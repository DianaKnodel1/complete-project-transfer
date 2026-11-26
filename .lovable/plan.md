# Lead-Versand: 6–24 Uhr und 75 Mails pro Absender

## Was sich ändert
- Lead-Mails gehen nur noch zwischen **6:00 und 24:00 Uhr** (deutsche Zeit) raus, statt 8 bis 20 Uhr. Sie werden weiter gleichmäßig über dieses Zeitfenster verteilt.
- Jeder Absender (jede hinterlegte Resend-Adresse, mit Firma oder im Pool ohne Firma) verschickt höchstens **75 Mails pro Tag**.
- Alle bestehenden Absender werden auf 75 gesetzt. Neue Absender starten auch mit 75. Pro Absender lässt sich der Wert weiterhin von Hand ändern.
- Der Hinweistext auf der Lead-Mailing-Seite nennt das neue Zeitfenster.

## Technische Details
- `src/lib/lead-mailing.ts` `allowedToSendNow`: Das Zeitfenster wird 6*60 bis 24*60. Der Kommentar wird angepasst.
- `src/routes/admin.lead-mailing.tsx`: Standardwert 50 wird 75, ebenso der Fallback beim Speichern. `lead-mailing.functions.ts`: Der Fallback 50 wird 75.
- Neue manuelle Migration `supabase/manual-migrations/20261126030000_lead_limit_75.sql`: Der Standard für `daily_limit` wird in `lead_mail_settings` und `lead_pool_settings` auf 75 gesetzt, bestehende Zeilen bekommen `daily_limit = 75`. Es werden keine Daten gelöscht.
- `src/test/lead-mailing.test.ts`: Tests für 05:59 Uhr (gesperrt), 06:00 Uhr (erlaubt) und 23:59 Uhr (erlaubt). Außerdem ein Test, dass nie mehr als 75 pro Tag rausgehen.
- Sobald der Code fertig ist, wird mit `bash scripts/deploy.sh` deployt.
