# Trip Mode - prompt.md

Ready-to-use prompts for building Trip Mode with an AI coding assistant (Claude Code, Cursor, or similar).

## How to use

1. Put `design.md`, `frontend.md`, `database.md`, and `security.md` in a `/docs` folder in your repo.
2. Start every new session by pasting the **Master Context Prompt** below.
3. Run the phase prompts in order. Finish and test each phase before starting the next.
4. After each phase, commit. If output drifts from the docs, paste the "Correction prompt" at the end.

---

## Master Context Prompt (paste at the start of every session)

```
You are a senior mobile engineer and product designer building "Trip Mode", a
collaborative multi-vehicle navigation feature: friends or families travelling
in separate vehicles join one shared trip room, see each other's live
positions on one map, get convoy alerts, and communicate through group chat,
push-to-talk voice, and one-tap quick alerts.

Source of truth (read these first, they are in /docs):
- design.md   : visual system, tokens, motion, screens, copy rules
- frontend.md : stack, structure, realtime protocol, location pipeline
- database.md : PostgreSQL/PostGIS schema, Redis keys, retention
- security.md : threat model, consent, auth, rate limits, privacy rules

Non-negotiable rules:
1. Follow design.md tokens exactly. Never hard-code colors, font sizes, or
   durations in components; import from src/design.
2. No emojis anywhere (UI, copy, comments, commit messages). Use Material
   Symbols icons or text.
3. No purple/blue gradients, no glow effects, no glassmorphism. Fonts are
   Public Sans and IBM Plex Mono only.
4. All motion follows the motion table in design.md and respects Reduce Motion.
5. TypeScript strict mode. No `any`. Validate all external input with zod.
6. Never log coordinates, tokens, invite codes, or message bodies.
7. No location is sent before explicit per-trip consent.
8. Write unit tests for pure logic and keep components small and typed.
9. Ask before adding a dependency not listed in frontend.md.
10. If a requirement is ambiguous, state your assumption in one line and proceed.

Work in small steps. After each step, list files changed and how to run or
verify. Do not refactor unrelated code.
```

---

## Phase 0 - Foundation and design system

```
Phase 0: project scaffolding and design system.

Tasks:
1. Create an Expo (development build) + React Native + TypeScript project using
   Expo Router with the folder structure in frontend.md section 2.
2. Install and configure: Reanimated, Gesture Handler, @gorhom/bottom-sheet,
   Zustand, TanStack Query, zod, react-hook-form, i18next, expo-secure-store,
   MMKV, FlashList.
3. Load fonts: Public Sans (400, 500, 600) and IBM Plex Mono (500). Include
   Noto Sans Devanagari fallback.
4. Implement src/design: tokens.ts (light and dark palettes, vehicle colors,
   motion constants exactly as in design.md sections 3 and 10), typography.ts
   (type scale from design.md section 4), spacing/radius constants, and a
   ThemeProvider with automatic light/dark switching plus a manual override.
5. Build base components with all states (default, pressed, disabled, loading,
   focus): Button (primary, secondary, quiet, destructive), Chip, Icon
   (Material Symbols wrapper), TextField, Toast, Sheet wrapper, ListRow.
6. Add an ESLint rule banning hex color literals and raw numeric durations
   outside src/design.
7. Create a hidden "Design Gallery" screen showing every component, both
   themes, and 130% text scale.

Acceptance criteria:
- App runs on Android and iOS; gallery renders in both themes.
- Contrast verified for all text/background token pairs (add a script that
  fails CI below AA).
- Lint passes; no hard-coded colors in components.
```

---

## Phase 1 - Auth, onboarding, permissions

```
Phase 1: authentication and permission flows.

Tasks:
1. Implement sign-in (Google and phone OTP) against a typed API client in
   src/services/api.ts. Use a mock server adapter behind an env flag so the
   app runs without a backend.
2. Token handling per security.md section 3: access token in memory, refresh
   token in secure store, silent refresh with rotation, sign-out everywhere.
3. Onboarding (3 screens max): what Trip Mode is, how location is used,
   profile (display name 1-40 chars). Copy follows design.md section 13.
4. Permission flow: pre-permission explanation screens for location
   (while-in-use, then background), notifications, and microphone. Handle
   denied, limited, and revoked states with recovery screens.
5. Age gate at sign-up per security.md section 6.

Acceptance criteria:
- Cold start restores session without flashing the login screen.
- Every permission state has a designed screen.
- No token appears in logs (add a test that scans logger output).
```

---

## Phase 2 - Create trip and invite

```
Phase 2: trip creation, invitation, join, and lobby.

Tasks:
1. Create-trip flow in 3 steps exactly as design.md section 8.2: destination
   and name, route selection (up to 3 routes, choose agreed route), rules
   (gap threshold, alert permissions, auto-end). Use a MapProvider interface
   with a MapLibre implementation; routes come from the API (mock first).
2. Invitation sheet: link, QR code, share action. Show expiry and max uses.
   Host controls: approval mode toggle, revoke, regenerate.
3. Invite deep link handling (app/join/[code].tsx): show trip preview (name,
   host, destination, member count) before any consent. Universal links and a
   fallback web preview route.
4. Join flow: vehicle label and color selection from the 8-color palette,
   Driver/Passenger role, explicit location consent screen with the exact
   disclosures from security.md section 6.
5. Lobby: member list with vehicle chips, Ready toggle, host Start trip,
   map preview of start positions, join-request approval UI for the host.

Acceptance criteria:
- A user cannot reach the live map without a recorded consent.
- Expired, revoked, full, and invalid invites each show a distinct,
  non-leaking message (invalid and revoked share one generic message).
- Screens match design.md at 100% and 130% text scale.
```

---

## Phase 3 - Live map and simulated vehicles

```
Phase 3: the live trip screen using simulated data first.

Tasks:
1. Build the simulation harness: a module that replays GPX tracks for N
   virtual vehicles and emits the same events as the real WebSocket protocol
   in frontend.md section 4. Include scenarios: normal convoy, one vehicle
   falls behind, one takes an alternate route, one loses signal, one stops.
2. Live screen: full-screen map, custom muted map style (light and dark),
   route line with casing and travelled-portion dimming, floating controls
   (recenter, fit group, layers, mute).
3. VehicleMarker per design.md section 6: rounded square, letter, heading
   wedge, own-vehicle ring, status rings (none, dashed caution, solid alert,
   grey dashed stale). Accessible labels.
4. Smooth movement per frontend.md section 6: interpolation over 1000 ms,
   shortest-arc heading, dead reckoning up to 3 s, then stale state.
5. Bottom sheet with three snap points (72 dp, 45%, 90%) using the spring from
   design.md. Collapsed state shows a placeholder where the Convoy Rail will go.
6. Fit group camera animation (700 ms).

Acceptance criteria:
- 60 fps with 10 simulated vehicles on a mid-range Android device.
- Markers never jump when a tick is late; stale after 15 s is visible.
- Reduce Motion produces crossfades and no rotation easing.
```

---

## Phase 4 - Convoy Rail and metrics

```
Phase 4: the Convoy Rail and convoy logic.

Tasks:
1. Implement lib/convoy.ts as pure, fully unit-tested functions: route
   progress, leader selection, along-route gaps, and status classification
   (following, behind, stopped, offroute, stale, offline) with thresholds from
   frontend.md section 7.
2. Build the ConvoyRail component exactly as design.md section 7: 8 dp rail,
   proportional chip placement, gap brackets with IBM Plex Mono distances,
   caution coloring and dashed ring above the threshold, tap-to-focus,
   collision handling (stack vertically), 400 ms slide animation.
3. Member list in the half-height sheet: vehicle chip, name, gap, speed,
   status text. Driver/Passenger indicator.
4. System alerts generated from status changes with the exact microcopy style
   from design.md section 8.7 and a 6 s top banner. Debounce so the same
   alert does not repeat within 2 minutes.
5. Driving mode layout switch above 10 km/h for Driver role: 64 dp targets,
   rail plus one alert only.

Acceptance criteria:
- Unit tests cover 2, 5, and 10 vehicles, equal progress, and reversed order.
- Rail remains legible at 130% text scale and with 10 chips.
- Simulation scenarios trigger the correct alerts and visual states.
```

---

## Phase 5 - Communication: chat, quick alerts, push-to-talk

```
Phase 5: communication features.

Tasks:
1. Quick alerts: 2x3 grid with Material Symbols icons (no emojis) for Slow
   down, Need fuel, Need a break, Food stop, Lost the route, Wait for me.
   Send via WebSocket, banner for recipients with sender chip, haptic and
   earcon, one-tap "Got it" acknowledgement, ack count for the sender.
2. Chat: FlashList, optimistic send with clientId idempotency, delivery
   states, unread badge, 500 character limit, no emoji picker. Typing is
   disabled for Drivers while moving; offer read-aloud instead.
3. Push-to-talk: 64 dp button, hold to talk, release to mute, via a LiveKit
   wrapper in services/voice.ts. Ripple animation driven by mic amplitude
   (max 3 rings), speaker chip shown on the map while someone talks, duck
   navigation audio during talk. Request voice token only after join consent.
4. Permissions and failure states: mic denied, voice connection failed,
   reconnecting. Each has a clear inline message.
5. Rate limits enforced client-side to mirror security.md section 8.

Acceptance criteria:
- Two devices on a LAN can exchange alerts, chat, and voice via a local dev
  server.
- No emoji characters exist anywhere in the bundle (add a CI check).
- PTT latency measured and logged (without audio content) in dev builds.
```

---

## Phase 6 - Real location and realtime wiring

```
Phase 6: replace the simulation with real data.

Tasks:
1. Implement services/location.ts per frontend.md section 5: foreground
   service on Android, background on iOS, adaptive sampling, movement
   threshold, accuracy filter, batching, and the "Sharing location" indicator
   with one-tap Pause.
2. Implement services/realtime.ts with auth, exponential backoff with jitter,
   snapshot on connect, event replay by last-seen id, and heartbeat.
3. Connect Zustand slices to real events; keep the simulation harness available
   behind a dev flag.
4. Offline handling: cache last snapshot, Reconnecting banner, queued alerts
   (30 s window), stale and offline member states.
5. SOS: 1.2 s long-press ring, 5 s cancel window, payload per design.md
   section 8.8, no automatic emergency calls.
6. Trip end flow and summary screen (distance, duration, arrival times,
   longest gap, stops) with "Delete trip data now".

Acceptance criteria:
- Two physical phones in a car show each other within 3 s accuracy.
- Battery and data usage measured over a 30-minute test and recorded in
  docs/field-test.md.
- Pausing sharing immediately stops sends and shows "location paused" to
  others.
```

---

## Phase 7 - Motion and polish pass

```
Phase 7: motion, haptics, and visual polish.

Tasks:
1. Audit every transition against the motion table in design.md section 10;
   fix any deviation. Add shared-element transition from trip card to live
   screen.
2. Implement haptic patterns and the two earcons (alert, join), with settings
   to adjust or disable.
3. Join animation: chip settles onto the rail in 300 ms, no confetti.
4. Skeleton loaders for lists only; designed empty, error, and offline states
   for every screen (checklist in design.md section 11).
5. Dark theme review on a real device at night; auto theme after sunset.
6. Performance profile: remove unnecessary re-renders on the live screen,
   verify budgets in frontend.md section 9.

Acceptance criteria:
- A screen recording shows no jank on a mid-range device.
- Reduce Motion mode verified on both platforms.
- No hard-coded durations or colors remain (lint passes).
```

---

## Phase 8 - Security hardening and QA

```
Phase 8: security and quality gate.

Tasks:
1. Walk the checklist in security.md section 14 and produce
   docs/security-review.md marking each item pass/fail with evidence.
2. Add negative authorization tests for every API endpoint and socket event
   (unauthenticated, non-member, removed member, wrong role, expired trip).
3. Verify no sensitive data in logs, analytics, crash reports, or push
   payloads; add automated tests that fail on coordinates in log output.
4. Verify consent gating, pause sharing, leave trip, remove member, block, and
   report flows end to end.
5. Accessibility audit: screen reader pass for each screen, 130% text, color
   independence of status, contrast report.
6. Write Maestro E2E flows: create trip, join by link, send alert, PTT smoke
   test, end trip, delete data.

Acceptance criteria:
- All checklist items pass or have a tracked issue with owner and date.
- E2E suite green on Android and iOS simulators.
```

---

## Phase 9 - Demo and pitch assets

```
Phase 9: prepare the demonstration for the Google Maps team.

Tasks:
1. Build a scripted demo mode: a 4-vehicle Jaipur to Udaipur scenario that
   runs deterministically (vehicle falls behind, alert sent, quick alert
   acknowledged, route deviation, arrival).
2. Write docs/case-study.md: problem, user research summary (add a short
   survey of 20+ people who have travelled in multi-car groups), solution,
   screens, technical architecture, privacy approach, metrics to validate.
3. Prepare a 90-second screen recording script with on-screen captions (no
   emojis, no music with vocals).
4. Create a one-page product brief using the paragraph in the concept document
   as the abstract, plus success metrics (for example, reduction in
   coordination calls per trip, time-to-regroup after separation).
5. List honest limitations and open questions (battery, rural connectivity,
   privacy edge cases) in docs/limitations.md.

Acceptance criteria:
- Demo runs offline from a single command.
- Case study clearly states that similar standalone products exist and
  argues for native integration as the differentiator.
```

---

## Utility prompts

### Correction prompt (when the AI drifts from the docs)

```
Re-read /docs/design.md, /docs/frontend.md, and /docs/security.md. Compare
your last change against them and list every deviation (colors, fonts,
motion, emojis, logging, consent). Fix each deviation. Do not change anything
else. Report what you changed.
```

### Component prompt template

```
Build the <ComponentName> component.
Purpose: <one sentence>
Props: <typed list>
States: default, pressed, disabled, loading, error, and any specific to it
Design rules: use tokens from src/design only; match design.md section <n>
Motion: <duration/easing from the motion table>
Accessibility: label, role, 130% text, Reduce Motion behavior
Tests: <what to test>
Show the file list and a usage example in the Design Gallery.
```

### Review prompt (before every merge)

```
Review the diff as a strict reviewer. Check: token usage, no emojis, no
hard-coded colors or durations, authorization present on server code, no
sensitive logging, input validation with zod, accessibility labels, Reduce
Motion handling, test coverage of pure logic. Output a list of issues ordered
by severity with suggested fixes.
```

### Bug triage prompt

```
Given this bug report and logs (coordinates redacted), propose the three most
likely root causes ranked by probability, the quickest experiment to confirm
each, and the smallest safe fix. Do not change code until I pick one.
```
