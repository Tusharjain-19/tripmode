ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT true;
ALTER TABLE public.trip_members ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
UPDATE public.trip_members SET approved = true;

CREATE OR REPLACE FUNCTION public.is_trip_host(_trip uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips WHERE id = _trip AND host_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_approved_member(_trip uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = _trip AND user_id = auth.uid() AND approved)
$$;
CREATE OR REPLACE FUNCTION public.trip_is_live(_trip uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips WHERE id = _trip AND status <> 'ended')
$$;

-- Only the host may change approval
CREATE OR REPLACE FUNCTION public.guard_member_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approved IS DISTINCT FROM OLD.approved AND NOT public.is_trip_host(NEW.trip_id) THEN
    RAISE EXCEPTION 'Only the host can approve members';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_member_approval ON public.trip_members;
CREATE TRIGGER trg_guard_member_approval BEFORE UPDATE ON public.trip_members FOR EACH ROW EXECUTE FUNCTION public.guard_member_approval();

CREATE POLICY "host updates members" ON public.trip_members FOR UPDATE TO authenticated USING (public.is_trip_host(trip_id)) WITH CHECK (public.is_trip_host(trip_id));
CREATE POLICY "host removes members" ON public.trip_members FOR DELETE TO authenticated USING (public.is_trip_host(trip_id));

-- Positions: approved members of a live trip only
DROP POLICY "members read positions" ON public.trip_positions;
DROP POLICY "write own position" ON public.trip_positions;
DROP POLICY "update own position" ON public.trip_positions;
CREATE POLICY "approved read positions" ON public.trip_positions FOR SELECT TO authenticated USING (public.is_approved_member(trip_id));
CREATE POLICY "approved write own position" ON public.trip_positions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_approved_member(trip_id) AND public.trip_is_live(trip_id));
CREATE POLICY "approved update own position" ON public.trip_positions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.is_approved_member(trip_id) AND public.trip_is_live(trip_id));

DROP POLICY "members read messages" ON public.trip_messages;
DROP POLICY "members send messages" ON public.trip_messages;
CREATE POLICY "approved read messages" ON public.trip_messages FOR SELECT TO authenticated USING (public.is_approved_member(trip_id));
CREATE POLICY "approved send messages" ON public.trip_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_approved_member(trip_id));

-- Drop shared positions when a member leaves, is removed or unapproved, or the trip ends
CREATE OR REPLACE FUNCTION public.clear_member_position()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.trip_positions WHERE trip_id = OLD.trip_id AND user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  IF NOT NEW.approved THEN
    DELETE FROM public.trip_positions WHERE trip_id = NEW.trip_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clear_member_position ON public.trip_members;
CREATE TRIGGER trg_clear_member_position AFTER DELETE OR UPDATE OF approved ON public.trip_members FOR EACH ROW EXECUTE FUNCTION public.clear_member_position();

CREATE OR REPLACE FUNCTION public.clear_ended_trip_positions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    DELETE FROM public.trip_positions WHERE trip_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clear_ended_trip_positions ON public.trips;
CREATE TRIGGER trg_clear_ended_trip_positions AFTER UPDATE OF status ON public.trips FOR EACH ROW EXECUTE FUNCTION public.clear_ended_trip_positions();

-- join_trip: host and no-approval trips are approved immediately
CREATE OR REPLACE FUNCTION public.join_trip(_code text, _display_name text, _vehicle_label text, _vehicle_type text, _color text, _role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.trips%ROWTYPE;
  n int;
  l text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO t FROM public.trips WHERE invite_code = _code FOR UPDATE;
  IF NOT FOUND OR t.invite_revoked OR t.status = 'ended' THEN RAISE EXCEPTION 'This invite is not available'; END IF;
  IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN
    UPDATE public.trip_members SET display_name = _display_name, vehicle_label = _vehicle_label, vehicle_type = _vehicle_type, color = _color, role = _role
      WHERE trip_id = t.id AND user_id = auth.uid();
    RETURN t.id;
  END IF;
  SELECT count(*) INTO n FROM public.trip_members WHERE trip_id = t.id;
  IF n >= 10 THEN RAISE EXCEPTION 'This trip is full'; END IF;
  SELECT x INTO l FROM unnest(ARRAY['A','B','C','D','E','F','G','H','I','J']) AS x
    WHERE x NOT IN (SELECT letter FROM public.trip_members WHERE trip_id = t.id) LIMIT 1;
  INSERT INTO public.trip_members (trip_id, user_id, letter, display_name, vehicle_label, vehicle_type, color, role, approved)
    VALUES (t.id, auth.uid(), l, _display_name, _vehicle_label, COALESCE(_vehicle_type,'car'), _color, COALESCE(_role,'driver'),
            auth.uid() = t.host_id OR NOT t.require_approval);
  RETURN t.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_trip(text,text,text,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.join_trip(text,text,text,text,text,text) TO authenticated;

-- Stops proposed from chat; members only see confirmed ones
CREATE TABLE public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  reason text NOT NULL DEFAULT '',
  query text NOT NULL DEFAULT '',
  lng double precision,
  lat double precision,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','confirmed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_stops TO authenticated;
GRANT ALL ON public.trip_stops TO service_role;
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read stops" ON public.trip_stops FOR SELECT TO authenticated USING (public.is_trip_host(trip_id) OR (status = 'confirmed' AND public.is_approved_member(trip_id)));
CREATE POLICY "host adds stops" ON public.trip_stops FOR INSERT TO authenticated WITH CHECK (public.is_trip_host(trip_id));
CREATE POLICY "host updates stops" ON public.trip_stops FOR UPDATE TO authenticated USING (public.is_trip_host(trip_id)) WITH CHECK (public.is_trip_host(trip_id));
CREATE POLICY "host deletes stops" ON public.trip_stops FOR DELETE TO authenticated USING (public.is_trip_host(trip_id));
ALTER TABLE public.trip_stops REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_stops;