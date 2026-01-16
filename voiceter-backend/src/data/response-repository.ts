/**
 * Response Repository
 * 
 * Handles persistence of survey responses to DynamoDB demo-responses table.
 * 
 * Requirements:
 * - REQ-DATA-001: Table 2 schema (demo-responses)
 * - REQ-DATA-003: Store Survey Responses
 * - 4.5: Save responses to DynamoDB demo-responses table
 * - 7.3: Store response data with sessionId, questionId, response, and timestamp
 * - 6.8: Update session state with responses for logic evaluation
 */

import { getDynamoDBClient } from './dynamodb';
import { ResponseRecord } from './types';
import { getLogger } from '../monitoring/logger';
import {
  withDatabaseErrorHandling,
  withDatabaseErrorHandlingVoid,
} from './error-handler';

const logger = getLogger();

// TTL: 90 days in seconds
const TTL_90_DAYS = 90 * 24 * 60 * 60;

/**
 * Response Repository for DynamoDB operations
 */
export class ResponseRepository {
  private tableName = 'responses';
  private dynamoClient = getDynamoDBClient();

  /**
   * Save a response record
   * 
   * Requirements:
   * - REQ-DATA-003: Store structured responses when answers are validated
   * - 4.5: Write to demo-responses table when record_response tool executes
   * - 7.3: Store sessionId, questionId, response, responseType, and timestamp
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   * 
   * Note: AWS table uses responseId as primary key (not composite key)
   */
  async saveResponse(response: ResponseRecord, continueOnFailure = true): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        // Generate responseId as primary key (matches existing AWS schema)
        const responseId = `${response.sessionId}-${response.questionId}-${Date.now()}`;
        
        // Include all REQ-DATA-003 required fields
        const record = {
          responseId, // Primary key for existing AWS table
          sessionId: response.sessionId,
          questionId: response.questionId,
          questionNumber: response.questionNumber,
          questionType: response.questionType,
          questionText: response.questionText,
          response: response.response,
          responseType: response.responseType || 'structured',
          timestamp: response.timestamp,
          responseTime: response.responseTime,
          clarificationCount: response.clarificationCount || 0,
          metadata: response.metadata || {},
          ttl: Math.floor(Date.now() / 1000) + TTL_90_DAYS,
        };

        await this.dynamoClient.putItem(this.tableName, record);
        
        const duration = Date.now() - startTime;
        logger.info('Response saved', {
          sessionId: response.sessionId,
          questionId: response.questionId,
          questionNumber: response.questionNumber,
          responseType: response.responseType,
          duration,
        });

        if (duration > 100) {
          logger.warn('Response save exceeded 100ms threshold', {
            sessionId: response.sessionId,
            questionId: response.questionId,
            duration,
          });
        }
      },
      {
        operationName: 'saveResponse',
        sessionId: response.sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Save a response record (alias for backward compatibility)
   */
  async create(response: ResponseRecord, continueOnFailure = true): Promise<void> {
    return this.saveResponse(response, continueOnFailure);
  }

  /**
   * Get all responses for a session
   * 
   * Queries by sessionId (partition key) to retrieve all responses
   * for a given session. Results are ordered by questionId (sort key).
   * 
   * Requirements:
   * - 7.3: Query responses by sessionId
   * - 6.8: Retrieve responses for logic evaluation
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async getResponses(sessionId: string, continueOnFailure = false): Promise<ResponseRecord[]> {
    const startTime = Date.now();
    
    const result = await withDatabaseErrorHandling(
      async () => {
        const results = await this.dynamoClient.query(
          this.tableName,
          'sessionId = :sessionId',
          { ':sessionId': sessionId }
        );

        const duration = Date.now() - startTime;
        logger.debug('Responses retrieved', {
          sessionId,
          count: results.length,
          duration,
        });

        if (duration > 100) {
          logger.warn('Response retrieval exceeded 100ms threshold', {
            sessionId,
            duration,
          });
        }

        return results as ResponseRecord[];
      },
      {
        operationName: 'getResponses',
        sessionId,
        continueOnFailure,
      }
    );

    return result || [];
  }

  /**
   * Get a specific response for a session and question
   * 
   * Retrieves a single response using both sessionId (partition key)
   * and questionId (sort key).
   * 
   * Requirements:
   * - 7.3: Get specific response by sessionId and questionId
   * - 6.8: Retrieve specific response for logic evaluation
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async getResponse(
    sessionId: string,
    questionId: string,
    continueOnFailure = false
  ): Promise<ResponseRecord | null> {
    const startTime = Date.now();
    
    return await withDatabaseErrorHandling(
      async () => {
        const result = await this.dynamoClient.getItem(this.tableName, {
          sessionId,
          questionId,
        });

        const duration = Date.now() - startTime;
        logger.debug('Response retrieved', {
          sessionId,
          questionId,
          found: result !== null,
          duration,
        });

        if (duration > 100) {
          logger.warn('Response retrieval exceeded 100ms threshold', {
            sessionId,
            questionId,
            duration,
          });
        }

        return result as ResponseRecord | null;
      },
      {
        operationName: 'getResponse',
        sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Delete all responses for a session
   * 
   * Note: This requires querying first to get all questionIds,
   * then deleting each item individually since DynamoDB doesn't
   * support batch delete by partition key only.
   * 
   * Requirements:
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async deleteResponses(sessionId: string, continueOnFailure = true): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        // First, get all responses for the session
        const responses = await this.getResponses(sessionId, continueOnFailure);

        // Delete each response
        for (const response of responses) {
          await this.dynamoClient.deleteItem(this.tableName, {
            sessionId: response.sessionId,
            questionId: response.questionId,
          });
        }

        const duration = Date.now() - startTime;
        logger.info('Responses deleted', {
          sessionId,
          count: responses.length,
          duration,
        });
      },
      {
        operationName: 'deleteResponses',
        sessionId,
        continueOnFailure,
      }
    );
  }

  /**
   * Delete a specific response
   * 
   * Requirements:
   * - 7.6: Retry on transient errors (handled by DynamoDBClientWrapper)
   * - 7.7: Continue session on database failure
   */
  async deleteResponse(
    sessionId: string,
    questionId: string,
    continueOnFailure = true
  ): Promise<void> {
    const startTime = Date.now();
    
    await withDatabaseErrorHandlingVoid(
      async () => {
        await this.dynamoClient.deleteItem(this.tableName, {
          sessionId,
          questionId,
        });

        const duration = Date.now() - startTime;
        logger.info('Response deleted', {
          sessionId,
          questionId,
          duration,
        });
      },
      {
        operationName: 'deleteResponse',
        sessionId,
        continueOnFailure,
      }
    );
  }
}

// Singleton instance
let repositoryInstance: ResponseRepository | null = null;

/**
 * Get singleton response repository instance
 */
export function getResponseRepository(): ResponseRepository {
  if (!repositoryInstance) {
    repositoryInstance = new ResponseRepository();
  }
  return repositoryInstance;
}
