// ============================================================================
// EMAIL SERVICE — Provider-Agnostic
// ============================================================================
// Supports: SMTP (default), SendGrid, Mailgun, Postmark, Amazon SES
// Configure via .env:
//   EMAIL_PROVIDER=smtp|sendgrid|mailgun|postmark|ses|none
//   EMAIL_FROM="Watershed Capital <noreply@watershedcapital.com>"
//
// SMTP:      EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS
// SendGrid:  SENDGRID_API_KEY
// Mailgun:   MAILGUN_API_KEY, MAILGUN_DOMAIN
// Postmark:  POSTMARK_API_KEY
// SES:       AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
// ============================================================================

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// ── Factory ──
export function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER || 'none';
  const from = process.env.EMAIL_FROM || 'Watershed Capital <noreply@watershedcapital.com>';

  switch (provider.toLowerCase()) {
    case 'smtp':
      return new SMTPProvider();
    case 'sendgrid':
      return new SendGridProvider();
    case 'mailgun':
      return new MailgunProvider();
    case 'postmark':
      return new PostmarkProvider();
    case 'ses':
      return new SESProvider();
    default:
      return new ConsoleProvider();
  }
}

// ── Console Provider (default — logs to console, no actual email sent) ──
class ConsoleProvider implements EmailProvider {
  name = 'console';
  async send(message: EmailMessage) {
    console.log(`\n📧 [EMAIL] To: ${message.to}`);
    console.log(`   Subject: ${message.subject}`);
    console.log(`   Body: ${message.text || message.html?.replace(/<[^>]*>/g, '').slice(0, 200) || '(empty)'}`);
    return { success: true, messageId: `console-${Date.now()}` };
  }
}

// ── SMTP Provider ──
// Uses Node's nodemailer (install: bun add nodemailer @types/nodemailer)
class SMTPProvider implements EmailProvider {
  name = 'smtp';
  async send(message: EmailMessage) {
    try {
      // Dynamic import so we don't crash if nodemailer isn't installed
      const nodemailer = await import('nodemailer').catch(() => null);
      if (!nodemailer) {
        console.error('[EMAIL] nodemailer not installed. Run: bun add nodemailer');
        return { success: false, error: 'nodemailer not installed' };
      }

      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_SMTP_HOST,
        port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
        secure: process.env.EMAIL_SMTP_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_SMTP_USER,
          pass: process.env.EMAIL_SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'Watershed Capital <noreply@watershedcapital.com>',
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        cc: message.cc ? (Array.isArray(message.cc) ? message.cc.join(', ') : message.cc) : undefined,
        bcc: message.bcc ? (Array.isArray(message.bcc) ? message.bcc.join(', ') : message.bcc) : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
      });

      return { success: true, messageId: info.messageId };
    } catch (e: any) {
      console.error('[EMAIL] SMTP error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── SendGrid Provider ──
// Install: bun add @sendgrid/mail
class SendGridProvider implements EmailProvider {
  name = 'sendgrid';
  async send(message: EmailMessage) {
    try {
      const sgMail = await import('@sendgrid/mail').catch(() => null);
      if (!sgMail) {
        console.error('[EMAIL] @sendgrid/mail not installed. Run: bun add @sendgrid/mail');
        return { success: false, error: '@sendgrid/mail not installed' };
      }
      sgMail.default.setApiKey(process.env.SENDGRID_API_KEY!);
      const [response] = await sgMail.default.send({
        to: message.to,
        from: process.env.EMAIL_FROM || 'noreply@watershedcapital.com',
        subject: message.subject,
        html: message.html,
        text: message.text,
        cc: message.cc,
        bcc: message.bcc,
        replyTo: message.replyTo,
      });
      return { success: true, messageId: response.headers['x-message-id'] };
    } catch (e: any) {
      console.error('[EMAIL] SendGrid error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Mailgun Provider ──
// Install: bun add mailgun-js
class MailgunProvider implements EmailProvider {
  name = 'mailgun';
  async send(message: EmailMessage) {
    try {
      const mailgun = await import('mailgun-js').catch(() => null);
      if (!mailgun) {
        console.error('[EMAIL] mailgun-js not installed. Run: bun add mailgun-js');
        return { success: false, error: 'mailgun-js not installed' };
      }
      const mg = mailgun.default({
        apiKey: process.env.MAILGUN_API_KEY!,
        domain: process.env.MAILGUN_DOMAIN!,
      });
      const data = await mg.messages().send({
        from: process.env.EMAIL_FROM || 'noreply@watershedcapital.com',
        to: Array.isArray(message.to) ? message.to.join(',') : message.to,
        cc: message.cc ? (Array.isArray(message.cc) ? message.cc.join(',') : message.cc) : undefined,
        bcc: message.bcc ? (Array.isArray(message.bcc) ? message.bcc.join(',') : message.bcc) : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { success: true, messageId: data.id };
    } catch (e: any) {
      console.error('[EMAIL] Mailgun error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Postmark Provider ──
// Install: bun add postmark
class PostmarkProvider implements EmailProvider {
  name = 'postmark';
  async send(message: EmailMessage) {
    try {
      const postmark = await import('postmark').catch(() => null);
      if (!postmark) {
        console.error('[EMAIL] postmark not installed. Run: bun add postmark');
        return { success: false, error: 'postmark not installed' };
      }
      const client = new postmark.ServerClient(process.env.POSTMARK_API_KEY!);
      const result = await client.sendEmail({
        From: process.env.EMAIL_FROM || 'noreply@watershedcapital.com',
        To: Array.isArray(message.to) ? message.to.join(',') : message.to,
        Cc: message.cc ? (Array.isArray(message.cc) ? message.cc.join(',') : message.cc) : undefined,
        Bcc: message.bcc ? (Array.isArray(message.bcc) ? message.bcc.join(',') : message.bcc) : undefined,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        ReplyTo: message.replyTo,
      });
      return { success: true, messageId: result.MessageID };
    } catch (e: any) {
      console.error('[EMAIL] Postmark error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Amazon SES Provider ──
// Install: bun add @aws-sdk/client-ses
class SESProvider implements EmailProvider {
  name = 'ses';
  async send(message: EmailMessage) {
    try {
      const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses').catch(() => ({} as any));
      if (!SESClient) {
        console.error('[EMAIL] @aws-sdk/client-ses not installed. Run: bun add @aws-sdk/client-ses');
        return { success: false, error: '@aws-sdk/client-ses not installed' };
      }
      const client = new SESClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
      const command = new SendEmailCommand({
        Source: process.env.EMAIL_FROM || 'noreply@watershedcapital.com',
        Destination: {
          ToAddresses: Array.isArray(message.to) ? message.to : [message.to],
          CcAddresses: message.cc ? (Array.isArray(message.cc) ? message.cc : [message.cc]) : undefined,
          BccAddresses: message.bcc ? (Array.isArray(message.bcc) ? message.bcc : [message.bcc]) : undefined,
        },
        Message: {
          Subject: { Data: message.subject },
          Body: {
            Html: message.html ? { Data: message.html } : undefined,
            Text: message.text ? { Data: message.text } : undefined,
          },
        },
      });
      const result = await client.send(command);
      return { success: true, messageId: result.MessageId };
    } catch (e: any) {
      console.error('[EMAIL] SES error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Main send function ──
export async function sendEmail(message: EmailMessage): Promise<{ success: boolean; error?: string }> {
  const provider = getEmailProvider();
  const result = await provider.send(message);
  if (!result.success) {
    console.error(`[EMAIL] Failed to send via ${provider.name}:`, result.error);
  }
  return result;
}
