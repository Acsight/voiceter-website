/**
 * Waitlist Repository
 * 
 * Handles waitlist submission storage in DynamoDB.
 * Table: website-demo-waitlist
 */

import { getDynamoDBClient } from './dynamodb';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

export interface WaitlistRecord {
  email: string;
  name: string;
  company: string;
  companySize?: string;
  role?: string;
  submittedAt: string;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
}

const TABLE_NAME = 'waitlist';

/**
 * Save a waitlist submission to DynamoDB
 */
export async function saveWaitlistSubmission(record: WaitlistRecord): Promise<WaitlistRecord> {
  const client = getDynamoDBClient();
  
  const item = {
    email: record.email,
    name: record.name,
    company: record.company,
    companySize: record.companySize || null,
    role: record.role || null,
    submittedAt: record.submittedAt,
    ipAddress: record.ipAddress || null,
    userAgent: record.userAgent || null,
    source: record.source || 'website',
  };

  logger.info('Saving waitlist submission', { email: record.email, company: record.company });

  await client.putItem(TABLE_NAME, item);

  logger.info('Waitlist submission saved successfully', { email: record.email });

  return record;
}

/**
 * Check if email already exists in waitlist
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  const client = getDynamoDBClient();
  
  const result = await client.getItem(TABLE_NAME, { email });
  
  return result !== null;
}

/**
 * Get waitlist submission by email
 */
export async function getWaitlistSubmission(email: string): Promise<WaitlistRecord | null> {
  const client = getDynamoDBClient();
  
  const result = await client.getItem(TABLE_NAME, { email });
  
  if (!result) {
    return null;
  }

  return {
    email: result.email,
    name: result.name,
    company: result.company,
    companySize: result.companySize,
    role: result.role,
    submittedAt: result.submittedAt,
    ipAddress: result.ipAddress,
    userAgent: result.userAgent,
    source: result.source,
  };
}
