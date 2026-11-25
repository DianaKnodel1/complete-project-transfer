# Passwort im Mitarbeiter-Profil + weitere Server-Absicherung

## Teil 1: „Neues Passwort anlegen“ im Mitarbeiter-Profil

- Der Button „Passwort“ in der Mitarbeiter-Liste wird entfernt.
- Im Mitarbeiter-Profil kommt unter dem Kopfbereich (Name, E-Mail, Telefon) ein eigener Bereich **„Neues Passwort anlegen“** dazu.
  - Er erscheint nur bei Mitarbeitern mit Login, nicht bei reinen Bewerbungen.
  - Er enthält ein Eingabefeld mit einem vorgeschlagenen Zufallspasswort und die Buttons „Neu erzeugen“ und „Kopieren“.
  - Mit „Passwort speichern“ wird das neue Passwort gesetzt. Vorher kommt eine kurze Sicherheitsabfrage.
  - Danach erscheint der Hinweis: „Gespeichert. Teilen Sie dem Mitarbeiter das neue Passwort mit.“
- Die Regeln bleiben gleich:
  - mindestens 8 Zeichen,
  - nur Admins dürfen Passwörter setzen,
  - Admin-Konten sind ausgenommen,
  - das alte Passwort gilt danach sofort nicht mehr.

## Teil 2: Weitere Absicherung des Landing-Servers

Das ist schon umgesetzt:
- Ins Web kommen nur Anfragen über Cloudflare.
- Mail-Versand ist gesperrt.
- Fail2ban, automatische Updates und SSH-Absicherung laufen.

Vorgeschlagene zusätzliche Schritte, alle ohne Auswirkung auf Besucher:

1. **Aufrufe über die IP direkt abweisen.** Fragt jemand den Server ohne eine Ihrer Domains an, schließt der Server die Verbindung ohne Antwort. Es wird kein Zertifikat gezeigt und keine Seite ausgeliefert. Scanner, die IP-Bereiche abklappern, finden so nichts, was sie einer Domain zuordnen können.
2. **Cloudflare-Herkunftsprüfung (Authenticated Origin Pulls).** Der Server nimmt nur Verbindungen an, die nachweislich von Ihrem Cloudflare-Konto kommen. Das schützt auch vor Angreifern, die selbst über Cloudflare kommen. Dafür müssen Sie in Cloudflare einen Schalter umlegen (SSL/TLS → Origin Server).
3. **Verräterische Antworten entfernen.** Kopfzeilen wie „Server: Caddy“ und Fehlerseiten, die Software oder Version nennen, verschwinden.
4. **Stärkste Variante, optional: Cloudflare Tunnel.** Der Server hat dann gar keine offenen Web-Ports mehr. Er baut selbst eine Verbindung zu Cloudflare auf, deshalb kann ihn von außen niemand mehr ansprechen. Der Haken ist der höhere Umbau: Die automatische Domain-Umstellung beim Server-Ausfall müsste angepasst werden. Diesen Schritt würde ich nur nach Ihrer Zustimmung als eigenes Vorhaben angehen.

Wichtig, unabhängig von der Technik: Gemeldete Inhalte, z. B. eine Stellenanzeige, die als Betrug gemeldet wird, leitet Cloudflare samt echter IP an den Hoster weiter. Dagegen hilft nur, die Meldegründe beim Hoster zu erfragen und die Inhalte entsprechend anzupassen.

Umgesetzt werden in diesem Schritt 1 bis 3. Anschließend gibt es die Befehle für den neuen Landing-Server.

## Technische Details

- `src/routes/admin.mitarbeiter.tsx`: `ResetPasswordButton` und die zugehörigen Imports entfernen.
- `src/routes/admin.personen.$id.tsx`: neue Karte `NewPasswordCard`, nur wenn `prof?.user_id` gesetzt ist. Sie nutzt die bestehende Funktion `resetEmployeePassword` und `generatePassword`. Der bestehende Test bleibt.
- `src/lib/landing-bootstrap-script.ts` (Caddyfile):
  - Für `:443` gilt `default_sni` mit Ablehnung unbekannter Hosts; die „ask“-Prüfung bleibt.
  - `:80` beantwortet nur ACME-Anfragen und Domains, die die „ask“-Prüfung bestätigt; sonst `abort`.
  - Optional `tls { client_auth }` mit dem Cloudflare-Origin-Pull-CA, gesteuert über die Variable `CF_ORIGIN_PULL=1`.
  - `header -Server`.
- `scripts/harden-landing-server.sh`: optionaler Schritt für Origin Pulls (CA herunterladen, Caddy neu laden).
- Bootstrap bleibt kompatibel mit apt und dnf.
