# Deckblatt: So funktioniert der Lead-Versand

Eine PDF-Seite zum Ausdrucken oder Weiterschicken an den Kollegen, im Portal-Stil, auf Deutsch.

## Inhalt
1. **Kurz erklärt:** Leads einfügen, prüfen, Versand aktiv lassen. Den Rest erledigt das Portal.
2. **Schritt für Schritt:**
   - Lead-Mailing öffnen und auswählen: Firma (z. B. szp-gmbh) oder „ohne Firma“ (Pool über die hinterlegten Resend-Absender).
   - Liste einfügen, z. B. direkt aus dem Meta-Export.
   - Vorschau prüfen: neue Leads, doppelte Leads, Tippfehler wie „.come“.
   - Vorlage für Betreff und Text wählen. Platzhalter wie {Vorname} werden automatisch ersetzt.
   - Optional eine Test-Mail an sich selbst schicken.
   - Versand auf „aktiv“ stellen.
3. **Regeln, die automatisch gelten:**
   - Versand nur von 6 bis 24 Uhr, gleichmäßig verteilt.
   - Höchstens 75 Mails pro Tag und Absender.
   - Keine Adresse wird zweimal angeschrieben.
   - Wer sich abmelden will, wird automatisch gestoppt.
4. **Täglich kontrollieren:** Status der Leads (wartet, gesendet, doppelt, Fehler), Antworten im Postfach.
5. **Wenn etwas nicht stimmt:** Versand pausieren und den Fehlergrund am Lead ansehen.

## Technische Details
- Erstellt mit einem PDF-Skript in /tmp, gespeichert als `/mnt/documents/Lead-Versand-Anleitung.pdf`.
- Vor der Übergabe wird die Seite als Bild geprüft.
