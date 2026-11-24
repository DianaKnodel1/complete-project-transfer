# Landing-Server: Warum er trotz Cloudflare wegen "Abuse" gesperrt wird

## Wahrscheinliche Ursachen (Cloudflare schützt hier nicht)

1. **Cloudflare leitet Beschwerden an den Hoster weiter.** Meldet jemand eine Landing Page (z. B. als "Phishing" oder "Job-Betrug" – bei Stellenanzeigen mit Bewerbungsformular häufig), schickt Cloudflare die Meldung inklusive der echten Server-IP an den Hoster. Der Hoster sperrt dann automatisch, ohne zu prüfen.
2. **Die echte Server-IP ist bekannt.** Der neue Server wird per Einrichtungs-Skript nur mit "Webseiten offen für alle" gestartet. Die Härtung (nur Cloudflare darf auf die Webseiten zugreifen) läuft separat – wurde sie auf dem neuen Server nicht ausgeführt, ist er direkt erreichbar und auffindbar.
3. **Ausgehender Verkehr vom Server** (Mail-Versand, Scans durch eine Schwachstelle) – das sieht Cloudflare gar nicht, der Hoster aber schon.

## Was wir tun

1. **Diagnose (zuerst, ohne Änderungen):** Sie fragen beim Hoster nach dem genauen Abuse-Grund (Phishing-Meldung, Netzwerk-Scan, Spam?) und ich gebe Ihnen Prüfbefehle für den Server (Firewall-Status, offene Ports, ausgehende Verbindungen, Mail-Dienst).
2. **Server abschotten:** Das Einrichtungs-Skript für Landing-Server führt die Härtung automatisch mit aus: Webseiten nur noch über Cloudflare erreichbar, ausgehender Mail-Port gesperrt, fail2ban, automatische Updates.
3. **Cloudflare-Meldungen abfangen:** In Cloudflare die Weiterleitung von Abuse-Meldungen an den Hoster so einstellen, dass sie nur an Sie gehen (pro Domain einstellbar), damit Sie selbst reagieren können.
4. **Hoster-Wahl:** Empfehlung für einen Hoster, der Meldungen erst weiterleitet statt sofort zu sperren; die automatische Umschaltung auf einen anderen Landing-Server bleibt als Notfall-Lösung.

## Technische Details
- `src/lib/landing-bootstrap-script.ts` öffnet http/https per firewalld für alle; `scripts/harden-landing-server.sh` (ufw nur Cloudflare-IPs) wird integriert bzw. am Ende des Bootstraps aufgerufen.
- Zusätzlich: ausgehend Port 25 blockieren.
