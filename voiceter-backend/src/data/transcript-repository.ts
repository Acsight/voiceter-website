/**
 * Transcript Repository
 * 
 * Handles persistence of conversation transcripts to DynamoDB demo-transcripts table.
 * 
 * Requirements:
 * - REQ-DATA-001: Table 3 schema (demo-transcripts)
 * - REQ-DATA-004: Store Conversation Transcripts
 * - 7.1: Store user transcriptions (textOutput with role USER and final true)
 * - 7.2: Store AI transcriptions (textOutput with role ASSISTANT and final true)
 * - 7.5: Store transcripts with sessionId, speaker, text, and timestamp
 */

import { getDynamoDBClient } from './dynamodb';
import { TranscriptRecord } from './types';
import { getLogger } from '../monitoring/logger';
import {
  withDatabaseErrorHandling,
  withDatabaseErrorHandlingVoid,
} from './error-handler';

const logger = getLogger();

// TTL: 90 days in seconds
const TTL_90_DAYS = 90 * 24 * 60 * 60;

/**
 * Transcript Repository for DynamoDB operations
 */
export class TranscriptRepository {
  private tableName = 'transcripts';
  private dynamoClient = getDynamoDBClient();

  /**
   * Save a transcript record
   * 
   * Requirements:
   * - REQ-DATA-004: Store full transcripts when conversations occur
   * - 7.1: Store user transcriptions when textOutput with role USER and final true is received
   * - 7.2: Store AI transcriptions when textOutput with role ASSISTANT and final true is received
   * - 7.5: Store sessionId, speaker, text, timestamp, and isFinal flag
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   * 
   * Note: AWS table uses transcriptId as primary key (not composite key)
   */
  async saveTranscript(transcript: TranscriptRecord, continueOnFailure = true): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        const timestampValue = typeof transcript.timestamp === 'string' 
          ? new Date(transcript.timestamp).getTime() 
          : transcript.timestamp;
        
        // Generate transcriptId as primary key (matches existing AWS schema)
        const transcriptId = `${transcript.sessionId}-${timestampValue}`;
        
        // Create record for the transcript with all REQ-DATA-004 required fields
        const record: Record<string, any> = {
          transcriptId, // Primary key for existing AWS table
          sessionId: transcript.sessionId,
          timestamp: timestampValue,
          turnNumber: transcript.turnNumber || 0, // For ordering transcripts
          role: transcript.role || transcript.speaker || 'USER',
          transcriptionType: transcript.transcriptionType || 
            (transcript.isFinal ? 'FINAL' : 'SPECULATIVE'),
          content: transcript.content || transcript.text || '',
          interrupted: transcript.interrupted || false,
          generationStage: transcript.generationStage || 'FINAL',
          isFinal: transcript.isFinal ?? true,
          ttl: Math.floor(Date.now() / 1000) + TTL_90_DAYS,
        };
        
        // Add guardrailBlocked if present
        if (transcript.guardrailBlocked !== undefined) {
          record.guardrailBlocked = transcript.guardrailBlocked;
        }

        await this.dynamoClient.putItem(this.tableName, record);
        
        const duration = Date.now() - startTime;
        logger.info('Transcript saved', {
          sessionId: transcript.sessionId,
          role: record.role,
          transcriptionType: record.transcriptionType,
          interrupted: record.interrupted,
          contentLength: record.content.length,
          duration,
        });

        if (duration > 100) {
          logger.warn('Transcript save exceeded 100ms threshold', {
            sessionId: transcript.sessionId,
            role: record.role,
            duration,
          });
        }
      },
      {
        operationName: 'saveTranscript',
        sessionId: transcript.sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Create a transcript record (alias for backward compatibility)
   * 
   * This method accepts a flexible format to support different calling patterns.
   * It normalizes the input to match the TranscriptRecord interface.
   * 
   * Requirements:
   * - REQ-DATA-004: Store full transcripts with all required fields
   */
  async create(transcript: {
    sessionId: string;
    timestamp: number | string;
    role?: 'user' | 'assistant' | 'USER' | 'ASSISTANT';
    speaker?: 'USER' | 'ASSISTANT';
    content?: string;
    text?: string;
    turnNumber?: number;
    isFinal: boolean;
    transcriptionType?: 'ASR_FINAL' | 'SPECULATIVE' | 'FINAL';
    interrupted?: boolean;
    generationStage?: string;
    guardrailBlocked?: boolean;
  }): Promise<void> {
    // Normalize the input to match TranscriptRecord interface
    const role = (transcript.speaker || 
      (transcript.role === 'user' || transcript.role === 'USER' ? 'USER' : 'ASSISTANT')) as 'USER' | 'ASSISTANT';
    
    const normalizedTranscript: TranscriptRecord = {
      sessionId: transcript.sessionId,
      timestamp: typeof transcript.timestamp === 'number' 
        ? transcript.timestamp 
        : new Date(transcript.timestamp).getTime(),
      role,
      transcriptionType: transcript.transcriptionType || 
        (transcript.isFinal ? 'FINAL' : 'SPECULATIVE'),
      content: transcript.text || transcript.content || '',
      interrupted: transcript.interrupted || false,
      generationStage: transcript.generationStage || 'FINAL',
      isFinal: transcript.isFinal,
      guardrailBlocked: transcript.guardrailBlocked,
    };

    return this.saveTranscript(normalizedTranscript, true);
  }

  /**
   * Get all transcripts for a session
   * 
   * Queries by sessionId (partition key) to retrieve all transcripts
   * for a given session. Results are ordered by timestamp (sort key).
   * 
   * Requirements:
   * - 7.5: Query transcripts by sessionId
   * - Return transcripts in chronological order
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async getTranscripts(sessionId: string, continueOnFailure = false): Promise<TranscriptRecord[]> {
    const startTime = Date.now();
    
    const result = await withDatabaseErrorHandling(
      async () => {
        const results = await this.dynamoClient.query(
          this.tableName,
          'sessionId = :sessionId',
          { ':sessionId': sessionId }
        );

        const duration = Date.now() - startTime;
        logger.debug('Transcripts retrieved', {
          sessionId,
          count: results.length,
          duration,
        });

        if (duration > 100) {
          logger.warn('Transcript retrieval exceeded 100ms threshold', {
            sessionId,
            duration,
          });
        }

        return results as TranscriptRecord[];
      },
      {
        operationName: 'getTranscripts',
        sessionId,
        continueOnFailure,
      }
    );

    return result || [];
  }

  /**
   * Get transcripts for a session filtered by speaker
   * 
   * Retrieves all transcripts for a session and filters by speaker type.
   * Useful for getting only user transcripts or only AI transcripts.
   * 
   * Requirements:
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async getTranscriptsBySpeaker(
    sessionId: string,
    speaker: 'USER' | 'ASSISTANT',
    continueOnFailure = false
  ): Promise<TranscriptRecord[]> {
    const startTime = Date.now();
    
    const result = await withDatabaseErrorHandling(
      async () => {
        const allTranscripts = await this.getTranscripts(sessionId, continueOnFailure);
        const filtered = allTranscripts.filter((t) => t.speaker === speaker);

        const duration = Date.now() - startTime;
        logger.debug('Transcripts retrieved by speaker', {
          sessionId,
          speaker,
          count: filtered.length,
          duration,
        });

        return filtered;
      },
      {
        operationName: 'getTranscriptsBySpeaker',
        sessionId,
        continueOnFailure,
      }
    );

    return result || [];
  }

  /**
   * Get only final transcripts for a session
   * 
   * Retrieves all transcripts for a session and filters to only final transcripts.
   * Useful for getting the complete conversation without intermediate transcriptions.
   * 
   * Requirements:
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async getFinalTranscripts(sessionId: string, continueOnFailure = false): Promise<TranscriptRecord[]> {
    const startTime = Date.now();
    
    const result = await withDatabaseErrorHandling(
      async () => {
        const allTranscripts = await this.getTranscripts(sessionId, continueOnFailure);
        const filtered = allTranscripts.filter((t) => t.isFinal);

        const duration = Date.now() - startTime;
        logger.debug('Final transcripts retrieved', {
          sessionId,
          count: filtered.length,
          duration,
        });

        return filtered;
      },
      {
        operationName: 'getFinalTranscripts',
        sessionId,
        continueOnFailure,
      }
    );

    return result || [];
  }

  /**
   * Delete all transcripts for a session
   * 
   * Note: This requires querying first to get all timestamps,
   * then deleting each item individually since DynamoDB doesn't
   * support batch delete by partition key only.
   * 
   * Requirements:
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async deleteTranscripts(sessionId: string, continueOnFailure = true): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        // First, get all transcripts for the session
        const transcripts = await this.getTranscripts(sessionId, continueOnFailure);

        // Delete each transcript
        for (const transcript of transcripts) {
          await this.dynamoClient.deleteItem(this.tableName, {
            sessionId: transcript.sessionId,
            timestamp: transcript.timestamp,
          });
        }

        const duration = Date.now() - startTime;
        logger.info('Transcripts deleted', {
          sessionId,
          count: transcripts.length,
          duration,
        });
      },
      {
        operationName: 'deleteTranscripts',
        sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Delete a specific transcript
   * 
   * Requirements:
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async deleteTranscript(
    sessionId: string,
    timestamp: string,
    continueOnFailure = true
  ): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        await this.dynamoClient.deleteItem(this.tableName, {
          sessionId,
          timestamp,
        });

        const duration = Date.now() - startTime;
        logger.info('Transcript deleted', {
          sessionId,
          timestamp,
          duration,
        });
      },
      {
        operationName: 'deleteTranscript',
        sessionId,
        continueOnFailure,
      }
    );
  }
}

// Singleton instance
let repositoryInstance: TranscriptRepository | null = null;

/**
 * Get singleton transcript repository instance
 */
export function getTranscriptRepository(): TranscriptRepository {
  if (!repositoryInstance) {
    repositoryInstance = new TranscriptRepository();
  }
  return repositoryInstance;
}
