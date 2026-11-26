-- Letzter Versandlauf pro Absender (nur hinzufügend, keine Daten werden geändert).
alter table public.lead_mail_settings add column if not exists last_run_at timestamptz;
alter table public.lead_mail_settings add column if not exists last_run_result text;
alter table public.lead_pool_settings add column if not exists last_run_at timestamptz;
alter table public.lead_pool_settings add column if not exists last_run_result text;
