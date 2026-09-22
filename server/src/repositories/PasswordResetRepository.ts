import { PasswordResetModel, type PasswordResetDocument } from '../models/PasswordReset';

/** The only code that touches the PasswordReset model. */
export const passwordResetRepository = {
  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetDocument> {
    return PasswordResetModel.create({ userId, tokenHash, expiresAt });
  },

  /**
   * Looks a reset up by the hash of the presented token.
   *
   * Deliberately does not filter on `usedAt` or `expiresAt`: the service checks
   * those itself so it can tell a spent link apart from an unknown one in the
   * logs, while still returning the same response to the client either way.
   */
  async findByTokenHash(tokenHash: string): Promise<PasswordResetDocument | null> {
    return PasswordResetModel.findOne({ tokenHash }).exec();
  },

  async markUsed(id: string): Promise<void> {
    await PasswordResetModel.updateOne({ _id: id }, { $set: { usedAt: new Date() } }).exec();
  },

  /**
   * Invalidates every outstanding reset for a user.
   *
   * Called after a successful reset, so a second link sitting in an inbox - or
   * in an attacker's hands - stops working the moment the password changes.
   */
  async invalidateAllForUser(userId: string): Promise<void> {
    await PasswordResetModel.updateMany(
      { userId, usedAt: null },
      { $set: { usedAt: new Date() } },
    ).exec();
  },
};

export type PasswordResetRepository = typeof passwordResetRepository;
