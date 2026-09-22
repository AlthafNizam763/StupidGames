# Build phases

Progress against the 28-phase plan. A phase is only "done" when it type-checks, lints, passes its tests, and works on both a desktop and a mobile viewport without breaking an earlier phase.

| # | Phase | Status |
| - | ----- | ------ |
| 1 | Repository audit + architecture | **done** |
| 2 | Next.js frontend foundation | **done** |
| 3 | Node.js backend foundation | next |
| 4 | Authentication | |
| 5 | Home / Profile / Settings | |
| 6 | Room creation and joining | |
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

