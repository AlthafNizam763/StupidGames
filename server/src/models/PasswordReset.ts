import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A pending password reset.
 *
 * Only the SHA-256 of the emailed token is stored. Someone holding a database
 * dump therefore holds nothing they can present to the reset endpoint, because
 * the hash is not the credential - the preimage is, and it exists only in the
 * user's inbox (SECURITY.md).
 */
const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    /** Set on first use. A reset link works exactly once. */
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/*
 * TTL index: MongoDB deletes each document once `expiresAt` passes, so expired
 * requests clean themselves up and the collection cannot grow without bound.
 *
 * Expiry is still checked in code. The TTL monitor runs about once a minute, so
 * a document can outlive its expiry briefly - long enough to matter.
 */
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetSchemaType = InferSchemaType<typeof passwordResetSchema>;
export type PasswordResetDocument = HydratedDocument<PasswordResetSchemaType>;

export const PasswordResetModel = model('PasswordReset', passwordResetSchema);
