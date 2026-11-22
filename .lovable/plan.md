# Neue Instanz auf 2 Servern

## Aufteilung

```text
Server 1 (Haupt-Server)                 Server 2 (Backup-Server)
- Backend (Datenbank, Logins, Dateien)  - holt nachts alles von Server 1
- Mitarbeiter-/Admin-Portal             - Server 1 hat KEINEN Zugriff hierher
- WebID-Server
```

Alles startet leer: neue Schlüssel, neue Datenbank, keine alten Daten.

## Schritte

1. **Anleitung anpassen**: docs/NEUINSTANZ.md auf genau diese 2-Server-Aufteilung umschreiben (Backend + Portal + WebID zusammen auf Server 1, Backup auf Server 2).
2. **Ein Installations-Skript für Server 1** (`scripts/setup-all-in-one.sh`): installiert Docker + Backend-Stack mit frisch erzeugten Schlüsseln, spielt nur das leere Datenbank-Gerüst ein, richtet Portal und WebID-Server ein, nginx mit 3 Adressen (z. B. api., portal., webid.), Firewall-Härtung. Funktioniert auf Ubuntu/Debian und AlmaLinux/Rocky.
3. **Backup-Server**: vorhandenes `setup-backup-server.sh` / `install-backup-orchestrator.sh` nutzen, so konfiguriert, dass er alles von Server 1 abholt (Datenbank, Backend, Portal, WebID). Server 1 erhält keinen Zugang zum Backup-Server.
4. **Erster Admin**: Konto registrieren, per Befehl zum Admin machen.
5. **Prüfung**: Gesundheits-Checks für alle 3 Adressen und ein Test-Backup inkl. Test-Wiederherstellung.

## Was ich von Ihnen brauche (vor der Ausführung)

- IP-Adressen beider Server und das Betriebssystem
- Die neue Domain bzw. gewünschte Adressen (Portal, Backend, WebID)
- SMTP-/Mail-Zugang für die neue Instanz
- SSH-Zugang (ich führe die Befehle nicht selbst aus; Sie kopieren sie, oder Sie geben mir die Ausgaben)

## Technische Details

- Basis: scripts/setup-server2.sh, deploy-backend-local.sh, harden-landing-server.sh, webid-sim-server/, backup-orchestrator.sh + restore.sh (Archiv-Layout bleibt unverändert).
- Migrationen: supabase/migrations + manual-migrations, keine Dumps.
- Neue VITE_SUPABASE_URL / Anon-Key nur in der Server-Umgebung von Server 1, das bestehende Projekt bleibt unverändert.
