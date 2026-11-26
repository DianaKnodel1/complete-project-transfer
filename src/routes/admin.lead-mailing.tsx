import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/lead-mailing")({
  head: () => ({ meta: [
    { title: "Lead-Mailing – Mitarbeiter-Portal" },
    { name: "description", content: "Indeed-Bewerbungen importieren und den E-Mail-Versand je Firma verwalten." },
    { property: "og:title", content: "Lead-Mailing – Mitarbeiter-Portal" },
    { property: "og:description", content: "E-Mail-Versand und Bewerbungsvorlagen je Firma verwalten." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: LeadMailingPage,
});

import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";
import {
  getLeadMailingOverview, saveResendAccess, saveLeadMailSettings, importLeads, checkLeadDuplicates, sendLeadTestMail, runLeadMailingNow,
} from "@/lib/lead-mailing.functions";
import { renderMail } from "@/lib/mail-template";
import { renderLeadTemplate, DEFAULT_LEAD_BODY, DEFAULT_LEAD_SUBJECT, DEFAULT_POOL_BODY, DEFAULT_POOL_SUBJECT, type LeadRow } from "@/lib/lead-mailing";
import { mergeLeadFiles } from "@/lib/lead-text-parser";

const POOL = "pool";
const HEALTH: Record<string, { label: string; cls: string }> = {
  green: { label: "OK", cls: "bg-primary/15 text-primary" },
  yellow: { label: "Achtung", cls: "bg-accent text-accent-foreground" },
  red: { label: "Problem", cls: "bg-destructive/15 text-destructive" },
};

type Settings = {
  tenant_id: string; active: boolean; sender_email: string | null; sender_name: string | null;
  subject: string | null; body: string | null; homepage_url: string | null; calendly_url: string | null; daily_limit: number;
  sig_name?: string | null; sig_position?: string | null; sig_phone?: string | null; sig_website?: string | null; sig_color?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Wartend", sending: "Wird gesendet", sent: "Gesendet", replied: "Geantwortet", failed: "Fehler", bounced: "Unzustellbar", unsubscribed: "Abgemeldet", check: "Prüfen", duplicate: "Doppelt übersprungen",
};

function LeadMailingPage() {
  const { toast } = useToast();
  const loadFn = useServerFn(getLeadMailingOverview);
  const saveAccessFn = useServerFn(saveResendAccess);
  const saveSettingsFn = useServerFn(saveLeadMailSettings);
  const importFn = useServerFn(importLeads);
  const checkDupFn = useServerFn(checkLeadDuplicates);
  const testFn = useServerFn(sendLeadTestMail);
  const runNowFn = useServerFn(runLeadMailingNow);

  const [data, setData] = useState<any>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [form, setForm] = useState<Settings | null>(null);
  const [resendKey, setResendKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [csv, setCsv] = useState<{ name: string; rows: LeadRow[]; invalid: number; duplicates: number; problems: string[]; existing: string[] } | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await loadFn({ data: {} });
      setData(d);
      setTenantId((cur) => cur || POOL);
    } catch (e: any) {
      toast({ title: "Laden fehlgeschlagen", description: e?.message, variant: "destructive" });
    }
  }, [loadFn, toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data || !tenantId) return;
    const isPool = tenantId === POOL;
    const s = isPool ? (data.pool ? { ...data.pool, tenant_id: POOL } : null) : data.settings.find((x: Settings) => x.tenant_id === tenantId);
    setForm(s ?? {
      tenant_id: tenantId, active: false, sender_email: "", sender_name: "", subject: isPool ? DEFAULT_POOL_SUBJECT : DEFAULT_LEAD_SUBJECT,
      body: isPool ? DEFAULT_POOL_BODY : DEFAULT_LEAD_BODY, homepage_url: "", calendly_url: "", daily_limit: 75,
    });
    setCsv(null);
  }, [data, tenantId]);

  const isPool = tenantId === POOL;
  const defaultBody = isPool ? DEFAULT_POOL_BODY : DEFAULT_LEAD_BODY;
  const defaultSubject = isPool ? DEFAULT_POOL_SUBJECT : DEFAULT_LEAD_SUBJECT;
  const tenantName = isPool ? "" : data?.tenants.find((t: any) => t.id === tenantId)?.name ?? "";
  const bucketLabel = isPool ? "Ohne Firma" : tenantName;
  const preview = useMemo(() => {
    if (!form) return "";
    const v = { Vorname: "Anna", Nachname: "Muster", Firma: tenantName, Homepage: form.homepage_url ?? "", Calendly: form.calendly_url ?? "", Absender: form.sender_name ?? "" };
    return `Betreff: ${renderLeadTemplate(form.subject || defaultSubject, v)}\n\n${renderLeadTemplate(form.body || defaultBody, v)}`;
  }, [form, tenantName, defaultBody, defaultSubject]);
  const tenantInfo: any = data?.tenants.find((t: any) => t.id === tenantId) ?? null;
  const htmlPreview = useMemo(() => {
    if (!form) return "";
    const v = { Vorname: "Anna", Nachname: "Muster", Firma: tenantName, Homepage: form.homepage_url ?? "", Calendly: form.calendly_url ?? "", Absender: form.sender_name ?? "" };
    return renderMail({
      kind: "lead", subject: form.subject ?? "",
      text: renderLeadTemplate(form.body || defaultBody, v),
      signature: {
        company: tenantName, name: form.sig_name || form.sender_name, position: form.sig_position, phone: form.sig_phone,
        email: form.sender_email, website: form.sig_website || tenantInfo?.domain, logoUrl: tenantInfo?.logo_url, color: form.sig_color || tenantInfo?.primary_color,
      },
    }).html;
  }, [form, tenantName, tenantInfo, defaultBody]);

  const saveAccess = async () => {
    setBusy("access");
    try {
      await saveAccessFn({ data: { resend_api_key: resendKey.trim() || undefined, resend_webhook_secret: webhookSecret.trim() || undefined } });
      setResendKey(""); setWebhookSecret("");
      toast({ title: "Resend-Zugang gespeichert" });
      await load();
    } catch (e: any) { toast({ title: "Fehler", description: e?.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const saveSettings = async (override?: Partial<Settings>) => {
    if (!form) return;
    const prev = form;
    const form2 = { ...form, ...override };
    if (override) setForm(form2);
    setBusy("settings");
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    try {
      await saveSettingsFn({ data: {
        ...form2, sender_email: clean(form2.sender_email), sender_name: clean(form2.sender_name), subject: clean(form2.subject),
        body: clean(form2.body), homepage_url: clean(form2.homepage_url), calendly_url: clean(form2.calendly_url),
        daily_limit: Number(form2.daily_limit) || 75,
        sig_name: clean(form2.sig_name ?? null), sig_position: clean(form2.sig_position ?? null), sig_phone: clean(form2.sig_phone ?? null),
        sig_website: clean(form2.sig_website ?? null), sig_color: clean(form2.sig_color ?? null),
      } });
      toast({ title: override && "active" in override ? (form2.active ? "Versand aktiv – gespeichert" : "Versand pausiert – gespeichert") : "Einstellungen gespeichert" });
      await load();
    } catch (e: any) {
      if (override) setForm(prev);
      toast({ title: "Nicht gespeichert", description: e?.message, variant: "destructive" });
    }
    finally { setBusy(null); }
  };

  const runNow = async () => {
    setBusy("run");
    try {
      const r = await runNowFn();
      toast({ title: `${r.sent} Mails gesendet`, description: "Von Hand gestartet – das Tageslimit gilt trotzdem." });
      await load();
    } catch (e: any) { toast({ title: "Lauf fehlgeschlagen", description: e?.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const prepare = async (files: { name: string; text: string }[]) => {
    try {
      const r = mergeLeadFiles(files);
      let existing: string[] = [];
      if (r.rows.length) existing = (await checkDupFn({ data: { tenant_id: tenantId, emails: r.rows.map((x) => x.email) } })).existing;
      setCsv({ name: files.map((f) => f.name).join(", ").slice(0, 290), ...r, existing });
    } catch (e: any) { toast({ title: "Liste nicht lesbar", description: e?.message, variant: "destructive" }); }
  };
  const onFiles = async (list: FileList) => {
    await prepare(await Promise.all(Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() }))));
  };

  const doImport = async () => {
    if (!csv || !tenantId) return;
    const existing = new Set(csv.existing);
    const rows = csv.rows.filter((r) => !existing.has(r.email));
    if (!rows.length) return;
    setBusy("import");
    try {
      let imported = 0, skipped = 0;
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await importFn({ data: { tenant_id: tenantId, file_name: csv.name || "Eingefügter Text", rows: rows.slice(i, i + 1000) } });
        imported += r.imported; skipped += r.skipped;
      }
      toast({ title: `${imported} Leads importiert`, description: skipped ? `${skipped} waren schon vorhanden.` : undefined });
      setCsv(null); setPasteText("");
      await load();
    } catch (e: any) { toast({ title: "Import fehlgeschlagen", description: e?.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const updateRow = (email: string, patch: Partial<LeadRow>) =>
    setCsv((c) => c && { ...c, rows: c.rows.map((r) => (r.email === email ? { ...r, ...patch } : r)) });

  const sendTest = async () => {
    if (!form?.sender_email) { toast({ title: "Erst Absender-Adresse eintragen", variant: "destructive" }); return; }
    setBusy("test");
    const v = { Vorname: "Anna", Nachname: "Muster", Firma: tenantName, Homepage: form.homepage_url ?? "", Calendly: form.calendly_url ?? "", Absender: form.sender_name ?? "" };
    try {
      await testFn({ data: { to: testTo.trim(), tenant_id: tenantId, sender_email: form.sender_email.trim(), sender_name: form.sender_name?.trim() || null,
        subject: renderLeadTemplate(form.subject || defaultSubject, v), text: renderLeadTemplate(form.body || defaultBody, v) } });
      toast({ title: "Test-Mail gesendet", description: testTo });
    } catch (e: any) { toast({ title: "Test-Mail fehlgeschlagen", description: e?.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  if (!data) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const counts = data.statusCounts[tenantId] ?? {};
  const existingSet = new Set(csv?.existing ?? []);
  const newCount = csv ? csv.rows.filter((r) => !existingSet.has(r.email)).length : 0;
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/resend-webhook` : "";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-heading font-bold">Lead-Mailing</h1>
        <p className="text-sm text-muted-foreground">Leads mit oder ohne Firma importieren, Standard-Nachricht festlegen und automatisch mit Tageslimit anschreiben. Antworten erscheinen im Postfach.</p>
      </div>

      {data.control?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Versand-Kontrolle (heute)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.control.map((c: any) => (
              <button type="button" key={c.key} onClick={() => setTenantId(c.key)}
                className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${c.key === tenantId ? "border-primary" : "border-border hover:bg-muted/50"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${HEALTH[c.health]?.cls}`}>{HEALTH[c.health]?.label}</span>
                  {!c.active && <span className="text-xs text-muted-foreground">pausiert</span>}
                  <span className="ml-auto tabular-nums">{c.sentToday} / {c.dailyLimit} heute</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Wartend {c.counts.pending ?? 0} · Gesendet {(c.counts.sent ?? 0) + (c.counts.replied ?? 0)} · Fehler {c.counts.failed ?? 0} · Unzustellbar {c.counts.bounced ?? 0} · Abgemeldet {c.counts.unsubscribed ?? 0}{c.counts.check ? ` · Prüfen ${c.counts.check}` : ""}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Letzter Lauf: {c.lastRunAt ? `${new Date(c.lastRunAt).toLocaleString("de-DE")} – ${c.lastRunResult ?? ""}` : "noch keiner"}
                </div>
                {c.lastError && <div className="mt-1 text-xs text-destructive break-words">Letzter Fehler: {c.lastError}</div>}
              </button>
            ))}
            <Button variant="outline" size="sm" disabled={busy === "run"} onClick={runNow}>Jetzt einen Lauf starten</Button>
            <p className="text-xs text-muted-foreground">Gelb: 80 % vom Tageslimit erreicht oder viele Rückläufer. Rot: Resend meldet Fehler oder über 5 % Rückläufer – dann Versand pausieren und prüfen.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">Resend-Zugang <span className={`text-xs font-normal ${data.resendKeyMasked ? "text-primary" : "text-destructive"}`}>{data.resendKeyMasked ? "● Resend verbunden" : "● Kein Schlüssel gespeichert"}</span></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>API-Schlüssel {data.resendKeyMasked && <span className="text-muted-foreground">({data.resendKeyMasked})</span>}</Label>
              <Input type="password" placeholder="re_…" value={resendKey} onChange={(e) => setResendKey(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Webhook-Signing-Secret {data.webhookSecretMasked && <span className="text-muted-foreground">({data.webhookSecretMasked})</span>}</Label>
              <Input type="password" placeholder="whsec_…" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Webhook-URL in Resend eintragen (Ereignisse: email.received, email.bounced, email.complained, email.delivered, email.opened; Open Tracking pro Domain einschalten): <code className="font-mono break-all">{webhookUrl}</code></p>
          <Button onClick={saveAccess} disabled={busy === "access" || (!resendKey && !webhookSecret)}>Speichern</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] sm:flex items-center gap-3">
        <Label>Leads für</Label>
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger className="w-full min-w-0 sm:w-72"><SelectValue placeholder="Firma wählen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={POOL}>Ohne Firma</SelectItem>
            {data.tenants.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_LABEL).map(([k, label]) => (
          <Badge key={k} variant="secondary">{label}: {counts[k] ?? 0}</Badge>
        ))}
      </div>

      {form && (
        <Card>
          <CardHeader><CardTitle className="text-base">Standard-Nachricht für {bucketLabel}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={form.active} disabled={busy === "settings"} onCheckedChange={(v) => saveSettings({ active: v })} />
              <span className="text-sm">{form.active ? "Versand aktiv" : "Versand pausiert"}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Absender-Adresse</Label>
                <Input placeholder="karriere@bewerbung.firma.de" value={form.sender_email ?? ""} onChange={(e) => setForm({ ...form, sender_email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Absender-Name</Label>
                <Input placeholder="Max Mustermann" value={form.sender_name ?? ""} onChange={(e) => setForm({ ...form, sender_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Homepage-Link</Label>
                <Input placeholder="https://…" value={form.homepage_url ?? ""} onChange={(e) => setForm({ ...form, homepage_url: e.target.value })} /></div>
              <div className="space-y-1"><Label>Calendly-Link</Label>
                <Input placeholder="https://calendly.com/…" value={form.calendly_url ?? ""} onChange={(e) => setForm({ ...form, calendly_url: e.target.value })} /></div>
              <div className="space-y-1"><Label>Tageslimit</Label>
                <Input type="number" min={1} max={2000} value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground">Standard: 75 Mails pro Tag und Absender, verteilt von 6 bis 24 Uhr.</p></div>
            </div>
            <div className="space-y-1"><Label>Betreff</Label>
              <Input value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div className="space-y-1"><Label>Text</Label>
              <Textarea rows={12} value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              <p className="text-xs text-muted-foreground">Platzhalter: {"{Vorname} {Nachname} {Firma} {Homepage} {Calendly} {Absender}"}. Ein Abmeldehinweis wird automatisch angehängt.</p></div>
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-sm font-medium">E-Mail-Signatur</p>
              <p className="text-xs text-muted-foreground">Gilt für Lead-Mails, Antworten im Postfach und Mails an Mitarbeiter. Leere Felder nutzen die Firmendaten (Domains/Tenants).</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Name</Label><Input placeholder={form.sender_name || "Max Mustermann"} value={form.sig_name ?? ""} onChange={(e) => setForm({ ...form, sig_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Position</Label><Input placeholder="Recruiting" value={form.sig_position ?? ""} onChange={(e) => setForm({ ...form, sig_position: e.target.value })} /></div>
                <div className="space-y-1"><Label>Telefon</Label><Input placeholder="+49 …" value={form.sig_phone ?? ""} onChange={(e) => setForm({ ...form, sig_phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>Website</Label><Input placeholder={tenantInfo?.domain || "firma.de"} value={form.sig_website ?? ""} onChange={(e) => setForm({ ...form, sig_website: e.target.value })} /></div>
                <div className="space-y-1"><Label>Akzentfarbe</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label="Akzentfarbe wählen" className="h-10 w-12 rounded-md border border-input bg-transparent" value={/^#[0-9a-f]{6}$/i.test(form.sig_color ?? "") ? form.sig_color! : (/^#[0-9a-f]{6}$/i.test(tenantInfo?.primary_color ?? "") ? tenantInfo.primary_color : "#1f1b16")} onChange={(e) => setForm({ ...form, sig_color: e.target.value })} />
                    <Input value={form.sig_color ?? ""} placeholder="#1f1b16" onChange={(e) => setForm({ ...form, sig_color: e.target.value })} />
                  </div></div>
              </div>
            </div>
            <div className="space-y-1"><Label>Vorschau (so sieht die E-Mail aus)</Label>
              <p className="text-xs text-muted-foreground break-words">{preview.split("\n")[0]}</p>
              <iframe title="E-Mail-Vorschau" sandbox="" srcDoc={htmlPreview} className="w-full h-[520px] rounded-2xl border border-border bg-[#f4f1ec]" /></div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 min-w-0 flex-1 sm:max-w-xs"><Label>Test-Mail an</Label>
                <Input type="email" placeholder="deine@adresse.de" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
              <Button variant="outline" onClick={sendTest} disabled={busy === "test" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim())}>Test-Mail senden</Button>
            </div>
            <Button onClick={() => saveSettings()} disabled={busy === "settings"}>Einstellungen speichern</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Leads importieren – {bucketLabel}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Dateien (Text, CSV oder Facebook-Export – mehrere auf einmal möglich)</Label>
            <Input type="file" multiple accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={(e) => e.target.files?.length && onFiles(e.target.files)} />
          </div>
          <div className="space-y-1">
            <Label>…oder Text einfügen</Label>
            <Textarea rows={5} placeholder={"Name\nmail@beispiel.de\n0176 …\n-----\nName , mail@beispiel.de"} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
            <Button variant="outline" size="sm" disabled={!pasteText.trim()} onClick={() => prepare([{ name: "Eingefügter Text", text: pasteText }])}>Text prüfen</Button>
          </div>
          {csv && (
            <div className="text-sm space-y-2">
              <p><strong>{newCount}</strong> neue Leads · {csv.existing.length} schon vorhanden · {csv.duplicates} doppelt in der Liste · {csv.invalid} ohne E-Mail</p>
              {csv.problems.length > 0 && <p className="text-xs text-muted-foreground break-words">Ohne E-Mail übersprungen: {csv.problems.slice(0, 10).join(" · ")}{csv.problems.length > 10 ? " …" : ""}</p>}
              <div className="max-h-80 overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Vorname</th><th className="p-2 text-left">Nachname</th><th className="p-2 text-left">E-Mail</th><th className="p-2 text-left">Telefon</th></tr></thead>
                  <tbody>
                    {csv.rows.map((r) => {
                      const dup = existingSet.has(r.email);
                      return (
                        <tr key={r.email} className={`border-t border-border ${dup ? "opacity-50" : ""}`}>
                          <td className="p-1"><Input className="h-8" disabled={dup} value={r.firstName} onChange={(e) => updateRow(r.email, { firstName: e.target.value })} /></td>
                          <td className="p-1"><Input className="h-8" disabled={dup} value={r.lastName} onChange={(e) => updateRow(r.email, { lastName: e.target.value })} /></td>
                          <td className="p-2 break-all">{r.email}{dup && <span className="ml-1 text-destructive">schon vorhanden</span>}</td>
                          <td className="p-2 whitespace-nowrap">{r.phone ?? ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground">Jede Adresse wird nur einmal angelegt und nur einmal angeschrieben – auch wenn sie in mehreren Listen oder schon früher importiert wurde.</p>
              <Button className="h-auto min-h-11 max-w-full whitespace-normal text-left" onClick={doImport} disabled={busy === "import" || newCount === 0}>
                <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" /><span>{newCount} Leads für {bucketLabel} importieren</span></span>
              </Button>
            </div>
          )}
          {data.imports.length > 0 && (
            <div className="text-xs text-muted-foreground break-words space-y-1 pt-2 border-t">
              {data.imports.slice(0, 8).map((i: any) => (
                <div key={i.id}>{new Date(i.created_at).toLocaleString("de-DE")} · {i.file_name} · {i.imported} importiert, {i.skipped} übersprungen</div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
