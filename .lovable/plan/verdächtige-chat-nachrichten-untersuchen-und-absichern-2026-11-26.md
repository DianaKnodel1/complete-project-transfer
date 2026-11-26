# Verdächtige Chat-Nachrichten untersuchen und absichern

## Einschätzung
Die Nachrichten ("PoC Realtime Kontrolle", "Acc2ToAcc1", "X-Testkonto", A/B/C/D) kamen heute zwischen 14:44 und 15:43 Uhr. Die Zahl dahinter (z. B. 1795707321) ist eine Uhrzeit-Kennung. Gesendet wurden sie über das Mitarbeiter-Konto "MM", nicht als Admin.
Das Muster passt zu jemandem, der gezielt testet. Er prüft, ob Live-Nachrichten fremder Konten mitgelesen werden können ("PoC" = Proof of Concept) und ob ein Konto in das Gespräch eines anderen Kontos schreiben kann ("Acc2ToAcc1").
Das heißt: Jemand hat Zugang zu einem Mitarbeiter-Konto oder konnte sich selbst eines anlegen. Dass jemand auf dem Server selbst ist, folgt daraus nicht. Sicher sagen kann ich das erst nach den Prüfungen unten.

## Sofort (du, jetzt)
1. Das Konto "MM / MM Agentur UG" im Chat auf **Sperren** stellen.
2. Über "Neues Passwort anlegen" im Profil ein neues Passwort setzen.
3. Prüfen, ob du "X-Testkonto" oder ähnliche neue Konten kennst, und sie sperren.
4. Admin-Passwort ändern.

## Prüfungen (ich, nach Freigabe)
1. In der Datenbank auf dem Server lesen (nur lesen, keine Änderungen):
   - Welches Konto die Nachrichten geschickt hat (user_id, IP, Uhrzeit)
   - Welche Konten heute neu angelegt wurden
   - Die Anmeldeprotokolle mit IP-Adressen
2. Die Zugriffsregeln für Chat, Live-Nachrichten und Registrierung prüfen:
   - Kann ein Mitarbeiter fremde Gespräche lesen oder in fremde Gespräche schreiben?
   - Kann sich jeder ohne Einladung ein Konto anlegen?
3. Gefundene Lücken schließen, also die Regeln in der Datenbank verschärfen, und Tests dazu schreiben.
4. Auf dem Server nachsehen, wer sich per SSH angemeldet hat (`last`, `journalctl -u ssh`), damit ein Zugriff auf den Server selbst ausgeschlossen werden kann.

## Was ich von dir brauche
Die Ausgabe von ein paar Abfragen, die ich dir gebe und die du auf dem Portal-Server ausführst (nur lesen).

## Erster Befund aus dem Code
- Jeder angemeldete Nutzer darf Chat-Nachrichten an **beliebige** Empfänger schicken. Geprüft wird nur, dass er selbst der Absender ist. Genau das hat "Acc2ToAcc1" getestet.
- Neue Konten kann man sich ohne Einladung selbst anlegen. Mehrere Angreifer-Konten sind so leicht möglich.

## Vollständiges Sicherheits-Audit (für die mehreren verdächtigen Konten)
1. Alle verdächtigen Konten auflisten (Registrierung, IP, letzte Anmeldung, Nachrichten) und als Liste zum Sperren ausgeben.
2. Ein Prüfskript mit zwei Test-Konten auf dem Server ausführen. Es versucht, fremde Daten zu lesen und zu ändern: Chat, Profile, Bewerbungen, Verträge, Dokumente, Postfach, Dateiablage, Live-Nachrichten, Admin-Funktionen. Jede Lücke landet im Bericht.
3. Lücken schließen:
   - Mitarbeiter dürfen nur noch an Admins oder an ihnen zugewiesene Anrufer schreiben.
   - Live-Nachrichten nur für Beteiligte.
   - Selbst-Registrierung nur noch über den Bewerbungsweg.
   - Neue Konten bleiben gesperrt, bis ein Admin sie freigibt.
4. Für jede Regel einen automatischen Test anlegen, der fehlschlägt, sobald die Lücke wieder aufgeht.
5. Danach erneut prüfen und dir einen kurzen Bericht geben: was offen war, was jetzt zu ist, welche Konten gesperrt wurden.
