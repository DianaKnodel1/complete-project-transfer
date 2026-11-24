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

## Wo die Landing-IP typischerweise sichtbar wird
- **Internet-Scanner (Censys, Shodan):** Sie rufen jede IP direkt auf und lesen das Zertifikat bzw. die Seite aus – dann steht dort "Domain X liegt auf IP Y". Gegenmittel: Firewall lässt Webseiten-Zugriffe nur von Cloudflare zu; direkter Aufruf der IP zeigt nichts.
- **DNS-Einträge ohne orange Wolke** (z. B. `www`, `mail`, `server`, Unteradressen) oder ein alter Eintrag aus der Zeit vor Cloudflare (DNS-Verlauf-Dienste speichern das). Gegenmittel: alle Einträge der Landing-Domains auf "Proxied"; neue IP nie ungeschützt veröffentlichen.
- **E-Mails vom Server selbst** (Kopfzeilen enthalten die IP). Gegenmittel: keine Mail vom Landing-Server, Versand nur über den Mail-Dienst.
- **Gleiche IP für viele Domains:** Eine gemeldete Domain bringt alle anderen mit herunter.

## Zusätzliche Schutzmaßnahmen
- Cloudflare "Authenticated Origin Pulls" bzw. Cloudflare-Herkunftszertifikat: Server antwortet nur echten Cloudflare-Anfragen.
- Optional später: Cloudflare Tunnel – der Server hat dann gar keine offenen Webseiten-Ports mehr, die IP ist praktisch unsichtbar.
- Prüfbefehl für Sie: `curl -k https://<SERVER-IP>` von außen muss scheitern.

Wichtig: Gegen Beschwerden über den **Inhalt** einer Seite hilft das Verstecken nur, wenn Cloudflare die Meldung nicht mit IP an den Hoster weitergibt (Punkt 3 oben).

## Sicherheitsnetz: Besucher und Portal funktionieren weiter
- Besucher erreichen die Seiten immer über Cloudflare – das bleibt erlaubt, für sie ändert sich nichts.
- **Vor dem Abschotten prüfen:** Jede Landing-Domain muss in Cloudflare auf "Proxied" (orange Wolke) stehen. Eine Domain mit grauer Wolke wäre sonst nicht mehr erreichbar.
- Das Portal (Hauptserver) darf weiter direkt auf den Landing-Server (Seiten veröffentlichen, Lebenszeichen, Umschaltung) – seine IP wird ausdrücklich freigegeben.
- SSH bleibt offen, damit Sie sich weiter anmelden können.
- Reihenfolge: erst prüfen, dann abschotten, danach sofort testen (Seite im Browser, Veröffentlichen aus dem Portal). Rückgängig machen geht mit einem Befehl (`ufw disable`).
