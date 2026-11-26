-- Sicherheits-Update: schließt Lücken aus dem Sicherheits-Scan.
-- Fügt nur Regeln hinzu bzw. verschärft sie; löscht keine Daten.

-- 1) Identitätsprüfung: Mitarbeiter dürfen ihre eigene Prüfung nie selbst freigeben.
DROP POLICY IF EXISTS "Users can update own kyc" ON public.kyc_verifications;
DROP POLICY IF EXISTS "Users update own pending kyc" ON public.kyc_verifications;
CREATE POLICY "Users update own pending kyc" ON public.kyc_verifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status <> 'verifiziert'::public.kyc_status)
  WITH CHECK (auth.uid() = user_id AND status <> 'verifiziert'::public.kyc_status);

CREATE OR REPLACE FUNCTION public.guard_kyc_self_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NEW.status = 'verifiziert'::public.kyc_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'Nur Admins dürfen eine Identitätsprüfung freigeben';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_kyc_self_approval ON public.kyc_verifications;
CREATE TRIGGER trg_guard_kyc_self_approval BEFORE INSERT OR UPDATE ON public.kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_kyc_self_approval();

-- 2) Profile: Firma (tenant_id) und verknüpfte Bewerbung (application_id) darf
--    ein Mitarbeiter nicht frei ändern. Erlaubt: Erstzuordnung, oder Zuordnung
--    über eine Einladung, die genau an seine E-Mail-Adresse ging.
CREATE OR REPLACE FUNCTION public.guard_profile_org_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  _email text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.application_id IS NOT DISTINCT FROM OLD.application_id THEN
    RETURN NEW;
  END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = auth.uid();

  IF NEW.application_id IS DISTINCT FROM OLD.application_id AND NEW.application_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = NEW.application_id
        AND (lower(a.email) = _email
             OR EXISTS (SELECT 1 FROM public.invitation_tokens t
                        WHERE t.application_id = a.id AND lower(t.email) = _email))
    ) THEN
      RAISE EXCEPTION 'Bewerbung gehört nicht zu diesem Konto';
    END IF;
  ELSIF NEW.application_id IS DISTINCT FROM OLD.application_id THEN
    RAISE EXCEPTION 'Bewerbung darf nicht entfernt werden';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id AND OLD.tenant_id IS NOT NULL THEN
    IF NEW.tenant_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.invitation_tokens t
      WHERE t.tenant_id = NEW.tenant_id AND lower(t.email) = _email
    ) AND NOT EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.tenant_id = NEW.tenant_id AND lower(a.email) = _email
    ) THEN
      RAISE EXCEPTION 'Firmenwechsel nur durch Admins';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profile_org_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_org_fields BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_org_fields();

-- 3) Einladungen: benutzte Einladungen liefern nichts mehr, und eine Einladung
--    kann nur einmal eingelöst werden.
CREATE OR REPLACE FUNCTION public.validate_invitation_token(_token text)
RETURNS TABLE(email text, tenant_id uuid, application_id uuid, used boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT email, tenant_id, application_id, used FROM public.invitation_tokens
  WHERE token = _token AND used = false LIMIT 1;
$$;

-- 4) Chat-Übersicht: nur Admins dürfen sie abrufen (geprüft am Aufrufer, nicht am Parameter).
CREATE OR REPLACE FUNCTION public.get_chat_thread_summaries(_admin_id uuid)
RETURNS TABLE (user_id uuid, full_name text, last_message text, last_at timestamptz, unread bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH partners AS (
    SELECT DISTINCT CASE WHEN sender_id = _admin_id THEN receiver_id ELSE sender_id END AS partner_id
    FROM public.chat_messages WHERE sender_id = _admin_id OR receiver_id = _admin_id
  ),
  last_msg AS (
    SELECT DISTINCT ON (partner_id) partner_id, message, created_at FROM (
      SELECT CASE WHEN sender_id = _admin_id THEN receiver_id ELSE sender_id END AS partner_id, message, created_at
      FROM public.chat_messages WHERE sender_id = _admin_id OR receiver_id = _admin_id
    ) s ORDER BY partner_id, created_at DESC
  ),
  unread AS (
    SELECT sender_id AS partner_id, COUNT(*) AS cnt FROM public.chat_messages
    WHERE receiver_id = _admin_id AND read = false GROUP BY sender_id
  )
  SELECT p.partner_id, pr.full_name, lm.message, lm.created_at, COALESCE(u.cnt, 0)
  FROM partners p
  LEFT JOIN public.profiles pr ON pr.user_id = p.partner_id
  LEFT JOIN last_msg lm ON lm.partner_id = p.partner_id
  LEFT JOIN unread u ON u.partner_id = p.partner_id
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.has_role(_admin_id, 'admin'::public.app_role)
  ORDER BY lm.created_at DESC NULLS LAST;
$$;
REVOKE EXECUTE ON FUNCTION public.get_chat_thread_summaries(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_summaries(uuid) TO authenticated;
