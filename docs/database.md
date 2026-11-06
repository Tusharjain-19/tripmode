# Trip Mode - database.md

Data model for Trip Mode. Primary store: **PostgreSQL with PostGIS**. Live state: **Redis**. Object storage is not needed for the MVP (no media).

---

## 1. Storage strategy

| Data                                       | Store                                    | Why                                        |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------ |
| Users, trips, members, rules, alerts, chat | PostgreSQL                               | Relational, durable, queryable             |
| Route geometry and spatial calculations    | PostgreSQL + PostGIS                     | `ST_LineLocatePoint`, distance along route |
| Live positions, presence, rate limits      | Redis                                    | High write rate, short-lived, expiring     |
| Location history (breadcrumbs)             | PostgreSQL, partitioned, short retention | Trip summary and replay, auto-deleted      |

Principle: **live positions are ephemeral**. Redis is the source of truth during a trip. Only sampled breadcrumbs are persisted, and only with the member's consent.

---

## 2. Entity overview

```
users 1---* trip_members *---1 trips
trips 1---* route_plans
trips 1---* invites
trips 1---* trip_events (alerts, system events)
trips 1---* messages
trip_members 1---1 vehicles
trip_members 1---* location_breadcrumbs
users 1---* devices
users 1---* blocks
trips 1---* reports
```

---

## 3. PostgreSQL schema

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ENUMS
CREATE TYPE trip_status    AS ENUM ('draft','lobby','active','ended','cancelled');
CREATE TYPE member_role    AS ENUM ('host','member');
CREATE TYPE member_status  AS ENUM ('invited','joined','ready','left','removed');
CREATE TYPE travel_role    AS ENUM ('driver','passenger');
CREATE TYPE event_type     AS ENUM (
  'alert_slow_down','alert_need_fuel','alert_need_break','alert_food_stop',
  'alert_lost_route','alert_wait_for_me','sys_falling_behind','sys_off_route',
  'sys_stopped','sys_connection_lost','sys_arrived','sys_member_joined',
  'sys_member_left','sos'
);

-- USERS
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider  text NOT NULL,                 -- 'google', 'phone'
  auth_subject   text NOT NULL,                 -- provider user id
  display_name   text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar_url     text,
  locale         text NOT NULL DEFAULT 'en',
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (auth_provider, auth_subject)
);

-- DEVICES (push tokens)
CREATE TABLE devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('ios','android')),
  push_token   text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, push_token)
);

-- TRIPS
CREATE TABLE trips (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          uuid NOT NULL REFERENCES users(id),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  status           trip_status NOT NULL DEFAULT 'draft',
  destination_name text NOT NULL,
  destination      geography(Point,4326) NOT NULL,
  origin_name      text,
  origin           geography(Point,4326),
  planned_start_at timestamptz,
  started_at       timestamptz,
  ended_at         timestamptz,
  gap_threshold_m  integer NOT NULL DEFAULT 3000 CHECK (gap_threshold_m BETWEEN 500 AND 20000),
  alerts_host_only boolean NOT NULL DEFAULT false,
  auto_end         boolean NOT NULL DEFAULT true,
  max_members      smallint NOT NULL DEFAULT 20 CHECK (max_members BETWEEN 2 AND 50),
  retention_days   smallint NOT NULL DEFAULT 1,   -- breadcrumb retention after end
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trips_host_idx   ON trips (host_id, created_at DESC);
CREATE INDEX trips_status_idx ON trips (status) WHERE status IN ('lobby','active');

-- ROUTE PLANS (agreed route + alternates)
CREATE TABLE route_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  is_agreed     boolean NOT NULL DEFAULT false,
  geometry      geography(LineString,4326) NOT NULL,
  distance_m    integer NOT NULL,
  duration_s    integer NOT NULL,
  provider      text NOT NULL,                    -- 'google_routes','osrm'
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_agreed_route_per_trip ON route_plans (trip_id) WHERE is_agreed;
CREATE INDEX route_geom_idx ON route_plans USING gist (geometry);

-- TRIP MEMBERS
CREATE TABLE trip_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  role             member_role NOT NULL DEFAULT 'member',
  status           member_status NOT NULL DEFAULT 'joined',
  travel_role      travel_role NOT NULL DEFAULT 'passenger',
  location_consent_at timestamptz,               -- explicit consent timestamp
  share_breadcrumbs   boolean NOT NULL DEFAULT false,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  left_at          timestamptz,
  arrived_at       timestamptz,
  UNIQUE (trip_id, user_id)
);
CREATE INDEX members_user_idx ON trip_members (user_id);

-- VEHICLES (one per member; several members can share one vehicle via vehicle_id)
CREATE TABLE vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  label         text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 24),  -- 'Car A'
  marker_letter char(1) NOT NULL,
  color_index   smallint NOT NULL CHECK (color_index BETWEEN 0 AND 7),
  vehicle_kind  text NOT NULL DEFAULT 'car' CHECK (vehicle_kind IN ('car','bike','van','bus')),
  UNIQUE (trip_id, label)
);
ALTER TABLE trip_members ADD COLUMN vehicle_id uuid REFERENCES vehicles(id);

-- INVITES
CREATE TABLE invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  code_hash    bytea NOT NULL UNIQUE,            -- SHA-256 of the code; the code itself is never stored
  created_by   uuid NOT NULL REFERENCES users(id),
  expires_at   timestamptz NOT NULL,
  max_uses     smallint NOT NULL DEFAULT 20,
  use_count    smallint NOT NULL DEFAULT 0,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- TRIP EVENTS (alerts and system events)
CREATE TABLE trip_events (
  id          bigserial PRIMARY KEY,
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES trip_members(id),
  type        event_type NOT NULL,
  note        text CHECK (char_length(note) <= 140),
  location    geography(Point,4326),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_trip_idx ON trip_events (trip_id, id DESC);

CREATE TABLE event_acks (
  event_id   bigint NOT NULL REFERENCES trip_events(id) ON DELETE CASCADE,
  member_id  uuid   NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  acked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, member_id)
);

-- MESSAGES
CREATE TABLE messages (
  id          bigserial PRIMARY KEY,
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES trip_members(id),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  client_id   uuid NOT NULL,                      -- idempotency
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, client_id)
);
CREATE INDEX messages_trip_idx ON messages (trip_id, id DESC);

-- LOCATION BREADCRUMBS (partitioned by day, short retention)
CREATE TABLE location_breadcrumbs (
  trip_id    uuid NOT NULL,
  member_id  uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  position   geography(Point,4326) NOT NULL,
  speed_mps  real,
  heading    smallint,
  PRIMARY KEY (trip_id, member_id, recorded_at)
) PARTITION BY RANGE (recorded_at);
-- create daily partitions via pg_partman or a cron job; drop partitions after retention

-- SAFETY
CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES users(id),
  trip_id      uuid REFERENCES trips(id) ON DELETE SET NULL,
  reported_id  uuid REFERENCES users(id),
  reason       text NOT NULL,
  details      text CHECK (char_length(details) <= 1000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

-- AUDIT LOG (security-relevant actions, no location data)
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  action      text NOT NULL,        -- 'invite.created','member.removed','trip.ended','data.deleted'
  target_type text,
  target_id   text,
  ip_hash     bytea,                -- salted hash, not raw IP
  meta        jsonb NOT NULL DEFAULT '{}'
);
```

---

## 4. Computing convoy metrics with PostGIS

Server-side, once per second per active trip, using positions from Redis (not stored rows):

```sql
-- progress of a point along the agreed route, in meters
SELECT ST_LineLocatePoint(r.geometry::geometry, ST_SetSRID(ST_MakePoint($lng,$lat),4326)) * r.distance_m AS progress_m
FROM route_plans r
WHERE r.trip_id = $1 AND r.is_agreed;

-- distance from route (for off-route detection), meters
SELECT ST_Distance(r.geometry, ST_SetSRID(ST_MakePoint($lng,$lat),4326)::geography) AS off_route_m
FROM route_plans r
WHERE r.trip_id = $1 AND r.is_agreed;
```

Optimization: load the agreed route once into worker memory and compute progress with a library (for example Turf.js `nearestPointOnLine`) to avoid per-tick DB queries. Use SQL only as the reference implementation and for post-trip summaries.

---

## 5. Redis keys (live state)

| Key                        | Type                              | TTL                  | Content                                         |
| -------------------------- | --------------------------------- | -------------------- | ----------------------------------------------- |
| `trip:{id}:pos`            | Hash (field = memberId)           | 1 h after last write | JSON `{lat,lng,speed,heading,ts,progressM,seq}` |
| `trip:{id}:presence`       | Sorted set (score = last ping ts) | 1 h                  | memberIds                                       |
| `trip:{id}:metrics`        | String (JSON)                     | 5 min                | Latest `convoy.metrics`                         |
| `trip:{id}:state`          | Hash                              | 12 h                 | status, thresholds cache                        |
| `trip:{id}:events`         | Stream (capped to 500)            | 24 h                 | alerts and chat for replay                      |
| `rl:{userId}:{action}`     | Counter                           | Window               | Rate limiting                                   |
| `ws:{connId}`              | Hash                              | Session              | userId, tripId, memberId                        |
| `invite:attempts:{ipHash}` | Counter                           | 15 min               | Brute-force protection                          |

Publish/subscribe channel per trip (`trip:{id}:bus`) so multiple API instances can fan out to connected sockets.

---

## 6. Row Level Security (if using Supabase or direct SQL access)

Even if all access goes through an API, enable RLS as defense in depth.

```sql
ALTER TABLE trips          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_breadcrumbs ENABLE ROW LEVEL SECURITY;

-- helper: is the current user an active member of this trip?
CREATE FUNCTION is_trip_member(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members m
    WHERE m.trip_id = t AND m.user_id = auth.uid()
      AND m.status IN ('joined','ready')
  );
$$;

CREATE POLICY trips_read ON trips FOR SELECT USING (is_trip_member(id) OR host_id = auth.uid());
CREATE POLICY trips_write ON trips FOR UPDATE USING (host_id = auth.uid());

CREATE POLICY members_read ON trip_members FOR SELECT USING (is_trip_member(trip_id));

CREATE POLICY messages_read ON messages FOR SELECT USING (is_trip_member(trip_id));
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (
  is_trip_member(trip_id)
  AND sender_id IN (SELECT id FROM trip_members WHERE user_id = auth.uid() AND trip_id = messages.trip_id)
);

CREATE POLICY events_read ON trip_events FOR SELECT USING (is_trip_member(trip_id));

-- breadcrumbs: only the owner can read their own history
CREATE POLICY crumbs_owner ON location_breadcrumbs FOR SELECT USING (
  member_id IN (SELECT id FROM trip_members WHERE user_id = auth.uid())
);
```

(`auth.uid()` is the Supabase helper; replace with `current_setting('app.user_id')::uuid` if you set the user in a session variable.)

---

## 7. Retention and deletion

| Data                   | Retention                                                                                      | Mechanism               |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ----------------------- |
| Live positions (Redis) | Deleted at trip end, hard TTL 1 h                                                              | TTL and explicit delete |
| Breadcrumbs            | Only stored if member opted in; deleted `retention_days` after trip end (default 1 day)        | Drop daily partitions   |
| Chat messages          | 30 days after trip end, or immediately on host delete                                          | Scheduled job           |
| Trip events            | 90 days                                                                                        | Scheduled job           |
| Invites                | Deleted 7 days after expiry                                                                    | Scheduled job           |
| Audit log              | 1 year, contains no location data                                                              |                         |
| Account deletion       | User soft-deleted, personal data purged within 30 days, messages anonymized to "Former member" | Background job          |

User controls: "Delete this trip's data now" and "Delete my account" must both work end to end and be tested.

---

## 8. Indexing and scale notes

- Expected MVP load: 1,000 concurrent trips x 10 members x 0.5 Hz = 5,000 writes/s to Redis. Postgres sees only a few writes per minute per trip.
- Single Redis instance is enough for MVP; shard by `tripId` later.
- Persist breadcrumbs at 10-30 s intervals only, via a batched writer, never per tick.
- Use connection pooling (PgBouncer) and prepared statements.
- Back up Postgres daily; Redis is not backed up (ephemeral by design).

---

## 9. Migrations and conventions

- Use a migration tool (Prisma Migrate, Drizzle, or Flyway). One migration per change, never edit applied migrations.
- IDs are UUIDs for externally visible objects; bigserial only for append-only internal tables.
- All timestamps `timestamptz` in UTC.
- Names `snake_case`, plural tables.
- Seed script: 1 host, 4 members, one 300 km sample route, and a GPX replay for the simulation harness.
