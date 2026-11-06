# Trip Mode - frontend.md

Frontend architecture, stack, and implementation guidance. Read together with `design.md` (visuals), `database.md` (data), and `security.md`.

---

## 1. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| App framework | React Native + Expo (development builds) + TypeScript | One codebase for Android and iOS; closest to the web skills you already have |
| Navigation | Expo Router | File-based, deep links for invite URLs |
| Animation | React Native Reanimated + Gesture Handler | UI-thread animation for markers, sheets, rail |
| Bottom sheet | @gorhom/bottom-sheet | Spring snap points, gesture-aware |
| Map | MapLibre React Native (prototype) behind a `MapProvider` interface; Google Maps SDK implementation for the Google pitch | Open and free for the prototype; swappable |
| Routing / ETA | Server-side via Google Routes API, or OSRM/Valhalla for free prototype | Keeps keys off the client |
| State | Zustand (client state) + TanStack Query (server state) | Small, predictable |
| Realtime | WebSocket (native) with reconnect logic | Positions and events |
| Voice (push-to-talk) | LiveKit (WebRTC) | Low-latency audio rooms |
| Storage | expo-secure-store (tokens), MMKV (cache) | |
| Forms and validation | react-hook-form + zod | Shared schemas with backend |
| i18n | i18next (English, Hindi first) | |
| Testing | Jest, React Native Testing Library, Maestro (E2E) | |
| Crash and performance | Sentry | |

**Web companion (optional, later):** a Next.js page for invite links (`/t/:code`) that shows trip info and opens the app or store.

**Alternative:** Flutter is equally valid if you prefer it. Everything below is stack-agnostic except code snippets.

---

## 2. Project structure

```
trip-mode/
  app/                      # Expo Router screens
    (auth)/
    (tabs)/index.tsx        # Home
    trip/create/            # step-1 destination, step-2 route, step-3 rules
    trip/[id]/lobby.tsx
    trip/[id]/live.tsx      # Active trip (map + sheet)
    trip/[id]/summary.tsx
    join/[code].tsx         # Invite deep link
  src/
    design/                 # tokens.ts, theme.ts, typography.ts, motion.ts
    components/
      map/                  # VehicleMarker, RouteLayer, MapProvider
      convoy/               # ConvoyRail, GapBracket, MemberRow
      comms/                # PushToTalk, QuickAlertGrid, ChatList
      common/               # Button, Chip, Sheet, Toast, Icon
    features/
      auth/ trips/ members/ location/ alerts/ chat/ voice/ sos/
    services/
      api.ts                # REST client
      realtime.ts           # WebSocket client
      location.ts           # GPS pipeline
      voice.ts              # LiveKit wrapper
    stores/                 # zustand slices
    lib/                    # geo.ts (haversine, route progress), time.ts, logger.ts
    i18n/
  assets/fonts/ icons/ map-style/
```

---

## 3. Design tokens in code

```ts
// src/design/tokens.ts
export const palette = {
  light: {
    surfaceBase: '#F7F5F0', surfaceRaised: '#FFFFFF', surfaceSunken: '#EDEAE2',
    inkPrimary: '#16201B', inkSecondary: '#4F5B54', inkTertiary: '#7B867F',
    lineSubtle: '#E1DDD2', brand: '#1B5A47', onBrand: '#F7F5F0',
    leading: '#1E7A4F', caution: '#B7700A', alert: '#B3361B', info: '#2F5D8C',
  },
  dark: {
    surfaceBase: '#111613', surfaceRaised: '#1A211D', surfaceSunken: '#0C100E',
    inkPrimary: '#ECEFEA', inkSecondary: '#A9B3AC', inkTertiary: '#76817A',
    lineSubtle: '#2A332E', brand: '#5FBF9D', onBrand: '#0C100E',
    leading: '#6FCB93', caution: '#E0A13B', alert: '#EE7B62', info: '#7FA6D1',
  },
} as const;

export const vehicleColors = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442',
  '#0072B2', '#CC79A7', '#9C6B30', '#5B6770',
] as const;

export const motion = {
  ease: [0.2, 0, 0, 1] as const,
  markerMs: 1000, railMs: 400, sheetSpring: { stiffness: 300, damping: 30 },
  bannerInMs: 220, bannerOutMs: 160, screenMs: 280,
};
```

Never hard-code a color or duration in a component. Lint rule: ban hex literals outside `design/`.

---

## 4. Realtime protocol (client view)

Single WebSocket per active trip: `wss://api.example.com/v1/trips/:id/stream?token=<short-lived>`.

**Client to server**

| Event | Payload |
|---|---|
| `loc.update` | `{ lat, lng, speed, heading, accuracy, ts, seq }` |
| `alert.send` | `{ type, note? }` |
| `chat.send` | `{ text, clientId }` |
| `ack` | `{ alertId }` |
| `sos.trigger` | `{ lat, lng }` |
| `presence.ping` | `{}` every 20 s |

**Server to client**

| Event | Payload |
|---|---|
| `snapshot` | Full state on connect: members, positions, route, rules |
| `members.positions` | Batched array of `{ memberId, lat, lng, speed, heading, ts, routeProgressM }`, max 1 per 1 s |
| `convoy.metrics` | `{ leaderId, gaps: [{ memberId, gapM, status }] }` |
| `alert.new` / `alert.ack` | Alert objects |
| `chat.new` | Message object |
| `member.joined / left / stale` | Presence events |
| `trip.ended` | Reason |

Design notes:
- The server batches positions at 1 Hz; client never receives raw per-device streams.
- `seq` and `ts` allow dropping out-of-order updates.
- On reconnect, request `snapshot` and replay missed `alert` and `chat` events by last-seen id.

```ts
// src/services/realtime.ts (simplified)
export function createTripSocket(tripId: string, getToken: () => Promise<string>) {
  let ws: WebSocket | null = null;
  let attempt = 0;
  const listeners = new Set<(e: ServerEvent) => void>();

  async function connect() {
    const token = await getToken();
    ws = new WebSocket(`${WS_URL}/v1/trips/${tripId}/stream?token=${token}`);
    ws.onopen = () => { attempt = 0; };
    ws.onmessage = (m) => listeners.forEach((l) => l(JSON.parse(m.data)));
    ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** attempt++, 15000) + Math.random() * 500; // backoff + jitter
      setTimeout(connect, delay);
    };
  }
  connect();
  return {
    send: (type: string, payload: unknown) => ws?.readyState === 1 && ws.send(JSON.stringify({ type, payload })),
    subscribe: (fn: (e: ServerEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    close: () => { ws?.close(); },
  };
}
```

---

## 5. Location pipeline

Goals: accurate enough for convoy gaps, light on battery and data.

- Use `expo-location` foreground service on Android (persistent notification: "Trip Mode is sharing your location") and background updates on iOS.
- **Adaptive sampling:**
  - Moving above 20 km/h: every 2 s
  - 5-20 km/h: every 4 s
  - Stationary: every 15 s (heartbeat)
- Send only if moved more than 8 m or heading changed more than 15 degrees, or heartbeat due.
- Filter: drop fixes with accuracy worse than 50 m; apply a light Kalman or exponential smoothing for display only.
- Batch and compress payloads; keep each message under 200 bytes.
- Show a persistent in-app "Sharing location" indicator and a one-tap "Pause sharing" (see security.md).
- Handle permission states explicitly: denied, while-in-use only, always. Explain why "always" is needed with a pre-permission screen.

---

## 6. Rendering moving vehicles smoothly

Raw GPS jumps; users should see continuous motion.

1. Maintain a per-vehicle buffer of the last 3 positions.
2. Snap to the route polyline when within 30 m (map-matching light), else show raw position with an "off route" ring.
3. Animate between known positions over 1000 ms; if a tick is late, dead-reckon for up to 3 s using speed and heading, then freeze and mark stale.
4. Heading: interpolate via shortest-arc.

```ts
// src/lib/geo.ts
export function shortestArc(from: number, to: number) {
  const d = ((to - from + 540) % 360) - 180;
  return from + d;
}

export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}
```

For many markers use a single GeoJSON source with data-driven symbol layers instead of one native view per marker where possible; keep animated custom views to the user's own vehicle and the focused vehicle.

---

## 7. Convoy logic on the client

The authoritative metrics come from the server (`convoy.metrics`). The client only presents them, but must render sensible output offline:

- `routeProgressM` per member = distance along the agreed route polyline.
- Leader = highest `routeProgressM`.
- Gap = leader progress minus member progress (along route, not straight line).
- Status thresholds from trip rules: `following` (gap below threshold), `behind` (above), `stopped` (speed under 2 km/h for 3 min), `offroute` (more than 150 m from route for 30 s), `stale` (no update for 15 s), `offline` (60 s).

Keep this logic in `lib/convoy.ts` as pure functions with unit tests.

---

## 8. Screens implementation notes

- **Live screen** composition: `<MapView>` fills the screen; `<ConvoySheet>` (bottom sheet) overlays; `<ActionBar>` is fixed above the safe area; `<AlertBanner>` is a top overlay with `pointerEvents="box-none"`.
- Keep the live screen free of re-renders from non-visible data: select narrow slices from Zustand; memoize markers by `memberId` and quantized position.
- **Invite deep links:** `https://app.example.com/t/ABC123` handled via universal links and app links; fall back to web page that shows trip preview and store buttons. Deferred deep linking to carry the code through install.
- **Push-to-talk:** press and hold to publish mic track to the LiveKit room; release to mute. Duck navigation voice during talk. Show speaker identity chip on the map while someone talks.
- **Chat:** optimistic send with `clientId`, list virtualization (FlashList), no emoji picker.
- **Offline:** cache last snapshot in MMKV; show "Reconnecting" banner; queue alerts for up to 30 s, then drop with a notice.

---

## 9. Performance budgets

| Metric | Target |
|---|---|
| Cold start to interactive | Under 2.5 s on a mid-range Android |
| Live screen frame rate | 60 fps with 10 vehicles |
| JS thread busy time during live trip | Under 25% |
| Battery drain during a 2 h trip | Under 12% (screen on, navigating) |
| Data usage per hour | Under 15 MB excluding voice |
| Voice latency (PTT) | Under 400 ms mouth to ear |
| Bundle | Fonts subset to Latin and Devanagari; images as WebP/SVG |

---

## 10. Testing plan

- **Unit:** geo math, convoy status, reducers, zod schemas.
- **Component:** ConvoyRail layout with 2, 5, 10 vehicles; text scaling to 130%.
- **Simulation harness:** a script that replays recorded GPX tracks for N virtual vehicles over the WebSocket, so you can demo and test without driving. Include scenarios: vehicle falls behind, takes an alternate route, loses signal, stops.
- **E2E (Maestro):** create trip, join via link, send alert, end trip.
- **Field test:** two phones in a real drive before any demo; log battery and dropped updates.

---

## 11. Accessibility and localization

- Every interactive element has `accessibilityLabel` and role; markers announce position relative to leader.
- Respect `AccessibilityInfo.isReduceMotionEnabled()`.
- Strings in i18n files only; support Hindi layout and number formats; no string concatenation for sentences.

---

## 12. Build order (summary)

1. Tokens, typography, base components, theme switching
2. Auth, onboarding, permissions
3. Create trip and invite
4. Live map with simulated positions
5. Real location pipeline plus WebSocket
6. Convoy rail and metrics
7. Alerts, chat, PTT
8. SOS, summary, polish and motion pass
9. Accessibility and performance pass
10. Field test, demo video

See `prompt.md` for ready-to-use prompts per phase.
