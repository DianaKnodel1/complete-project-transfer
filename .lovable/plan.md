# Leads schnell anschreiben, sicherer Auto-Versand, Mail-Vorlagen

## So funktioniert der automatische Versand heute
- Alle 10 Minuten schaut das Portal je Firma nach Leads mit Status „wartet“ und schickt nur so viele, wie das **Tageslimit** erlaubt – gleichmäßig verteilt zwischen 8 und 20 Uhr, maximal 25 pro Durchgang.
- Nach dem Senden wird der Lead auf „gesendet“ gesetzt und kommt nie wieder dran. Zusätzlich bekommt Resend pro Lead eine feste Kennung, damit Resend dieselbe Mail nicht zweimal annimmt.
- Meldet Resend „zu viele“ (429), stoppt der Durchgang sofort. Zurückgekommene Mails und Abmeldungen werden gesperrt und nie wieder angeschrieben.
- Beim Import werden Leads übersprungen, die es in dieser Firma schon gibt.

**Schwachstelle, die ich behebe:** Laufen zwei Durchgänge zufällig gleichzeitig, könnten beide denselben Lead greifen. Neu wird jeder Lead vor dem Senden fest „reserviert“ – nur ein Durchgang kann ihn haben. Ein Lead, der beim Senden hängen bleibt, wird nicht automatisch nochmal geschickt, sondern als „prüfen“ markiert.

## 1. Neue Übersicht „Versand-Kontrolle“
Pro Resend-Zugang/Firma auf einen Blick: heute gesendet / Tageslimit, wartend, fehlgeschlagen, zurückgekommen, abgemeldet, letzte Fehlermeldung von Resend. Ampel wird gelb ab 80 % des Limits und rot bei Resend-Fehlern oder hoher Rückläuferquote (Resend sperrt eher wegen Rückläufern als wegen Menge). Knopf „Versand pausieren“ je Zugang.

## 2. Leads ohne Firma (Listen wie 4, 5, 6) – alles auf einer Seite
- Eine Seite **Lead-Mailing**, oben die Auswahl „Ohne Firma“ oder eine Firma. Darunter direkt: Standard-Nachricht, Tageslimit, Import und Versand-Status – keine Unterseiten.
- Du kannst die 3 Textdateien auf einmal hochladen (oder reinkopieren). Doppelte E-Mails werden sofort erkannt – innerhalb der Dateien und gegen alle schon vorhandenen Leads – und in der Vorschau angezeigt, bevor etwas importiert wird.
- Versand läuft über die im Portal hinterlegten Resend-Zugänge.

**Welche Mail bekommen die Leads?** Die **Standard-Nachricht**, die du dort einstellst: Betreff, Text und Absender frei änderbar, mit Platzhaltern `{Vorname}`, `{Nachname}`, `{Homepage}`, `{Calendly}`, `{Absender}`. Daneben siehst du eine Vorschau, wie die Mail beim ersten Lead aussieht, und kannst eine Test-Mail an dich selbst schicken. Für „Ohne Firma“ ist eine Startnachricht ohne Firmennamen vorbereitet; Firmen behalten ihre eigene Nachricht.

## 3. Leads mit Firma (Listen wie 7, z. B. szp-gmbh)
- Beim Import wählst du die Firma; versendet wird mit deren Absender und Vorlage, wie bisher.
- Liste 7 ist ein Facebook/Meta-Export (Tabulator-getrennt, Telefon mit „p:“): wird jetzt direkt erkannt, Telefon wird bereinigt.

## 4. Einfügen per Copy & Paste
- Feld „Leads als Text einfügen“: den ganzen Text reinkopieren (Blöcke mit `-----`, „Name , Mail“-Zeilen, „Bewerber Information“ usw.).
- Erkennt Name, E-Mail, Telefon. Vorschau mit Doppelten und Problemfällen (keine Mail, Tippfehler wie „.come“) vor dem Import; Namen korrigierbar.

## 5. Mail-Vorlagen („Makros“) im Postfach
- Beim Schreiben/Antworten Menü **Vorlage einfügen**: füllt Betreff und Text, Platzhalter `{Vorname}`, `{Nachname}`, `{Firma}` werden ersetzt, dann nur anpassen und senden.
- Vorlagen anlegen/bearbeiten/löschen, allgemein oder je Firma; Startvorlagen: Erstkontakt, Erinnerung, Terminbestätigung, Unterlagen anfordern.

## 6. Deploy auf den alten Portal-Server (Daten bleiben)
```
cd /opt/apps/portal && git status --short
cd /opt/apps/portal && bash scripts/deploy.sh
```
Falls noch nicht geschehen, einmalig vorher: `GITHUB_TOKEN=<token> bash scripts/set-git-token.sh`. Es kommen nur neue Tabellen/Spalten dazu, nichts wird gelöscht.

## Technische Details
- Atomare Reservierung: `UPDATE applications SET lead_mail_status='sending' WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` als DB-Funktion; hängende `sending` > 30 min → `check`.
- Leads ohne Firma: `applications.tenant_id` bleibt null, Quelle „pool“; neue Tabelle `lead_pool_settings` + Zuordnung zu Resend-Zugängen; globaler Dubletten-Check per lower(email) über alle Lead-Quellen.
- Parser: `src/lib/lead-text-parser.ts` (Freitext) + Tab-Trenner und `p:`-Präfix in `parseLeadCsv`; Tests mit Auszügen aus den Dateien 4–7.
- Neue Tabelle `mail_templates` (tenant_id nullable) mit GRANTs + Admin-RLS; Versand-Kontrolle aus `lead_messages`/`applications`-Zählungen plus letzter Resend-Fehler.
- Tests: kein Doppelversand bei zwei parallelen Durchgängen, Limit pro Zugang, globale Dubletten.
