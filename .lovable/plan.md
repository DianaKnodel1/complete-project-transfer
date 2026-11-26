# Lead-Versand startet nicht – Ursache finden und beheben

## Was wahrscheinlich los ist
Das Portal verschickt Lead-Mails nicht sofort beim Einschalten. Ein Zeitplan auf dem Portal-Server ruft alle 10 Minuten den Versand auf. Für Lead-Mails ist in den Einrichtungs-Skripten kein solcher Zeitplan hinterlegt. Gibt es ihn auf dem Server nicht, passiert nie etwas. Weitere mögliche Gründe:
- kein Resend-Schlüssel hinterlegt
- beim Absender fehlt die Absender-Adresse
- der neueste Stand (6–24 Uhr, 75 Mails) ist noch nicht auf dem Server

## Schritt 1 – Prüfen (du auf dem Portal-Server)
1. `crontab -l | grep lead-mailing` zeigt, ob der Zeitplan existiert.
2. Versand einmal von Hand anstoßen:
   `curl -s "https://<portal-domain>/api/public/lead-mailing-cron?key=$(grep ^CRON_SECRET= /opt/apps/portal/.env.server | cut -d= -f2)"`
   Die Antwort nennt den Grund, z. B. `no_resend_key`, `sent: 0` oder einen Fehler.

## Schritt 2 – Beheben
- Ein Skript `scripts/setup-lead-cron.sh` richtet den 10-Minuten-Zeitplan einmalig ein, nach dem Vorbild von `fix-domain-health-cron.sh`. Der Deploy legt ihn ab jetzt automatisch an, wenn er fehlt.
- Auf der Lead-Mailing-Seite steht künftig, wann der letzte Versandlauf war und warum nichts rausging, z. B. „kein Absender“, „außerhalb 6–24 Uhr“ oder „Tageslimit erreicht“. Ein Knopf „Jetzt einen Lauf starten“ (nur für Admins) stößt den Versand sofort an. Dabei gelten dieselben Limits, doppelte Mails sind ausgeschlossen.

## Technische Details
- Jeder Lauf speichert Zeitpunkt und Ergebnis in `lead_pool_settings`/`lead_mail_settings` (zusätzliche Spalten `last_run_at` und `last_run_result`, nur hinzufügende Migration).
- Der Admin-Knopf ruft `runLeadMailingCycle` über eine geschützte Server-Funktion mit Admin-Prüfung auf.
- Ein Test prüft, dass auch ein Lauf von Hand nicht mehr als 75 Mails pro Absender und Tag und nichts außerhalb von 6–24 Uhr verschickt.

# Backup-Server wieder frei machen

## Sofort (du auf dem Backup-Server, nichts wird blind gelöscht)
1. Ansehen, was Platz frisst: `df -h` und `du -sh <BACKUP_DIR>/* | sort -h`
2. Halb fertige Läufe entfernen, sie sind nie vollständig: `rm -rf <BACKUP_DIR>/daily/.run-*`
3. Alte Tages-Backups löschen, die 3 neuesten bleiben:
   `ls -1t <BACKUP_DIR>/daily/portal-*.tar.gz | tail -n +4 | xargs -r rm -f` (dazu die passenden `.sha256`)
4. Bei Bedarf Monats-Backups bis auf das neueste löschen, außerdem alte Logs.
5. `df -h` zeigt danach den freien Platz. Dann einen Backup-Lauf von Hand starten.

## Damit es nicht wieder voll läuft
- Bisher bleiben 14 Tages- und 92 Tage Monats-Backups liegen. Der Backup-Lauf löscht künftig zuerst das Älteste, wenn die Platte über 80 % voll ist, und lässt mindestens 3 Backups stehen. Erst danach legt er ein neues an.
- Halb fertige `.run-*`-Ordner aus abgebrochenen Läufen werden bei jedem Start aufgeräumt.
