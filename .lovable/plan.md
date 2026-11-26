# Leads schneller anschreiben + Mail-Vorlagen

## Was es schon gibt
Unter **Lead-Mailing** können Leads per CSV importiert werden; das Portal schreibt sie dann automatisch mit Tageslimit über Resend an, Antworten landen im Postfach. Deine Leads liegen aber als freier Text vor (Name, Mail, Telefon, Adresse gemischt) – deshalb musst du heute jeden einzeln anschreiben.

## 1. Leads per Copy & Paste einfügen
- Neues Feld „Leads als Text einfügen“ neben dem CSV-Import.
- Du kopierst einfach den ganzen Text (wie in deinen Dateien) rein.
- Das Portal erkennt pro Block (getrennt durch `-----` oder Leerzeilen, auch „Name , Mail“-Zeilen) automatisch **Name, E-Mail, Telefon**.
- Vorschau-Tabelle: erkannte Leads, Doppelte, Einträge ohne E-Mail (rot markiert). Namen kannst du vor dem Import korrigieren; fehlt ein Name, wird er aus der E-Mail geraten oder „Hallo,“ verwendet.
- Klick auf „Importieren“ → gleiche Logik wie CSV: Doppelte werden übersprungen, danach läuft der automatische Versand mit der vorhandenen Vorlage und dem Tageslimit. Kein Einzelanschreiben mehr.

## 2. Mail-Vorlagen („Makros“) im Postfach
- Beim Schreiben/Antworten im Postfach gibt es oben ein Menü **Vorlage einfügen**.
- Ein Klick füllt Betreff und Text; Platzhalter wie `{vorname}`, `{name}`, `{firma}` werden mit den Daten des Empfängers ersetzt. Danach nur noch anpassen und senden.
- Vorlagen verwalten (anlegen, umbenennen, bearbeiten, löschen) je Firma; ein paar Startvorlagen (Erstkontakt, Erinnerung, Terminbestätigung, Unterlagen anfordern) sind vorbereitet.
- Versand bleibt wie gehabt: immer nur ein Empfänger pro Mail, gleiche Signatur und Layout.

## 3. Deploy auf den alten Portal-Server
Nach der Umsetzung schickst du auf dem alten Server:
```
cd /opt/apps/portal && git status --short
cd /opt/apps/portal && bash scripts/deploy.sh
```
(Falls noch nicht passiert, einmalig vorher `GITHUB_TOKEN=<token> bash scripts/set-git-token.sh`.) Die Daten bleiben erhalten; nur die neue Vorlagen-Tabelle wird ergänzt.

## Technische Details
- `src/lib/lead-text-parser.ts`: Blocksplit, E-Mail-/Telefon-Regex, Namenserkennung (Labels „Name“, „Name , mail“, `Name<mail>`, Großbuchstaben normalisieren); Ausgabe `LeadRow[]` für den bestehenden `importLeads`. Tests mit Auszügen aus den drei Beispieldateien.
- Neue Tabelle `mail_templates` (tenant_id, name, subject, body, sort) mit RLS nur für Admins, als neue Migration; Server-Funktionen list/save/delete.
- Platzhalter über bestehendes `renderLeadTemplate`; Rendering weiter über `src/lib/mail-template.ts`.
- UI: Paste-Karte in `admin.lead-mailing.tsx`, Vorlagen-Dropdown im Compose von `admin.postfach.tsx`.
