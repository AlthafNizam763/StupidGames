import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Outbound mail, behind a transport abstraction.
 *
 * Two transports, chosen by configuration:
 *
 * - **SMTP**, when `SMTP_HOST` is set. Real delivery.
 * - **Log**, when it is not. The message is written to the server log,
 *   including the reset link, so password reset is fully usable in development
 *   without an email account.
 *
 * The log transport is not a stub that pretends to succeed - it says plainly in
 * the log that nothing was sent and where the link went instead. Configuration
 * requirements for real delivery are in .env.example and DEPLOYMENT.md.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailTransport {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

class LogTransport implements MailTransport {
  readonly name = 'log';

  async send(message: MailMessage): Promise<void> {
    logger.warn(
      { to: message.to, subject: message.subject, body: message.text },
      'SMTP is not configured - email was NOT sent. Body logged above; ' +
        'set SMTP_HOST in .env to deliver it for real.',
    );
  }
}

class SmtpTransport implements MailTransport {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      // 465 is implicit TLS; everything else upgrades with STARTTLS.
      secure: config.mail.port === 465,
      auth:
        config.mail.user && config.mail.password
          ? { user: config.mail.user, pass: config.mail.password }
          : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: config.mail.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

const transport: MailTransport = config.mail.isConfigured
  ? new SmtpTransport()
  : new LogTransport();

export const mailService = {
  transportName: transport.name,

  /**
   * Sends a message, and never lets a delivery failure fail the request.
   *
   * A mail outage must not turn "we have emailed you a link" into an error - it
   * would also reveal, by differing response, whether the address exists. The
   * failure is logged for an operator; the caller is told nothing.
   */
  async send(message: MailMessage): Promise<void> {
    try {
      await transport.send(message);
    } catch (error) {
      logger.error(
        { err: error, to: message.to, subject: message.subject },
        'failed to send email',
      );
    }
  },

  async sendPasswordReset(to: string, username: string, resetUrl: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your VOIDLINE password',
      text:
        `Hello ${username},\n\n` +
        `Someone asked to reset the password for your VOIDLINE account.\n\n` +
        `Open this link to choose a new one. It works once and expires in one hour:\n` +
        `${resetUrl}\n\n` +
        `If this was not you, you can ignore this message - your password has not changed.\n`,
    });
  },
};
