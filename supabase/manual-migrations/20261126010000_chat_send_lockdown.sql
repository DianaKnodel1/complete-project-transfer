-- Mitarbeiter dürfen Chat-Nachrichten nur noch an Admin-Personal schicken,
-- nicht mehr an beliebige andere Konten (Acc2ToAcc1-Lücke).
DROP POLICY IF EXISTS "Users send messages" ON public.chat_messages;
CREATE POLICY "Users send messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_admin_staff(receiver_id)
  );
