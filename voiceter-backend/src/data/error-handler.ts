/**
 * Database Error Handler
 * 
 * Provides error handling wrapper for database operations that ensures
 * session continuation even when database operations fail.
 * 
 * This module implements a two-layer error handling strategy:
 * 
 * 1. **Retry Layer (DynamoDBClientWrapper)**: 
 *    - Automatically retries transient errors (throttling, timeouts, network issues)
 *    - Uses exponential backoff (100ms, 200ms, 400ms, up to 10s max)
 *    - Retries up to 3 times before giving up
 * 
 * 2. **Continuation Layer (this module)**:
 *    - Wraps database operations with error handling
 *    - Logs errors with full context (sessionId, operation, error details)
 *    - Optionally continues session on failure (returns null instead of throwing)
 *    - Allows critical operations to fail (continueOnFailure=false)
 * 
 * Usage Examples:
 * 
 * ```typescript
 * // Critical operation - must succeed or throw
 * await withDatabaseErrorHandlingVoid(
 *   async () => await dynamoClient.putItem(table, item),
 *   {
 *     operationName: 'createSession',
 *     sessionId: 'abc123',
 *     continueOnFailure: false  // Throw on failure
 *   }
 * );
 * 
 * // Non-critical operation - continue session on failure
 * await withDatabaseErrorHandlingVoid(
 *   async () => await dynamoClient.updateItem(table, key, updates),
 *   {
 *     operationName: 'updateSession',
 *     sessionId: 'abc123',
 *     continueOnFailure: true  // Log error but don't throw
 *   }
 * );
 * 
 * // Query operation - return empty array on failure
 * const results = await withDatabaseErrorHandling(
 *   async () => await dynamoClient.query(table, condition),
 *   {
 *     operationName: 'getResponses',
 *     sessionId: 'abc123',
 *     continueOnFailure: true
 *   }
 * );
 * return results || [];  // Return empty array if null
 * ```
 * 
 * Requirements:
 * - 7.6: Retry on transient errors (throttling, timeouts) - handled by DynamoDBClientWrapper
 * - 7.7: Continue session on database failure - handled by continueOnFailure flag
 * - 8.6: Handle database errors gracefully with retry logic - both layers work together
 */

import { getLogger } from '../monitoring/logger';
import { ERROR_CODES } from '../errors/codes';

const logger = getLogger();

/**
 * Database error types that should trigger retry
 */
const RETRYABLE_ERROR_PATTERNS = [
  'ThrottlingException',
  'ProvisionedThroughputExceededException',
  'RequestLimitExceeded',
  'ServiceUnavailable',
  'InternalServerError',
  'NetworkingError',
  'TimeoutError',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
];

/**
 * Check if an error is a transient database error that should be retried
 */
export function isTransientDatabaseError(error: Error): boolean {
  return RETRYABLE_ERROR_PATTERNS.some(
    (pattern) =>
      error.name === pattern ||
      error.message.includes(pattern) ||
      (error as any).code === pattern
  );
}

/**
 * Options for database operation wrapper
 */
export interface DatabaseOperationOptions {
  operationName: string;
  sessionId?: string;
  continueOnFailure?: boolean;
  logLevel?: 'error' | 'warn';
}

/**
 * Wrap a database operation with error handling
 * 
 * This wrapper:
 * 1. Executes the database operation
 * 2. Logs errors with full context
 * 3. Optionally continues session on failure (returns null/undefined instead of throwing)
 * 4. Provides consistent error handling across all database operations
 * 
 * Requirements:
 * - 7.6: Retry is handled by DynamoDBClientWrapper
 * - 7.7: Continue session on database failure when continueOnFailure=true
 * - 8.6: Log errors with full context
 * 
 * @param operation - The database operation to execute
 * @param options - Configuration options
 * @returns The result of the operation, or null/undefined if continueOnFailure is true and operation fails
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  options: DatabaseOperationOptions
): Promise<T | null> {
  const {
    operationName,
    sessionId,
    continueOnFailure = false,
    logLevel = 'error',
  } = options;

  try {
    return await operation();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const isTransient = error instanceof Error && isTransientDatabaseError(error);

    // Build log context
    const logContext: Record<string, any> = {
      operation: operationName,
      error: errorMessage,
      errorName,
      isTransient,
      continueOnFailure,
    };

    if (sessionId) {
      logContext.sessionId = sessionId;
    }

    // Log the error
    if (logLevel === 'error') {
      logger.error(`Database operation failed: ${operationName}`, logContext);
    } else {
      logger.warn(`Database operation failed: ${operationName}`, logContext);
    }

    // If continueOnFailure is true, return null instead of throwing
    // This allows the session to continue even if database operations fail
    if (continueOnFailure) {
      logger.info(`Continuing session despite database failure: ${operationName}`, {
        sessionId,
        operation: operationName,
      });
      return null;
    }

    // Otherwise, re-throw the error
    throw error;
  }
}

/**
 * Wrap a void database operation with error handling
 * 
 * Similar to withDatabaseErrorHandling but for operations that don't return a value.
 * When continueOnFailure is true and the operation fails, it logs the error and returns
 * without throwing.
 * 
 * @param operation - The database operation to execute
 * @param options - Configuration options
 */
export async function withDatabaseErrorHandlingVoid(
  operation: () => Promise<void>,
  options: DatabaseOperationOptions
): Promise<void> {
  const {
    operationName,
    sessionId,
    continueOnFailure = false,
    logLevel = 'error',
  } = options;

  try {
    await operation();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const isTransient = error instanceof Error && isTransientDatabaseError(error);

    // Build log context
    const logContext: Record<string, any> = {
      operation: operationName,
      error: errorMessage,
      errorName,
      isTransient,
      continueOnFailure,
    };

    if (sessionId) {
      logContext.sessionId = sessionId;
    }

    // Log the error
    if (logLevel === 'error') {
      logger.error(`Database operation failed: ${operationName}`, logContext);
    } else {
      logger.warn(`Database operation failed: ${operationName}`, logContext);
    }

    // If continueOnFailure is true, return without throwing
    // This allows the session to continue even if database operations fail
    if (continueOnFailure) {
      logger.info(`Continuing session despite database failure: ${operationName}`, {
        sessionId,
        operation: operationName,
      });
      return;
    }

    // Otherwise, re-throw the error
    throw error;
  }
}

/**
 * Get database error code for error reporting
 */
export function getDatabaseErrorCode(error: Error): string {
  if (isTransientDatabaseError(error)) {
    if (error.name.includes('Throttl') || error.message.includes('Throttl')) {
      return ERROR_CODES.DB_THROTTLED;
    }
    return ERROR_CODES.DB_CONNECTION_FAILED;
  }
  return ERROR_CODES.DB_WRITE_FAILED;
}
