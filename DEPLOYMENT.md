# Deployment

Target topology, the constraints that shape it, and what has actually been run.

Everything under **Server** below was executed against the built artefact. The
container image was not: there is no Docker daemon in the environment this was
built in, so `server/Dockerfile` is reviewed but unbuilt. What that means in
practice is in [Verification](#verification) at the end - it is stated rather
than glossed, because this project has repeatedly been caught by documentation
asserting something nobody ran.

## Topology

```
Browser ──► Vercel (web/, Next.js)
   │
   ├── REST  ──► Render / Railway / Fly.io  (server/, Node + Express)
   └── WS    ──► same instance
                       │
                       ├──► MongoDB Atlas
                       └──► Redis  (only when >1 instance)
```

The web client is static-ish and edge-friendly, so Vercel suits it. The game server is **stateful and long-lived** — it holds live rooms in memory and keeps WebSockets open for the length of a match — so it must run somewhere that supports persistent connections. It cannot run on a serverless platform, and that includes Vercel functions.

## Environment variables

Full list with explanations in [.env.example](.env.example).

**web** (Vercel): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`. Both are compiled into the browser bundle — never put a secret behind `NEXT_PUBLIC_`.

**server**: `NODE_ENV`, `PORT`, `CORS_ORIGINS`, `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, optionally `REDIS_URL`, `VOICE_*`, `SMTP_*`.

`CORS_ORIGINS` must list the deployed web origin exactly. Getting this wrong is the single most common cause of "it works locally but the socket will not connect in production".

## Server

Build and run:

```bash
npm ci
npm run build -w @voidline/shared
npm run build -w @voidline/server
node server/dist/index.js
```

The entry point is `index.js`, not `app.js`. This document said `app.js` until
somebody ran it: `app.ts` exports `createApp` and never listens, so the
documented command started a process that bound no port and exited. It had been
wrong since the file was written, because nothing reads a deployment document
except a person doing a deployment.

Or with Docker, from the repository root:

```bash
docker build -f server/Dockerfile -t voidline-server .
docker compose up --build   # server + mongo, and redis under --profile cluster
```

Health check: `GET /health`. No auth, no envelope, and no database round-trip,
so it answers while the database is still connecting - which is deliberate: a
liveness probe that fails on a slow database restart would have the platform
kill a server that was about to recover.

Platform settings that matter:

- **WebSocket support on.** Off, and Socket.IO silently degrades to polling — playable, but with latency that ruins a movement-based game.
- **Sticky sessions on**, if the platform load-balances at all. Socket.IO's handshake spans multiple requests; without stickiness it fails intermittently and confusingly.
- **Generous idle timeout.** A connection is held for a whole match.
- **Graceful shutdown.** Implemented in `server/src/index.ts`: on `SIGTERM` the sockets are closed after telling connected clients, this instance's rooms are released from the directory, then HTTP and the database, with a 10s hard timeout so a stuck connection cannot hold the process open. Killing a process mid-match loses that match — see [DATABASE.md](DATABASE.md) on why live state is in memory.
- **The container must run node as PID 1.** `server/Dockerfile` uses the exec-form `CMD` for this. A shell-form `CMD` puts `/bin/sh` at PID 1, and it does not forward signals: the graceful shutdown above would never run, and every deploy would sit out the full termination grace period before being killed.

## Web

Vercel, root directory `web/`. The monorepo builds `shared` first, so the install command must run at the repository root.

```
Install:  npm ci
Build:    npm run build --workspace=@voidline/web
Output:   web/.next
```

## Database

MongoDB Atlas. Restrict network access to the server platform's egress addresses rather than `0.0.0.0/0`. Use a dedicated application user with read/write on the one database only.

Indexes (listed in [DATABASE.md](DATABASE.md)) are applied as a deploy step, not by Mongoose `autoIndex` — autoIndex on a live collection rebuilds indexes during a deploy, at exactly the moment you least want the extra load.

## Scaling past one instance

One instance is enough for development and a single-region launch. Adding a second one changes something important: **a room lives in the memory of one specific instance**, so a player whose socket lands elsewhere cannot see it.

Handling that needs three things:

1. `REDIS_URL` set, enabling the Socket.IO Redis adapter for cross-instance fan-out. The realtime layer is written against the adapter interface from day one, so this is configuration, not a rewrite.
2. Sticky sessions, so a reconnecting player returns to the instance holding their room.
3. A shared room directory in Redis, mapping room code → instance, so joins route correctly.

Until all three are in place, run exactly one server instance. Two instances without them produce rooms that some players cannot join, which looks like a bug long before anyone suspects the topology.

## Voice

Voice is behind a provider abstraction (`VOICE_PROVIDER`: `none` | `livekit` | `agora` | `daily` | `webrtc`). With `none`, voice UI is hidden and the game is fully playable — voice is an enhancement, never a dependency.

A provider needs credentials (`VOICE_API_KEY`, `VOICE_API_SECRET`, `VOICE_SERVER_URL`), and tokens are minted **server-side** with permissions derived from game state, so channel membership follows the same secrecy rules as text chat.

## Troubleshooting

| Symptom | Likely cause |
| ------- | ------------ |
| Socket connects then immediately drops | `CORS_ORIGINS` missing the web origin, or an invalid/expired JWT at handshake |
| Socket works locally, not in production | WebSocket support disabled, or no sticky sessions behind the load balancer |
| Movement stutters in production but not locally | Transport fell back to polling — check WebSocket support |
| Players cannot find a room that exists | More than one instance without the Redis adapter and room directory |
| `MONGODB_URI` connects locally, not in production | Atlas network access list missing the platform's egress IPs |
| Rooms vanish after a deploy | Expected: live rooms are in memory. Deploy between matches, or drain on `SIGTERM` |
| 401 on every request after ~15 minutes | Access token expired and the client is not refreshing — check the refresh cookie's `SameSite`/`Secure` flags across origins |

## Verification

What was actually run, and what was not. The distinction matters more here than
elsewhere in these documents: a deployment guide is executed once, by somebody
who cannot tell a tested instruction from a plausible one.

**Run, and passing:**

- `npm ci && npm run build` for `shared` then `server`, from clean.
- `node server/dist/index.js` against a real MongoDB, with a production
  `NODE_ENV`. It binds, connects, opens the socket namespace and answers
  `GET /health` with `200`. This is what found the `app.js` error above.
- `npm ci --omit=dev --workspace=@voidline/server --include-workspace-root`,
  the install line the image depends on: 162 packages, with the client's
  dependency tree correctly absent and `@voidline/shared` symlinked into
  `node_modules`. That symlink is why the runtime stage copies `shared/dist`
  and the workspace layout rather than only `server/dist`.
- `next build` for the client: succeeds, 13 routes, no `/design` route present.

**Not run:**

- **`docker build`.** There is no Docker daemon available here, so the image is
  written and reviewed but has never been built. Treat the first build as part
  of deployment rather than as a formality. The install step inside it is the
  part most likely to be wrong, and that is the one part verified separately
  above.
- **`SIGTERM` handling, end to end.** The handler is wired and the shutdown
  sequence is implemented, but Windows does not deliver POSIX signals, so the
  path could only be read rather than exercised. Worth confirming on the first
  deploy: send a `SIGTERM` and check for `shutting down` followed by
  `http server closed` in the logs before the process exits.
- **A real platform deploy.** No account was configured, so nothing here has
  met a real load balancer, a real Atlas network rule, or a real TLS
  termination point.

**Known cost:** the server image installs only its own workspace's production
dependencies, but the build stage installs everything, including the client's.
That is discarded with the stage and affects build time rather than image size.
