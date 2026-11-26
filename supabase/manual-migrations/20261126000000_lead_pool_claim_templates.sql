-- Leads ohne Firma, sicherer Versand (Reservierung) und bearbeitbare Mail-Vorlagen.
-- Nur Ergänzungen, keine Daten werden gelöscht.

-- 1) Neue Versand-Status: sending (reserviert), check (hängen geblieben), duplicate (Adresse schon angeschrieben).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.applications'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%lead_mail_status%'
  loop
    execute format('alter table public.applications drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.applications
  add constraint applications_lead_mail_status_check check (lead_mail_status is null or lead_mail_status in
    ('pending','sending','sent','failed','bounced','unsubscribed','replied','check','duplicate'));
alter table public.applications add column if not exists lead_mail_claimed_at timestamptz;

create index if not exists applications_lead_pool_pending_idx
  on public.applications (created_at) where lead_mail_status = 'pending' and tenant_id is null;

-- 2) Einstellungen für Leads ohne Firma (eine Zeile).
create table if not exists public.lead_pool_settings (
  id smallint primary key default 1 check (id = 1),
  active boolean not null default false,
  sender_email text,
  sender_name text,
  subject text,
  body text,
  homepage_url text,
  calendly_url text,
  daily_limit integer not null default 50 check (daily_limit between 1 and 2000),
  sig_name text, sig_position text, sig_phone text, sig_website text, sig_color text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.lead_pool_settings to authenticated;
grant all on public.lead_pool_settings to service_role;
alter table public.lead_pool_settings enable row level security;
drop policy if exists "admins manage lead_pool_settings" on public.lead_pool_settings;
create policy "admins manage lead_pool_settings" on public.lead_pool_settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Atomare Reservierung: jeder Lead kann nur von einem Versandlauf gegriffen werden.
create or replace function public.claim_lead_batch(p_tenant uuid, p_limit integer)
returns table(id uuid, email text, first_name text, last_name text, full_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update public.applications a set lead_mail_status = 'check',
         lead_mail_error = 'Versand wurde unterbrochen – bitte prüfen, ob die Mail rausging.'
   where a.lead_mail_status = 'sending' and a.lead_mail_claimed_at < now() - interval '30 minutes';

  update public.applications a set lead_mail_status = 'duplicate', lead_mail_error = 'Adresse wurde bereits angeschrieben.'
   where a.lead_mail_status = 'pending' and a.tenant_id is not distinct from p_tenant
     and exists (select 1 from public.applications b
                  where b.id <> a.id and lower(b.email) = lower(a.email)
                    and b.lead_mail_status in ('sending','sent','replied','bounced','unsubscribed','check'));

  return query
  with c as (
    select a.id from public.applications a
     where a.lead_mail_status = 'pending' and a.tenant_id is not distinct from p_tenant
     order by a.created_at limit greatest(p_limit, 0)
     for update skip locked
  )
  update public.applications a set lead_mail_status = 'sending', lead_mail_claimed_at = now()
    from c where a.id = c.id
  returning a.id, a.email, a.first_name, a.last_name, a.full_name;
end $$;
revoke all on function public.claim_lead_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_lead_batch(uuid, integer) to service_role;

-- 4) Bearbeitbare Mail-Vorlagen (allgemein: tenant_id null, oder je Firma).
create table if not exists public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.mail_templates to authenticated;
grant all on public.mail_templates to service_role;
alter table public.mail_templates enable row level security;
drop policy if exists "staff read mail_templates" on public.mail_templates;
create policy "staff read mail_templates" on public.mail_templates
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'caller'::public.app_role));
drop policy if exists "admins manage mail_templates" on public.mail_templates;
create policy "admins manage mail_templates" on public.mail_templates
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

insert into public.mail_templates (name, subject, body, sort)
select * from (values
  ('Erstkontakt', 'Ihre Bewerbung – nächster Schritt', E'Guten Tag {Vorname},\n\nvielen Dank für Ihr Interesse. Wir würden Sie gern kennenlernen. Bitte antworten Sie kurz auf diese E-Mail, wann Sie gut erreichbar sind.\n\nFreundliche Grüße', 1),
  ('Erinnerung', 'Kurze Erinnerung', E'Guten Tag {Vorname},\n\nwir haben noch nichts von Ihnen gehört. Haben Sie weiterhin Interesse? Eine kurze Antwort genügt.\n\nFreundliche Grüße', 2),
  ('Terminbestätigung', 'Ihr Termin ist bestätigt', E'Guten Tag {Vorname},\n\nhiermit bestätigen wir Ihren Termin. Wir freuen uns auf das Gespräch.\n\nFreundliche Grüße', 3),
  ('Unterlagen anfordern', 'Bitte Unterlagen nachreichen', E'Guten Tag {Vorname},\n\nfür die weitere Bearbeitung benötigen wir noch Ihre Unterlagen. Bitte senden Sie diese als Antwort auf diese E-Mail.\n\nFreundliche Grüße', 4)
) v(name, subject, body, sort)
where not exists (select 1 from public.mail_templates);
