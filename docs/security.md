# Trip Mode - security.md

Security, privacy, and safety requirements. A location-sharing product carries real risk (stalking, harassment, data leaks), so this document is treated as a launch gate, not an afterthought.

This is engineering guidance, not legal advice. Have the privacy policy and consent flows reviewed by qualified counsel before any public release.

---

## 1. Security principles

1. **Consent is explicit, informed, and revocable.** Location is shared only after the member says yes for this trip, and they can stop at any time.
2. **Least data, shortest time.** Store the minimum, for the shortest time. Live positions are ephemeral.
3. **Members only.** A trip's data is visible only to current members of that trip.
4. **Secure by default.** The safest option is pre-selected; riskier options need a deliberate choice.
5. **Defense in depth.** API checks, database RLS, short-lived tokens, rate limits, monitoring.
6. **No silent behavior.** The user always sees when sharing is on and who can see it.

---

## 2. Threat model

| Threat                       | Example                                                             | Mitigation                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Stalking / unwanted tracking | Someone joins a trip to track a person, or a host keeps a trip open | Explicit per-trip consent, visible sharing indicator, auto-end, leave anytime, removal and block tools, trip expiry |
| Invite link leakage          | Link forwarded to strangers                                         | Random high-entropy codes, expiry, max uses, host approval mode, revoke, member cap                                 |
| Invite brute force           | Guessing codes                                                      | 128-bit codes, hashed at rest, rate limits, lockout                                                                 |
| Account takeover             | Stolen session                                                      | Short-lived access tokens, refresh rotation, device binding, re-auth for sensitive actions                          |
| Broken access control        | Reading another trip's positions by changing an ID                  | Server-side authorization on every request and socket event, RLS                                                    |
| Location spoofing            | Fake GPS to disrupt convoy view                                     | Plausibility checks (max speed, teleport detection), server timestamp, mark suspicious data                         |
| WebSocket abuse              | Flooding, subscribing to other trips                                | Auth at connect, per-connection rate limits, message size caps, topic authorization                                 |
| Voice eavesdropping          | Joining the audio room                                              | Per-user, per-room, short-lived LiveKit tokens issued only to members, encrypted transport                          |
| Data breach                  | Database dump                                                       | Encryption at rest, minimal retention, no raw invite codes, secrets management                                      |
| API key theft                | Maps key extracted from app                                         | Server-side use where possible; restricted client keys (see section 9)                                              |
| Harassing chat               | Abusive messages                                                    | Block, report, host remove, length limits, rate limits                                                              |
| Driver distraction           | UI demands attention                                                | Driving mode, disabled typing while moving, voice-first (see design.md)                                             |
| Supply chain                 | Malicious dependency                                                | Lockfiles, audit in CI, minimal dependencies, pinned versions                                                       |
| Insider access               | Staff browsing locations                                            | No admin UI for live location, audit logging, access reviews                                                        |

---

## 3. Authentication and sessions

- Sign-in with Google and phone OTP (use a managed provider; do not build password storage).
- Access token: JWT, **15 minutes**. Refresh token: opaque, rotating, stored hashed server-side, 30 days, revoked on reuse detection.
- Tokens stored in the platform secure store (Keychain / Keystore), never in plain storage or logs.
- WebSocket and LiveKit use **separate, single-purpose, short-lived tokens** (2-5 minutes) scoped to one trip and one member.
- Re-authentication required to delete the account or export data.
- Device list in settings with "sign out everywhere".

---

## 4. Authorization

Every request and every WebSocket event passes through the same checks:

1. Authenticated user exists and is not deleted or suspended.
2. User is an active member of the trip (`status IN ('joined','ready')`).
3. Action allowed for role (host-only: start, end, remove, change rules, revoke invites; and alert permissions when `alerts_host_only`).
4. Resource belongs to that trip (never trust `tripId` or `memberId` from the client body; derive from the token).

Rules:

- Deny by default.
- Use opaque UUIDs; do not rely on obscurity for security.
- Write authorization tests for every endpoint: unauthenticated, wrong user, wrong role, removed member, expired trip.
- Database RLS (see database.md) as a second layer.

---

## 5. Invite links and joining

- Code: 128 bits from a CSPRNG, URL-safe base64 (about 22 chars). Never sequential or derived from trip ID.
- Stored as SHA-256 hash only.
- Default expiry **24 hours**, max 7 days; default max uses = number of invitees host expects (cap 20).
- **Approval mode** (on by default for public sharing): host approves each join request, seeing the requester's name.
- Host can revoke a link or regenerate at any time; revoking does not remove existing members.
- Joining shows trip name, host name, destination, and member count before consent, so people do not join unknowingly.
- Rate limit: 10 failed code attempts per IP per 15 minutes, with exponential backoff; generic error message for invalid, expired, or revoked codes.
- Do not put PII in the URL.

---

## 6. Location privacy

**Consent**

- Dedicated consent screen on join: what is shared (live position, speed, vehicle name), who sees it (members of this trip only), when it stops (trip end or when you leave), and your controls.
- Consent timestamp stored per member per trip. No consent, no sharing.
- Separate, optional toggle for saving a breadcrumb history (off by default).

**Controls**

- Persistent in-app indicator and OS-level indicator (Android foreground notification, iOS background location indicator) while sharing.
- **Pause sharing** (members see "location paused", not a fake position) and **Leave trip** are one tap.
- Host cannot force a member's location to be shared and cannot see data of ended trips beyond summaries the member agreed to.
- Auto-stop: sharing ends when the trip ends, when the member arrives (optional), or after 12 hours of trip inactivity.
- Precision: exact position only during active trips. No sharing in lobby unless the member opts to preview their start.

**Data handling**

- No location in logs, analytics events, crash reports, or push notification payloads.
- Redis positions deleted at trip end; breadcrumbs only by opt-in and short retention.
- No selling or advertising use of location. State this plainly in the privacy policy.
- Third-party SDKs (analytics, crash) must not receive coordinates; scrub in `beforeSend`.

**Compliance considerations (verify with counsel)**

- India: Digital Personal Data Protection Act, 2023 (notice, consent, purpose limitation, deletion rights, grievance contact).
- If users in the EU: GDPR (lawful basis, DPIA for location data, data subject rights).
- Store and Play policies: accurate location permission rationale, background location justification, data safety form.
- Children: set a minimum age (for example 18, or parental consent where required) and enforce it at sign-up.

---

## 7. Transport and data protection

- TLS 1.2+ everywhere (prefer 1.3), HSTS on web endpoints, certificate pinning optional for the mobile API.
- WebSocket over `wss` only; origin checks for web clients.
- LiveKit: DTLS-SRTP media encryption (default WebRTC); enforce authenticated rooms; disable recording.
- Postgres: encryption at rest (managed provider), TLS to the database, least-privilege DB roles (the API role cannot drop tables; migrations use a separate role).
- Redis: private network only, auth enabled, TLS, no public exposure.
- Secrets in a secrets manager or platform env vars, never in the repo or app bundle. Rotate on any suspected exposure.
- Backups encrypted; restore tested quarterly.

---

## 8. Abuse prevention and rate limits

| Action                 | Limit                                   |
| ---------------------- | --------------------------------------- |
| Location updates       | 1 per second per member; reject faster  |
| Chat messages          | 10 per 10 seconds per member; 500 chars |
| Quick alerts           | 1 per 5 seconds per member              |
| Trip creation          | 10 per hour per user                    |
| Invite creation        | 20 per day per trip                     |
| Join attempts          | 10 failures per 15 min per IP           |
| WebSocket message size | 4 KB max                                |
| Connections            | 3 per user                              |

Plus:

- Location plausibility: reject updates implying speed over 250 km/h or teleport jumps; flag the member as "unverified position".
- Server timestamps are authoritative; client time only used for ordering hints.
- Profanity filtering optional; reporting and blocking mandatory (see database `blocks`, `reports`).
- Host powers: remove member (immediately drops socket and LiveKit access), end trip for all, lock joining.
- A removed or blocked user cannot rejoin the same trip.

---

## 9. API keys and third-party services

- **Google Maps Platform:** Restrict client keys by app (Android package + SHA-1, iOS bundle ID) and by API. Set quotas and billing alerts. Prefer calling Routes/Places from the server with an IP-restricted key.
- Never put server keys or LiveKit API secrets in the mobile app.
- Do not cache or store Google Maps content beyond what the Terms of Service allow; follow attribution requirements.
- Dependency policy: lockfile committed, automated vulnerability scanning in CI, review of new native modules, Renovate/Dependabot weekly.

---

## 10. Mobile app hardening

- Secure store for tokens; no sensitive data in AsyncStorage/MMKV unless encrypted.
- Disable screenshots on the consent and account screens only if needed; do not block map screenshots (users share them).
- Basic root/jailbreak detection as a signal only (do not hard-block).
- Minify and obfuscate release builds; strip debug logs.
- Validate deep link parameters; treat invite codes as untrusted input.
- Clipboard: do not auto-read; invite code pasted only on user action.
- App Transport Security and Android network security config set to block cleartext.

---

## 11. Logging, monitoring, incident response

- Structured logs with request IDs; **never** log coordinates, tokens, invite codes, or message bodies.
- Metrics and alerts: spike in failed joins, unusual trip creation, WebSocket auth failures, Redis memory, 5xx rates.
- Audit log for security-relevant actions (see database `audit_log`).
- Incident runbook: detect, contain (revoke tokens, rotate keys, disable endpoints), assess, notify affected users and regulators as required by law, post-mortem.
- Security contact: `security@` address and a simple disclosure policy page.

---

## 12. Safety features (non-technical security)

- SOS flow with confirmation window to avoid accidental triggers.
- "Stop sharing with everyone" panic option in the main menu, reachable in two taps.
- Clear indication of who is in the trip at all times; notification whenever someone joins.
- Warn the host before sharing a public link in a public channel ("Anyone with this link can request to join").
- Trip creator cannot see a member's location after that member leaves.

---

## 13. Secure development lifecycle

- Threat-model review for each new feature touching location, voice, or invites.
- Code review checklist: authz present, input validated (zod/schema), no sensitive logging, rate limit applied.
- Input validation on server for every payload; reject unknown fields.
- SAST and dependency scanning in CI; secret scanning on commits.
- Pre-launch penetration test or at minimum a structured self-test against OWASP API Security Top 10 and OWASP MASVS.

---

## 14. Pre-launch security checklist

- [ ] Every endpoint and socket event has authz tests (negative cases included)
- [ ] RLS enabled and tested with a non-service role
- [ ] Invite codes hashed, expiry and max uses enforced, brute-force limits verified
- [ ] Consent screen implemented; no location sent before consent
- [ ] Pause sharing, leave trip, remove member, block, report all working
- [ ] Location excluded from logs, analytics, crash reports, push payloads (verified by grep and test)
- [ ] Retention jobs running; account and trip deletion verified end to end
- [ ] Rate limits in place and load-tested
- [ ] Google Maps keys restricted; quotas and billing alerts set
- [ ] Secrets rotated and not present in repo history
- [ ] TLS configuration scanned; Redis and Postgres not publicly reachable
- [ ] Privacy policy, terms, data safety forms, and age gate reviewed
- [ ] Incident runbook written and rehearsed once
- [ ] Dependency and container scans clean of high-severity issues
