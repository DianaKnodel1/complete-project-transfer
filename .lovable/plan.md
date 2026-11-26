# Strix-Sicherheitstest und Deploy

## Befund aus dem letzten Deploy
- Der Deploy lief durch, aber die neuen Updates (`20261126000000_lead_pool_claim_templates.sql`, `20261126010000_chat_send_lockdown.sql`) fehlen – der Server hat noch aus dem alten Repo gezogen. Deshalb Schritt 0 zwingend vorher.
- Der Abgleich mit dem alten Landing-Server 190.97.165.54 schlägt fehl (nicht erreichbar). Das blockiert nichts; die Adresse wird später auf den neuen Landing-Server umgestellt.

## GitHub-Repo
Alle Änderungen (inkl. Chat-Sperre und Audit-Skript) sind gespeichert und werden automatisch nach `DianaKnodel1/complete-project-transfer` übertragen. Vor dem Deploy kurz auf GitHub prüfen, ob der neueste Eintrag "Fix audit column" heißt – dann deployt der Server die neue Version.

## Reihenfolge auf dem Portal-Server
0. Repo-Adresse auf dem Server umstellen (einmalig):
   `cd /opt/apps/portal && git remote set-url origin https://github.com/DianaKnodel1/complete-project-transfer.git && git remote -v`
   Da das Repo privat ist, danach einmalig: `GITHUB_TOKEN=<dein-token> bash scripts/set-git-token.sh` (falls set-git-token.sh noch fehlt, weil der Server noch die alte Version hat: `git config --global credential.helper store` und Token per `git ls-remote origin` mit Benutzer `x-access-token` eingeben).
   Prüfen: `git fetch origin && git log origin/main --oneline -1` muss "Fix audit column" zeigen.
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
