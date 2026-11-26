/** Platzhalter in Postfach-Vorlagen ersetzen; leere Werte hinterlassen keine Lücke vor dem Komma. */
export function fillMailTemplate(tpl: string, vars: { Vorname?: string; Nachname?: string; Firma?: string }): string {
  return tpl
    .replace(/\{(Vorname|Nachname|Firma)\}/g, (_, k: "Vorname" | "Nachname" | "Firma") => (vars[k] ?? "").trim())
    .replace(/[ \t]+,/g, ",").replace(/[ \t]{2,}/g, " ");
}
