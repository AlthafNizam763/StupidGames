# Socket events

Every realtime message, its payload, what the server checks and who receives the result.

Names are defined once in `shared/src/events/names.ts`; the typed maps are in `shared/src/events/socket.ts`. Both sides bind `Socket<ClientToServerEvents, ServerToClientEvents>`, so an unknown event or a wrong payload is a compile error.

Namespace: `/game`. Protocol version: `PROTOCOL_VERSION` (currently `1`).

## Connection

The JWT is supplied at handshake, not as an event:

```ts
io(process.env.NEXT_PUBLIC_SOCKET_URL, {
  path: '/socket.io',
  auth: { token: accessToken },   // SOCKET_AUTH_TOKEN_KEY
});
```

Server middleware verifies the token and populates `SocketData` — `userId`, `username`, `roomId`, `roomCode`, `lastInputSequence`. **Every handler reads identity from `SocketData`, never from the payload.** A payload that contains a `userId` is ignoring this rule and is a bug.

An unverified socket is disconnected before any handler runs.

## Acknowledgements

Everything that changes authoritative state takes an ack, so the client learns whether its intent was accepted rather than inferring it from a later broadcast:

```ts
type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };
```

The sole exception is `player:move`, which fires 15 times a second — an ack per input would cost more than it is worth. Rejected movement is corrected with `player:correction` instead.

Clients apply `ACK_TIMEOUT_MS` (8s) and treat a timeout as a failure, not as a success.

## Client → server

| Event | Payload | Ack | Server checks |
| ----- | ------- | --- | ------------- |
| `room:create` | `CreateRoomInput` | `RoomState` | `validateRoomSettings` on the raw input; caller not already in a room |
| `room:join` | `{ code }` | `RoomState` | Code matches `ROOM_CODE_PATTERN`; room exists, open, not full, not in progress; caller not banned from it |
| `room:leave` | — | — | Caller is in a room. Host leaving transfers host to the longest-seated player |
| `room:ready` | `{ ready }` | — | Phase is `LOBBY` |
| `room:settings` | `Partial<RoomSettings>` | `RoomState` | Caller is host; phase is `LOBBY`; merged settings re-validated in full |
| `room:kick` | `{ userId }` | — | Caller is host; target is in the room; target is not the host |
| `room:close` | — | — | Caller is host |
| `room:start` | — | — | Caller is host; phase is `LOBBY`; players ≥ `MIN_PLAYERS_TO_START`; all non-host players ready; settings still valid for the current player count |
| `player:move` | `MovementInput` | *(none)* | Sequence is newer than `lastInputSequence`; direction normalised; `deltaMs` clamped; resulting position collision- and speed-checked |
| `player:eliminate` | `{ targetId }` | — | The seven checks in GAME_PROTOCOL.md § Elimination |
| `task:start` | `{ taskId }` | `TaskAssignment` | Task assigned to caller; caller alive; in range of its terminal; phase allows it |
| `task:progress` | `TaskSubmission` | `TaskAssignment` | As above, plus the step is the expected next one |
| `task:complete` | `TaskSubmission` | `TaskCompletedEvent` | As above, plus the solution matches the server's, and elapsed time is plausible |
| `sabotage:start` | `{ type }` | `SabotageState` | Caller is a Saboteur, alive; phase is `PLAYING`; no sabotage active; team cooldown elapsed |
| `sabotage:repair` | `{ stationId }` | `SabotageState \| null` | Caller alive, in range of that station; a sabotage is active; station belongs to it |
| `body:report` | `{ bodyId }` | — | Caller alive; body exists, unreported; within `REPORT_RANGE`; no meeting active |
| `council:emergency` | — | — | Caller alive; phase is `PLAYING`; `emergencyMeetingLimit` not exhausted; no meeting active |
| `council:chat` | `ChatSendInput` | `ChatMessage` | Caller may send on that channel given their alive state and the phase; length ≤ 200; within `CHAT_RATE_LIMIT` |
| `council:vote` | `VoteInput` | — | Caller alive and eligible; phase is `VOTING`; `meetingId` current; has not already voted; target is alive or `SKIP` |
| `game:resume` | — | `GameResumeState` | Caller holds a seat in an active match |

## Server → client

| Event | Payload | Sent to |
| ----- | ------- | ------- |
| `room:state` | `RoomState` | everyone in the room, on any lobby change |
| `room:closed` | `{ reason }` | everyone in the room |
| `room:kicked` | `{ by }` | the kicked player only |
| `game:start` | `{ snapshot, self }` | each player individually — `self` differs per socket |
| `game:state` | `GameSnapshot` | room, at `STATE_BROADCAST_HZ` and on any phase change |
| `game:delta` | `MovementDelta` | room, high frequency: positions only |
| `game:self` | `GameSelfState` | one socket, when its private state changes |
| `game:timer` | `PhaseTimer` | room, on phase change |
| `game:result` | `MatchResult` | room, at match end |
| `player:state` | `PublicPlayerState` | room, for a single-player change |
| `player:correction` | `MovementCorrection` | one socket, only on drift past tolerance |
| `player:eliminated` | `EliminationEvent` | room — **victim only**, never the killer |
| `player:disconnect` / `player:reconnect` | `{ playerId }` | room |
| `task:updated` | `TaskAssignment[]` | one socket — its own objectives only |
| `task:team` | `TeamTaskProgress` | room |
| `sabotage:started` / `sabotage:updated` | `SabotageState` | room — never names who triggered it |
| `sabotage:resolved` | `{ type }` | room |
| `body:reported` | `{ bodyId, reporterId }` | room |
| `council:start` | `MeetingState` | room |
| `council:chat` | `ChatMessage` | **only the sockets entitled to that channel** |
| `council:voting_open` | `{ meetingId, endsAt }` | room |
| `council:vote` | `CastVote` | room — `target` omitted when voting is anonymous |
| `council:result` | `VotingResult` | room — `ejectedRole` null unless `confirmEjection` |
| `system:error` | `{ code, message }` | one socket, for failures with no ack to carry them |

## Movement in detail

```
client                                    server
  │ direction + sequence (15 Hz)
  ├────────────────────────────────────────►│ clamp delta, integrate,
  │                                         │ collide, speed-check
  │◄────────── game:delta (10 Hz) ──────────┤ broadcast positions
  │  interpolate between snapshots          │
  │◄────── player:correction (rare) ────────┤ only on drift past tolerance
```

The payload carries a **direction**, never a position, so there is no coordinate in the message for a client to forge. The sequence number makes replayed and out-of-order packets detectable, and inputs arriving faster than `MOVEMENT_INPUT_HZ` allows are dropped by the rate limiter.

## Rate limits

From `shared/src/constants/network.ts`, applied per socket:

| Limit | Value |
| ----- | ----- |
| `SOCKET_EVENT_RATE_LIMIT` | 60 events / second, all events |
| `ACTION_RATE_LIMIT` | 10 / second for interact, eliminate, report, vote |
| `CHAT_RATE_LIMIT` | 5 messages / 5 seconds, per channel |
| `MOVEMENT_INPUT_HZ` | 15 / second |

Excess is dropped. Sustained abuse disconnects the socket; the seat is then subject to the ordinary reconnect grace period, so a rate-limited player is not instantly removed from a match.

## Disconnect and resume

```
socket drops
   → player marked RECONNECTING, seat held RECONNECT_GRACE_MS (60s)
   → player:disconnect broadcast to the room
   → on return: new socket, same userId, emits game:resume
   → server replies with GameResumeState; player:reconnect broadcast
   → grace expires instead: player marked DISCONNECTED, seat released,
     win conditions re-evaluated
```

The resume payload is the whole truth — snapshot, private state, missed chat for entitled channels. The client rebuilds from it rather than reconciling against what it had before the drop.
