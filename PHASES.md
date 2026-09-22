# Build phases

Progress against the 28-phase plan. A phase is only "done" when it type-checks, lints, passes its tests, and works on both a desktop and a mobile viewport without breaking an earlier phase.

| # | Phase | Status |
| - | ----- | ------ |
| 1 | Repository audit + architecture | **done** |
| 2 | Next.js frontend foundation | **done** |
| 3 | Node.js backend foundation | **done** |
| 4 | Authentication | **done** |
| 5 | Home / Profile / Settings | **done** |
| 6 | Room creation and joining | next |
| 7 | Lobby | |
| 8 | Socket.IO architecture | |
| 9 | Canvas game engine | |
| 10 | Map + collision | |
| 11 | Player movement | |
| 12 | Role system | |
| 13 | Objectives | |
| 14 | Sabotage | |
| 15 | Elimination | |
| 16 | Body reporting | |
| 17 | Council | |
| 18 | Voting | |
| 19 | Win conditions | |
| 20 | Reconnection | |
| 21 | Results + XP | |
| 22 | Leaderboard | |
| 23 | Friends / social | |
| 24 | Voice chat | |
| 25 | Anti-cheat / security hardening | |
| 26 | Testing | |
| 27 | Performance optimization | |
| 28 | Production deployment | |

## Phase 1 — what was built

The repository was empty, so there was nothing to reuse and nothing to preserve.

- Git repository initialised.
- npm workspaces monorepo: `shared/`, `server/`, `web/`, with cross-platform scripts (the project is developed on Windows and deployed on Linux, so no script may depend on a POSIX-only shell).
- Strict shared TypeScript configuration, including `noUncheckedIndexedAccess`.
- **`@voidline/shared`** — the whole client/server contract, compiling clean: 20 client events, 26 server events, every payload type, the phase state machine and its legal transitions, error codes with HTTP statuses and default copy, world tuning constants, network rates and abuse limits, and the shared room-settings validator.
- `.env.example` documenting every variable, with no credentials.
- Architecture, protocol, socket, API, database, security and deployment documentation.

`server/` and `web/` contain a workspace manifest only. They are filled in by Phases 2 and 3.

## Decisions made in Phase 1 that later phases inherit

**The server is authoritative.** The browser sends intentions, never outcomes. Every later phase adds validation on the server side of that line before it adds the UI on the client side.

**Secrecy is enforced by payload shape.** `PublicPlayerState` has no `role` field, `EliminationEvent` has no killer, `SabotageState` has no actor. Adding one of those fields, however convenient, breaks the game — these omissions are load-bearing, not oversights.

**Clients send direction, not position.** This removes forged-coordinate cheating by construction rather than by detection, and it is why `MovementInput` carries a vector and a sequence number.

**React is not the game loop.** Canvas rendering runs on `requestAnimationFrame` against mutable state outside React. Phase 9 builds this properly; nothing before it should introduce a per-frame `setState`.

**`shared/` holds no game logic.** Rules that decide outcomes live on the server. The single exception is settings validation, which is safe only because the server re-runs it on raw input regardless of what the client did.

**Live room state stays in memory; only completed matches are persisted.** A match is latency-sensitive and short-lived. The accepted cost is that a server crash loses in-flight matches, and that scaling past one instance requires the Redis adapter, sticky sessions and a shared room directory — all three, or not at all.
## Phase 2 — what was built

The Next.js client foundation. No screen beyond the splash, and no fake data anywhere.

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind 4, consuming `@voidline/shared`.
- **Design system** in `app/globals.css`: VOIDLINE tokens as Tailwind 4 `@theme` variables — void surfaces, one primary accent (`signal`), one danger accent (`alert`) reserved for the Saboteur faction and destructive actions. Display/UI/mono type scale, rounded radii, a single soft elevation.
- **Mobile-first shell**: `dvh` viewport utilities, safe-area padding, a 44px touch-target utility, root-level `overflow-x: hidden`, reduced-motion handling, and a `viewport-locked` utility for the game surface.
- **UI primitives** in `components/ui/`: Button + ButtonLink (shared style builder), Input, Card, Badge + StatusDot, Spinner, and the loading / empty / error / skeleton states from §45.
- **Brand**: original VOIDLINE mark (orbital ring cut by a line) as a component and as the favicon.
- **API client** (`services/http.ts`): unwraps the shared response envelope, raises a typed `ApiError` carrying an `ErrorCode`, times out hung requests, and refreshes an expired token exactly once.
- **State**: Zustand UI store for toasts, with an imperative helper for non-React callers.
- **Screens**: splash (`/`) with a real server health probe, plus route-level `loading`, `error`, `not-found` and `global-error`.
- ESLint flat config + Prettier.

## Decisions made in Phase 2

**Zoom is not disabled.** Locking `maximum-scale` is the usual reflex for a game, but it breaks WCAG 1.4.4 for anyone who magnifies text. Accidental zoom is prevented only where it matters — on the game surface, via `touch-action: none` — rather than by removing magnification from the whole app.

**Server Components by default.** The splash ships as HTML with one Client Component island (`UplinkGate`). Marking a page `"use client"` to get one interactive control is a bug, not a shortcut.

**Inputs are 16px minimum.** Below that, mobile Safari zooms the page on focus and the player has to pinch back out.

**Every button clears 44px in height.** `sm` is small in padding and type, never in tap area.

**Badges and states never use colour alone.** Each carries a glyph or a label, so status survives a colour vision deficiency.

**The splash tells the truth about the server.** PLAY unlocks only once `/health` actually answers; otherwise the screen says the uplink is down and offers a retry. There is no point routing a player into a sign-in flow that cannot complete, and a disabled button beats a dead link.

**ESLint is pinned to 9.x.** ESLint 10 crashes `eslint-plugin-react`, which `eslint-config-next@16` depends on. A working linter on the version Next supports beats a newer one that cannot run.


## Phase 3 — what was built

The authoritative server's foundation. No game logic and no authentication yet — those are Phases 4 onward.

- Express 5 + TypeScript on Node, with `tsx` for development and a separate build tsconfig so tests are type-checked without being compiled into `dist`.
- **Config** (`config/env.ts`): the environment is parsed with Zod at startup and the process refuses to boot on bad configuration. It validates only what the server actually reads today; later phases extend the schema as they add variables.
- **Error handling**: one `AppError` type that takes its HTTP status from the shared contract, and one error handler that is the single exit point for every failure. Anything that is not an `AppError` is treated as a bug — logged in full, reported as a bare `INTERNAL_ERROR`. No stack trace reaches a response in any environment; the correlation id does.
- **Response envelope** (`lib/respond.ts`): every endpoint returns the shape in API.md, from one place.
- **Middleware**: correlation id, structured request logging, Helmet, CORS against the configured allowlist, body limits, a MongoDB-operator guard, Zod validation helpers, and per-IP rate limiting using the shared budgets.
- **Database** (`db/connect.ts`): Mongoose connection with background retry and exponential backoff.
- **Model + repository**: the `User` schema from DATABASE.md and a `UserRepository` with explicit projections — one concrete vertical slice proving the layering, ready for Phase 4 to build auth on top.
- **Health**: `/health` (liveness, touches no database) and `/health/ready` (readiness, reflects the real connection state).
- 21 unit tests covering the error mapping, the envelope and the injection guard.

## Decisions made in Phase 3

**Liveness and readiness are different endpoints.** A database blip should keep traffic away from an instance, not restart it. The server therefore stays up when Mongo is unreachable, retries in the background, and reports `/health/ready` as 503 until it connects. Conflating the two is how a short outage becomes a crash loop.

**The injection guard rejects rather than strips.** `express-mongo-sanitize` is unmaintained and writes to `req.query`, which is a read-only getter in Express 5, so it throws on this stack. The replacement refuses any payload containing a `$`-prefixed or dotted key: a request carrying `{"email": {"$ne": null}}` is not a typo, and silently rewriting it into something that works hides an attack that belongs in the logs. It is defence in depth — Zod schemas at each endpoint are the primary control.

**No `asyncHandler` wrapper.** Express 5 forwards rejected promises from async handlers to the error handler natively. Wrapping every route in a helper would be Express 4 muscle memory.

**Helmet's resource policy is set to `cross-origin`.** The client is served from a different origin, and Helmet's `same-origin` default makes the browser discard every response before CORS is ever consulted.

**`trust proxy` is 1, not `true`.** The deploy targets sit behind exactly one proxy. Trusting every hop would let a client forge `X-Forwarded-For` and escape rate limiting entirely.

**Mongoose 9 pre-save hooks have no `next` callback.** The signature is `(this, opts) => void | Promise<void>`; the callback form was removed.

## Phase 4 — what was built

Real accounts, end to end.

**Server**
- argon2id password hashing at OWASP's baseline cost, via `@node-rs/argon2` (prebuilt binaries, so no C toolchain on Windows).
- Short-lived JWT access tokens plus a long-lived refresh token delivered as an httpOnly cookie, signed with separate secrets.
- `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` and `GET /api/auth/me`.
- `PasswordReset` model storing only the SHA-256 of the emailed token, single use, one-hour TTL.
- `requireAuth` middleware putting the caller on `req.auth`; a `userId` in a request body is never read.
- A mail abstraction: SMTP when `SMTP_HOST` is set, otherwise a transport that logs the message and says plainly that nothing was sent.

**Client**
- Session store holding the access token in memory only, with restoration on load from the refresh cookie.
- Sign-in, sign-up, forgot-password and reset-password screens, with server field errors mapped onto the inputs.
- Route guards, and a minimal real `/home` showing the server-issued account so sign-in is not a dead end. The full home screen is Phase 5.

**Verification**: 46 unit and integration tests against a real `mongod` (via `mongodb-memory-server`), plus a 34-check end-to-end pass driving the built server over HTTP.

## Decisions made in Phase 4

**The access token is never persisted.** Not `localStorage`, not a readable cookie. Anything on disk is readable by any script that runs on the page and outlives the tab. The cost is that a page refresh loses it, which is exactly what the refresh cookie is for.

**Sign-in failures are indistinguishable, including in timing.** A missing account runs a real argon2 verification against a dummy hash before failing. Returning early would answer measurably faster and turn the endpoint into a way to enumerate registered addresses. The dummy has to be a genuine hash — a malformed one fails argon2's parser immediately and leaves the timing difference intact.

**`forgot-password` always reports success.** Anything else is an enumeration oracle, so the client's confirmation screen is worded to match.

**Usernames are unique case-insensitively and restricted to `[A-Za-z0-9_-]`.** In a game about working out who is lying, being able to register a name that renders identically to another player's is not a cosmetic problem.

**The account is re-read on every refresh.** A player disabled ten minutes ago must not keep minting access tokens for the next thirty days on the strength of a cookie issued before the ban.

**Missing JWT secrets are fatal in production and random in development.** A hard-coded development default is the value that eventually ships; 48 random bytes plus a loud warning is not, and the only cost is that a restart ends dev sessions.

**Route guards are convenience, not security.** Everything they protect is enforced server-side. A guard running in the browser can be deleted by anyone who opens devtools.

## Phase 5 — what was built

The three account screens (§10, §33, §37), plus the avatar system.

**Shared**
- Avatar roster: eight preset ids with suit colours, chosen to stay distinguishable from one another and under common colour vision deficiencies. The Canvas renderer will use the same colours in Phase 9.
- Achievement *presentation* — names, descriptions, locked hints. The criteria are not here.

**Server**
- `GET /api/users/me`, `PATCH /api/users/me` (username and avatar only), `GET /api/profile/:userId`.
- `achievementService`: unlock criteria held server-side, evaluated against counters the server writes itself, with partial-progress reporting for the counted achievements.
- A private `achievementProgress` subdocument on `User`, `select: false`, kept out of the published profile shape.

**Client**
- Original SVG Operator-suit avatars in eight colours, drawn inline so one silhouette serves every size from a 24px lobby row to a 96px profile header.
- Full home screen: player card, XP bar, PLAY as the primary CTA, and the six secondary destinations.
- Profile screen with the full record, achievement grid, and inline editing of username and avatar.
- Settings screen covering audio, gameplay, controls and language, on a persisted device-local store.
- i18n scaffolding: locale catalogue, flat dotted keys, `t()` with interpolation, English as the typed source of truth.

**Verification**: 20 new server tests (66 total) and a 29-check end-to-end pass over real HTTP.

## Decisions made in Phase 5

**Avatars are preset ids, never URLs or uploads.** A client-supplied avatar URL is a way to make every other player's browser fetch something the attacker controls. The server validates the id against the shared roster, and there is a test that an avatar of `https://evil.example/x.gif` is refused.

**`PATCH /api/users/me` reads two fields and ignores everything else.** It does not merge the request body into the document. A test sends `xp: 999999, level: 99, stats: {...}, disabled: true` alongside a legitimate avatar change and asserts the avatar changed while nothing else did — which is the difference between an update endpoint and a way to award yourself anything.

**A disabled account's profile reads as "not found", not "disabled".** Otherwise the profile page becomes a way for anyone to confirm a ban.

**Achievement counters are separate from public stats.** `stats` is published on every profile; adding a counter there to satisfy a new achievement would widen the public contract and tell other players about matches they were not in.

**Settings are device-local, not synced.** Joystick sensitivity and control position describe the device, not the account. Someone playing on a phone and a desktop wants different values, and syncing would fight that.

**Home shows unbuilt destinations as disabled tiles marked "Soon".** §10 specifies the full set of destinations, and a tile that navigates to a 404 is worse than one that says it is not ready yet. PLAY stays visually dominant as the primary CTA but is disabled until rooms exist.

**i18n is scaffolding, and says so.** The locale preference and the lookup are real and exercised end to end by the settings screen. The rest of the app still holds English literals — extracting them is a mechanical pass, and doing it half-way would leave a codebase where some text translates and some does not.
