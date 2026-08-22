import { IEmailProvider } from './email.interface.js';
import { logger } from '../../../infrastructure/logger/index.js';

export class ConsoleEmailProvider implements IEmailProvider {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    logger.info({
      event: 'MOCK_EMAIL_SENT',
      to,
      subject,
      bodyPreview: body.substring(0, 100)
    }, `[ConsoleEmailProvider] Sending email to ${to}: ${subject}`);
  }
}
