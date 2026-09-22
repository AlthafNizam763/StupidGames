# REST API

Specification for the `server/` HTTP layer. Base path `/api`. **Implemented in Phases 3–6, 21–23**; this document is the contract those phases build to.

Realtime gameplay does not go through REST — see [SOCKET_EVENTS.md](SOCKET_EVENTS.md). REST covers accounts, profiles, room lookup and historical data.

## Response envelope

Every endpoint, success or failure, returns the same shape, so the client has exactly one branch to write.

```json
{ "success": true,  "message": "Signed in.",  "code": null,        "data": { } }
{ "success": false, "message": "Room is full.", "code": "ROOM_FULL", "data": null }
```

Validation failures add field detail:

```json
{
  "success": false,
  "message": "Some of the values you sent are not valid.",
  "code": "VALIDATION_ERROR",
  "data": null,
  "errors": [{ "path": "settings.saboteurCount", "message": "At most 1 Saboteur for 4 players - Saboteurs must start outnumbered." }]
}
```

`code` is from `ErrorCode` in `shared/src/errors.ts`, and HTTP status comes from `ERROR_HTTP_STATUS` — a controller picks a code, never a status, so the two cannot drift apart. **Clients branch on `code`, never on `message`**; copy is free to change or be translated.

Production responses never include a stack trace.

## Authentication

`Authorization: Bearer <accessToken>`, with the access token short-lived (`JWT_EXPIRES_IN`, default 15m). The refresh token is issued as an httpOnly, `SameSite=Lax`, Secure-in-production cookie and is never readable by JavaScript.

`TOKEN_EXPIRED` means refresh and retry once. `TOKEN_INVALID` or `UNAUTHENTICATED` means sign in again.

## Endpoints

### Auth

| Method | Path | Body | Returns |
| ------ | ---- | ---- | ------- |
| `POST` | `/api/auth/register` | `RegisterInput` | `AuthSession` |
| `POST` | `/api/auth/login` | `LoginInput` | `AuthSession` |
| `POST` | `/api/auth/refresh` | *(cookie)* | `AuthTokens` |
| `POST` | `/api/auth/logout` | — | `null` |
| `GET`  | `/api/auth/me` | — | `SelfUser` |
| `POST` | `/api/auth/forgot-password` | `ForgotPasswordInput` | `null` |
| `POST` | `/api/auth/reset-password` | `ResetPasswordInput` | `null` |

`forgot-password` always returns success, whether or not the address is registered — a differing response is an account-enumeration oracle. With no SMTP host configured, development logs the reset link to the console.

### Users and profile

| Method | Path | Returns |
| ------ | ---- | ------- |
| `GET`  | `/api/users/me` | `SelfUser` |
| `PATCH`| `/api/users/me` | `SelfUser` — username and avatar only |
| `GET`  | `/api/profile/:userId` | `UserProfile` — no email, no private fields |

### Rooms

All room routes require a session.

| Method | Path | Body | Returns |
| ------ | ---- | ---- | ------- |
| `POST` | `/api/rooms` | `CreateRoomInput` | `RoomState` — caller becomes host |
| `POST` | `/api/rooms/join` | `{ code }` | `RoomSummary` — *may I join?*, not *I have joined* |
| `GET`  | `/api/rooms/code/:code` | — | `RoomSummary` |
| `GET`  | `/api/rooms/:id` | — | `RoomState` — members only |
| `PATCH` | `/api/rooms/:id` | `Partial<RoomSettings>` | `RoomState` — host only, lobby only |
| `DELETE` | `/api/rooms/:id` | — | `null` — host only |

REST room endpoints exist so the join screen can preview a room before opening a socket. Preview and join both return a `RoomSummary`, deliberately thinner than `RoomState`: someone who has not joined sees the host, the map, the mode and a player count, **never the roster**. A six-character code is a weak secret, and an endpoint that hands over a player list to anyone who guesses one is a way to find out who is playing with whom.

`POST /api/rooms/join` answers whether the caller *could* take a seat and returns what to show on the confirmation screen. It does not add them to the room. Membership is live state the server must be able to revoke when a connection drops, so a seat is taken over the socket — see [SOCKET_EVENTS.md](SOCKET_EVENTS.md).

A settings update re-validates the **merged** result, not just the changed field: lowering `maxPlayers` from 10 to 5 can make an already-stored `saboteurCount` of 3 illegal.

Rooms are held in memory, not MongoDB — see [DATABASE.md](DATABASE.md) for why, and what that costs.

### Leaderboard and matches

| Method | Path | Query | Returns |
| ------ | ---- | ----- | ------- |
| `GET` | `/api/leaderboard` | `scope=WORLD\|FRIENDS\|LOCALITY`, `page`, `limit` | `Paginated<LeaderboardEntry>` + viewer rank |
| `GET` | `/api/matches` | `page`, `limit` | `Paginated<MatchSummary>` — caller's own history |
| `GET` | `/api/matches/:id` | — | `MatchResult` — only if the caller played in it |

Pagination defaults come from `PAGINATION`: 25 per page, 100 maximum. `LOCALITY` is derived server-side from request metadata; a client-supplied location is ignored.

### Friends

| Method | Path | Returns |
| ------ | ---- | ------- |
| `GET` | `/api/friends` | `Friendship[]` |
| `POST` | `/api/friends/request` | `Friendship` |
| `POST` | `/api/friends/:id/accept` | `Friendship` |
| `DELETE` | `/api/friends/:id` | `null` |

### Health

`GET /health` — liveness for the platform. No auth, no envelope, no database round-trip.

## Layering

```
routes → controllers → services → repositories → MongoDB
```

Routes wire paths to middleware and a controller, and contain no logic. Controllers validate input with Zod, call a service and shape the envelope. Services hold the rules and are framework-free, so they unit-test without an HTTP server. Repositories are the only code that touches Mongoose models.

Business logic in a route handler is the one thing this layering exists to prevent.

## Rate limits

Per IP, from `HTTP_RATE_LIMITS`:

| Group | Limit |
| ----- | ----- |
| `/api/auth/*` | 10 requests / minute |
| everything else | 120 requests / minute |

Exceeding either returns `429` with `code: "RATE_LIMITED"`.
