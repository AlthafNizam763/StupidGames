import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { levelForXp } from '@voidline/shared';

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
      default: 'operator-01',
    },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    stats: { type: statsSchema, default: () => ({}) },
    achievements: { type: [achievementSchema], default: [] },
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
