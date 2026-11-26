// Reine Helfer für das Lead-Mailing (CSV-Import, Vorlage, Tageslimit).
// Keine Server-Abhängigkeiten → testbar und im Browser nutzbar.

export type LeadRow = { firstName: string; lastName: string; email: string; phone: string | null };

export const DEFAULT_LEAD_SUBJECT = "Ihre Bewerbung bei {Firma} – nächster Schritt";
export const DEFAULT_LEAD_BODY = `Guten Tag {Vorname} {Nachname},

vielen Dank für Ihre Bewerbung über Indeed. Wir freuen uns, Ihnen mitzuteilen, dass Sie in die engere Auswahl aufgenommen wurden.

Bitte registrieren Sie sich auf unserer Website {Homepage} und wählen Sie anschließend über Calendly einen Termin für Ihr Interview: {Calendly}

Bei Fragen antworten Sie einfach auf diese E-Mail.

Freundliche Grüße
{Absender}
{Firma}`;

/** Häufige Tippfehler am Ende (z. B. „.come“ aus Facebook-Formularen) korrigieren. */
export function fixEmailTypos(email: string): string {
  return email.trim().toLowerCase().replace(/\.(come|con|cmo|comm)$/, ".com").replace(/\.dee$/, ".de");
}

/** Telefonnummer bereinigen (Meta-Präfix „p:“, unsichtbare Zeichen). */
export function cleanPhone(v: string): string | null {
  const t = v.replace(/^p:/i, "").replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim();
  return t || null;
}

export const DEFAULT_POOL_SUBJECT = "Ihre Bewerbung – nächster Schritt";
export const DEFAULT_POOL_BODY = `Guten Tag {Vorname} {Nachname},

vielen Dank für Ihre Bewerbung. Wir freuen uns, Ihnen mitzuteilen, dass Sie in die engere Auswahl aufgenommen wurden.

Bitte registrieren Sie sich auf unserer Website {Homepage} und wählen Sie anschließend einen Termin für Ihr Gespräch: {Calendly}

Bei Fragen antworten Sie einfach auf diese E-Mail.

Freundliche Grüße
{Absender}`;

/** Gleiche Adresse mehrfach in einem Versandlauf → nur der erste wird gesendet. */
export function splitBatchDuplicates<T extends { id: string; email: string }>(rows: T[]): { unique: T[]; duplicates: string[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: string[] = [];
  for (const r of rows) {
    const k = String(r.email).trim().toLowerCase();
    if (seen.has(k)) duplicates.push(r.id); else { seen.add(k); unique.push(r); }
  }
  return { unique, duplicates };
}

/** Ampel für die Versand-Kontrolle. */
export function sendHealth(o: { sentToday: number; dailyLimit: number; sent: number; bounced: number; lastErrorRecent: boolean }): "green" | "yellow" | "red" {
  const bounceRate = o.sent >= 20 ? o.bounced / o.sent : 0;
  if (o.lastErrorRecent || bounceRate >= 0.05) return "red";
  if (o.sentToday >= o.dailyLimit * 0.8 || bounceRate >= 0.02) return "yellow";
  return "green";
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-zäöüß]/g, "");
const FIRST = ["vorname", "firstname", "first", "givenname"];
const LAST = ["nachname", "lastname", "last", "surname", "familyname", "familienname"];
const FULL = ["name", "fullname", "kandidat", "candidate", "candidatename", "bewerber", "vollständigername"];
const MAIL = ["email", "emailadresse", "mail", "emailaddress", "candidateemail"];
const PHONE = ["telefon", "phone", "telefonnummer", "phonenumber", "mobil", "handy"];

/** Liest einen Indeed-CSV-Export (Komma oder Semikolon). Entfernt ungültige Mails und Dubletten. */
export function parseLeadCsv(text: string): { rows: LeadRow[]; invalid: number; duplicates: number } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], invalid: 0, duplicates: 0 };
  const cnt = (c: string) => lines[0].split(c).length - 1;
  const sep = cnt("\t") > Math.max(cnt(";"), cnt(",")) ? "\t" : cnt(";") > cnt(",") ? ";" : ",";
  const header = splitCsvLine(lines[0], sep).map(norm);
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iFirst = idx(FIRST), iLast = idx(LAST), iFull = idx(FULL), iMail = idx(MAIL), iPhone = idx(PHONE);
  if (iMail < 0) throw new Error("Keine E-Mail-Spalte gefunden (z. B. „E-Mail“ oder „Email“).");
  const seen = new Set<string>();
  const rows: LeadRow[] = [];
  let invalid = 0, duplicates = 0;
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line, sep);
    const email = fixEmailTypos((cols[iMail] ?? "").trim().toLowerCase());
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    let firstName = iFirst >= 0 ? cols[iFirst] ?? "" : "";
    let lastName = iLast >= 0 ? cols[iLast] ?? "" : "";
    if (!firstName && !lastName && iFull >= 0) {
      const parts = (cols[iFull] ?? "").trim().split(/\s+/);
      firstName = parts.shift() ?? "";
      lastName = parts.join(" ");
    }
    rows.push({ firstName: firstName.trim(), lastName: lastName.trim(), email, phone: iPhone >= 0 ? cleanPhone(cols[iPhone] ?? "") : null });
  }
  return { rows, invalid, duplicates };
}

export type TemplateVars = {
  Vorname?: string; Nachname?: string; Firma?: string; Homepage?: string; Calendly?: string; Absender?: string;
};

export function renderLeadTemplate(tpl: string, vars: TemplateVars): string {
  return tpl.replace(/\{(Vorname|Nachname|Firma|Homepage|Calendly|Absender)\}/g, (_, k: keyof TemplateVars) => (vars[k] ?? "").trim())
    .replace(/[ \t]+,/g, ",").replace(/Guten Tag ,/g, "Guten Tag,");
}

/**
 * Wie viele Mails dürfen JETZT noch raus? Versand nur 06–24 Uhr (Berlin),
 * gleichmäßig über das Fenster verteilt, nie mehr als das Tageslimit.
 */
export function allowedToSendNow(dailyLimit: number, sentToday: number, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const minutes = h * 60 + m;
  const start = 6 * 60, end = 24 * 60;
  if (minutes < start || minutes >= end) return 0;
  const fraction = (minutes - start + 10) / (end - start);
  const target = Math.min(dailyLimit, Math.ceil(dailyLimit * Math.min(1, fraction)));
  return Math.max(0, target - sentToday);
}

/** Beginn des heutigen Tages in deutscher Zeit (Tageslimit zählt ab 0 Uhr Berlin). */
export function berlinStartOfDay(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(v("year"), v("month") - 1, v("day")) - offset);
}

/**
 * Kontingent für einen Versandlauf. Automatisch (Cron): nur 06–24 Uhr, verteilt.
 * Von Hand gestartet: zu jeder Uhrzeit, aber nie über das Tageslimit.
 */
export function leadAllowance(dailyLimit: number, sentToday: number, now: Date, manual: boolean): number {
  if (manual) return Math.max(0, dailyLimit - sentToday);
  return allowedToSendNow(dailyLimit, sentToday, now);
}

/** Abmeldewunsch in einer Antwort erkennen. */
export function isUnsubscribeReply(subject: string, body: string): boolean {
  // Nur der neue Antworttext zählt, kein zitierter Verlauf.
  const fresh = body.split(/\n\s*>|\n.*(?:schrieb|wrote).*:|\n-{2,}\s*(?:Original|Ursprüngliche)/i)[0];
  const t = `${subject}\n${fresh}`.toLowerCase();
  return /\b(bitte\s+(?:abmelden|austragen|löschen\s+sie\s+mich)|abmeldung|unsubscribe|melden\s+sie\s+mich\s+ab|keine\s+weiteren\s+(?:e-?mails|nachrichten)\s+(?:mehr\s+)?(?:senden|schicken|zusenden))\b/.test(t);
}

/** Nur dauerhafte Rückläufer sperren (Adresse existiert nicht), keine vollen Postfächer. */
export function isPermanentBounce(bounce: { type?: string | null } | null | undefined): boolean {
  const t = String(bounce?.type ?? "").toLowerCase();
  return t === "permanent" || t === "hard";
}

export const MAIL_BLOCK_PREFIX = "MAIL_BLOCKED:";

export function mailBlockMessage(status: string, error: string | null): string {
  const why = status === "bounced" ? "Die Adresse existiert nicht (Mail kam dauerhaft zurück)."
    : error === "email.complained" ? "Die Person hat eine frühere Mail als Spam markiert."
    : "Die Person hat per Antwort um Abmeldung gebeten.";
  return `${MAIL_BLOCK_PREFIX} ${why}`;
}

export const MAIL_ATTACHMENT_MAX_TOTAL = 10 * 1024 * 1024;
export const MAIL_ATTACHMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "doc", "docx", "odt", "txt"];

/** Prüft Anhänge vor dem Senden; gibt eine Fehlermeldung oder null zurück. */
export function checkMailAttachments(files: { name: string; size: number }[]): string | null {
  if (files.length > 10) return "Höchstens 10 Anhänge pro E-Mail.";
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MAIL_ATTACHMENT_EXTENSIONS.includes(ext)) return `Dateityp nicht erlaubt: ${f.name} (erlaubt: PDF, Bilder, Word, Text).`;
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAIL_ATTACHMENT_MAX_TOTAL) return "Anhänge sind zusammen größer als 10 MB.";
  return null;
}

/** Ordnet gesendete Mails Personen zu – über Bewerbungs-/Profil-ID und E-Mail-Adresse. */
export type MailPerson = { id: string; ids: string[]; emails: string[] };
export function matchMailsToPeople<T extends { id: string; created_at: string; application_id?: string | null; profile_id?: string | null; peer_email?: string | null }>(rows: T[], people: MailPerson[]) {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest: Record<string, T> = {};
  const byPerson: Record<string, T[]> = {};
  for (const p of people) {
    const ids = new Set(p.ids.filter(Boolean));
    const emails = new Set(p.emails.filter(Boolean).map((e) => e.toLowerCase()));
    const list = sorted.filter((m) => (m.application_id && ids.has(m.application_id)) || (m.profile_id && ids.has(m.profile_id)) || (m.peer_email && emails.has(m.peer_email.toLowerCase())));
    byPerson[p.id] = list;
    if (list[0]) latest[p.id] = list[0];
  }
  return { latest, byPerson };
}

/** gmail.com und googlemail.com sind dasselbe Postfach. */
export function normalizeMailAddress(addr: string | null | undefined): string {
  const a = String(addr ?? "").trim().toLowerCase();
  return a.endsWith("@googlemail.com") ? a.replace(/@googlemail\.com$/, "@gmail.com") : a;
}
export function mailAddressVariants(addr: string): string[] {
  const n = normalizeMailAddress(addr);
  return n.endsWith("@gmail.com") ? [n, n.replace(/@gmail\.com$/, "@googlemail.com")] : [n];
}
const domainOf = (a: string) => a.split("@")[1] ?? "";
/** Firma anhand der Empfängeradresse: exakte Absenderadresse, sonst gleiche (Sub-)Domain. */
export function resolveTenantFromRecipient(to: string[], senders: { tenant_id: string; sender_email: string | null }[]): string | null {
  const tos = to.map(normalizeMailAddress).filter(Boolean);
  for (const t of tos) { const hit = senders.find((s) => normalizeMailAddress(s.sender_email) === t); if (hit) return hit.tenant_id; }
  for (const t of tos) {
    const d = domainOf(t);
    const hit = senders.find((s) => { const sd = domainOf(normalizeMailAddress(s.sender_email)); return !!sd && (d === sd || d.endsWith("." + sd) || sd.endsWith("." + d)); });
    if (hit) return hit.tenant_id;
  }
  return null;
}
