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
