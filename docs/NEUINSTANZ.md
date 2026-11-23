# Neue, leere Instanz — 2 Server

```text
Hauptserver 190.97.165.55            Backup-Server 190.97.165.56
- Backend (Datenbank, Logins, Dateien)  - holt jede Nacht alles vom Hauptserver
- Mitarbeiter-/Admin-Portal             - der Hauptserver hat KEINEN Zugang hierher
- WebID-Server
```

Alles startet leer: neue Schlüssel, neue Datenbank, keine alten Daten.
Die bestehende Instanz (api.mb-portal.com) wird nicht berührt.

## Vorbereitung

1. Drei DNS-Einträge (A-Record) auf **190.97.165.55**, z. B.
   `portal.neue-domain.de`, `api.neue-domain.de`, `webid.neue-domain.de` (+ `*.webid…` falls nötig).
2. Beide Server: Ubuntu/Debian oder AlmaLinux/Rocky, Zugang als root per SSH.

## Teil A — Hauptserver (190.97.165.55)

```bash
ssh root@190.97.165.55
git clone <REPO-URL> /opt/apps/portal && cd /opt/apps/portal
PORTAL_DOMAIN=portal.neue-domain.de \
API_DOMAIN=api.neue-domain.de \
WEBID_DOMAIN=webid.neue-domain.de \
ADMIN_EMAIL=ihre@mail.de \
BACKUP_SERVER_IP=190.97.165.56 \
bash scripts/setup-all-in-one.sh
```

Das Skript installiert alles, erzeugt neue Schlüssel (`/opt/supabase/.instance-secrets`
→ sofort in den Passwortmanager), spielt nur das leere Datenbank-Gerüst ein, startet
Portal und WebID, richtet HTTPS und Firewall ein und prüft am Ende alle drei Dienste.
Es kann gefahrlos erneut gestartet werden.

Mail-Versand (SMTP / Resend) danach im Admin-Bereich des Portals eintragen.

### Erster Admin

1. `https://portal.neue-domain.de` öffnen und registrieren.
2. Auf dem Hauptserver: `bash /opt/apps/portal/scripts/make-admin.sh ihre@mail.de`

## Teil B — Backup-Server (190.97.165.56)

```bash
ssh root@190.97.165.56
git clone <REPO-URL> /opt/apps/portal && cd /opt/apps/portal
cp scripts/backup-orchestrator.neuinstanz.env.example scripts/backup-orchestrator.env
age-keygen -o key.txt     # Zeile "age1..." in AGE_PUBLIC_KEY eintragen,
                          # key.txt in den Passwortmanager, dann: rm key.txt
nano scripts/backup-orchestrator.env
bash scripts/install-backup-orchestrator.sh
```

Das Skript zeigt einen Schlüssel an. Diesen **auf dem Hauptserver** in
`/root/.ssh/authorized_keys` eintragen und das Skript erneut starten, bis
„190.97.165.55 erreichbar" erscheint. Umgekehrt bekommt der Hauptserver keinen Zugang.

## Teil C — Prüfung

- Auf dem Backup-Server: `bash scripts/backup-orchestrator.sh` (Test-Sicherung),
  danach `bash scripts/backup-status.sh` und `bash scripts/backup-verify.sh`.
- Test-Wiederherstellung nach `docs/DISASTER-RECOVERY.md` mit `scripts/restore.sh`.
- Im Browser: Portal öffnet sich, Login mit dem Admin-Konto funktioniert.
