import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resetEmployeePassword } from "@/lib/employee-password.functions";
import { generatePassword, MIN_PASSWORD_LENGTH } from "@/lib/employee-password";

export function NewPasswordCard({ userId, name }: { userId: string; name: string }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const run = useServerFn(resetEmployeePassword);

  async function save() {
    setBusy(true);
    try {
      await run({ data: { user_id: userId, password: pw } });
      setDone(true);
      setConfirm(false);
      toast.success("Passwort geändert");
    } catch (e: any) {
      toast.error(e?.message ?? "Passwort konnte nicht geändert werden");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 grid place-items-center">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-sm">Neues Passwort anlegen</h2>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">Neues Passwort</Label>
          <div className="flex gap-2 flex-wrap">
            <Input id="new-pw" className="flex-1 min-w-[180px] font-mono" value={pw} placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
              onChange={(e) => { setPw(e.target.value); setDone(false); }} disabled={busy} autoComplete="new-password" />
            <Button type="button" variant="outline" className="gap-1.5" disabled={busy} onClick={() => { setPw(generatePassword()); setDone(false); }}>
              <RefreshCw className="h-3.5 w-3.5" /> Neu erzeugen
            </Button>
            <Button type="button" variant="outline" size="icon" title="Kopieren" disabled={!pw}
              onClick={() => { navigator.clipboard.writeText(pw); toast.success("Kopiert"); }}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" disabled={busy || pw.length < MIN_PASSWORD_LENGTH} onClick={() => setConfirm(true)}>
              Passwort speichern
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {done ? "Gespeichert. Teilen Sie dem Mitarbeiter das neue Passwort mit." : "Das alte Passwort gilt nach dem Speichern sofort nicht mehr."}
          </p>
        </div>
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={(o) => { if (!busy) setConfirm(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passwort wirklich ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              {name} kann sich danach nur noch mit dem neuen Passwort anmelden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); save(); }}>
              {busy ? "Speichert…" : "Ja, ändern"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
