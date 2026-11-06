CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text NOT NULL UNIQUE,
  invite_revoked boolean NOT NULL DEFAULT false,
  host_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  origin text NOT NULL,
  destination text NOT NULL,
  routes jsonb NOT NULL,
  route_index int NOT NULL DEFAULT 0,
  threshold_km int NOT NULL DEFAULT 3,
  alerts_by text NOT NULL DEFAULT 'everyone',
  auto_end boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'lobby',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trip_members (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  letter text NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  vehicle_label text NOT NULL CHECK (char_length(vehicle_label) BETWEEN 1 AND 40),
  vehicle_type text NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('car','bike')),
  color text NOT NULL,
  role text NOT NULL DEFAULT 'driver',
  ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_members TO authenticated;
GRANT ALL ON public.trip_members TO service_role;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trip_positions (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lng double precision NOT NULL,
  lat double precision NOT NULL,
  speed_ms double precision,
  heading double precision,
  accuracy_m double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_positions TO authenticated;
GRANT ALL ON public.trip_positions TO service_role;
ALTER TABLE public.trip_positions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trip_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','quick','sos')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.trip_messages TO authenticated;
GRANT ALL ON public.trip_messages TO service_role;
ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_trip_member(_trip uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = _trip AND user_id = auth.uid())
$$;

CREATE POLICY "members read trip" ON public.trips FOR SELECT TO authenticated USING (host_id = auth.uid() OR public.is_trip_member(id));
CREATE POLICY "host creates trip" ON public.trips FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY "host updates trip" ON public.trips FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());
CREATE POLICY "host deletes trip" ON public.trips FOR DELETE TO authenticated USING (host_id = auth.uid());

CREATE POLICY "members read members" ON public.trip_members FOR SELECT TO authenticated USING (public.is_trip_member(trip_id));
CREATE POLICY "host adds self" ON public.trip_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.host_id = auth.uid()));
CREATE POLICY "update own member" ON public.trip_members FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "leave trip" ON public.trip_members FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "members read positions" ON public.trip_positions FOR SELECT TO authenticated USING (public.is_trip_member(trip_id));
CREATE POLICY "write own position" ON public.trip_positions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id));
CREATE POLICY "update own position" ON public.trip_positions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id));
CREATE POLICY "delete own position" ON public.trip_positions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "members read messages" ON public.trip_messages FOR SELECT TO authenticated USING (public.is_trip_member(trip_id));
CREATE POLICY "members send messages" ON public.trip_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id));

-- Invite preview for signed-in users who are not members yet
CREATE OR REPLACE FUNCTION public.trip_invite_preview(_code text)
RETURNS TABLE (id uuid, name text, destination text, members int, revoked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.destination, (SELECT count(*)::int FROM public.trip_members m WHERE m.trip_id = t.id), t.invite_revoked
  FROM public.trips t WHERE t.invite_code = _code
$$;
REVOKE EXECUTE ON FUNCTION public.trip_invite_preview(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.trip_invite_preview(text) TO authenticated;

-- Join via invite code; assigns next free letter and color
CREATE OR REPLACE FUNCTION public.join_trip(_code text, _display_name text, _vehicle_label text, _vehicle_type text, _color text, _role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.trips%ROWTYPE;
  n int;
  l text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO t FROM public.trips WHERE invite_code = _code FOR UPDATE;
  IF NOT FOUND OR t.invite_revoked THEN RAISE EXCEPTION 'This invite is not available'; END IF;
  IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN
    UPDATE public.trip_members SET display_name = _display_name, vehicle_label = _vehicle_label, vehicle_type = _vehicle_type, color = _color, role = _role
      WHERE trip_id = t.id AND user_id = auth.uid();
    RETURN t.id;
  END IF;
  SELECT count(*) INTO n FROM public.trip_members WHERE trip_id = t.id;
  IF n >= 10 THEN RAISE EXCEPTION 'This trip is full'; END IF;
  SELECT x INTO l FROM unnest(ARRAY['A','B','C','D','E','F','G','H','I','J']) AS x
    WHERE x NOT IN (SELECT letter FROM public.trip_members WHERE trip_id = t.id) LIMIT 1;
  INSERT INTO public.trip_members (trip_id, user_id, letter, display_name, vehicle_label, vehicle_type, color, role)
    VALUES (t.id, auth.uid(), l, _display_name, _vehicle_label, COALESCE(_vehicle_type,'car'), _color, COALESCE(_role,'driver'));
  RETURN t.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_trip(text,text,text,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.join_trip(text,text,text,text,text,text) TO authenticated;

ALTER TABLE public.trip_members REPLICA IDENTITY FULL;
ALTER TABLE public.trip_positions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_members, public.trip_positions, public.trip_messages, public.trips;
