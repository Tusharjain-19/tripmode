CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- The owner's email becomes admin once it is confirmed
CREATE OR REPLACE FUNCTION public.grant_owner_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'jaint0910@gmail.com' AND NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_owner_admin AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_owner_admin();
INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'jaint0910@gmail.com' AND email_confirmed_at IS NOT NULL
  ON CONFLICT DO NOTHING;

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 400),
  tone text NOT NULL DEFAULT 'info' CHECK (tone IN ('info','caution','alert')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "everyone reads active" ON public.announcements FOR SELECT TO anon, authenticated USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin inserts" ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin updates" ON public.announcements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin deletes" ON public.announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;

-- Admin overview: counts and trip list, no locations or message text
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN jsonb_build_object(
    'trips', (SELECT count(*) FROM public.trips),
    'live_trips', (SELECT count(*) FROM public.trips WHERE status <> 'ended'),
    'members', (SELECT count(*) FROM public.trip_members),
    'messages', (SELECT count(*) FROM public.trip_messages),
    'trips_7d', (SELECT count(*) FROM public.trips WHERE created_at > now() - interval '7 days'),
    'daily', COALESCE((SELECT jsonb_agg(d ORDER BY d->>'day') FROM (
        SELECT jsonb_build_object('day', to_char(g::date, 'YYYY-MM-DD'),
          'trips', (SELECT count(*) FROM public.trips t WHERE t.created_at::date = g::date),
          'messages', (SELECT count(*) FROM public.trip_messages m WHERE m.created_at::date = g::date)) d
        FROM generate_series(current_date - 13, current_date, interval '1 day') g) s), '[]'::jsonb),
    'list', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC) FROM (
        SELECT jsonb_build_object('id', t.id, 'name', t.name, 'origin', t.origin, 'destination', t.destination, 'status', t.status,
          'created_at', t.created_at, 'members', (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = t.id)) x
        FROM public.trips t ORDER BY t.created_at DESC LIMIT 100) l), '[]'::jsonb)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_overview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;