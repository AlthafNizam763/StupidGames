# Database

MongoDB via Mongoose. **Implemented in Phase 3**; this document is the schema contract.

## What is persisted, and what is not

Persisted: accounts, completed matches, friendships. These are durable and queried across sessions.

**Not persisted: live room and match state.** A match is short-lived, chatty and latency-sensitive; writing world state to a database on every tick would add latency to the one thing that must not have it. Rooms live in server memory and are written to Mongo exactly once, as a `Match` document, when the match ends.

The consequence is deliberate and worth knowing: if the server process dies mid-match, that match is lost. A room is recoverable state worth rebuilding on reconnect, not a record worth storing. Accounts and history — the things players would actually mourn — are never in memory alone.

## Collections

### `users`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `_id` | ObjectId | |
| `username` | string | unique, case-insensitive, 3–16 chars |
| `email` | string | unique, lowercased, **never returned to another player** |
| `passwordHash` | string | argon2id. Excluded from queries by default (`select: false`) |
| `avatar` | string | preset id, validated against the server's list |
| `level` | number | derived from `xp`, stored for sorting |
| `xp` | number | server-written only |
| `stats` | subdocument | `matchesPlayed`, `matchesWon`, `matchesLost`, `operatorWins`, `saboteurWins`, `eliminations`, `objectivesCompleted` |
| `achievements` | array | `{ id, unlockedAt }` |
| `disabled` | boolean | soft ban |
| `createdAt` / `updatedAt` | Date | timestamps |

Indexes: `{ username: 1 }` unique (collation strength 2), `{ email: 1 }` unique, `{ xp: -1, _id: 1 }` for the leaderboard.

`winRate` is computed on read, not stored — a stored derived value is one more thing that can go stale.

### `matches`

Written once, at match end.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `_id` | ObjectId | |
| `roomCode` | string | the ephemeral code, for support lookups |
| `map` / `gameMode` | string | |
| `settings` | subdocument | the `RoomSettings` actually used |
| `players` | array | `{ userId, username, role, survived, objectivesCompleted, eliminations, xpEarned }` |
| `winner` | string | `OPERATORS` \| `SABOTEURS` |
| `reason` | string | a `WinReason` |
| `duration` | number | seconds |
| `startedAt` / `endedAt` | Date | |

Indexes: `{ 'players.userId': 1, endedAt: -1 }` for match history, `{ endedAt: -1 }` for recency.

Roles are stored — a finished match has no secrets left.

### `friendships`

One document per relationship, not two, with the pair stored in a canonical order so a duplicate request cannot create a second row.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `requesterId` / `addresseeId` | ObjectId | ref `users` |
| `status` | string | `PENDING` \| `ACCEPTED` \| `BLOCKED` |
| `createdAt` / `updatedAt` | Date | |

Index: `{ requesterId: 1, addresseeId: 1 }` unique, plus `{ addresseeId: 1, status: 1 }` for incoming requests.

### `passwordResets`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `userId` | ObjectId | ref `users` |
| `tokenHash` | string | SHA-256 of the emailed token; the token itself is never stored |
| `expiresAt` | Date | TTL index, 1 hour |
| `usedAt` | Date \| null | single use |

Index: `{ expiresAt: 1 }` with `expireAfterSeconds: 0`, so expired rows delete themselves.

## Rules

- **The client never writes a derived field.** XP, level, stats and achievements are written by the server at match end, inside the same service that computed them.
- **Repositories are the only code that imports a Mongoose model.** Services take and return plain objects, which is what makes them testable without a database.
- **Every query that takes user input is parameterised through Mongoose and passed through `express-mongo-sanitize`**, so a `$`-prefixed key in a request body cannot become a query operator.
- **Projections are explicit on anything user-facing.** `passwordHash` and `email` are opt-in, never opt-out — a default-deny projection fails safe when a new field is added.

## Local development

```bash
# Docker
docker run -d --name voidline-mongo -p 27017:27017 mongo:7

# then in .env
MONGODB_URI=mongodb://127.0.0.1:27017/voidline
```

Indexes are declared in the schemas and created on boot in development. In production they are applied as a migration step rather than by autoIndex, which would otherwise rebuild indexes on a live collection at deploy time.
