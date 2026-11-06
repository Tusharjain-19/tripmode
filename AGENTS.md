# Trip Mode Development Guidelines

## Project rules

- Product specs live in `docs/` and `docs_tripmode/` (design, frontend, database, security, prompt); they are the source of truth for Trip Mode.
- Implemented as a responsive TanStack Start web app with full mobile, tablet, and desktop fidelity.
- Convoy math stays pure in `src/lib/convoy.ts` with unit tests; UI only presents it.
- Map is MapLibre + OpenFreeMap positron (keyless); road routes are pre-fetched OSRM geometry in `src/data/routes.json`, projected to local meters in `src/lib/geo.ts`.
- Other vehicles come from `src/lib/simulation.ts` until a realtime backend exists; keep its output shaped like position snapshots so it can be swapped.
- All colors/durations come from tokens in `src/styles.css`; no hex literals in components.
- Trips, members, live positions and messages live in backend database tables with membership-scoped RLS; joining goes through the `join_trip` RPC so invite codes are the only entry.
- Client sync lives in `src/lib/trip-sync.ts` (realtime postgres_changes); UI never talks to tables directly.
- Guidance (OSRM steps), place search (Nominatim) and nearby (Overpass) are keyless browser calls in `src/lib/nav.ts`, `geo.ts`, `places.ts`.
- Location and chat access requires `trip_members.approved` (host-set, guarded by trigger); backend triggers delete positions on leave, unapproval and trip end.
- AI stop extraction runs in the host-only `suggestStopsFromChat` server function (`src/lib/stops.functions.ts` + `stops-ai.server.ts`); suggestions are hidden from members by RLS until confirmed.
- No user sign-in required for drivers: devices get an anonymous guest session (`ensureGuest` in `src/lib/auth.ts`) so membership RLS keeps working. Only admins use email/password at `/admin`.
- Admin rights come only from `public.user_roles`; admin stats go through the `admin_overview` SECURITY DEFINER RPC, never raw table reads.
