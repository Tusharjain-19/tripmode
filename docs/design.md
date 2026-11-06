# Trip Mode - design.md

Design system, UX rules, and motion spec for Trip Mode (collaborative multi-vehicle navigation).

---

## 1. Design principles

1. **Glanceable first.** A driver gets about 1.5 seconds per look. Every driving screen must communicate its single most important fact in that time.
2. **The map is the product.** UI sits on the map, never fights it. Sheets and chips are quiet; the route and vehicles are loud.
3. **Truthful state.** Never show a position as live when it is stale. Stale, reconnecting, and offline states are designed, not hidden.
4. **Calm under pressure.** Alerts inform, they do not panic. Reserve high-intensity treatment for SOS and genuine danger.
5. **Coordination, not control.** The app informs the group about deviations; it never forces a route on anyone.
6. **No decoration without function.** Every animation explains a change of state. No gradients for mood, no glow, no confetti.

---

## 2. Visual identity

**Personality:** precise, calm, trustworthy, like a well-made instrument. Think cartography and aviation instruments, not "tech startup".

**What to avoid (explicit):**

- Purple-to-blue gradients, neon accents, glassmorphism everywhere, glowing borders.
- Default AI-product typefaces (Inter, Poppins, Space Grotesk as the only face), sparkle iconography.
- Emojis anywhere in UI, notifications, or copy. Use icons or text.
- Stock illustrations of people with oversized limbs.

**Iconography:** one set only: Material Symbols (Rounded, weight 500, optical size 24). Vehicle markers and the convoy rail are custom.

---

## 3. Color tokens

Warm neutrals with a deep pine primary and a restrained signal palette. All text pairs meet WCAG AA (4.5:1 body, 3:1 large).

### Light theme

| Token                  | Hex       | Use                                  |
| ---------------------- | --------- | ------------------------------------ |
| `surface.base`         | `#F7F5F0` | App background, sheets               |
| `surface.raised`       | `#FFFFFF` | Cards, chips on map                  |
| `surface.sunken`       | `#EDEAE2` | Inputs, segmented controls           |
| `ink.primary`          | `#16201B` | Primary text                         |
| `ink.secondary`        | `#4F5B54` | Secondary text                       |
| `ink.tertiary`         | `#7B867F` | Hints, disabled                      |
| `line.subtle`          | `#E1DDD2` | Dividers                             |
| `brand.primary`        | `#1B5A47` | Primary actions, route line          |
| `brand.primaryPressed` | `#144536` | Pressed state                        |
| `brand.onPrimary`      | `#F7F5F0` | Text on primary                      |
| `status.leading`       | `#1E7A4F` | Leader, healthy                      |
| `status.caution`       | `#B7700A` | Falling behind, weak signal          |
| `status.alert`         | `#B3361B` | Stopped unexpectedly, off route, SOS |
| `status.info`          | `#2F5D8C` | Neutral notices                      |

### Dark theme (night driving, default after sunset)

| Token             | Hex       |
| ----------------- | --------- |
| `surface.base`    | `#111613` |
| `surface.raised`  | `#1A211D` |
| `surface.sunken`  | `#0C100E` |
| `ink.primary`     | `#ECEFEA` |
| `ink.secondary`   | `#A9B3AC` |
| `ink.tertiary`    | `#76817A` |
| `line.subtle`     | `#2A332E` |
| `brand.primary`   | `#5FBF9D` |
| `brand.onPrimary` | `#0C100E` |
| `status.leading`  | `#6FCB93` |
| `status.caution`  | `#E0A13B` |
| `status.alert`    | `#EE7B62` |
| `status.info`     | `#7FA6D1` |

### Vehicle identity palette (colorblind-safe, Okabe-Ito derived)

Assigned in join order. Color is never the only identifier: every marker also carries a letter or number.

`#E69F00` `#56B4E9` `#009E73` `#F0E442` `#0072B2` `#CC79A7` `#9C6B30` `#5B6770`

Text on vehicle colors is always `#0C100E` or `#FFFFFF`, whichever passes AA.

---

## 4. Typography

| Role                          | Typeface                   | Notes                                             |
| ----------------------------- | -------------------------- | ------------------------------------------------- |
| UI and body                   | **Public Sans** (variable) | Neutral, highly legible, supports tabular figures |
| Numerics (distance, ETA, gap) | **IBM Plex Mono**          | Only on the convoy rail and driving-mode readouts |
| Devanagari fallback           | **Noto Sans Devanagari**   | Hindi support                                     |

If the project is ever embedded inside Google Maps itself, swap to Google Sans / Roboto per Google's guidelines; tokens make this a one-file change.

| Style         | Size / line | Weight          |
| ------------- | ----------- | --------------- |
| Display       | 28 / 34     | 600             |
| Title         | 22 / 28     | 600             |
| Heading       | 18 / 24     | 600             |
| Body          | 16 / 24     | 400             |
| Label         | 14 / 20     | 500             |
| Caption       | 12 / 16     | 500             |
| Drive Numeral | 40 / 44     | 500 (Plex Mono) |

Rules: sentence case everywhere. No all-caps except 11-12 pt overline labels with +6% tracking. Maximum two weights per screen.

---

## 5. Spacing, shape, elevation

- Spacing scale (dp): 4, 8, 12, 16, 20, 24, 32, 48. Screen gutters 16.
- Radius: 8 (inputs, chips), 14 (cards), 24 (sheets, top corners), full (avatars, PTT).
- Elevation: avoid shadows on sheets; use a 1 dp `line.subtle` top border plus a soft 12% black shadow only on floating map controls.
- Minimum touch target 48 dp; **driving-mode targets 64 dp**.

---

## 6. Map styling

- Custom muted map style: desaturated land, low-contrast labels, no POI clutter except fuel, food, rest stops, and hospitals relevant to the trip.
- **Route line:** 6 dp `brand.primary` with 2 dp white casing (dark theme: 2 dp `surface.base` casing). Alternate routes: 4 dp `ink.tertiary`.
- **Travelled portion** of the route is rendered at 40% opacity so progress reads at a glance.
- **Vehicle marker:** rounded square (radius 10), 36 dp, vehicle color fill, bold letter in center, a small heading wedge on the leading edge. The user's own vehicle has a 2 dp ring in `ink.primary`.
- **Status ring** around marker: none (healthy), `status.caution` dashed (falling behind), `status.alert` solid (stopped/off route), grey dashed (stale position).
- **Stale position:** marker desaturates and shows "last seen 2 min ago" label after 15 s without update.
- Camera: follow the user by default; "Fit group" button animates bounds to all vehicles.

---

## 7. Signature element: the Convoy Rail

A horizontal rail representing the route from origin to destination, with each vehicle placed proportionally to route progress.

```
Origin  |-------A------B----------------C-------------|  Destination
              Leader   1.5 km          4.0 km
```

- Rail is 8 dp tall, travelled portion filled with `brand.primary`.
- Vehicle chips (letter + color) sit above the rail and slide as positions update.
- Gaps between adjacent vehicles are drawn as a bracket with the distance in Plex Mono.
- When a gap exceeds the host's threshold (default 3 km), the bracket turns `status.caution` and the trailing chip gets a dashed ring.
- Tap a chip to focus that vehicle on the map.
- Collapsed height 72 dp (always visible in driving mode); expanded shows the member list.

This is the one memorable, ownable visual of the product. Keep it clean and precise.

---

## 8. Screens and flows

### 8.1 Entry

Inside the host navigation app, a "Trip" action appears next to Directions. In the standalone prototype, the home screen has a search bar, recent trips, and a primary "Start a trip" button.

### 8.2 Create trip (3 steps, one decision per step)

1. **Destination and name.** Search field, trip name auto-filled ("Jaipur to Udaipur"), editable.
2. **Route.** Map preview with up to 3 route options; select one as the "agreed route". Departure time optional.
3. **Rules.** Falling-behind threshold (2 / 3 / 5 km), who can send alerts (everyone / host only), auto-end when all arrive.
   Then: invitation sheet with link, QR code, and share button.

### 8.3 Join flow (invitee)

Link opens app (or store listing). Screen shows trip name, destination, host name, member count. Steps: sign in, choose vehicle name and color, **explicit location-sharing consent** screen, join.

### 8.4 Lobby (before departure)

Member list with vehicle chips, readiness toggle ("Ready"), host "Start trip" button. Map preview shows everyone's start positions.

### 8.5 Active trip

Bottom sheet with three snap points:

| Snap      | Height | Content                             |
| --------- | ------ | ----------------------------------- |
| Collapsed | 72 dp  | Convoy rail + next group alert      |
| Half      | 45%    | Member list with gap, speed, status |
| Full      | 90%    | Chat, trip settings, stops          |

Floating controls on the map: recenter, fit group, layers, mute.

Persistent bottom action bar (always reachable by thumb):

- **Push-to-talk** (64 dp circle, center)
- **Quick alerts** (opens 2x3 grid)
- **Chat** (badge for unread)

### 8.6 Quick alerts (icon + label, no emoji)

| Alert          | Icon (Material Symbols)       |
| -------------- | ----------------------------- |
| Slow down      | `speed`                       |
| Need fuel      | `local_gas_station`           |
| Need a break   | `airline_seat_recline_normal` |
| Food stop      | `restaurant`                  |
| Lost the route | `wrong_location`              |
| Wait for me    | `hourglass_top`               |

Alerts appear as a banner for 6 s at the top of the map with sender chip, and as a haptic + soft tone. One tap to acknowledge ("Got it"); acknowledgements are shown to the sender as a count.

### 8.7 Smart convoy alerts (system-generated)

Tone: factual, no blame. Examples:

- "Vehicle C is 5.2 km behind the group."
- "Vehicle B left the agreed route near Bhilwara."
- "Vehicle A has stopped for 4 minutes."
- "Vehicle C lost connection. Last seen 2 minutes ago."
- "Vehicle A reached the destination."

### 8.8 SOS

Long-press (1.2 s) with a filling ring, then a 5 s cancel window. Sends location and vehicle identity to all members; optionally to a saved emergency contact. Never auto-calls emergency services without a confirmation step.

### 8.9 Trip summary

Total distance, duration, per-vehicle arrival times, longest gap, stops made. Option to save or delete trip data (see security.md).

---

## 9. Driving mode vs passenger mode

Role is chosen per member ("Driver" / "Passenger") and can be switched.

| Behavior       | Driver                | Passenger               |
| -------------- | --------------------- | ----------------------- |
| Typing in chat | Disabled while moving | Enabled                 |
| Touch targets  | 64 dp                 | 48 dp                   |
| Chat messages  | Read aloud on request | Shown inline            |
| Quick alerts   | 6 large buttons       | 6 buttons + custom text |
| Info density   | Rail + one alert      | Full member list        |

Auto-switch to driving layout above 10 km/h if the user is marked Driver. Never block the SOS or PTT controls.

---

## 10. Motion specification

Philosophy: motion explains state change. Short, decelerating, never bouncy except where physical (sheets).

| Interaction              | Duration                                                         | Easing                           | Detail                                                                    |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| Vehicle marker update    | 1000 ms (linear, between GPS ticks)                              | Linear                           | Interpolate along route polyline, rotate heading with shortest-arc easing |
| Convoy rail chip slide   | 400 ms                                                           | `cubic-bezier(0.2, 0, 0, 1)`     | Chips never overlap; resolve collisions by stacking vertically            |
| Gap bracket color change | 250 ms                                                           | Ease-out                         | Crossfade, no flash                                                       |
| Bottom sheet snap        | Spring: stiffness 300, damping 30                                | Spring                           | Velocity-aware                                                            |
| Screen transition        | 280 ms                                                           | `cubic-bezier(0.2, 0, 0, 1)`     | Shared-element for trip card to active trip                               |
| Quick alert banner in    | 220 ms                                                           | Ease-out, 12 dp translate + fade | Out: 160 ms                                                               |
| PTT press                | 120 ms scale to 0.96, then ripple rings expanding at audio level |                                  | Ripples driven by mic amplitude, max 3 rings                              |
| Join notification        | Chip drops onto rail with 300 ms ease-out                        |                                  | Subtle, no confetti                                                       |
| Camera "Fit group"       | 700 ms                                                           | Ease-in-out                      |                                                                           |
| Skeleton loading         | 1.4 s shimmer, low contrast                                      |                                  | Only for lists, never the map                                             |
| SOS ring fill            | 1200 ms linear                                                   |                                  | Haptic tick at 50% and 100%                                               |

**Rules**

- Respect system "Reduce motion": replace slides with 120 ms crossfades, disable marker rotation easing, keep functional indicators.
- Target 60 fps; marker animation runs on the UI thread (Reanimated worklets).
- No motion longer than 700 ms except marker interpolation and loaders.

**Haptics:** light tick on alert received, medium on PTT start, success pattern on joining, heavy double on SOS armed.
**Sound:** two earcons only (alert, join), under 400 ms, user adjustable, off by default for passengers during PTT.

---

## 11. States to design (do not skip)

Empty, loading, offline, reconnecting, GPS weak, GPS denied, background-location denied, stale member, trip ended, host left (host transfer), invite expired, trip full, rate limited, permission revoked.

---

## 12. Accessibility

- AA contrast verified for both themes and over map imagery (chips have solid backgrounds).
- Screen reader labels for every marker: "Vehicle B, 1.5 kilometers behind leader, following."
- Dynamic type up to 130% without truncating the rail.
- Haptic and audio alternatives for visual alerts.
- Color is never the sole signal: ring pattern (solid, dashed) plus text.
- Left-handed mode: mirror the bottom action bar.

---

## 13. Microcopy guidelines

- Plain and short: "3 vehicles connected", "Vehicle C is 4 km behind".
- No exclamation marks, no humor in alerts, no emojis.
- Always say what happened and what the user can do: "Connection lost. Retrying. You can still see last known positions."
- Names: use the vehicle's name or the driver's first name, never "User 12".

---

## 14. Deliverables checklist for design

- [ ] Figma file: tokens as variables (light and dark), components with all states
- [ ] Convoy Rail component with interactive prototype
- [ ] Marker set (8 colors, 5 status rings)
- [ ] Motion prototypes for PTT, rail slide, sheet snap
- [ ] Map style JSON (light and dark)
- [ ] Accessibility audit sheet
