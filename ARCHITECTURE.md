# Architecture

How VOIDLINE is put together, and why. Written for engineers working in this repository.

## Shape

```
┌──────────────────────────────┐        ┌───────────────────────────────────┐
│  web/  (Next.js, browser)    │        │  server/  (Node, authoritative)   │
│                              │        │                                   │
│  App Router UI ── React      │  REST  │  Express ── routes → controllers  │
│  HUD, lobby, chat, voting    │◄──────►│           → services → repos      │
│                              │        │                                   │
│  Canvas renderer ── rAF      │ Socket │  Socket.IO ── GameManager,        │
│  map, players, movement      │◄──────►│   RoomManager, MovementManager,   │
│                              │        │   TaskManager, KillManager,       │
│  Zustand stores              │        │   MeetingManager, VotingManager   │
└──────────────┬───────────────┘        └──────────────┬────────────────────┘
               │                                       │
               └──────────► shared/ ◄──────────────────┘
                      types · events · enums
                      error codes · bounds
                                                       │
                                        MongoDB ◄──────┴──────► Redis (scale-out)
```

Both sides compile against `shared/`. A protocol change that breaks a client therefore fails `npm run type-check`, rather than failing in a live match.

## The authority boundary

The single most important line in the system runs between the browser and the server.

The browser owns **presentation and intent**: what to draw, what the player is pressing, what they are asking to do. The server owns **truth**: who has which role, where everyone actually is, who is alive, which objectives are genuinely complete, what the votes were, who won.

Concretely, every one of these is computed server-side and broadcast outward, never accepted from a client:

role assignment · position · collision · elimination · objective completion · cooldowns · sabotage state · meeting and vote results · win conditions · XP · host permissions

Two things follow from this that shape day-to-day code:

1. **A client message is a request, not a fact.** `player:eliminate` means *"I would like to eliminate this player"*. The server checks the actor is alive, is a Saboteur, is in range, is off cooldown, that the phase allows it and that no meeting is running — and only then changes anything.
2. **What a client is not entitled to know is never sent to it.** Not sent-and-hidden — not sent. See "Secrecy" below.

## Workspaces

### `shared/` — the contract

Dependency-free TypeScript compiled to CommonJS plus declarations. It contains:

- `constants/` — roles, phases and their legal transitions, settings bounds and defaults, world tuning (speed, ranges), XP table, network rates and abuse limits, map and zone identity
- `types/` — every payload shape: user, room, player, task, sabotage, meeting, game snapshot, match result
- `events/` — socket event names and the typed `ClientToServerEvents` / `ServerToClientEvents` maps
- `errors.ts` — every error code, its HTTP status and its default copy
- `validation/` — the room-settings validator, run by both sides

It deliberately holds **no game logic**. Rules that decide outcomes live on the server. Anything placed here can be read by anyone who opens devtools, and more importantly, duplicated logic drifts — and a rule that drifts between client and server is a desync.

The one shared *computation* is settings validation, which is safe precisely because the server re-runs it on the raw input regardless of what the client did.

### `server/` — authority *(Phase 3)*

Layered so business logic never sits in a route handler:

```
routes → controllers → services → repositories → MongoDB
```

- **routes** — path, method, middleware wiring. No logic.
- **controllers** — parse and validate input (Zod), call a service, shape the response envelope.
- **services** — the actual rules. Framework-free, so they are directly unit-testable.
- **repositories** — the only code that touches Mongoose models.

The realtime layer sits beside the REST layer and shares the service layer:

```
sockets/  → handlers, auth middleware, rate limiting
game/     → GameManager, RoomManager, RoleManager, MovementManager,
            TaskManager, KillManager, SabotageManager, MeetingManager,
            VotingManager, WinConditionManager
```

Each `game/` manager owns one concern and one validation surface, so "where is elimination validated?" has exactly one answer.

### `web/` — presentation *(Phase 2)*

Next.js App Router. Server Components by default; Client Components where interactivity genuinely requires them — game canvas, lobby, chat, voting, HUD, settings. Marking everything `"use client"` is a bug, not a shortcut.

## Rendering: React and Canvas do different jobs

React renders **UI**: menus, lobby, HUD, chat, voting, modals. Canvas renders the **world**: map, players, movement, animation.

They are not allowed to share a clock.

The game loop runs on `requestAnimationFrame` against a plain mutable world object, outside React. It never calls `setState` per frame. Rendering hundreds of moving entities as DOM nodes, or driving a 60 Hz loop through React state, would make the game stutter on exactly the mobile devices it most needs to run on.

React learns about the world only at UI cadence — a task completes, a body is found, a phase changes — through the store, not through the frame loop.

```
input (keyboard / joystick) → intent → socket
                            ↓
socket snapshots → world state (mutable, outside React)
                            ↓
       rAF: simulate → interpolate → collide → draw to Canvas
                            ↓
       occasional store updates → React re-renders the HUD
```

## Movement and reconciliation

Clients send **direction**, not position, at `MOVEMENT_INPUT_HZ` (15/s) — each input carrying a monotonic sequence number. The server integrates that direction against the map's collision geometry at `SERVER_TICK_HZ` (20/s) and broadcasts state at `STATE_BROADCAST_HZ` (10/s), with clients interpolating between snapshots.

Sending intent rather than coordinates removes a whole class of cheating by construction: there is no coordinate in the payload to forge. A speed hack becomes a client sending inputs too fast, which the rate limiter catches, and the sequence number makes replayed packets detectable.

The client predicts its own movement locally at full framerate. The server sends a `player:correction` only when prediction has drifted past tolerance, so a well-behaved client on a decent connection rarely receives one.

## Secrecy

Role secrecy is enforced by **payload shape**, not by client-side filtering.

- `PublicPlayerState` — broadcast to everyone — has no `role` field at all. The omission is load-bearing: add one, and every Operator instantly knows every role.
- `SelfPlayerState` — role, assigned objectives, cooldowns, fellow Saboteurs — goes to one socket only.
- `EliminationEvent` names the victim. The killer's identity appears in no broadcast, because deducing it is the entire game.
- `SabotageState` never names who triggered it.
- Dead chat is enforced at fan-out. A living socket is never *sent* a dead-channel message, so no client bug or patched bundle can reveal one.
- Anonymous voting omits the `target` field server-side rather than sending it for the client to hide.

## Scaling

One process is enough for development and for a single-region launch. Socket.IO is written against its adapter interface from the start, so horizontal scale-out is a matter of enabling the Redis adapter (`REDIS_URL`) rather than restructuring the realtime layer.

Room state is held in memory by design — a match is short-lived, chatty and latency-sensitive, and round-tripping it to a database per tick would be the wrong trade. Only durable records are persisted: users, completed matches, friendships. The consequence is that with more than one instance, a room lives on a specific instance and connections for that room must land there; Redis handles the cross-instance fan-out.

## Conventions

- Strict TypeScript everywhere, including `noUncheckedIndexedAccess`. Not relaxed per-workspace.
- Enum-like values are const objects, not TS `enum`s — they transpile cleanly under `isolatedModules` in both the bundler and Node.
- Every error the client can encounter has a code in `shared/src/errors.ts`. Clients branch on the code, never on the message, so copy can change or be translated freely.
- Timestamps crossing the wire are epoch milliseconds. Deadlines are sent as an `endsAt` for the client to count down from locally — one message instead of one per second, and the countdown survives a network hiccup.
