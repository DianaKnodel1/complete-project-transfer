// Prüft in öffentlichen Server-Routen (/api/public/*) den angemeldeten Aufrufer
// über das Bearer-Token. Rollen werden mit dem Nutzer-Token selbst gelesen
// (RLS gilt), nicht mit dem privilegierten Client.
import { createClient } from "@supabase/supabase-js";

export type BearerUser = { userId: string; isAdmin: boolean };

export async function getBearerUser(request: Request): Promise<BearerUser | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: role } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  return { userId: data.user.id, isAdmin: !!role };
}
