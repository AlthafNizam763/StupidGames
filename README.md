# VOIDLINE

A web-only, real-time multiplayer social-deduction game set aboard **ORBITAL-09**, an isolated orbital facility.

A crew of specialists keeps the station alive. Most are **Operators**: they complete station objectives and try to work out who among them is lying. The rest are **Saboteurs**: they eliminate Operators quietly and drive the facility toward critical failure. Nobody is told who is who.

Everything runs in the browser — desktop, laptop, tablet and mobile all load the same application. There is no native app and no Flutter code in this repository.

> **Status: PHASE 3 of 28 complete.** The monorepo, the protocol contract, the Next.js client foundation and the Express server foundation all exist and build. Authentication (Phase 4) is next, so there are no API endpoints beyond health yet. `PHASES.md` tracks what is done and what is next.

## Requirements

- Node.js **>= 20** (developed on 24.15)
- npm **>= 10** (workspaces)
- MongoDB — local, or an Atlas connection string (needed from Phase 3)
- Redis — optional, only needed to run more than one server instance

## Getting started

```bash
npm install          # installs every workspace
cp .env.example .env # then fill in the values
npm run build        # compiles the shared protocol package
```

`npm run dev` starts the client on http://localhost:3000 and the server on http://localhost:4000 together. MongoDB is optional for now: the server serves without it and reports itself as not-ready until it connects.

## Workspaces

| Path      | Package             | What it is |
| --------- | ------------------- | ---------- |
| `shared/` | `@voidline/shared`  | The client/server contract: event names, payload types, enums, error codes, tuning constants, settings validation. Dependency-free and free of game logic. |
| `server/` | `@voidline/server`  | The authoritative game server: Express REST API, MongoDB persistence, and the Socket.IO realtime layer *(realtime arrives in Phase 8)*. |
| `web/`    | `@voidline/web`     | The Next.js client: App Router UI plus a Canvas game renderer *(Canvas arrives in Phase 9)*. |

## Scripts

Run from the repository root.

| Command              | What it does |
| -------------------- | ------------ |
| `npm run dev`        | Starts the server and the web client together |
| `npm run build`      | Builds `shared` first, then every workspace that has a build |
| `npm run type-check` | Type-checks every workspace |
| `npm run lint`       | Lints every workspace |
| `npm test`           | Runs every workspace's tests |
| `npm run clean`      | Removes build output |

All scripts are cross-platform; the project is developed on Windows and deployed on Linux, so no script may depend on a POSIX-only shell.

## The one rule that shapes everything

**The server is authoritative. The browser sends intentions, never outcomes.**

The client may say *"I am pressing left"*, *"I want to eliminate that player"*, *"here is my solution to this objective"*. It may never say *"I am at these coordinates"*, *"that player is now dead"*, *"this objective is complete"* or *"award me this XP"*. Role, position, elimination, objective completion, cooldowns, votes, win conditions, XP and room permissions are all decided on the server and broadcast outward.

This is not only anti-cheat. It is what keeps every player's screen showing the same match.

## Documentation

| Document | Covers |
| -------- | ------ |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System shape, workspace boundaries, rendering strategy, why the decisions are what they are |
| [GAME_PROTOCOL.md](GAME_PROTOCOL.md) | Game rules, the phase state machine, roles, objectives, sabotage, councils, win conditions |
| [SOCKET_EVENTS.md](SOCKET_EVENTS.md) | Every realtime event, its payload, its validation and who receives it |
| [API.md](API.md) | REST endpoints, the response envelope, error codes |
| [DATABASE.md](DATABASE.md) | MongoDB collections, indexes, what is persisted and what is not |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Environments, hosting, scaling to more than one instance |
| [SECURITY.md](SECURITY.md) | Threat model, anti-cheat, secret handling, what is deliberately never sent to a client |
| [PHASES.md](PHASES.md) | The 28-phase build plan and current progress |

## Original work

VOIDLINE is an original game. Its story, faction names, map, objectives, characters, interface, audio and visual identity are authored for this project. No assets, terminology or visual identity from any existing game are used.
