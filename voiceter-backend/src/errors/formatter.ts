/**
 * Error response formatting utilities.
 * Formats errors for sending to the frontend with sanitized messages.
 */

import { ErrorCode, ERROR_CODES, ERROR_MESSAGES } from './codes';
import { VoiceterError } from './types';

/**
 * Error response structure sent to the frontend.
 */
export interface ErrorResponse {
  event: 'error';
  sessionId: string;
  timestamp: string;
  data: {
    errorCode: ErrorCode;
    errorMessage: string;
    recoverable: boolean;
    retryAfter?: number;
  };
}

/**
 * Formats an error for sending to the frontend.
 * Sanitizes error messages to prevent leaking internal details.
 *
 * @param error - The error to format
 * @param sessionId - The session ID associated with the error
 * @returns Formatted error response safe for frontend
 */
export function formatErrorResponse(
  error: Error | VoiceterError,
  sessionId: string
): ErrorResponse {
  let errorCode: ErrorCode;
  let errorMessage: string;
  let recoverable: boolean;
  let retryAfter: number | undefined;

  if (error instanceof VoiceterError) {
    errorCode = error.code;
    errorMessage = ERROR_MESSAGES[error.code];
    recoverable = error.recoverable;

    // Add retry delay for rate limiting errors
    if (error.code === ERROR_CODES.BEDROCK_RATE_LIMIT || 
        error.code === ERROR_CODES.DB_THROTTLED ||
        error.code === ERROR_CODES.GEMINI_RATE_LIMITED) {
      retryAfter = 5000; // 5 seconds
    }
  } else {
    // Unknown error - use generic internal error
    errorCode = ERROR_CODES.INTERNAL_ERROR;
    errorMessage = ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];
    recoverable = false;
  }

  return {
    event: 'error',
    sessionId,
    timestamp: new Date().toISOString(),
    data: {
      errorCode,
      errorMessage,
      recoverable,
      ...(retryAfter && { retryAfter }),
    },
  };
}

/**
 * Sanitizes an error message for user-facing display.
 * Removes sensitive information and technical details.
 * Requirements: 9.6 - Display user-friendly error messages without exposing technical details
 *
 * @param message - The error message to sanitize
 * @returns Sanitized error message safe for user display
 */
export function sanitizeErrorMessage(message: string): string {
  // If message is empty, return a generic message
  if (!message || message.trim().length === 0) {
    return 'An error occurred';
  }

  let sanitized = message;

  // Remove stack traces (patterns like "at Function (file:line:col)")
  sanitized = sanitized.replace(/at\s+\w+\s*\([^)]*\)/g, '');
  sanitized = sanitized.replace(/at\s+[^\n]+:\d+:\d+/g, '');

  // Remove file paths
  sanitized = sanitized.replace(/\/home\/[^\s]+/g, '[PATH]');
  sanitized = sanitized.replace(/\/app\/[^\s]+/g, '[PATH]');
  sanitized = sanitized.replace(/\/src\/[^\s]+/g, '[PATH]');
  sanitized = sanitized.replace(/C:\\[^\s]+/g, '[PATH]');
  sanitized = sanitized.replace(/\\Users\\[^\s]+/g, '[PATH]');
  sanitized = sanitized.replace(/\/[a-zA-Z0-9_\-./]+\.(ts|js):\d+/g, '[PATH]');
  sanitized = sanitized.replace(/node_modules[^\s]*/g, '[PATH]');

  // Remove credentials and secrets
  sanitized = sanitized.replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]');
  sanitized = sanitized.replace(/secret\s*=\s*[^\s]+/gi, 'secret=[REDACTED]');
  sanitized = sanitized.replace(/AWS_SECRET[^\s]*/gi, '[AWS_CREDENTIAL]');
  sanitized = sanitized.replace(/AWS_ACCESS_KEY[^\s]*/gi, '[AWS_CREDENTIAL]');
  sanitized = sanitized.replace(/AKIA[A-Z0-9]{16}/g, '[AWS_KEY]');
  sanitized = sanitized.replace(/api[_-]?key\s*=\s*[^\s]+/gi, 'api_key=[REDACTED]');
  sanitized = sanitized.replace(/token\s*=\s*[^\s]+/gi, 'token=[REDACTED]');

  // Remove internal IP addresses
  sanitized = sanitized.replace(/192\.168\.\d+\.\d+/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/10\.\d+\.\d+\.\d+/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/localhost:\d+/g, '[LOCALHOST]');
  sanitized = sanitized.replace(/127\.0\.0\.1/g, '[LOCALHOST]');

  // Remove AWS account IDs
  sanitized = sanitized.replace(/\d{12}/g, '[ACCOUNT_ID]');

  // Remove email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // Remove potential API keys or tokens (long alphanumeric strings)
  sanitized = sanitized.replace(/[A-Za-z0-9]{32,}/g, '[TOKEN]');

  // Remove Gemini Live-specific sensitive information
  sanitized = sanitized.replace(/agent_id=[^\s&]*/gi, 'agent_id=[REDACTED]');
  sanitized = sanitized.replace(/conversation_id=[^\s&]*/gi, 'conversation_id=[REDACTED]');
  sanitized = sanitized.replace(/session_id=[^\s&]*/gi, 'session_id=[REDACTED]');
  sanitized = sanitized.replace(/wss:\/\/[^\s]*aiplatform\.googleapis\.com[^\s]*/gi, '[GEMINI_URL]');

  // Remove technical error codes
  sanitized = sanitized.replace(/ECONNREFUSED/g, 'connection refused');
  sanitized = sanitized.replace(/ETIMEDOUT/g, 'connection timed out');
  sanitized = sanitized.replace(/ENOTFOUND/g, 'not found');

  // Remove "Stack trace:" prefix
  sanitized = sanitized.replace(/Stack trace:?/gi, '');

  // Clean up multiple spaces and trim
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Truncate if too long
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  // If sanitization removed everything meaningful, return generic message
  if (sanitized.length === 0 || sanitized === '[PATH]' || sanitized === '[REDACTED]') {
    return 'An error occurred';
  }

  return sanitized;
}

/**
 * Creates a log entry for an error with full context.
 * Requirements: 9.5 - Log all errors with session context for debugging
 *
 * @param error - The error to log
 * @param sessionId - The session ID associated with the error
 * @param additionalContext - Additional context to include in the log
 * @returns Log entry object
 */
export function createErrorLogEntry(
  error: Error | VoiceterError,
  sessionId?: string,
  additionalContext?: Record<string, any>
): Record<string, any> {
  // Determine error code
  let errorCode: string;
  if (error instanceof VoiceterError) {
    errorCode = error.code;
  } else {
    errorCode = ERROR_CODES.INTERNAL_ERROR;
  }

  const logEntry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    sessionId: sessionId || 'unknown',
    errorCode,
    errorMessage: error.message,
    event: 'error_occurred',
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  };

  if (error instanceof VoiceterError) {
    logEntry.error.code = error.code;
    logEntry.error.recoverable = error.recoverable;
    if (error.context) {
      logEntry.error.context = error.context;
    }
  }

  if (additionalContext) {
    // Merge additional context into log entry
    Object.assign(logEntry, additionalContext);
  }

  return logEntry;
}

/**
 * Determines if an error should trigger an immediate session termination.
 *
 * @param error - The error to check
 * @returns true if session should be terminated
 */
export function shouldTerminateSession(error: Error | VoiceterError): boolean {
  if (!(error instanceof VoiceterError)) {
    // Unknown errors should terminate the session
    return true;
  }

  // Non-recoverable errors should terminate the session
  if (!error.recoverable) {
    return true;
  }

  // Specific error codes that should terminate
  const terminatingErrors = new Set<ErrorCode>([
    ERROR_CODES.SESSION_EXPIRED,
    ERROR_CODES.SESSION_NOT_FOUND,
    ERROR_CODES.SESSION_INVALID,
    ERROR_CODES.UNAUTHORIZED,
    ERROR_CODES.FORBIDDEN,
    ERROR_CODES.QUESTIONNAIRE_NOT_FOUND,
    ERROR_CODES.GEMINI_AUTH_FAILED,
    ERROR_CODES.GEMINI_RECONNECTION_FAILED,
    ERROR_CODES.GEMINI_SESSION_NOT_FOUND,
  ]);

  return terminatingErrors.has(error.code);
}
