// Serverseitiger Lead-Versand über Resend + Verarbeitung der Resend-Webhooks.
import { berlinStartOfDay, mailAddressVariants, resolveTenantFromRecipient } from "./lead-mailing";
import {
  leadAllowance,
  renderLeadTemplate,
  isUnsubscribeReply,
  DEFAULT_LEAD_BODY,
  DEFAULT_LEAD_SUBJECT,
  DEFAULT_POOL_BODY,
  DEFAULT_POOL_SUBJECT,
  splitBatchDuplicates,
} from "./lead-mailing";

const RESEND_API = "https://api.resend.com";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadResendConfig() {
  const db = await admin();
  const { data, error } = await db.from("system_settings").select("resend_api_key, resend_webhook_secret").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Resend-Zugang konnte nicht geladen werden: ${error.message}`);
  return {
    apiKey: (data?.resend_api_key as string | null)?.trim() || process.env.RESEND_API_KEY || null,
    webhookSecret: (data?.resend_webhook_secret as string | null)?.trim() || process.env.RESEND_WEBHOOK_SECRET || null,
  };
}

import { renderMail, type MailKind, type MailSignature } from "./mail-template";

/** Signatur einer Firma: eigene Felder aus lead_mail_settings, sonst Firmendaten. */
export async function loadSignature(tenantId: string | null | undefined, senderEmail?: string | null): Promise<MailSignature> {
  if (!tenantId) return { email: senderEmail ?? null };
  const db = await admin();
  const [{ data: t }, { data: s }] = await Promise.all([
    db.from("tenants").select("name, logo_url, primary_color, domain, company_signer_name, company_signer_title, company_ceo_name").eq("id", tenantId).maybeSingle(),
    db.from("lead_mail_settings").select("sender_email, sender_name, sig_name, sig_position, sig_phone, sig_website, sig_color").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return {
    company: t?.name ?? null,
    name: s?.sig_name || s?.sender_name || t?.company_signer_name || t?.company_ceo_name || null,
    position: s?.sig_position || t?.company_signer_title || null,
    phone: s?.sig_phone || null,
    email: senderEmail ?? s?.sender_email ?? null,
    website: s?.sig_website || t?.domain || null,
    logoUrl: t?.logo_url || null,
    color: s?.sig_color || t?.primary_color || null,
  };
}

export async function sendViaResend(opts: {
  apiKey: string; from: string; to: string; subject: string; text: string; replyTo: string;
  idempotencyKey?: string; kind?: MailKind; signature?: MailSignature;
  attachments?: { filename: string; content: string }[];
}): Promise<{ id: string }> {
  const kind = opts.kind ?? "lead";
  const { html, text } = renderMail({ text: opts.text, signature: opts.signature ?? { email: opts.replyTo }, kind, subject: opts.subject });
  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      text,
      html,
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      ...(kind === "lead" ? { headers: { "List-Unsubscribe": `<mailto:${opts.replyTo}?subject=Abmelden>` } } : {}),
    }),
  });
  const bodyTxt = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${bodyTxt.slice(0, 300)}`);
  const data = JSON.parse(bodyTxt || "{}");
  return { id: String(data.id ?? "") };
}

export function fromHeader(name: string | null, email: string) {
  const n = (name ?? "").replace(/["<>]/g, "").trim();
  return n ? `"${n}" <${email}>` : email;
}

/** Absender-Einstellungen eines Versand-Topfs: eine Firma oder „Ohne Firma“ (tenant_id null). */
type Bucket = {
  tenant_id: string | null; sender_email: string | null; sender_name: string | null; subject: string | null; body: string | null;
  homepage_url: string | null; calendly_url: string | null; daily_limit: number;
  sig_name?: string | null; sig_position?: string | null; sig_phone?: string | null; sig_website?: string | null; sig_color?: string | null;
};

/** Heute schon gesendet – Firma: alle ausgehenden Mails; ohne Firma: automatisch versendete Leads. */
export async function sentTodayFor(db: any, tenantId: string | null, startOfDay: Date): Promise<number> {
  if (tenantId) {
    const { count } = await db.from("lead_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("direction", "out").gte("created_at", startOfDay.toISOString());
    return count ?? 0;
  }
  const { count } = await db.from("applications").select("id", { count: "exact", head: true })
    .is("tenant_id", null).not("lead_source", "is", null).gte("lead_mail_sent_at", startOfDay.toISOString());
  return count ?? 0;
}

/** Letzten Lauf merken; fehlt die Spalte (Migration noch nicht da), still ignorieren. */
async function recordRun(db: any, tenantId: string | null, now: Date, result: string) {
  const patch = { last_run_at: now.toISOString(), last_run_result: result.slice(0, 300) };
  try {
    if (tenantId) await db.from("lead_mail_settings").update(patch).eq("tenant_id", tenantId);
    else await db.from("lead_pool_settings").update(patch).eq("id", 1);
  } catch { /* ignore */ }
}

/** Ein Versandlauf (Cron alle 10 Minuten). Leads werden vor dem Senden fest reserviert. */
export async function runLeadMailingCycle(now = new Date(), opts: { manual?: boolean } = {}) {
  const db = await admin();
  const { apiKey } = await loadResendConfig();
  if (!apiKey) return { skipped: "no_resend_key" };

  const [{ data: settings }, { data: pool }] = await Promise.all([
    db.from("lead_mail_settings").select("*").eq("active", true),
    db.from("lead_pool_settings").select("*").eq("id", 1).eq("active", true).maybeSingle(),
  ]);
  const buckets: Bucket[] = [...(settings ?? []), ...(pool ? [{ ...pool, tenant_id: null }] : [])];
  const startOfDay = berlinStartOfDay(now);
  const results: any[] = [];
  let rateLimited = false;

  for (const s of buckets) {
    if (rateLimited) break;
    if (!s.sender_email) continue;
    const sentToday = await sentTodayFor(db, s.tenant_id, startOfDay);
    const allowed = Math.min(25, leadAllowance(s.daily_limit, sentToday, now, !!opts.manual));
    if (allowed <= 0) {
      const reason = sentToday >= s.daily_limit ? "Tageslimit erreicht" : "Außerhalb 6–24 Uhr oder Kontingent für diese Uhrzeit verbraucht";
      results.push({ tenant: s.tenant_id, sent: 0, reason });
      await recordRun(db, s.tenant_id, now, `0 gesendet – ${reason}`);
      continue;
    }

    const { data: claimed, error: claimErr } = await db.rpc("claim_lead_batch", { p_tenant: s.tenant_id, p_limit: allowed });
    if (claimErr) throw new Error(`Leads konnten nicht reserviert werden: ${claimErr.message}`);
    const { unique, duplicates } = splitBatchDuplicates((claimed ?? []) as any[]);
    if (duplicates.length) {
      await db.from("applications").update({ lead_mail_status: "duplicate", lead_mail_error: "Adresse wurde bereits angeschrieben." }).in("id", duplicates);
    }

    const tenant = s.tenant_id ? (await db.from("tenants").select("name").eq("id", s.tenant_id).maybeSingle()).data : null;
    const signature: MailSignature = s.tenant_id ? await loadSignature(s.tenant_id, s.sender_email) : {
      company: null, name: s.sig_name || s.sender_name, position: s.sig_position ?? null, phone: s.sig_phone ?? null,
      email: s.sender_email, website: s.sig_website ?? null, color: s.sig_color ?? null,
    };
    let sent = 0;
    for (let i = 0; i < unique.length; i++) {
      const lead = unique[i];
      const vars = {
        Vorname: lead.first_name ?? "", Nachname: lead.last_name ?? "",
        Firma: tenant?.name ?? "", Homepage: s.homepage_url ?? "", Calendly: s.calendly_url ?? "",
        Absender: s.sender_name ?? "",
      };
      const subject = renderLeadTemplate(s.subject || (s.tenant_id ? DEFAULT_LEAD_SUBJECT : DEFAULT_POOL_SUBJECT), vars);
      const text = renderLeadTemplate(s.body || (s.tenant_id ? DEFAULT_LEAD_BODY : DEFAULT_POOL_BODY), vars);
      try {
        const r = await sendViaResend({
          apiKey, from: fromHeader(s.sender_name, s.sender_email), to: lead.email, subject, text,
          replyTo: s.sender_email, idempotencyKey: `lead-invite-${lead.id}`, kind: "lead", signature,
        });
        await db.from("applications").update({ lead_mail_status: "sent", lead_mail_sent_at: new Date().toISOString(), lead_mail_error: null }).eq("id", lead.id);
        await db.from("lead_messages").insert({
          application_id: lead.id, tenant_id: s.tenant_id, direction: "out", from_email: s.sender_email,
          to_email: lead.email, subject, body_text: text, provider_id: r.id || null, handled: true,
          peer_email: String(lead.email).toLowerCase(), kind: "lead",
        });
        sent++;
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 500);
        console.warn("[lead-mailing] send failed", lead.id, msg);
        if (/Resend 429/.test(msg)) {
          // Resend bremst: nichts verloren – dieser und alle übrigen reservierten Leads warten auf den nächsten Lauf.
          const rest = unique.slice(i).map((l: any) => l.id);
          await db.from("applications").update({ lead_mail_status: "pending", lead_mail_error: "Resend: zu viele Anfragen – wird später erneut versucht." }).in("id", rest);
          rateLimited = true;
          break;
        }
        await db.from("applications").update({ lead_mail_status: "failed", lead_mail_error: msg }).eq("id", lead.id);
      }
    }
    results.push({ tenant: s.tenant_id, sent, rateLimited });
    const summary = rateLimited ? `${sent} gesendet – Resend bremst, Rest folgt im nächsten Lauf`
      : unique.length === 0 ? "0 gesendet – keine wartenden Leads" : `${sent} von ${unique.length} gesendet`;
    await recordRun(db, s.tenant_id, now, `${summary}${opts.manual ? " (von Hand)" : ""}`);
  }
  return { results };
}

// ───────────── Webhook (Svix-Signatur) ─────────────

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifySvixSignature(secret: string, headers: Headers, body: string, nowSec = Math.floor(Date.now() / 1000)) {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(nowSec - Number(ts)) > 5 * 60) return false;
  const key = await crypto.subtle.importKey("raw", b64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  let bin = "";
  mac.forEach((b) => (bin += String.fromCharCode(b)));
  const expected = btoa(bin);
  return sigHeader.split(" ").some((part) => {
    const v = part.split(",")[1] ?? "";
    if (v.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

const addrOf = (v: unknown): string => {
  const s = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
};

export async function handleResendEvent(evt: any) {
  const db = await admin();
  const type: string = evt?.type ?? "";
  const data = evt?.data ?? {};

  const trackId = String(data.email_id ?? data.id ?? "");
  if (trackId && (type === "email.delivered" || type === "email.opened" || type === "email.bounced")) {
    const { data: msg } = await db.from("lead_messages").select("id, delivered_at, opened_at, open_count, bounced_at")
      .eq("provider_id", trackId).eq("direction", "out").maybeSingle();
    if (msg) {
      const patch = trackingPatch(msg, type, String(evt?.created_at ?? data.created_at ?? new Date().toISOString()));
      if (patch) await db.from("lead_messages").update(patch).eq("id", msg.id);
    }
    if (type !== "email.bounced") return { tracked: type };
  }

  if (type === "email.bounced" || type === "email.complained") {
    const to = addrOf(data.to);
    if (!to) return { ignored: true };
    if (type === "email.bounced") {
      const { isPermanentBounce } = await import("@/lib/lead-mailing");
      if (!isPermanentBounce(data.bounce)) return { ignored: "transient_bounce" };
    }
    const status = type === "email.bounced" ? "bounced" : "unsubscribed";
    await db.from("applications").update({ lead_mail_status: status, lead_mail_error: type }).ilike("email", to).not("lead_source", "is", null);
    return { updated: status };
  }

  if (type === "email.received") {
    const from = addrOf(data.from);
    const providerId = String(data.email_id ?? data.id ?? "");
    let text: string = data.text ?? "";
    const subject: string = data.subject ?? "";
    if (!text && providerId) {
      const { apiKey } = await loadResendConfig();
      if (apiKey) {
        const r = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(providerId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!r.ok) {
          const reason = await r.text();
          console.error(`[resend-receiving] ${r.status}: ${reason}`);
          throw new Error(`Mailinhalt konnte nicht abgerufen werden (Resend ${r.status}). Bitte den Resend-Zugang und seine Empfangsrechte prüfen.`);
        }
        const response = await r.json();
        const full = response?.data ?? response;
        text = full?.text || (full?.html ? String(full.html).replace(/<[^>]+>/g, " ") : "");
      }
    }
    // Zuordnung: bestehender Verlauf (auch gmail/googlemail), sonst Bewerbung/Profil, Firma zusätzlich über Empfängeradresse.
    const variants = mailAddressVariants(from);
    const { data: prev } = await db
      .from("lead_messages").select("application_id, profile_id, tenant_id, kind")
      .in("peer_email", variants).eq("direction", "out").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: app } = prev
      ? { data: prev.application_id ? { id: prev.application_id, tenant_id: prev.tenant_id } : null }
      : await db.from("applications").select("id, tenant_id, lead_source").or(variants.map((v) => `email.ilike.${v}`).join(","))
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: senders } = await db.from("lead_mail_settings").select("tenant_id, sender_email");
    const toList = (Array.isArray(data.to) ? data.to : [data.to]).map(addrOf);
    const recipientTenant = resolveTenantFromRecipient(toList, senders ?? []);
    // The provider index is partial (WHERE provider_id IS NOT NULL).
    // PostgREST ON CONFLICT without that predicate cannot infer it (42P10).
    const attachments = providerId ? await storeInboundAttachments(db, providerId) : [];
    const { error: insertError } = await db.from("lead_messages").insert({
      attachments,
      application_id: app?.id ?? null, profile_id: prev?.profile_id ?? null,
      tenant_id: prev?.tenant_id ?? recipientTenant ?? app?.tenant_id ?? null, direction: "in",
      from_email: from, to_email: addrOf(data.to), subject, body_text: String(text).slice(0, 20000),
      provider_id: providerId || null, handled: false, peer_email: from,
      ...(data.created_at ? { created_at: String(data.created_at) } : {}),
      kind: prev?.kind ?? (app ? "lead" : "other"),
    });
    if (insertError?.code === "23505" && providerId) {
      const { data: duplicate, error: duplicateError } = await db.from("lead_messages")
        .select("id").eq("provider_id", providerId).eq("direction", "in").maybeSingle();
      if (!duplicateError && duplicate) return { stored: false };
    }
    if (insertError) throw new Error(`Eingegangene Mail konnte nicht gespeichert werden: ${insertError.message}`);
    if (app?.id && (prev?.kind ?? "lead") === "lead") {
      const status = isUnsubscribeReply(subject, text) ? "unsubscribed" : "replied";
      await db.from("applications").update({ lead_mail_status: status }).eq("id", app.id);
    }
    return { stored: true };
  }
  return { ignored: type };
}

export function trackingPatch(
  msg: { delivered_at: string | null; opened_at: string | null; open_count: number | null; bounced_at: string | null },
  type: string, at: string,
): Record<string, unknown> | null {
  if (type === "email.delivered") return msg.delivered_at ? null : { delivered_at: at };
  if (type === "email.opened") return { opened_at: msg.opened_at ?? at, open_count: (msg.open_count ?? 0) + 1, delivered_at: msg.delivered_at ?? at };
  if (type === "email.bounced") return msg.bounced_at ? null : { bounced_at: at };
  return null;
}

/** Neue, noch nicht gespeicherte Eingänge aus einer Resend-Liste auswählen. */
export function pickNewReceived(items: any[], existingIds: Set<string>, sinceMs: number): any[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const id = String(it?.id ?? "");
    if (!id || existingIds.has(id) || seen.has(id)) return false;
    const t = Date.parse(it?.created_at ?? "");
    if (Number.isFinite(t) && t < sinceMs) return false;
    seen.add(id);
    return true;
  });
}

/** Holt eingegangene Mails direkt aus Resend (Fallback, falls der Webhook nichts liefert). */
export async function syncReceivedEmails(days = 15): Promise<{ fetched: number; stored: number; error?: string }> {
  const { apiKey } = await loadResendConfig();
  if (!apiKey) return { fetched: 0, stored: 0, error: "Kein Resend-Zugang hinterlegt." };
  const sinceMs = Date.now() - days * 86400000;
  const items: any[] = [];
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = `${RESEND_API}/emails/receiving?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) {
      const body = await r.text();
      console.error(`[resend-sync] ${r.status}: ${body}`);
      return { fetched: items.length, stored: 0, error: `Resend antwortete mit ${r.status}: ${body.slice(0, 200)}` };
    }
    const j = await r.json();
    const list: any[] = j?.data ?? [];
    items.push(...list);
    const last = list[list.length - 1];
    if (!j?.has_more || !last || Date.parse(last.created_at ?? "") < sinceMs) break;
    after = String(last.id);
  }
  const db = await admin();
  const ids = items.map((i) => String(i?.id ?? "")).filter(Boolean);
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("lead_messages").select("provider_id").eq("direction", "in").in("provider_id", ids.slice(i, i + 100));
    if (error) return { fetched: items.length, stored: 0, error: `Vorhandene Mails konnten nicht geprüft werden: ${error.message}` };
    for (const row of data ?? []) existing.add(String(row.provider_id));
  }
  const fresh = pickNewReceived(items, existing, sinceMs);
  let stored = 0;
  for (const it of fresh) {
    // Receiving details also count against Resend's request limit.
    await new Promise((resolve) => setTimeout(resolve, 550));
    try {
      const result = await handleResendEvent({ type: "email.received", data: { ...it, email_id: it.id } });
      if (result.stored) stored++;
    } catch (e: any) {
      console.error("[resend-sync] store", it?.id, e?.message ?? e);
      return { fetched: items.length, stored, error: `${stored} neue Mails gespeichert. ${e?.message ?? "Abruf fehlgeschlagen"} Bitte erneut abrufen.` };
    }
  }
  return { fetched: items.length, stored };
}

export type StoredAttachment = { name: string; type: string; size: number; path: string };
export const MAIL_ATTACHMENT_BUCKET = "mail-attachments";

function safeName(n: string) {
  return (n || "datei").replace(/[^\w.\-äöüÄÖÜß ]+/g, "_").slice(0, 120);
}

/** Legt eine Datei im privaten Anhang-Speicher ab. */
export async function storeAttachment(db: any, folder: string, name: string, type: string, bytes: Uint8Array): Promise<StoredAttachment> {
  const path = `${folder}/${crypto.randomUUID()}-${safeName(name)}`;
  const { error } = await db.storage.from(MAIL_ATTACHMENT_BUCKET).upload(path, bytes, { contentType: type || "application/octet-stream", upsert: false });
  if (error) throw new Error(`Anhang konnte nicht gespeichert werden: ${error.message}`);
  return { name: name || "datei", type: type || "application/octet-stream", size: bytes.byteLength, path };
}

/** Holt Anhänge einer eingegangenen Mail aus Resend. Fehler verhindern nie das Speichern der Mail. */
async function storeInboundAttachments(db: any, providerId: string): Promise<StoredAttachment[]> {
  try {
    const { apiKey } = await loadResendConfig();
    if (!apiKey) return [];
    const r = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(providerId)}/attachments`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) { console.error(`[resend-attachments] ${r.status}: ${(await r.text()).slice(0, 200)}`); return []; }
    const body = await r.json();
    const list: any[] = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    const out: StoredAttachment[] = [];
    for (const a of list.slice(0, 20)) {
      const url = a?.download_url;
      if (!url || (a?.size && a.size > 15 * 1024 * 1024)) continue;
      const f = await fetch(url);
      if (!f.ok) continue;
      const bytes = new Uint8Array(await f.arrayBuffer());
      out.push(await storeAttachment(db, `in/${providerId}`, a?.filename ?? "datei", a?.content_type ?? "", bytes));
    }
    return out;
  } catch (e) {
    console.error("[resend-attachments]", e);
    return [];
  }
}
