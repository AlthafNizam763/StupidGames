import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A relationship between two players.
 *
 * One document per relationship, not two. The pair is stored in a canonical
 * order - lower id first - with a unique index across both, so A-requests-B and
 * B-requests-A cannot create two rows that then disagree about the status.
 *
 * `requesterId` records who asked, which is what distinguishes an incoming
 * request from an outgoing one. Canonical ordering would otherwise lose that.
 */
const friendshipSchema = new Schema(
  {
    /** Lower of the two ids. Used for the unique index. */
    pairLow: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Higher of the two ids. */
    pairHigh: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Who sent the request. Always one of the pair. */
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'BLOCKED'],
      default: 'PENDING',
    },
    /** Who blocked, when status is BLOCKED. */
    blockedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

friendshipSchema.index({ pairLow: 1, pairHigh: 1 }, { unique: true });
/** Finds every relationship a player is part of, from either side. */
friendshipSchema.index({ pairLow: 1, status: 1 });
friendshipSchema.index({ pairHigh: 1, status: 1 });

export type FriendshipSchemaType = InferSchemaType<typeof friendshipSchema>;
export type FriendshipDocument = HydratedDocument<FriendshipSchemaType>;

export const FriendshipModel = model('Friendship', friendshipSchema);

/** Orders a pair canonically, so the unique index does its job. */
export function canonicalPair(a: string, b: string): { pairLow: string; pairHigh: string } {
  return a < b ? { pairLow: a, pairHigh: b } : { pairLow: b, pairHigh: a };
}
