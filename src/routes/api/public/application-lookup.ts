// Public lookup: Bewerber gibt seine E-Mail ein → wir prüfen, ob es eine
// Bewerbung gibt. Wenn ja, erzeugen/erneuern wir einen Magic-Link und leiten
// direkt ins Bewerbungsgespräch. Calendly wurde bereits im Vermittlungsflow
// gebucht und wird hier bewusst NICHT mehr geöffnet.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const Schema = z.object({
  email: z.string().trim().email().max(255),
  portal_url: z.string().url().max(500).optional().nullable(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const GENERIC_MESSAGE = "Falls zu dieser E-Mail-Adresse eine Bewerbung vorliegt, haben wir dir soeben deinen persönlichen Link zum Bewerbungsgespräch per E-Mail geschickt. Bitte prüfe auch den Spam-Ordner.";

async function mailInterviewLink(app: any, link: string) {
  const supabaseUrl = (process.env["SUPABASE_URL"] ?? process.env["API_EXTERNAL_URL"] ?? "").replace(/\/+$/, "");
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SERVICE_ROLE_KEY"] ?? "";
  if (!supabaseUrl || !serviceKey || !app?.email || !app?.tenant_id) return;
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: serviceKey };
  if (!serviceKey.startsWith("sb_")) headers.Authorization = `Bearer ${serviceKey}`;
  const parts = String(app.full_name ?? "").trim().split(/\s+/);
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-invitation-email`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: app.email,
        fullName: app.full_name,
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" "),
        registrationLink: link,
        tenantId: app.tenant_id,
        templateName: "application_received",
        applicationId: app.id,
        requestId: `lookup-${app.id}-${Math.floor(Date.now() / 600000)}`,
        placeholders: { calendly_link: link, booking_link: link },
      }),
    });
  } catch (e) {
    console.error("[application-lookup] mail failed", e);
  }
}

export const Route = createFileRoute("/api/public/application-lookup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "Ungültige Anfrage (JSON konnte nicht gelesen werden)." }, 400); }
        const parsed = Schema.safeParse(payload);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return json({ error: `Ungültige E-Mail-Adresse: ${first?.message ?? "bitte prüfen"}` }, 400);
        }

        const email = parsed.data.email.toLowerCase();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Bewerbungen zu dieser E-Mail laden. Wichtig: Es kann Duplikate geben
        // (z.B. Formular-Submit + Calendly-Webhook). Deshalb nicht blind die
        // neueste Zeile nehmen, sondern bevorzugt eine Zeile mit gebuchtem Termin.
        const { data: apps, error } = await supabaseAdmin
          .from("applications")
          .select("id, full_name, email, phone, source_slug, source_landing_id, target_landing_id, booking_status, scheduled_at, calendly_event_uri, calendly_invitee_uri, tenant_id, created_at, magic_token, magic_token_expires_at")
          .ilike("email", email)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) {
          console.error("[application-lookup]", error);
          return json({ error: "Abfrage fehlgeschlagen. Bitte später erneut versuchen." }, 500);
        }
        const bookedStatuses = new Set(["scheduled", "completed", "booked", "gebucht", "bestätigt", "bestaetigt", "abgeschlossen"]);
        const isBooked = (row: any) => {
          const status = String(row?.booking_status || "").toLowerCase().trim();
          return bookedStatuses.has(status) || !!row?.scheduled_at || !!row?.calendly_invitee_uri || !!row?.calendly_event_uri;
        };

        const rows = (apps ?? []) as any[];
        const app = rows.find(isBooked) ?? rows[0];
        // Keine Auskunft, ob eine Bewerbung existiert; der Link geht nur an das Postfach.
        if (!app) return json({ found: false, message: GENERIC_MESSAGE });

        const landingSelect = "id, calendly_url, slug, source_slug, flow_type, domain, linked_fasttrack_landing_id, booking_mode";
        const loadLandingById = async (id?: string | null) => {
          if (!id) return null;
          const { data } = await supabaseAdmin
            .from("landing_pages")
            .select(landingSelect)
            .eq("id", id)
            .maybeSingle();
          return data as any | null;
        };
        const loadLandingBySlug = async (slug?: string | null) => {
          const s = String(slug || "").trim();
          if (!s) return null;
          const { data: bySource } = await supabaseAdmin
            .from("landing_pages")
            .select(landingSelect)
            .eq("source_slug", s)
            .eq("is_published", true)
            .maybeSingle();
          if (bySource) return bySource as any;
          const { data: bySlug } = await supabaseAdmin
            .from("landing_pages")
            .select(landingSelect)
            .eq("slug", s)
            .eq("is_published", true)
            .maybeSingle();
          return bySlug as any | null;
        };
        const followFasttrack = async (lp: any | null) => {
          if (!lp) return null;
          const linkedId = lp.linked_fasttrack_landing_id ?? null;
          if (linkedId) {
            const linked = await loadLandingById(linkedId);
            if (linked) return linked;
          }
          return lp;
        };

        // Landing-Info robust auflösen: alte Datensätze haben oft nur source_slug,
        // neue Vermittlungen zusätzlich source_landing_id/target_landing_id.
        const targetLanding = await followFasttrack(
          (await loadLandingById(app.target_landing_id))
          || (await loadLandingById(app.source_landing_id))
          || (await loadLandingBySlug(app.source_slug))
        );
        void (targetLanding?.slug ?? app.source_slug);

        let magicToken: string | null = app.magic_token ?? null;
        // Bewerbungs-/Interview-Magic-Links laufen bewusst NICHT ab.
        if (!magicToken) {
          magicToken = `${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
          const { error: tokenError } = await supabaseAdmin
            .from("applications")
            .update({
              magic_token: magicToken,
              magic_token_expires_at: null,
              target_landing_id: targetLanding?.id ?? app.target_landing_id ?? null,
            } as any)
            .eq("id", app.id);
          if (tokenError) {
            console.error("[application-lookup] token update failed", tokenError);
            return json({ error: "Bewerbungslink konnte nicht erstellt werden." }, 500);
          }
        }
        let base = (parsed.data.portal_url || new URL(request.url).origin).replace(/\/+$/, "");
        // Hinter Cloudflare kommt der Origin intern oft als http:// an —
        // Magic-Links muessen immer https sein (Token nicht unverschluesselt).
        if (base.startsWith("http://") && !base.includes("localhost") && !base.includes("127.0.0.1")) {
          base = "https://" + base.slice(7);
        }

        // Das Bewerbungsgespräch kann sofort gestartet werden — es gibt keine
        // Terminbuchung / Umbuchung mehr im Bewerber-Flow.
        const redirectUrl = `${base}/bewerbung?token=${encodeURIComponent(magicToken)}`;
        await mailInterviewLink(app, redirectUrl);
        return json({ found: false, mailed: true, message: GENERIC_MESSAGE });
      },
    },
  },
});
