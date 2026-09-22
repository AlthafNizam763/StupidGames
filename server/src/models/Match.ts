import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A finished match.
 *
 * Written exactly once, when the match ends (DATABASE.md). Live match state
 * lives in memory; this is the durable record a player's history and the
 * leaderboard are built from.
 *
 * Roles are stored. A finished match has no secrets left, and a history that
 * omitted them would be unable to answer "how do I do as a Saboteur?", which is
 * most of what a player wants from their own record.
 */
const matchPlayerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    avatar: { type: String, required: true },
    role: { type: String, required: true },
    survived: { type: Boolean, required: true },
    objectivesCompleted: { type: Number, default: 0 },
    eliminations: { type: Number, default: 0 },
    xpEarned: { type: Number, default: 0 },
    won: { type: Boolean, required: true },
  },
  { _id: false },
);

const matchSchema = new Schema(
  {
    roomCode: { type: String, required: true },
    map: { type: String, required: true },
    gameMode: { type: String, required: true },
    settings: { type: Schema.Types.Mixed, required: true },
    players: { type: [matchPlayerSchema], required: true },
    winner: { type: String, required: true },
    reason: { type: String, required: true },
    /** Seconds. */
    duration: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

/** A player's own history, newest first. */
matchSchema.index({ 'players.userId': 1, endedAt: -1 });
matchSchema.index({ endedAt: -1 });

export type MatchSchemaType = InferSchemaType<typeof matchSchema>;
export type MatchDocument = HydratedDocument<MatchSchemaType>;

export const MatchModel = model('Match', matchSchema);
