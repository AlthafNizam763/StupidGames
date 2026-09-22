import {
  coerceAppearance,
  type AchievementId,
  type PublicUser,
  type SelfUser,
  type UserProfile,
  type UserStats,
} from '@voidline/shared';
import { UserModel, type UserDocument } from '../models/User';

/**
 * The only code that touches the User model.
 *
 * Services above this layer take and return the shared contract types, never
 * Mongoose documents - which is what lets them be unit-tested without a
 * database, and what stops a document with `passwordHash` attached from
 * drifting up into a response by accident.
 */

/* ----------------------------------------------------------- projections - */

/**
 * Document to `PublicUser`. Everything not listed is dropped, so adding a
 * sensitive field to the schema cannot leak it: the mapper has to be taught
 * about it first (SECURITY.md - default deny).
 */
export function toPublicUser(doc: UserDocument): PublicUser {
  return {
    id: doc.id as string,
    username: doc.username,
    avatar: doc.avatar,
    level: doc.level,
    xp: doc.xp,
    // Repaired on read rather than trusted, so a roster change never yields an
    // unrenderable character.
    appearance: coerceAppearance(doc.appearance),
  };
}

function toStats(doc: UserDocument): UserStats {
  const s = doc.stats;
  return {
    matchesPlayed: s.matchesPlayed,
    matchesWon: s.matchesWon,
    matchesLost: s.matchesLost,
    operatorWins: s.operatorWins,
    saboteurWins: s.saboteurWins,
    eliminations: s.eliminations,
    objectivesCompleted: s.objectivesCompleted,
    // Derived on read so every surface rounds identically, and so a stored
    // copy cannot go stale (DATABASE.md).
    winRate: s.matchesPlayed > 0 ? s.matchesWon / s.matchesPlayed : 0,
  };
}

function toAchievements(doc: UserDocument) {
  return doc.achievements.map((entry) => ({
    id: entry.id as AchievementId,
    unlockedAt: entry.unlockedAt.toISOString(),
  }));
}

/** The account owner's own view. Includes email; never send it to anyone else. */
export function toSelfUser(doc: UserDocument): SelfUser {
  return {
    ...toPublicUser(doc),
    email: doc.email,
    stats: toStats(doc),
    achievements: toAchievements(doc),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Another player's profile page. No email, no private fields. */
export function toUserProfile(doc: UserDocument): UserProfile {
  return {
    ...toPublicUser(doc),
    stats: toStats(doc),
    achievements: toAchievements(doc),
    createdAt: doc.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------- repository - */

export interface CreateUserData {
  username: string;
  email: string;
  passwordHash: string;
  avatar?: string;
}

export const userRepository = {
  async findById(id: string): Promise<UserDocument | null> {
    return UserModel.findById(id).exec();
  },

  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase().trim() }).exec();
  },

  /**
   * Looks up an account *with* its password hash, for credential checking only.
   * Separate from `findByEmail` so that including the hash is always a
   * deliberate act at the call site.
   */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();
  },

  async findByUsername(username: string): Promise<UserDocument | null> {
    return UserModel.findOne({ username })
      .collation({ locale: 'en', strength: 2 })
      .exec();
  },

  async create(data: CreateUserData): Promise<UserDocument> {
    return UserModel.create(data);
  },

  /** Leaderboard page. Sorted by XP, with `_id` breaking ties for stable paging. */
  async findTopByXp(skip: number, limit: number): Promise<UserDocument[]> {
    return UserModel.find({ disabled: false })
      .sort({ xp: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .exec();
  },

  async countActive(): Promise<number> {
    return UserModel.countDocuments({ disabled: false }).exec();
  },
};

export type UserRepository = typeof userRepository;
