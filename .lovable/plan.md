# Strix-Sicherheitstest und Deploy

## GitHub-Repo
Alle Änderungen (inkl. Chat-Sperre und Audit-Skript) sind gespeichert und werden automatisch nach `DianaKnodel1/complete-project-transfer` übertragen. Vor dem Deploy kurz auf GitHub prüfen, ob der neueste Eintrag "Fix audit column" heißt – dann deployt der Server die neue Version.

## Reihenfolge auf dem Portal-Server
1. `cd /opt/apps/portal && bash scripts/deploy.sh` – Ausgabe schicken (Zeile mit `20261126010000_chat_send_lockdown.sql` muss erscheinen).
2. `docker exec -i supabase-db psql -U postgres -d postgres < scripts/security-audit.sql` – nur lesen, Ausgabe schicken.
3. `last -n 30; journalctl -u ssh --since "-3 days" | grep Accepted` – Ausgabe schicken.

## Strix (KI-Penetrationstest, Open Source, Apache-2.0)
Strix greift die eigene App wie ein Angreifer an und meldet gefundene Lücken. Sinnvoll als Ergänzung zum Audit.
- Nur gegen eigene Systeme einsetzen, nie gegen fremde.
- Läuft NICHT auf dem Produktionsserver, sondern auf einem separaten Rechner (z. B. dem Backup-Server oder lokal) mit Docker.
- Benötigt einen KI-Schlüssel (z. B. OpenAI/Anthropic) – verursacht Kosten.
- Ziel: zuerst eine Test-Umgebung oder außerhalb der Hauptzeiten, mit zwei eigenen Test-Konten (Mitarbeiter + zweiter Mitarbeiter), damit echte Daten nicht verändert werden.
- Ich bereite eine Anleitung `docs/STRIX-PENTEST.md` vor: Installation, Befehl gegen Portal-Domain, Testkonten, Auswertung der Befunde; jede gefundene Lücke schließe ich anschließend im Code mit Test.

## Danach
Auswertung der Audit-Ausgaben, verdächtige Konten sperren, restliche Bereiche (Profile, Bewerbungen, Verträge, Dokumente, Postfach, Dateien) prüfen und absichern.
