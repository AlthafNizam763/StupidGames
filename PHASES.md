# Build phases

Progress against the 28-phase plan. A phase is only "done" when it type-checks, lints, passes its tests, and works on both a desktop and a mobile viewport without breaking an earlier phase.

| # | Phase | Status |
| - | ----- | ------ |
| 1 | Repository audit + architecture | **done** |
| 2 | Next.js frontend foundation | **done** |
| 3 | Node.js backend foundation | **done** |
| 4 | Authentication | **done** |
| 5 | Home / Profile / Settings | **done** |
| 6 | Room creation and joining | **done** |
| 7 | Lobby | **done** |
| 8 | Socket.IO architecture | **done** |
| 9 | Canvas game engine | **done** |
| 10 | Map + collision | **done** |
| 11 | Player movement | **done** |
| 12 | Role system | **done** |
| 13 | Objectives | **done** |
| 14 | Sabotage | **done** |
| 15 | Elimination | **done** |
| 16 | Body reporting | **done** |
| 17 | Council | **done** |
| 18 | Voting | **done** |
| 19 | Win conditions | **done** |
| 20 | Reconnection | **done** |
| 21 | Results + XP | **done** |
| 22 | Leaderboard | **done** |
| 23 | Friends / social | **done** |
| 24 | Voice chat | **done** |
| 25 | Anti-cheat / security hardening | **done** |
| 26 | Testing | **done** |
| 27 | Performance optimization | next |
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

## Phase 6 — what was built

Rooms: creating them, finding them, previewing them.

**Server**
- `RoomManager`: the in-memory room registry, with cryptographically random codes over the unambiguous alphabet, a code index for lookup, phase transitions checked against the shared state machine, and an idle reaper.
- `roomService`: create, preview, join check, lobby state, settings update, close — each with its own authorisation and phase rules.
- `POST /api/rooms`, `POST /api/rooms/join`, `GET /api/rooms/code/:code`, `GET /api/rooms/:id`, `PATCH /api/rooms/:id`, `DELETE /api/rooms/:id`.

**Client**
- Create room screen covering every option in §11, with live validation from the shared validator.
- Join room screen with the two-step look-up-then-confirm flow and a distinct message for each failure state in §12.
- A lobby page showing the real room, explicitly labelled as not yet live.
- A `Stepper` control for discrete settings.

**Verification**: 31 new server tests (97 total) and a 39-check end-to-end pass over real HTTP.

## Decisions made in Phase 6

**`POST /api/rooms/join` is a check, not a commitment.** It answers "may I join this?" and returns the preview. Taking the seat happens over the socket, because membership is live state the server has to be able to revoke when the connection drops — a REST call cannot tell the room when the player goes away. This is the design SOCKET_EVENTS.md committed to in Phase 1, and Phase 8 completes it.

**A preview never includes the roster.** Six characters is a weak secret and codes are enumerable in bulk. Anyone who guesses one learns that a room exists, its host and its occupancy — not who is sitting in it.

**The host starts as `DISCONNECTED`.** Creating a room over REST does not open a socket. Marking them connected before their socket exists would show a phantom player and make the idle reaper think the room is occupied.

**Settings updates re-validate the merged result.** Lowering `maxPlayers` from 10 to 5 can make an already-stored `saboteurCount` of 3 illegal; validating only the changed field would miss it. There is a test for exactly that.

**The occupancy check runs before settings validation.** Shrinking a 10-player room to 4 breaks both the occupancy rule and saboteur parity. Both errors are true, but "at most 1 Saboteur for 4 players" is not what to tell a host whose real problem is that six people are already sitting there.

**One room per host, with a caveat.** Creating a second room closes the first when it is empty — an abandoned lobby from a closed tab should not linger. When other players are still in it, the request is refused instead, because closing it would eject them without warning.

**Rooms are reaped when idle.** Without a sweep, every abandoned lobby stays in memory until the process restarts. Rooms with nobody connected are closed after the teardown delay; a room with any connected member is never touched.

## Phase 7 — what was built

The live lobby, and the socket layer underneath it.

**A note on phase order.** §52 lists Lobby (7) before Socket.IO (8), but a lobby without sockets is a screen that cannot update, and Phase 6 deliberately made membership socket-only rather than building REST membership that would need unpicking. So the realtime foundation was built here. Phase 8 extends it to gameplay events, reconnection of *match* state, and the Redis adapter — it does not start from nothing.

**Server**
- Socket.IO on the `/game` namespace, typed end to end against the shared contract in both directions.
- Handshake authentication: the JWT is verified before any handler exists, and identity lands on `socket.data`.
- A `handle()` wrapper turning every handler into one that cannot crash the connection — an `AppError` becomes a failed acknowledgement, anything else a logged `INTERNAL_ERROR`.
- Per-socket rate limiting on the shared budgets.
- `lobbyService`: join, leave, ready, kick, close, host transfer, connection state and grace expiry — framework-free and unit-tested without opening a socket.
- Seat retention across a dropped connection, released on a timer when the player does not return.
- `RoomManager` membership operations, including host transfer to the longest-seated connected player.
- Graceful shutdown now closes sockets before HTTP.

**Client**
- A single typed socket for the application, with `emitWithAck` turning acknowledgements into promises that resolve, reject or time out.
- Automatic silent refresh-and-reconnect when the handshake fails on an expired token.
- `roomStore` holding exactly what the server last broadcast.
- The full lobby screen: code with copy, live roster with avatars, ready and connection state, host controls, and a start button whose disabled state mirrors the server's preconditions.

**Verification**: 28 new server tests (125 total) and a 49-check end-to-end pass driving six concurrent real Socket.IO clients through a shared lobby.

## Decisions made in Phase 7

**Nothing is applied optimistically.** Tapping Ready asks the server and waits for the next `room:state`. A lobby is shared, and a client that renders its own guess shows one player something the others cannot see.

**A dropped connection is a pause, not an ejection.** The seat is held for the grace period and the player shows as `RECONNECTING` to everyone. Rejoining is the same code path as joining — the difference between "arriving" and "coming back" is whether a seat already exists, which is not something the client gets to assert.

**A host who drops keeps the room; a host who leaves hands it on.** Transferring on a brief disconnect would take the room away from someone whose train went through a tunnel. There are tests for both.

**One identity, one seat.** Joining a room drops the player from any other. Two tabs must not put the same person in two rooms and hand a match a player who is not there.

**A disconnect only counts when the player's last socket goes.** Another tab may still be connected; releasing the seat because one of them closed would eject someone who is still playing.

**`room:start` validates everything and then says what is missing.** Every precondition — host, phase, connected count, readiness — is real and enforced, and the host sees the blocking reason next to a disabled button rather than discovering it by pressing. With all checks passed, the server reports that the match engine is not built rather than moving the room into a phase nothing can advance, which would strand everyone on a "starting" screen. Phase 12 replaces one line; nothing above it changes.

## Phase 9 — what was built

The Canvas game engine (§8, §41), and the mobile controls that drive it (§7).

*Phase 8's remainder — gameplay socket events and the Redis adapter — is still outstanding and was skipped over. Phase 9 is purely client-side rendering, so it did not block.*

**Engine** (`web/game/`)
- `GameLoop`: fixed-timestep simulation with variable-rate rendering, an accumulator capped against death spirals, and an interpolation alpha for the renderer.
- `Engine`: owns the world, loop, input and renderer. The boundary React does not cross.
- `InputManager`: keyboard and joystick normalised into one snapshot, reused each frame.
- `Renderer`: DPR-aware canvas sizing, camera transform, culled floor/obstacle/entity passes, and an Operator sprite matching the avatar silhouette.
- `Camera`: damped follow, framerate-independent, clamped to the world and scaled from the smaller viewport axis.
- `collision/resolve`: circle-against-rectangle with shortest-axis ejection, so sliding along a wall falls out naturally.
- `MovementSystem`: the integration the server will mirror in Phase 11.

**React bridge**
- `GameCanvas` holds the engine in a *ref*, not state. The only per-second setState is the stats readout.
- `VirtualJoystick`: floating origin, dead zone, pointer capture, `touch-action: none`, and honouring the player's control-position and sensitivity settings.

**Verification**: 41 new client-side tests (166 total across both workspaces) — the first tests in the web workspace.

## Decisions made in Phase 9

**Fixed timestep, not per-frame delta.** Integrating against a variable frame time means a 30fps phone takes steps twice as large, which lets a player tunnel through a wall and makes the same input produce different movement on different hardware. Every step is identical; there is a test asserting that across deliberately irregular frames.

**The accumulator is capped at five steps.** After a long stall the honest catch-up could be hundreds of steps, and running them would freeze the page far longer than the stall did. Time is dropped instead — the server is authoritative and its next snapshot corrects anything that matters.

**React never sees a position.** The engine lives in a ref and mutates plain objects in place. A `setState` per frame would spend more time diffing a tree than drawing the game, which on a mid-range phone is the difference between playable and not.

**The camera scales from the smaller viewport axis.** Scaling from width would let a wide monitor see players a phone cannot — not a cosmetic difference in a game about who saw whom.

**Device pixel ratio is capped at 2.** Beyond that the pixel count grows quadratically for a difference almost nobody can see, on exactly the devices that can least afford it.

**Diagonal movement is normalised.** Holding W and D otherwise gives a vector of length 1.41 and a player who moves 41% faster diagonally — and the server's speed check would reject it as a hack.

**The joystick has a floating origin.** It appears where the thumb lands rather than at a fixed point, so nobody has to find it by feel while playing.

## Phase 8 — what was built

The remainder of the socket architecture, completing what Phase 7 started.

**Payload validation at the socket boundary.** SOCKET_EVENTS.md said every socket payload was validated before reaching a manager. That was true of REST and *not* of sockets, where handlers took whatever arrived. Every room event now parses through a Zod schema first. This matters more here than over REST: a socket payload passes through neither the body parser nor the MongoDB-operator guard, so `{ code: { $ne: null } }` arrived intact. The settings schema is `.strict()` rather than stripping — a host sending an unknown key is on a modified or mismatched client, and silently ignoring it would leave them believing a setting applied.

**Redis adapter and room directory.** DEPLOYMENT.md names three things scale-out needs; two of them are code and are now built. The Socket.IO Redis adapter republishes every broadcast so instances reach each other's sockets, and a Redis-backed room directory records which instance owns which room, with a TTL and a heartbeat so a crashed process stops advertising rooms it no longer has. Both are optional: with no `REDIS_URL` the server runs exactly as before, single-instance with in-memory rooms. The third piece, sticky sessions, is platform configuration.

**`SequenceGuard`.** Monotonic input-sequence checking, built with the rest of the socket layer rather than bolted onto the movement handler in Phase 11. Rejects replays and reordered packets, and resets on reconnect — without which a returning player's restarted counter would look like a replay and they could not move.

**Shutdown notification.** Connected players are told the instance is going away before sockets close. Previously a deploy simply dropped every connection and the client found its room gone with nothing to explain why.

**Verification**: 36 new server tests (161 total). Plus two end-to-end passes — 10 forged payloads rejected over a real socket, and a 6-check adapter test proving a broadcast on one Socket.IO server reaches a client on another, *with a control case* showing it does not without the adapter.

## Decisions made in Phase 8

**The directory is an interface with two implementations.** The alternative is `if (redis)` scattered through the socket layer. The in-memory version answers "this instance" for everything it knows about, so calling code never learns which backend it got.

**A directory failure never fails the operation it accompanies.** If Redis rejects a claim, the room is still created and still works on this instance — it is only unfindable from another. Taking down room creation because a cache is unavailable would turn a degradation into an outage.

**`RoomManager` does not know the cluster layer exists.** It publishes room lifecycle through an observer that the bootstrap wires to the directory, which keeps the import graph acyclic and the room registry focused on room state.

**Redis needs three connections.** A client in subscriber mode cannot issue ordinary commands, so the adapter's publisher and subscriber cannot be reused for directory reads and writes.

**The sequence guard rejects equality, not just regression.** A client never legitimately sends the same sequence twice, so a duplicate is a retransmission or a replay — and applying it twice is the bug either way.

## Phase 10 — what was built

ORBITAL-09, and the collision to go with it (§14).

**Server owns the geometry.** The map is authored server-side and shipped as data over `GET /api/maps/:mapId`, per the Phase 1 decision. Moving a wall is a data change the client picks up on its next load, not a protocol change requiring both sides to redeploy together — and the server stays the only authority on where a wall is, which is what will let both sides resolve collision to the same answer in Phase 11.

- `geometry.ts`: walls are *derived* from a room's interior plus its doorways rather than typed out. ORBITAL-09 is ten room rectangles a person can check; the 69 wall segments are generated from them.
- `orbital09.ts`: the ten rooms, 15 spawns, 9 objective terminals, 6 repair stations.
- `zoneAt`: which room a point is in. Corridors are the space *between* rooms — nothing declares a corridor.

**Client**
- `SpatialGrid`: a uniform-grid broadphase. 69 walls × 15 players × 60Hz is ~62,000 checks a second to discover most walls are across the station; the grid cuts each query to two or three candidates.
- Renderer draws room floors, walls, terminals, repair stations and room labels at fixed pixel size.
- Map loads *after* the loop starts, so a slow connection sees an empty hull rather than a black screen.
- Current room shown in the HUD, polled twice a second rather than pushed — the engine still never calls `setState`.

**Verification**: 38 new tests (187 server, 51 web).

## Decisions made in Phase 10

**Walls are generated, not authored.** Hand-typing ~120 wall rectangles means every one has four numbers that must agree with its neighbours, and moving a room by 20 units means editing a dozen of them correctly. Describing the layout once, in terms a person can verify, and letting arithmetic do the arithmetic is the difference between a map that can be adjusted and one nobody dares touch.

**Every room has at least two doors.** A dead end turns every encounter into a certainty — "I watched them go in and nobody came out" should be a claim that can be wrong. There is a test asserting both the minimum *and* the exact authored count.

**The two critical repair stations are far apart.** A reactor breach needs both worked, so the crew must split up — and splitting up is what makes a sabotage dangerous beyond its timer. Tested at >800 units apart.

**Everyone spawns in the corridor, not in rooms.** A match that begins with two players already alone together in Cargo Bay has handed the Saboteur a free elimination before anyone has moved.

**A broadphase is an optimisation, not a rule.** It changes which pairs get tested, never the outcome. That is why the server may use a different one — or none — without the two sides disagreeing about where a player ends up. Anything that *decided* collision could not be duplicated this way.

## Two test bugs found and fixed this phase

Both are worth recording, because both were tests that passed while proving nothing.

**The doorway counter was vacuously passing.** It reported 22 openings for a two-door room: probes from different sides were interleaved, so the open/closed flag flip-flopped between unrelated walls and every alternation counted as a doorway. `>= 2` passed regardless. Fixed by walking each side separately, asserting the *exact* authored count, and adding a self-check that the counter can tell a sealed wall from an open one.

**The spatial grid's cell key was not injective.** `row * columns + column` makes `key(-1, row)` collide with `key(columns-1, row-1)`, so a query just off the left edge could return walls from the right edge of the row above. It produced false positives rather than misses, so collision stayed correct — but the test that was supposed to catch it passed by luck on the values chosen. Indices are now clamped into range, with a test for the specific aliasing case.

## Phases 11–23 — what was built

The game itself. Server mechanism and client transport; screens belong to the UI session under the agreed split.

**Managers, one rule surface each**: `RoleManager`, `MovementManager`, `TaskManager`, `SabotageManager`, `KillManager`, `MeetingManager`, `WinConditionManager`. All framework-free — no Socket.IO, no Mongoose — so every rule is testable without standing up a server. `MatchManager` runs one interval per match and owns the phase machine.

**`serialise.ts` is the secrecy boundary.** Every rule about what a player may not learn is enforced by building a payload that does not contain it. `PublicPlayerState` has no role, no task list, no cooldowns; `zone` is omitted entirely during a comms blackout rather than sent with a flag.

**Persistence**: `Match` documents written once at match end, with XP, stats and achievements computed from server state. No endpoint or event accepts an XP value.

**Verification**: 275 server tests, plus a 39-check end-to-end pass in which four real socket clients play a complete match — roles dealt, authority refusals, movement, emergency council, chat, voting, ejection, win condition, XP, history and leaderboard.

## Decisions made in Phases 11–23

**Clients send direction, servers integrate it.** The anti-cheat for movement is structural, not detective: a payload with no coordinate in it cannot carry a forged one. Verified end to end — a client sending a direction vector of length 500 travels no further than one sending length 1.

**Nothing names the killer.** Not the outcome, not the body, not any broadcast. Working out who did it is the entire game. There is a test that serialises the elimination result and asserts the killer's id does not appear in it.

**A Saboteur is refused an objective with the same error an Operator gets for someone else's task.** A distinct error would be a second confirmation of their own role. The same reasoning refuses eliminating a fellow Saboteur with the generic `TARGET_INVALID` — a specific error would let them probe who their allies are.

**Dead chat is enforced at fan-out.** The recipient list is computed server-side; a living socket is never *sent* a dead-channel message, so no client bug or patched bundle can reveal one.

**Anonymous votes omit the target; unconfirmed ejections omit the role.** Absent from the payload, not present and hidden.

**An expired critical sabotage beats a completed objective bar.** They can land on the same tick, and the station was already lost when the countdown hit zero.

**Puzzle honesty.** SELECT puzzles hold their answer server-side and cannot be forged. ALIGN puzzles necessarily show their target — the challenge is doing it, not knowing it — so they get a minimum plausible solve time instead, measured against the server's own issue time. The shared puzzle docs say exactly this rather than implying more.

## Three bugs found by tests this phase

**Win conditions treated `RECONNECTING` as absent.** A player whose connection dropped handed the other side a `TEAM_ABANDONED` win — losing a match because someone's train went through a tunnel. Only `DISCONNECTED`, set when the grace period expires, now means gone.

**The voting result was stored after the event that broadcasts it.** `resolveVoting` called `onMeetingResolved` and *then* recorded the tally, so the broadcast found nothing and clients could only infer the outcome from the next snapshot. Caught by the socket end-to-end run, not by the unit tests — the unit tests called `tallyVotes` directly and never exercised the ordering.

**Two of my own test bugs, both worth noting** because both looked like product failures: a movement assertion that read positions out of `game:state` (which is event-driven) instead of `game:delta` (which carries motion), and a wall test that placed the player inside a doorway and then asserted they could not walk through it.

## Phase 24 — voice chat

**The permission derivation is the whole security surface**, and it is a pure function of server state: match phase and whether the player is alive. A client asks for a token and is told which channel it is for; the channel is not an input, so there is nothing to forge.

The rule, stated once: living players hear living players, dead players hear dead players, and the two sets never intersect during a live match. There is a test that asserts this exhaustively — every phase against every alive/dead pairing — rather than case by case, because a rule checked case by case can be broken by a phase added later.

**LiveKit is implemented for real.** Its access token is an HS256 JWT with a documented claim set, so tokens are minted and their grants asserted without needing a LiveKit server. Agora, Daily and native WebRTC report themselves unavailable and name the provider asked for, rather than shipping something that looks like support and fails at the first call.

## Decisions made in Phase 24

**There is no Saboteur voice channel.** A private channel for one team is the easiest possible way to leak a role — a player visibly talking when nobody else hears anything has told the room what they are.

**Everyone is silent during the role reveal.** A player reacting out loud to their own role, at the exact moment everyone is looking at their screen, is a tell — and it is the one moment the game can prevent it.

**Dead is checked before any phase.** Ordering it that way means a phase added later cannot accidentally grant a dead player a living channel, because they never reach the switch.

**No data channel on the voice token.** A second, unvalidated channel between clients would route around every rule the server enforces.

**A player with no channel gets no token, not a muted one.** A token for a room is permission to hear that room.

## Phase 25 — security hardening

Two real gaps closed, both introduced by earlier decisions that were right in themselves.

**Movement escaped the rate limiter.** `player:move` is deliberately outside the acknowledged-handler wrapper — an ack per input at 15Hz costs more than the input is worth — and as a result it also escaped the limiter. A client could send ten thousand a second; the server would clamp each one's *effect* and still pay to parse all of them. `AbuseTracker` gives movement its own budget at triple the documented rate, so a client that stalls and catches up is never punished for bad wifi.

**Refresh tokens survived a password change.** SECURITY.md admitted this. Every refresh token now carries the account's `tokenVersion`, and a password reset bumps it — so every session opened with the old password dies at once. That is the case that matters: you reset *because* the password was stolen. Per-token revocation with reuse detection still needs a server-side token store and is still absent; the docs say which is which.

**Sustained rejection now disconnects.** A rejected action in ones and twos is normal play. Forty in ten seconds is a script probing for an unguarded action, and nothing was counting.

**A real Content Security Policy** on the web app, with `connect-src` scoped to the configured API and socket origins and `'unsafe-eval'` absent.

## The CSP bug, and why it matters

The first version of the CSP shipped **without its `connect-src` directive** — a shell heredoc ate the template literal and left a bare comma in the array, which `.filter(Boolean)` then silently dropped. With `connect-src` absent, `default-src 'self'` governs connections: every call to the API and the entire Socket.IO upgrade would have been blocked by the browser.

Type-check, lint and all 358 tests stayed green throughout. Nothing in this repository could have caught it, because it is a header on a response that no test reads. It was found by two people looking at a running server with `curl` — independently, within minutes of each other.

The lesson is narrow and worth keeping: `.filter(Boolean)` on a configuration array converts a missing entry into a silent omission. The verification for anything that only exists at the HTTP boundary is a request, not a test.

## Phase 26 — testing

392 tests: 309 on the server, 83 on the web client. Everything runs from `npm test` at the root, with no build step and no browser.

### What §48 asked for, and where it lives

| §48 requirement | Where |
| --------------- | ----- |
| Role assignment is random and correct | `server/src/game/match/match.test.ts` — distribution over many draws, and `secureShuffle` |
| Kill validation | `match.test.ts` — all seven refusal paths |
| Task verification | `match.test.ts` — server-generated answers, step order, replay |
| Voting tally and ejection | `match.test.ts`, plus the full path in `match.e2e.test.ts` |
| Win conditions | `match.test.ts` — each reason, including a fully disconnected side |
| Secret state never leaks | `serialise.test.ts` by payload shape; both e2e suites assert no role string appears in any public payload |
| Dead players cannot talk to the living | `match.test.ts` — `recipientsFor` |
| Reconnection keeps a seat and a role | `reconnect.e2e.test.ts` |
| A full match, end to end | `match.e2e.test.ts` — four clients, lobby to persisted result |
| Client prediction and reconciliation | `web/game/systems/NetworkSync.test.ts` |
| Collision | `web/game/collision/*.test.ts` |

### The end-to-end suites

`server/src/test/e2e/` starts a real MongoDB, a real Express app and a real Socket.IO server in-process, then drives them with real socket clients. They exist because the unit tests demonstrably could not catch a whole class of bug in this project. Three that shipped green:

- the voting result was stored *after* the event that broadcasts it, so every client received an empty tally
- the CSP went out without `connect-src`, which would have blocked the client from reaching its own server
- movement bypassed the rate limiter, because it deliberately bypasses the handler wrapper the limiter lives in

Each is a seam between two components that are individually correct. Unit tests check components.

### What the new tests found

**The match was never told about disconnections.** The socket disconnect handler updated the *room's* membership and left the *match's* player records untouched. `MatchManager.setConnection` already did the right thing — zero the velocity, re-check the outcome — and was never called by anything. Three consequences, none of which raised an error:

- a player who dropped mid-stride kept their velocity, so the simulation walked them into the nearest wall for the length of the grace period while everyone else watched an apparently healthy player stroll off
- the authoritative snapshot reported them as `CONNECTED`, contradicting the `player:disconnect` sent on the same tick
- the win condition was never re-evaluated, so a side that entirely disconnected left the match running with nobody able to win it

**`game:state` was never sent on a state change outside a phase transition.** `onSnapshot` was declared in `MatchEvents` and wired up in `matchWiring`, and nothing in `game/` ever called it. A connection change now pushes one; connection churn is rare, so this costs nothing on the tick.

### The CSP now has a test

The `connect-src` bug above was previously described here as something no test could catch. That was true of a header assembled inline in `next.config.ts`. It is now built by `buildCsp` in `web/lib/securityHeaders.ts`, a pure function with a test per failure mode: the client can reach its own API and socket, an unconfigured voice origin is omitted rather than emitted as an empty source, and `'unsafe-eval'` is absent in production.

The narrower lesson still holds: `.filter(Boolean)` on a configuration array turns a missing entry into a silent omission.

### Two test bugs worth recording

Both looked exactly like product failures, and neither was.

The first: `game:start` carries `{ snapshot, self }` where `self` is a `GameSelfState`, which itself wraps `{ self, tasks }` — so a player's own role is at `payload.self.self.role`. Reading `payload.self.role` returns `undefined`, and `Array.join` renders that as an empty string, so the failure reported "roles were ,,," rather than pointing at the path. The nesting is now documented at the type.

The second: `MatchPlayer` keys on `userId`, not `id`. Tests written against `player.id` passed `undefined` into `setConnection`, which found no player and returned quietly — three assertions failed at once and looked like the fix not working.

Both share a shape: an undefined property read through an API that has no reason to complain. The defence is asserting on the value you expect rather than on "something happened".

### Type-checking is not optional for tests

Four of the new web tests passed while referring to enum members that do not exist — `ZoneId.HUB`, `TaskType.CALIBRATE`, `Facing.DOWN`. They resolved to `undefined`, no assertion depended on them, and the suite was green. `tsc` caught all of them. A test file is source.
