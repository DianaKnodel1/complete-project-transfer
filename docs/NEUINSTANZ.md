# Neuinstanz: Frisches Mitarbeiter-/Admin-Portal ohne alte Daten

Anleitung zum Aufbau einer **komplett neuen, leeren Instanz** des Portals —
mit eigener Datenbank, eigenen Schlüsseln und eigenem ersten Admin-Zugang.
Es werden **keine** Daten aus der alten Instanz übernommen (kein Dump, kein
Storage-Sync, keine Benutzer).

Unterschied zu `docs/SERVER-UMZUG.md`: Dort wird die Datenbank per Dump
übernommen. Hier bleibt die Datenbank leer und wird nur per Migrationen
aufgebaut.

## Übersicht

| Server | Zweck | Empfehlung |
|---|---|---|
| Backend-Server | Self-hosted Supabase (Datenbank, Auth, Storage, Edge Functions) | 4 vCPU, 8 GB RAM, 160 GB SSD, Ubuntu 22.04/24.04 |
| Portal-Server | Mitarbeiter-/Admin-Portal (TanStack Start + nginx) | 2 vCPU, 4 GB RAM, 40 GB SSD |
| Optional | WebID-Sim, Bot-Runner, Landing, Backup | siehe `docs/SERVER-SETUP.md` |

Beide Server brauchen Root-Zugang (SSH) und ausgehendes Internet.

---

## Phase 1 — Neuen Backend-Server aufbauen (leere Datenbank)

1. Supabase-Stack per Docker installieren (Struktur wie auf dem bisherigen
   Backend, Verzeichnis `/opt/supabase`).

2. **Neue Schlüssel erzeugen — nichts aus der alten Instanz übernehmen:**
   - Neuen `JWT_SECRET` generieren (z. B. `openssl rand -base64 48`)
   - Neue ANON- und SERVICE-ROLE-Keys aus diesem Secret ableiten
   - SMTP-Zugangsdaten des gewünschten Mailkontos eintragen
   - Alles in `/opt/supabase/.env` eintragen und den Stack starten

3. Repo klonen:
   ```bash
   git clone https://github.com/DianaKnodel1/project-replica.git /opt/apps/portal
   cd /opt/apps/portal
   ```

4. **Datenbank-Schema einspielen (leere DB → volles Schema, keine Daten):**
   ```bash
   # Alle Versionierungs-Migrationen in Reihenfolge:
   for f in supabase/migrations/*.sql; do
     docker exec -i supabase-db psql -U postgres -d postgres < "$f"
   done
   # Danach die manuellen Migrationen:
   for f in supabase/manual-migrations/*.sql; do
     docker exec -i supabase-db psql -U postgres -d postgres < "$f"
   done
   ```
   Alternativ `bash scripts/deploy-backend-local.sh` auf dem Backend-Server,
   wenn dort `scripts/backend-server.env` eingerichtet ist.

5. Edge Functions deployen:
   ```bash
   bash scripts/deploy-backend.sh
   ```

6. TLS für die Backend-Domain (z. B. `api.neue-domain.de`) einrichten
   (Cloudflare-Origin-Cert oder Let's Encrypt) und prüfen:
   ```bash
   curl https://api.neue-domain.de/auth/v1/health   # → ok
   ```

---

## Phase 2 — Neuen Portal-Server aufbauen

Auf dem Portal-Server als root:

```bash
git clone https://github.com/DianaKnodel1/project-replica.git /opt/apps/portal
cd /opt/apps/portal

PORTAL_DOMAINS="portal.neue-domain.de" \
SUPABASE_URL="https://api.neue-domain.de" \
SUPABASE_PUBLISHABLE_KEY="<neuer-anon-key>" \
SUPABASE_SERVICE_ROLE_KEY="<neuer-service-role-key>" \
bash scripts/setup-server2.sh
```

Das Skript installiert Bun + nginx, baut das Portal, richtet den
systemd-Dienst (`portal.service`, Port 3000) und den Reverse-Proxy ein.

Danach:
1. DNS: A-Record der Portal-Domain auf die Portal-Server-IP setzen.
2. HTTPS: `certbot --nginx -d portal.neue-domain.de`
3. Test: `curl -I http://127.0.0.1:3000/` → 200

---

## Phase 3 — Ersten Admin-Zugang anlegen

Die Datenbank ist leer, es gibt noch keinen Benutzer.

1. Im Browser die Portal-URL öffnen und über das Registrierungsformular ein
   Konto anlegen (oder per Auth-API).
2. Dem Konto die Admin-Rolle geben — auf dem Backend-Server:
   ```bash
   docker exec -i supabase-db psql -U postgres -d postgres <<'SQL'
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin'::public.app_role
   FROM auth.users
   WHERE email = 'admin@neue-domain.de'
   ON CONFLICT (user_id, role) DO NOTHING;
   SQL
   ```
3. Abmelden, wieder anmelden → der Admin-Bereich ist erreichbar.

---

## Phase 4 — Grundeinrichtung im Portal

Ohne alte Daten müssen einmalig angelegt werden:

- **Mandant/Firma** (Tabelle `tenants`) mit Name, Farben, Domain
- **Standard-Verträge** je Beschäftigungsart (Rohtext-Vorlagen)
- **E-Mail-Einstellungen** (Absender, Signatur) in den Lead-Mail-Settings
- **Landing-Server / WebID-Sim / Bot-Runner** nach Bedarf, siehe
  `docs/SERVER-SETUP.md`
- **Proxys** für den Bot-Runner (`REQUIRE_PROXY=true` — ohne Proxy startet
  kein Lauf)

---

## Was bewusst NICHT übernommen wird

- Kein Datenbank-Dump der alten Instanz (keine Bewerber, Mitarbeiter, Chats,
  Mails, Aufträge)
- Keine Storage-Dateien (Dokumente, Verträge, Signaturen)
- Keine Benutzerkonten und keine alten Sessions
- Keine alten JWT-/API-Schlüssel

## Zu beachten

- Die neue Instanz braucht eigene Domains (Portal + API). Die alten Domains
  (`mb-portal.com`, `api.mb-portal.com`) zeigen weiter auf die alte Instanz,
  bis DNS bewusst umgestellt wird.
- Beim Mailversand von einer neuen Server-IP: SPF-, DKIM- und DMARC-Einträge
  der Versanddomain anpassen, sonst landen Mails im Spam.
- Backups von Anfang an mitdenken: Backup-Server nach
  `docs/SERVER-UMZUG.md` Phase 0 aufsetzen und auf die **neuen** Server
  zeigen lassen.
