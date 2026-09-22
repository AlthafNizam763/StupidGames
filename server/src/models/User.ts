import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { DEFAULT_AVATAR_ID, deriveAppearance, levelForXp } from '@voidline/shared';

/**
 * The user account.
 *
 * Two fields here are load-bearing for security (see SECURITY.md):
 *
 * - `passwordHash` is `select: false`. A query has to ask for it explicitly, so
 *   forgetting a projection fails safe rather than leaking the hash.
 * - `email` is never part of any public projection. It exists on `SelfUser` and
 *   nowhere else in the shared contract.
 *
 * `level` is stored rather than derived on read because the leaderboard sorts
 * on it. It is written only alongside `xp`, by the server, at match end.
 */

const statsSchema = new Schema(
  {
    matchesPlayed: { type: Number, default: 0, min: 0 },
    matchesWon: { type: Number, default: 0, min: 0 },
    matchesLost: { type: Number, default: 0, min: 0 },
    operatorWins: { type: Number, default: 0, min: 0 },
    saboteurWins: { type: Number, default: 0, min: 0 },
    eliminations: { type: Number, default: 0, min: 0 },
    objectivesCompleted: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/**
 * Counters that exist only to satisfy achievement criteria.
 *
 * Kept apart from `stats` because `stats` is published on every profile: a new
 * achievement should not widen the public contract, and these numbers would
 * tell other players things about a match they were not in.
 *
 * Written by the match-end service in Phase 21.
 */
const achievementProgressSchema = new Schema(
  {
    matchesSurvived: { type: Number, default: 0, min: 0 },
    decidingVotesAgainstSaboteurs: { type: Number, default: 0, min: 0 },
    perfectOperatorWins: { type: Number, default: 0, min: 0 },
    untouchedSaboteurWins: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/**
 * How this player is drawn.
 *
 * Free-form in the schema and validated in the service against the shared
 * roster, so retiring a hair style does not make every stored character fail
 * Mongoose validation on read.  repairs slot by slot.
 */
const appearanceSchema = new Schema(
  {
    body: { type: String, required: true },
    skin: { type: String, required: true },
    hair: { type: String, required: true },
    hairColour: { type: String, required: true },
    outfit: { type: String, required: true },
    shoes: { type: String, required: true },
    accessory: { type: String, default: null },
    backpack: { type: String, default: null },
  },
  { _id: false },
);

const achievementSchema = new Schema(
  {
    id: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 16,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    avatar: {
      type: String,
      default: DEFAULT_AVATAR_ID,
    },
    /**
     * Seeded from the account id so a new station is not full of identical
     * crew. Only ever an initial value - the player's own choices replace it.
     */
    appearance: {
      type: appearanceSchema,
      default: function defaultAppearance(this: { _id?: unknown }) {
        return deriveAppearance(String(this._id ?? Math.random()));
      },
    },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    stats: { type: statsSchema, default: () => ({}) },
    achievements: { type: [achievementSchema], default: [] },
    achievementProgress: { type: achievementProgressSchema, default: () => ({}), select: false },
    /**
     * Bumped to invalidate every outstanding session.
     *
     * Refresh tokens are stateless JWTs, so there is nothing to delete when a
     * password changes. Embedding this counter in the token and comparing it on
     * every refresh gives revocation without a token store: bump the number and
     * every token minted before it stops verifying (SECURITY.md).
     */
    tokenVersion: { type: Number, default: 0, min: 0 },

    /** Soft ban. Checked at sign-in and at socket handshake. */
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/*
 * Usernames are unique case-insensitively: "Vega" and "vega" are the same crew
 * member as far as impersonation is concerned. Strength 2 compares base letters
 * and accents but ignores case.
 */
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index({ email: 1 }, { unique: true });

/** Leaderboard ordering. `_id` breaks ties so pagination is stable. */
userSchema.index({ xp: -1, _id: 1 });

/**
 * Keeps `level` consistent with `xp` no matter which code path wrote the XP.
 * Deriving it in one place means a future service cannot forget to update it.
 *
 * Mongoose 9 pre-save hooks return instead of calling a `next` callback; the
 * callback form was removed, so do not reintroduce one here.
 */
userSchema.pre('save', function syncLevel() {
  if (this.isModified('xp')) this.level = levelForXp(this.xp);
});

export type UserSchemaType = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserSchemaType>;

export const UserModel = model('User', userSchema);
