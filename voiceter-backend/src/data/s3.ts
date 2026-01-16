/**
 * S3 Client Wrapper
 * 
 * Provides S3 operations for audio recording storage.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getConfig } from '../server/config';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

let s3Client: S3Client | null = null;

/**
 * Get or create the S3 client singleton
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    const config = getConfig();
    s3Client = new S3Client({
      region: config.aws.region,
    });
    logger.info('S3 client initialized', { region: config.aws.region });
  }
  return s3Client;
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string> {
  const client = getS3Client();
  
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  });

  await client.send(command);
  
  logger.info('File uploaded to S3', { bucket, key, size: body.length });
  
  return `s3://${bucket}/${key}`;
}

/**
 * Download a file from S3
 */
export async function downloadFromS3(bucket: string, key: string): Promise<Buffer> {
  const client = getS3Client();
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await client.send(command);
  
  if (!response.Body) {
    throw new Error(`Empty response body for s3://${bucket}/${key}`);
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(bucket: string, key: string): Promise<void> {
  const client = getS3Client();
  
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);
  
  logger.info('File deleted from S3', { bucket, key });
}
