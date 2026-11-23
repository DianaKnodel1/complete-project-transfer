#!/usr/bin/env bash
# make-admin.sh — macht ein bereits registriertes Konto zum Admin.
#   Auf dem Hauptserver:  bash scripts/make-admin.sh deine@mail.de
set -euo pipefail
EMAIL="${1:?E-Mail-Adresse angeben}"
DB_CT="${DB_CONTAINER:-supabase-db}"
n=$(docker exec -i "$DB_CT" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA -v email="$EMAIL" <<'SQL'
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where lower(email) = lower(:'email');
insert into public.user_roles (user_id, role)
  select id, 'admin'::public.app_role from auth.users where lower(email) = lower(:'email')
  on conflict (user_id, role) do nothing;
select count(*) from public.user_roles r join auth.users u on u.id = r.user_id
  where lower(u.email) = lower(:'email') and r.role = 'admin';
SQL
)
n="$(echo "$n" | tail -n1)"
[ "$n" = "1" ] && echo "✓ $EMAIL ist jetzt Admin" || { echo "✗ Kein Konto mit $EMAIL gefunden — zuerst im Portal registrieren." >&2; exit 1; }
