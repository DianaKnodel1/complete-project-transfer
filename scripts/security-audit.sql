-- NUR LESEN. Ausführen: docker exec -i supabase-db psql -U postgres -d postgres < scripts/security-audit.sql
\echo '== Konten der letzten 14 Tage =='
SELECT u.id, u.email, u.created_at, u.last_sign_in_at, u.raw_user_meta_data->>'full_name' AS name
FROM auth.users u WHERE u.created_at > now() - interval '14 days' ORDER BY u.created_at;

\echo '== Absender verdaechtiger Nachrichten =='
SELECT m.sender_id, su.email AS sender, ru.email AS empfaenger, m.created_at, left(m.content,60) AS text
FROM public.chat_messages m
LEFT JOIN auth.users su ON su.id = m.sender_id
LEFT JOIN auth.users ru ON ru.id = m.receiver_id
WHERE m.created_at > now() - interval '3 days'
  AND (m.content ~* '(poc|acc2|testkonto|realtime|^[A-Z]-?[0-9]{9,})' OR m.content ~ '[0-9]{10}')
ORDER BY m.created_at;

\echo '== Nachrichten zwischen zwei Nicht-Admins (sollte leer sein) =='
SELECT su.email, ru.email, count(*) FROM public.chat_messages m
JOIN auth.users su ON su.id=m.sender_id JOIN auth.users ru ON ru.id=m.receiver_id
WHERE NOT public.is_admin_staff(m.sender_id) AND NOT public.is_admin_staff(m.receiver_id)
GROUP BY 1,2 ORDER BY 3 DESC;

\echo '== Anmeldungen mit IP (letzte 3 Tage) =='
SELECT created_at, ip_address, payload->>'actor_username' AS konto, payload->>'action' AS aktion
FROM auth.audit_log_entries WHERE created_at > now() - interval '3 days'
  AND payload->>'action' IN ('login','user_signedup','user_recovery_requested','token_refreshed')
ORDER BY created_at DESC LIMIT 200;
