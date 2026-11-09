-- Ensure messages can only be sent into live (non-ended) trips (SEC-5)
DROP POLICY IF EXISTS "approved send messages" ON public.trip_messages;
CREATE POLICY "approved send messages" ON public.trip_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    public.is_approved_member(trip_id) AND
    public.trip_is_live(trip_id)
  );
