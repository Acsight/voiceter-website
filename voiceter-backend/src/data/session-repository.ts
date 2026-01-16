/**
 * Session Repository
 * 
 * Handles persistence of session data to DynamoDB demo-sessions table.
 * 
 * Requirements:
 * - REQ-DATA-001: Table 1 schema (demo-sessions)
 * - REQ-DATA-002: Record Session Metadata
 * - 7.4: Store session data in DynamoDB demo-sessions table
 * - 2.1: Create sessions with unique IDs
 * - 11.1: Maintain isolated session state
 * - 11.7: Support concurrent sessions
 */

import * as crypto from 'crypto';
import { getDynamoDBClient } from './dynamodb';
import { getLogger } from '../monitoring/logger';
import {
  withDatabaseErrorHandling,
  withDatabaseErrorHandlingVoid,
} from './error-handler';

const logger = getLogger();

// TTL: 90 days in seconds
const TTL_90_DAYS = 90 * 24 * 60 * 60;

/**
 * Session record stored in DynamoDB
 * 
 * Requirements:
 * - REQ-DATA-001: Table 1 schema
 * - REQ-DATA-002: Session metadata fields
 */
export interface SessionRecord {
  sessionId: string;
  questionnaireId: string;
  questionnaireName?: string;
  currentQuestionIndex: number;
  startTime: string; // ISO 8601
  lastActivityTime: string; // ISO 8601
  status: 'active' | 'completed' | 'abandoned' | 'terminated' | 'error';
  voiceId: string;
  metadata: Record<string, any>;
  // Optional fields per REQ-DATA-002
  endTime?: string; // ISO 8601
  duration?: number; // seconds
  userId?: string;
  completionRate?: number; // 0-100
  ipAddress?: string; // anonymized hash
  userAgent?: string;
  audioFileId?: string; // S3 key for the audio recording file
  ttl?: number; // TTL for auto-deletion
}

/**
 * Anonymize IP address by hashing
 * 
 * Requirements:
 * - REQ-DATA-002: PII anonymized (IP addresses hashed)
 */
export function anonymizeIpAddress(ipAddress: string): string {
  if (!ipAddress) return '';
  return crypto.createHash('sha256').update(ipAddress).digest('hex').substring(0, 16);
}

/**
 * Session Repository for DynamoDB operations
 */
export class SessionRepository {
  private tableName = 'sessions';
  private dynamoClient = getDynamoDBClient();

  /**
   * Create a new session record
   * 
   * Requirements:
   * - REQ-DATA-002: Record session metadata when demo starts
   * - 7.4: Write to demo-sessions table
   * - 2.1: Create session with unique ID
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async createSession(session: SessionRecord, continueOnFailure = false): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        // Add TTL for auto-deletion after 90 days
        const sessionWithTtl = {
          ...session,
          ttl: Math.floor(Date.now() / 1000) + TTL_90_DAYS,
        };

        await this.dynamoClient.putItem(this.tableName, sessionWithTtl);
        
        const duration = Date.now() - startTime;
        logger.info('Session created', {
          sessionId: session.sessionId,
          questionnaireId: session.questionnaireId,
          questionnaireName: session.questionnaireName,
          duration,
        });

        if (duration > 100) {
          logger.warn('Session creation exceeded 100ms threshold', {
            sessionId: session.sessionId,
            duration,
          });
        }
      },
      {
        operationName: 'createSession',
        sessionId: session.sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Create a new session record (alias for backward compatibility)
   */
  async create(session: SessionRecord, continueOnFailure = false): Promise<void> {
    return this.createSession(session, continueOnFailure);
  }

  /**
   * Get a session record by ID
   * 
   * Requirements:
   * - 7.4: Read from demo-sessions table
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async getSession(sessionId: string, continueOnFailure = false): Promise<SessionRecord | null> {
    const startTime = Date.now();
    
    return await withDatabaseErrorHandling(
      async () => {
        const result = await this.dynamoClient.getItem(this.tableName, {
          sessionId,
        });

        const duration = Date.now() - startTime;
        logger.debug('Session retrieved', {
          sessionId,
          found: result !== null,
          duration,
        });

        if (duration > 100) {
          logger.warn('Session retrieval exceeded 100ms threshold', {
            sessionId,
            duration,
          });
        }

        return result as SessionRecord | null;
      },
      {
        operationName: 'getSession',
        sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Get a session record by ID (alias for backward compatibility)
   */
  async get(sessionId: string, continueOnFailure = false): Promise<SessionRecord | null> {
    return this.getSession(sessionId, continueOnFailure);
  }

  /**
   * Update a session record
   * 
   * Requirements:
   * - 7.4: Update session record in demo-sessions table
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async updateSession(
    sessionId: string,
    updates: Partial<SessionRecord>,
    continueOnFailure = true
  ): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        // Remove sessionId from updates if present (can't update partition key)
        const { sessionId: _, ...updateFields } = updates as any;

        await this.dynamoClient.updateItem(
          this.tableName,
          { sessionId },
          updateFields
        );

        const duration = Date.now() - startTime;
        logger.info('Session updated', {
          sessionId,
          duration,
        });

        if (duration > 100) {
          logger.warn('Session update exceeded 100ms threshold', {
            sessionId,
            duration,
          });
        }
      },
      {
        operationName: 'updateSession',
        sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Update a session record (alias for backward compatibility)
   */
  async update(
    sessionId: string,
    updates: Partial<SessionRecord>,
    continueOnFailure = true
  ): Promise<void> {
    return this.updateSession(sessionId, updates, continueOnFailure);
  }

  /**
   * Delete a session record
   * 
   * Requirements:
   * - 7.4: Remove session from demo-sessions table
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async deleteSession(sessionId: string, continueOnFailure = true): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        await this.dynamoClient.deleteItem(this.tableName, { sessionId });

        const duration = Date.now() - startTime;
        logger.info('Session deleted', {
          sessionId,
          duration,
        });

        if (duration > 100) {
          logger.warn('Session deletion exceeded 100ms threshold', {
            sessionId,
            duration,
          });
        }
      },
      {
        operationName: 'deleteSession',
        sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Delete a session record (alias for backward compatibility)
   */
  async delete(sessionId: string, continueOnFailure = true): Promise<void> {
    return this.deleteSession(sessionId, continueOnFailure);
  }

  /**
   * List all active sessions
   * 
   * Queries for sessions with status='active'
   * Uses GSI: status-lastActivityTime-index
   * 
   * Requirements:
   * - 7.4: Query active sessions from demo-sessions table
   * - 11.1: Support concurrent session management
   * - 11.7: Track active sessions
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async listActiveSessions(continueOnFailure = false): Promise<SessionRecord[]> {
    const startTime = Date.now();
    
    const result = await withDatabaseErrorHandling(
      async () => {
        const results = await this.dynamoClient.query(
          this.tableName,
          '#status = :active',
          { ':active': 'active' },
          { '#status': 'status' }
        );

        const duration = Date.now() - startTime;
        logger.debug('Active sessions retrieved', {
          count: results.length,
          duration,
        });

        if (duration > 100) {
          logger.warn('Active sessions query exceeded 100ms threshold', {
            duration,
          });
        }

        return results as SessionRecord[];
      },
      {
        operationName: 'listActiveSessions',
        continueOnFailure,
      }
    );

    return result || [];
  }

  /**
   * Get sessions by questionnaire ID
   * Uses GSI: questionnaireId-startTime-index
   * 
   * Requirements:
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async getByQuestionnaire(
    questionnaireId: string,
    continueOnFailure = false
  ): Promise<SessionRecord[]> {
    const result = await withDatabaseErrorHandling(
      async () => {
        const results = await this.dynamoClient.query(
          this.tableName,
          '#qid = :questionnaireId',
          { ':questionnaireId': questionnaireId },
          { '#qid': 'questionnaireId' }
        );

        logger.debug('Sessions retrieved by questionnaire', {
          questionnaireId,
          count: results.length,
        });

        return results as SessionRecord[];
      },
      {
        operationName: 'getByQuestionnaire',
        continueOnFailure,
      }
    );

    return result || [];
  }
}

// Singleton instance
let repositoryInstance: SessionRepository | null = null;

/**
 * Get singleton session repository instance
 */
export function getSessionRepository(): SessionRepository {
  if (!repositoryInstance) {
    repositoryInstance = new SessionRepository();
  }
  return repositoryInstance;
}
