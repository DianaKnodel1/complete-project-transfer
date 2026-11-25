import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ResetPasswordSchema } from "@/lib/employee-password";

/** Admin setzt das Passwort eines Mitarbeiters neu. Admin-Konten sind ausgenommen. */
export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResetPasswordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: role, error } = await context.supabase
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (error) throw new Error(error.message);
    if (!role) throw new Error("Nicht autorisiert");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: targetAdmin } = await sb
      .from("user_roles").select("role")
      .eq("user_id", data.user_id).eq("role", "admin").maybeSingle();
    if (targetAdmin) throw new Error("Passwörter von Admins können hier nicht geändert werden");

    const { error: upErr } = await sb.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });
