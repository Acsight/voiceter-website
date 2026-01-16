/**
 * AWS SES Email Service
 * 
 * Sends email notifications using Amazon Simple Email Service (SES).
 */

import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

let sesClient: SESClient | null = null;

/**
 * Get or create SES client
 */
function getSESClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return sesClient;
}

export interface WaitlistEmailData {
  name: string;
  email: string;
  company: string;
  companySize?: string;
  role?: string;
}

/**
 * Get marketing email recipients from environment
 */
function getMarketingEmails(): string[] {
  const emailsEnv = process.env.MARKETING_EMAILS || '';
  return emailsEnv.split(',').map(e => e.trim()).filter(e => e.length > 0);
}

/**
 * Send notification email to marketing team about new waitlist submission
 */
export async function sendWaitlistNotificationToMarketing(data: WaitlistEmailData): Promise<boolean> {
  const marketingEmails = getMarketingEmails();
  const senderEmail = process.env.SES_SENDER_EMAIL;

  if (!senderEmail) {
    logger.warn('SES_SENDER_EMAIL not configured, skipping marketing notification');
    return false;
  }

  if (marketingEmails.length === 0) {
    logger.warn('MARKETING_EMAILS not configured, skipping marketing notification');
    return false;
  }

  const client = getSESClient();

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        h2 { color: #2563eb; }
        .info-row { margin: 10px 0; }
        .label { font-weight: bold; color: #555; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🎉 New Waitlist Submission</h2>
        <p>A new user has joined the Voiceter AI waitlist!</p>
        
        <div class="info-row"><span class="label">Name:</span> ${data.name}</div>
        <div class="info-row"><span class="label">Email:</span> ${data.email}</div>
        <div class="info-row"><span class="label">Company:</span> ${data.company}</div>
        ${data.companySize ? `<div class="info-row"><span class="label">Company Size:</span> ${data.companySize}</div>` : ''}
        ${data.role ? `<div class="info-row"><span class="label">Role:</span> ${data.role}</div>` : ''}
        <div class="info-row"><span class="label">Submitted At:</span> ${new Date().toISOString()}</div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
New Waitlist Submission

A new user has joined the Voiceter AI waitlist!

Name: ${data.name}
Email: ${data.email}
Company: ${data.company}
${data.companySize ? `Company Size: ${data.companySize}` : ''}
${data.role ? `Role: ${data.role}` : ''}
Submitted At: ${new Date().toISOString()}
  `.trim();

  const params: SendEmailCommandInput = {
    Source: senderEmail,
    Destination: {
      ToAddresses: marketingEmails,
    },
    Message: {
      Subject: {
        Data: `🎉 New Waitlist: ${data.name} from ${data.company}`,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8',
        },
        Text: {
          Data: textBody,
          Charset: 'UTF-8',
        },
      },
    },
  };

  try {
    await client.send(new SendEmailCommand(params));
    logger.info('Marketing notification email sent', { to: marketingEmails });
    return true;
  } catch (error) {
    logger.error('Failed to send marketing notification email', {
      error: error instanceof Error ? error.message : String(error),
      to: marketingEmails,
    });
    return false;
  }
}

/**
 * Send welcome email to user who joined the waitlist
 */
export async function sendWaitlistWelcomeEmail(data: WaitlistEmailData): Promise<boolean> {
  const senderEmail = process.env.SES_SENDER_EMAIL;

  if (!senderEmail) {
    logger.warn('SES_SENDER_EMAIL not configured, skipping welcome email');
    return false;
  }

  const client = getSESClient();

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        h2 { color: #2563eb; }
        .highlight { background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Welcome to Voiceter AI! 🎙️</h2>
        
        <p>Hi ${data.name},</p>
        
        <p>Thank you for joining the Voiceter AI waitlist! We're thrilled to have <strong>${data.company}</strong> interested in our AI-powered voice survey platform.</p>
        
        <div class="highlight">
          <strong>What happens next?</strong>
          <ul>
            <li>We've received your request and added you to our priority list</li>
            <li>Our team will reach out as soon as we're ready to onboard new users</li>
            <li>You'll get early access to our platform with exclusive benefits</li>
          </ul>
        </div>
        
        <p>In the meantime, if you have any questions or want to learn more about Voiceter AI, feel free to reply to this email.</p>
        
        <p>We can't wait to show you what AI-powered voice surveys can do!</p>
        
        <div class="footer">
          <p>Best regards,<br>The Voiceter AI Team</p>
          <p><a href="https://voiceter.ai">voiceter.ai</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Welcome to Voiceter AI!

Hi ${data.name},

Thank you for joining the Voiceter AI waitlist! We're thrilled to have ${data.company} interested in our AI-powered voice survey platform.

What happens next?
- We've received your request and added you to our priority list
- Our team will reach out as soon as we're ready to onboard new users
- You'll get early access to our platform with exclusive benefits

In the meantime, if you have any questions or want to learn more about Voiceter AI, feel free to reply to this email.

We can't wait to show you what AI-powered voice surveys can do!

Best regards,
The Voiceter AI Team
https://voiceter.ai
  `.trim();

  const params: SendEmailCommandInput = {
    Source: senderEmail,
    Destination: {
      ToAddresses: [data.email],
    },
    Message: {
      Subject: {
        Data: 'Welcome to Voiceter AI Waitlist! 🎙️',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8',
        },
        Text: {
          Data: textBody,
          Charset: 'UTF-8',
        },
      },
    },
  };

  try {
    await client.send(new SendEmailCommand(params));
    logger.info('Welcome email sent', { to: data.email });
    return true;
  } catch (error) {
    logger.error('Failed to send welcome email', {
      error: error instanceof Error ? error.message : String(error),
      to: data.email,
    });
    return false;
  }
}

/**
 * Send both notification emails for a new waitlist submission
 */
export async function sendWaitlistEmails(data: WaitlistEmailData): Promise<{
  marketingEmailSent: boolean;
  welcomeEmailSent: boolean;
}> {
  const [marketingEmailSent, welcomeEmailSent] = await Promise.all([
    sendWaitlistNotificationToMarketing(data),
    sendWaitlistWelcomeEmail(data),
  ]);

  return { marketingEmailSent, welcomeEmailSent };
}
