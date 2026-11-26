// Liest Leads aus freiem Text (kopierte Bewerbungen, Listen „Name , Mail“, Blöcke mit -----)
// und aus Tabellen-Exporten (CSV/Tab, z. B. Facebook/Meta). Rein, ohne Server – testbar.
import { parseLeadCsv, fixEmailTypos, cleanPhone, type LeadRow } from "./lead-mailing";

export type ParsedLeads = { rows: LeadRow[]; invalid: number; duplicates: number; duplicateEmails: string[]; problems: string[] };

const EMAIL_G = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+|00)?\d[\d\s/().\-]{6,}\d/;
const LABEL_RE = /^(name|e-?mail|mail|telefon(?:nummer)?|tel\.?|mobil|handy|adresse|geb(?:urts)?\.?\s*datum|geburtstag|geburtdatum|staatsangehörigkeit|familien?stand)\s*:?\s*/i;
const NOISE = /^(bewerber information|kadermarketing leads\s*:?|adresse|deutschland)$/i;

function titleCase(s: string) {
  return s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s\-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s;
}

function looksLikeName(line: string): boolean {
  if (/\d/.test(line) || /@/.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 4 && words.every((w) => /^[\p{L}'.\-]+$/u.test(w));
}

function nameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._\-]/).filter((p) => /^[a-zäöüß]{2,}$/i.test(p));
  if (parts.length >= 2) return { firstName: titleCase(parts[0]!.toUpperCase()), lastName: titleCase(parts.slice(1).join(" ").toUpperCase()) };
  return { firstName: "", lastName: "" };
}

function splitName(full: string) {
  const parts = titleCase(full.replace(/\s+/g, " ").trim()).split(" ").filter(Boolean);
  return { firstName: parts.shift() ?? "", lastName: parts.join(" ") };
}

/** Ein Block → höchstens ein Lead (oder mehrere bei „Name , Mail“-Zeilen ohne Trenner). */
function parseBlock(block: string): LeadRow[] {
  const lines = block.split(/\r?\n/).map((l) => l.replace(/^[\s•·]+|[\s•·]+$/g, "").trim()).filter(Boolean);
  const emails = Array.from(new Set((block.match(EMAIL_G) ?? []).map((e) => fixEmailTypos(e))));
  // Mehrere Zeilen mit je eigener Mail (Liste „Name , mail“) → jede Zeile einzeln.
  if (emails.length > 1) {
    return lines.flatMap((l) => (l.match(EMAIL_G) ? parseBlock(l) : []));
  }
  const email = emails[0];
  if (!email) return [];
  let name = "";
  let phone: string | null = null;
  for (const raw of lines) {
    const isNameLabel = /^name\b/i.test(raw);
    const line = raw.replace(LABEL_RE, "").trim();
    // „Name <mail>“ oder „Name , mail , Telefon“
    const segs = line.split(/\s*[,|·<>]\s*/).map((x) => x.trim()).filter(Boolean);
    for (const seg of segs) {
      if (seg.match(EMAIL_G)) continue;
      const pm = seg.match(PHONE_RE);
      if (pm && !phone && pm[0].replace(/\D/g, "").length >= 8 && !/\d{2}\.\d{2}\.\d{4}/.test(seg)) { phone = cleanPhone(pm[0]); continue; }
      if (!name && !NOISE.test(seg) && (isNameLabel || looksLikeName(seg))) {
        name = isNameLabel ? seg.replace(/\s+\S*str\.?.*$/i, "") : seg;
      }
    }
  }
  const n = name ? splitName(name) : nameFromEmail(email);
  return [{ ...n, email, phone }];
}

function isTable(text: string) {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
  return /(^|[\t;,])\s*"?(e-?mail|email_address)"?\s*([\t;,]|$)/i.test(first);
}

/** Erkennt automatisch Tabelle oder Freitext. */
export function parseLeadText(text: string): ParsedLeads {
  if (isTable(text)) {
    const r = parseLeadCsv(text);
    return { ...r, duplicateEmails: [], problems: [] };
  }
  const blocks = text.split(/\n\s*-{3,}\s*\n|\n\s*\n/);
  const all = blocks.flatMap(parseBlock);
  const problems = blocks
    .filter((b) => b.trim() && !b.match(EMAIL_G) && !NOISE.test(b.trim()))
    .map((b) => b.trim().split(/\r?\n/)[0]!.slice(0, 60));
  return { ...dedupe(all), invalid: problems.length, problems };
}

/** Mehrere Dateien zusammenführen; doppelte Adressen über alle Dateien entfernen. */
export function mergeLeadFiles(files: { name: string; text: string }[]): ParsedLeads {
  const parsed = files.map((f) => parseLeadText(f.text));
  const d = dedupe(parsed.flatMap((p) => p.rows));
  return {
    rows: d.rows,
    duplicates: d.duplicates + parsed.reduce((n, p) => n + p.duplicates, 0),
    duplicateEmails: d.duplicateEmails,
    invalid: parsed.reduce((n, p) => n + p.invalid, 0),
    problems: parsed.flatMap((p) => p.problems),
  };
}

function dedupe(rows: LeadRow[]) {
  const seen = new Map<string, LeadRow>();
  const dup = new Set<string>();
  let duplicates = 0;
  for (const r of rows) {
    const k = r.email.toLowerCase();
    const prev = seen.get(k);
    if (prev) {
      duplicates++; dup.add(k);
      if (!prev.firstName && r.firstName) { prev.firstName = r.firstName; prev.lastName = r.lastName; }
      if (!prev.phone && r.phone) prev.phone = r.phone;
      continue;
    }
    seen.set(k, { ...r, email: k });
  }
  return { rows: [...seen.values()], duplicates, duplicateEmails: [...dup] };
}
