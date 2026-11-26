import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Settings2, Trash2 } from "lucide-react";
import { listMailTemplates, saveMailTemplate, deleteMailTemplate } from "@/lib/lead-mailing.functions";
import { MAIL_TEMPLATES } from "@/lib/mail-template";
import { fillMailTemplate } from "@/lib/mail-template-fill";

type Tpl = { id: string; tenant_id: string | null; name: string; subject: string; body: string };

/** Vorlagen-Auswahl („Makros“): füllt Betreff und Text, Platzhalter werden ersetzt. */
export function MailTemplatePicker({ tenantId, vars, onApply, keepSubject }: {
  tenantId: string | null;
  vars: { Vorname?: string; Nachname?: string; Firma?: string };
  onApply: (subject: string, body: string) => void;
  keepSubject?: boolean;
}) {
  const listFn = useServerFn(listMailTemplates);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [manage, setManage] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await listFn({ data: {} });
      setTemplates(r.missing || !r.templates.length
        ? MAIL_TEMPLATES.map((t) => ({ id: t.id, tenant_id: null, name: t.label, subject: t.subject, body: t.body }))
        : (r.templates as Tpl[]));
    } catch { /* Vorlagen sind optional */ }
  }, [listFn]);
  useEffect(() => { load(); }, [load]);

  const visible = templates.filter((t) => !t.tenant_id || t.tenant_id === tenantId);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <select aria-label="Vorlage einfügen" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" value=""
        onChange={(e) => {
          const t = visible.find((x) => x.id === e.target.value);
          if (t) onApply(keepSubject ? "" : fillMailTemplate(t.subject, vars), fillMailTemplate(t.body, vars));
        }}>
        <option value="">Vorlage einfügen …</option>
        {visible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <Button type="button" variant="outline" size="icon" aria-label="Vorlagen verwalten" onClick={() => setManage(true)}><Settings2 className="h-4 w-4" /></Button>
      <ManageTemplatesDialog open={manage} onOpenChange={setManage} templates={templates.filter((t) => t.id.length > 20)} tenantId={tenantId} onChanged={load} />
    </div>
  );
}

function ManageTemplatesDialog({ open, onOpenChange, templates, tenantId, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; templates: Tpl[]; tenantId: string | null; onChanged: () => void;
}) {
  const saveFn = useServerFn(saveMailTemplate);
  const delFn = useServerFn(deleteMailTemplate);
  const empty = { id: null as string | null, name: "", subject: "", body: "", onlyTenant: false };
  const [edit, setEdit] = useState(empty);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await saveFn({ data: { id: edit.id, tenant_id: edit.onlyTenant && tenantId ? tenantId : null, name: edit.name, subject: edit.subject, body: edit.body } });
      toast.success("Vorlage gespeichert");
      setEdit(empty); onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Speichern fehlgeschlagen"); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Vorlage wirklich löschen?")) return;
    try { await delFn({ data: { id } }); onChanged(); if (edit.id === id) setEdit(empty); }
    catch (e: any) { toast.error(e?.message ?? "Löschen fehlgeschlagen"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mail-Vorlagen</DialogTitle>
          <DialogDescription>Platzhalter: {"{Vorname} {Nachname} {Firma}"} – werden beim Einfügen ersetzt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {templates.length === 0 && <p className="text-sm text-muted-foreground">Noch keine eigenen Vorlagen gespeichert.</p>}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => setEdit({ id: t.id, name: t.name, subject: t.subject, body: t.body, onlyTenant: !!t.tenant_id })}>
                {t.name}{t.tenant_id && <span className="ml-2 text-xs text-muted-foreground">nur diese Firma</span>}
              </button>
              <Button type="button" variant="ghost" size="icon" aria-label={`${t.name} löschen`} onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium">{edit.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</p>
          <div className="space-y-1"><Label htmlFor="tpl-name">Name</Label><Input id="tpl-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="tpl-subject">Betreff</Label><Input id="tpl-subject" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="tpl-body">Text</Label><Textarea id="tpl-body" rows={8} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
          {tenantId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.onlyTenant} onChange={(e) => setEdit({ ...edit, onlyTenant: e.target.checked })} /> Nur für diese Firma anzeigen
            </label>
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !edit.name.trim()}>Speichern</Button>
            {edit.id && <Button variant="outline" onClick={() => setEdit(empty)}>Neu anlegen</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
