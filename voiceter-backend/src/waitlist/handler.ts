/**
 * Waitlist HTTP Handler
 * 
 * Handles waitlist form submissions via REST API.
 * Stores data in DynamoDB and sends email notifications via AWS SES.
 */

import { Request, Response } from 'express';
import { saveWaitlistSubmission, checkEmailExists, WaitlistRecord } from '../data/waitlist-repository';
import { sendWaitlistEmails } from '../email/ses-service';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

interface WaitlistSubmissionBody {
  email: string;
  name: string;
  company: string;
  company_size?: string;
  role?: string;
}

/**
 * Handle waitlist form submission
 */
export async function handleWaitlistSubmission(req: Request, res: Response): Promise<void> {
  try {
    const body: WaitlistSubmissionBody = req.body;

    // Validate required fields
    if (!body.email || !body.name || !body.company) {
      res.status(400).json({
        error: 'Email, name, and company are required fields',
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      res.status(400).json({
        error: 'Invalid email format',
      });
      return;
    }

    // Check for duplicate email
    const emailExists = await checkEmailExists(body.email);
    if (emailExists) {
      res.status(409).json({
        error: 'This email is already registered on the waitlist',
      });
      return;
    }

    // Get client IP and user agent
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    // Create waitlist record
    const record: WaitlistRecord = {
      email: body.email,
      name: body.name,
      company: body.company,
      companySize: body.company_size,
      role: body.role,
      submittedAt: new Date().toISOString(),
      ipAddress: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : ipAddress,
      userAgent,
      source: 'website',
    };

    // Save to DynamoDB
    await saveWaitlistSubmission(record);

    logger.info('Waitlist submission saved', {
      event: 'waitlist_submission_saved',
      data: { email: body.email, company: body.company },
    });

    // Send email notifications (non-blocking)
    sendWaitlistEmails({
      name: body.name,
      email: body.email,
      company: body.company,
      companySize: body.company_size,
      role: body.role,
    }).then((result) => {
      logger.info('Waitlist emails sent', {
        event: 'waitlist_emails_sent',
        data: {
          email: body.email,
          marketingEmailSent: result.marketingEmailSent,
          welcomeEmailSent: result.welcomeEmailSent,
        },
      });
    }).catch((error) => {
      logger.error('Failed to send waitlist emails', {
        event: 'waitlist_emails_failed',
        error: error instanceof Error ? error.message : String(error),
        data: { email: body.email },
      });
    });

    res.status(201).json({
      success: true,
      message: 'Successfully added to waitlist. You will receive a confirmation email shortly.',
    });
  } catch (error) {
    logger.error('Waitlist submission failed', {
      event: 'waitlist_submission_error',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: 'Failed to submit waitlist form. Please try again.',
    });
  }
}
