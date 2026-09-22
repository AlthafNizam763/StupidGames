# Security

Threat model and controls. **Implemented across Phases 3–4 and 25**; this document is what those phases build to.

## Threat model

This is a competitive game with no money attached, so the realistic attacker is a player with devtools open and an interest in winning. They can read the entire client bundle, modify it, replay traffic and script their socket. Assume all of that.

The controls therefore fall into two questions:

1. **Can a modified client do something it should not?** Answered by server-side validation.
2. **Can a modified client learn something it should not?** Answered by never sending it.

The second is the one that gets skipped, and the one that matters most in a social-deduction game: an attacker who can see everyone's role does not need to break a single rule to ruin every match.

## Secrecy: not sent, not merely hidden

| Secret | How it is protected |
| ------ | ------------------- |
| Player roles | `PublicPlayerState` has no `role` field. Role travels only in `SelfPlayerState`, to one socket. |
| Killer identity | `EliminationEvent` carries the victim only. No broadcast anywhere names a killer. |
| Sabotage trigger | `SabotageState` has no actor field. |
| Dead chat | Enforced at fan-out. A living socket is never *sent* a `DEAD` message. |
| Anonymous votes | The server omits the `target` field until the tally. |
| Ejected role | `ejectedRole` is `null` unless `confirmEjection` is on. |
| Objective lists | `task:updated` carries the recipient's own tasks only. |
| Email addresses | Present in `SelfUser` only. `PublicUser`, `UserProfile` and `LeaderboardEntry` have no such field. |

The test for each is the same: **if the client received it and chose not to render it, it is not protected.** These are omissions at the point of serialisation.

## Anti-cheat

| Attack | Control |
| ------ | ------- |
| Speed hack | Server integrates movement itself; anything above `PLAYER_BASE_SPEED × MOVEMENT_SPEED_TOLERANCE` is rejected |
| Teleport | Clients send direction, never position — there is no coordinate to forge. Deltas above `MAX_POSITION_DELTA` are rejected outright |
| Wall clipping | Collision resolved server-side against the map geometry; client collision is prediction only |
| Fake elimination | Seven server checks: alive, role, target validity, range, cooldown, phase, no meeting |
| Fake objective | The server generates each puzzle and holds the solution. It checks assignment, range, liveness, step order, the solution itself and plausible elapsed time |
| Fake vote | Identity from `SocketData`, never the payload. Eligibility, duplicate votes and the deadline are all checked. The tally is computed server-side |
| Role forgery | The client is never asked for its role; the server holds it |
| Forced win | Win conditions are computed only by `WinConditionManager`, from server state |
| XP manipulation | XP is awarded at match end by the server. No endpoint or event accepts an XP value |
| Host-action spoofing | Every host action re-checks `socket.data.userId === room.hostId` |
| Event spam | `SOCKET_EVENT_RATE_LIMIT`, `ACTION_RATE_LIMIT`, `CHAT_RATE_LIMIT` per socket |
| Replay | Movement carries a monotonic sequence; anything at or below `lastInputSequence` is dropped |

The general rule: **a client message names an intent, never a result.** "I want to eliminate that player", not "that player is dead".

## Authentication

- Passwords hashed with **argon2id**. `passwordHash` is `select: false`, so it cannot leak by forgetting a projection.
- Access tokens are short-lived JWTs (15m) sent as `Authorization: Bearer`.
- Refresh tokens are httpOnly, `SameSite=Lax`, Secure in production — never readable from JavaScript, so an XSS bug cannot lift a long-lived credential.
- Sockets authenticate at handshake. An unverified socket is disconnected before any handler runs.
- `JWT_SECRET` and `JWT_REFRESH_SECRET` are distinct. A token minted for one purpose is not valid for the other.
- Password reset stores only a SHA-256 of the emailed token, with a 1-hour TTL and single use. `forgot-password` responds identically whether or not the address exists, so it cannot be used to enumerate accounts.

## Transport and HTTP

- `helmet` for security headers; a Content-Security-Policy that does not need `unsafe-eval`.
- CORS restricted to `CORS_ORIGINS`. Never `*` with credentials enabled.
- A request carrying a `$`-prefixed or dotted key is rejected outright, so it cannot become a query operator. (`express-mongo-sanitize` is not used: it is unmaintained and writes to `req.query`, a read-only getter in Express 5.)
- Body size limits on every route.
- Rate limiting per IP: 10/min on auth, 120/min elsewhere.
- HTTPS everywhere in production, including the WebSocket origin.

## Input validation

Every REST body is parsed with **Zod** at the controller boundary; every socket payload is validated in its handler before reaching a manager. Nothing downstream re-checks a type, because nothing downstream ever sees an unvalidated value.

Room settings are the one validator shared with the client (`validateRoomSettings`) — for identical inline errors, not for trust. The server re-runs it on the raw input every time, including on a mid-lobby settings edit.

## Secrets

- Real values live in `.env`, which is gitignored. `.env.example` documents every variable and contains no credentials.
- No production URL, key or connection string is ever hard-coded.
- Only `NEXT_PUBLIC_*` variables reach the browser bundle. Putting a secret behind that prefix publishes it.
- Generate signing secrets with real entropy:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

## Errors

Production responses carry a code and a human sentence, never a stack trace and never an internal path. Full detail is logged server-side with a correlation id, which is what a support request should be quoting.

## Randomness

Role assignment uses `crypto.randomInt` for a Fisher–Yates shuffle. `Math.random` is not cryptographically secure and is unacceptable for deciding roles — in a game whose entire premise is hidden information, a predictable shuffle is a total break.

Room codes use the same source, over an alphabet that excludes `0/O` and `1/I/L`.

## Reporting a vulnerability

Open a private security advisory rather than a public issue. Include reproduction steps and what a player could gain; a proof-of-concept against a local instance is more useful than against a live match.

## Known limitations

Recorded deliberately, so nothing here reads as stronger than it is.

**Refresh tokens are not revocable.** A refresh issues a new token but the previous one stays valid until it expires, because these are stateless JWTs. Genuine rotation — with reuse detection, where presenting an already-spent refresh token invalidates the whole family — needs a server-side token store. That store is not built yet. In the meantime, a stolen refresh token is valid for up to its full lifetime unless the account is disabled, which *is* checked on every refresh.

**Access tokens are not revocable either.** Signing out clears the refresh cookie and drops the in-memory access token, but an access token already captured stays valid for the remainder of its 15 minutes. A blacklist would close this, at the cost of shared state on every request for a 15-minute window on a token the user has already stopped using.

**Rate limits are per instance.** `express-rate-limit` keeps its counters in process memory, so running two instances doubles the effective limit. Moving the store to Redis is part of the same work as the Socket.IO adapter (DEPLOYMENT.md).
