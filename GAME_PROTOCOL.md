# Game protocol

The rules of VOIDLINE, and where each one is enforced. Every rule here is evaluated on the server.

Constants referenced below live in `shared/src/constants/game.ts`; the server imports them rather than repeating the numbers.

## Premise

ORBITAL-09 is losing systems. The crew cannot agree on why.

**Operators** keep the station running: they complete objectives across ten zones, watch each other, and try to identify the Saboteurs before there are too few Operators left to matter.

**Saboteurs** look exactly like Operators. They eliminate crew quietly, trigger facility failures, and win by reaching parity or by letting a critical system fail.

## Phase state machine

```
WAITING ──► LOBBY ──► STARTING ──► PLAYING ◄────────────┐
                                    │  ▲                │
                                    │  └── SABOTAGE ────┤
                                    │        (critical) │
                                    ▼                   │
                                 COUNCIL                 │
                                    ▼                   │
                                 VOTING                  │
                                    ▼                   │
                                EJECTION ────────────────┘
                                    ▼
                                 RESULTS ──► ENDED
```

Legal transitions are declared once, in `GAME_PHASE_TRANSITIONS`, and checked by `canTransition()`. An illegal transition is rejected and logged rather than silently corrected — a quietly corrected transition becomes a desynced room that nobody can debug.

| Phase | What is running | Movement | Elimination | Chat |
| ----- | --------------- | -------- | ----------- | ---- |
| `WAITING` | Room created, not yet open | — | — | — |
| `LOBBY` | Joining, readying, host tuning settings | — | — | lobby |
| `STARTING` | Roles dealt, countdown and role reveal | frozen | no | no |
| `PLAYING` | Free roam, objectives, elimination, reporting | yes | yes | proximity / saboteur |
| `SABOTAGE` | A critical countdown over normal play | yes | yes | proximity / saboteur |
| `COUNCIL` | Discussion | frozen | no | council + dead |
| `VOTING` | Ballots open | frozen | no | council + dead |
| `EJECTION` | Result reveal | frozen | no | dead |
| `RESULTS` | Win screen, XP award | — | — | all |
| `ENDED` | Terminal | — | — | — |

`SABOTAGE` is a phase only because a *critical* sabotage runs a countdown that can end the match by itself. Non-critical sabotages (comms, power, door lockdown) are modifiers applied while the room stays in `PLAYING` — they never end a match, so they do not deserve a phase.

## Roles

Assigned in `STARTING` by `RoleManager`, using a cryptographically secure shuffle (`crypto.randomInt`, not `Math.random`). A player's role is written to their socket's private state and to nothing else.

| | Operator | Saboteur |
| --- | --- | --- |
| Knows own role | yes | yes |
| Knows anyone else's role | never | knows fellow Saboteurs |
| Has objectives | yes | no (sees the bar, cannot advance it) |
| Can eliminate | no | yes, on cooldown |
| Can sabotage | no | yes, on cooldown |
| Can report a body | yes | yes — reporting is excellent cover |
| Can call an emergency meeting | yes | yes |

Saboteur count is bounded by `maxSaboteursFor(playerCount)` = `floor((players - 1) / 2)`, capped at 3. Saboteurs must start outnumbered, or the match is over the moment it begins.

## Objectives

Each Operator is assigned `objectiveCount` objectives, drawn across zones so the map stays busy. Seven originals:

| Objective | Zone flavour | Interaction |
| --------- | ------------ | ----------- |
| Reactor Calibration | Reactor Core | Align energy nodes to a target phase |
| Signal Routing | Communications | Connect signal paths across a routing grid |
| Oxygen Balancing | Hydroponics | Bring pressure valves into the safe band |
| Data Recovery | Research Lab | Restore corrupted data blocks in order |
| Power Synchronization | Engine Room | Match timing indicators across generators |
| Security Scan | Security | Match a scan pattern against a reference |
| Navigation Calibration | Command Deck | Align orbital coordinates on a nav plot |

Each carries `id`, `type`, `zone`, `duration`, `steps`, `progress`, `status`.

**Verification.** The server generates each puzzle's parameters and keeps the expected solution. The client receives only what it needs to render the puzzle. On `task:complete` the server checks the submitted solution against its own, that the task is assigned to that player, that it is not already complete, that the player is alive, in range of the right terminal, and that the elapsed time is not implausibly short. Only then does the team bar move.

Saboteurs see the team bar — it is their clock — but their submissions are refused.

## Sabotage

Cooldowns and durations are per type, in `SABOTAGE_RULES`.

| Sabotage | Critical | Effect |
| -------- | -------- | ------ |
| Reactor Failure | yes | 45s countdown; Saboteurs win if it expires. Two repair stations. |
| Oxygen Leak | yes | 45s countdown; Saboteurs win if it expires. Two repair stations. |
| Communication Failure | no | Suppresses zone reporting and the objective bar for 40s |
| Power Failure | no | Collapses Operator vision radius for 40s |
| Door Lockdown | no | Seals one zone's doors for 15s. No repair — it lapses. |

Triggering requires: actor alive, actor is a Saboteur, phase is `PLAYING`, no meeting active, no sabotage already active, team cooldown elapsed. The broadcast never names who triggered it.

A critical sabotage cannot be started during a meeting, and calling a meeting does not clear one — a critical countdown continues through `COUNCIL`, which is the tension it exists to create.

## Elimination

A Saboteur may eliminate a nearby Operator. The server verifies, in order:

1. Killer is alive
2. Killer's role is `SABOTEUR`
3. Target exists, is alive, and is not a fellow Saboteur
4. Distance ≤ `ELIMINATION_RANGE` (64 world units), measured against **server-held** positions
5. Killer's `killCooldownEndsAt` has passed
6. Phase is `PLAYING` or `SABOTAGE`
7. No meeting is active

On success the target is marked dead, a body is left at their position, the killer's cooldown resets to `killCooldown`, and `player:eliminated` is broadcast — carrying the **victim only**. The killer's identity appears in no broadcast, ever.

The eliminated player stays connected: they keep moving as a ghost, can still finish objectives (they still count toward the Operator win), and join the dead chat channel. They can no longer report, vote, or speak to the living.

## Body discovery and councils

Any living player within `REPORT_RANGE` (80 units) of an unreported body may report it. The server verifies range and liveness, marks the body reported and opens a council.

A council can also be opened by an emergency meeting, if `emergencyMeetingLimit` allows and the player has one left.

```
BODY FOUND or EMERGENCY
   ↓
COUNCIL   — discussionTime seconds, movement frozen, chat open
   ↓
VOTING    — votingTime seconds, ballots open
   ↓
RESULT    — tally computed server-side
   ↓
EJECTION  — reveal
   ↓
PLAYING   (or RESULTS, if the match is now decided)
```

Opening a council teleports every living player to their spawn, clears all bodies, and pauses objective terminals. A critical sabotage countdown keeps running.

## Chat

| Channel | Who may send | Who receives |
| ------- | ------------ | ------------ |
| `PROXIMITY` | living, during `PLAYING` | living players nearby |
| `COUNCIL` | living, during a meeting | all living players |
| `DEAD` | eliminated only | eliminated players only |
| `SABOTEUR` | Saboteurs, where the mode allows | Saboteurs only |

A living socket is never sent a `DEAD` message. This is enforced at fan-out, not by asking the client not to render it.

Limits: `MAX_CHAT_MESSAGE_LENGTH` 200 characters, `CHAT_RATE_LIMIT` 5 messages per 5 seconds per channel, and a profanity filter applied server-side (the `filtered` flag tells the client the body was rewritten).

## Voting

Each living player casts one vote: a player, or `SKIP`. Votes are final. The server rejects a vote from a dead player, a second vote, a vote for a dead or absent player, or a vote after `votingEndsAt`.

Voting closes when every eligible voter has voted or the timer expires. Then, server-side:

- Highest tally wins, and that player is ejected.
- A tie — including a tie with `SKIP` — ejects nobody (`TIED`).
- `SKIP` winning ejects nobody (`SKIPPED`).
- Too few ballots to decide anything is `NO_QUORUM`.

With `anonymousVoting` on, the server broadcasts *that* a player has voted but omits the target until the tally, and the final tallies carry empty `voterIds`. The client is not sent a value it is asked to hide.

## Ejection

> **{PLAYER} was removed from the station.**

With `confirmEjection` **enabled**, the reveal adds the ejected player's role and the number of Saboteurs remaining. With it **disabled**, `ejectedRole` and `saboteursRemaining` are `null` — withheld by the server, not hidden by the client.

## Win conditions

Checked by `WinConditionManager` after every elimination, ejection, objective completion, sabotage resolution and disconnect.

**Operators win when:**
- every assigned objective is complete (`OBJECTIVES_COMPLETED`), or
- every Saboteur has been eliminated or ejected (`SABOTEURS_ELIMINATED`)

**Saboteurs win when:**
- living Saboteurs ≥ living Operators (`SABOTEURS_REACHED_PARITY`), or
- a critical sabotage countdown expires unrepaired (`CRITICAL_SABOTAGE`)

If every member of one side leaves and does not return within the grace period, the match ends as `TEAM_ABANDONED` and the remaining side is credited.

Objective completion is counted from server-verified completions only, so a match cannot be ended by a client claiming to have finished its list.

## Reconnection

A dropped socket does **not** remove a player from a match. Their seat, role, position, alive/dead state and objective progress are held for `RECONNECT_GRACE_MS` (60s) and they are shown to everyone as `RECONNECTING`.

On return, the client emits `game:resume` and receives a `GameResumeState`: the public snapshot, its own private state, and the chat it missed on channels it is entitled to read. The client rebuilds from that rather than trying to replay what it lost.

Past the grace period the seat is released, the player is marked `DISCONNECTED`, and win conditions are re-evaluated — a Saboteur who abandons a match does not hand their team a parity win.

## XP

Awarded server-side on match end, from `XP_AWARDS`. The client never submits an XP value and the results screen shows the server's breakdown.

| Award | XP |
| ----- | -- |
| Match completed | 50 |
| Per objective completed | 15 |
| On the winning team | 120 |
| Survived to the end | 40 |
| Per successful elimination | 25 |
| Council participation | 10 |
| Voted for an ejected Saboteur | 20 |

Levels follow `xpForLevel(n) = 100 · (n−1) · n`, so each level costs more than the last.
