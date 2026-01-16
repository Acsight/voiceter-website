/**
 * Error codes for the Voiceter Backend Integration system.
 * These codes are used to identify specific error types and provide
 * appropriate error handling and user-facing messages.
 */

export const ERROR_CODES = {
  // WebSocket Errors
  WS_CONNECTION_FAILED: 'WS_CONNECTION_FAILED',
  WS_MESSAGE_INVALID: 'WS_MESSAGE_INVALID',
  WS_DISCONNECTED: 'WS_DISCONNECTED',
  WS_RECONNECTION_FAILED: 'WS_RECONNECTION_FAILED',
  WS_RATE_LIMIT_EXCEEDED: 'WS_RATE_LIMIT_EXCEEDED',

  // Bedrock API Errors
  BEDROCK_INIT_FAILED: 'BEDROCK_INIT_FAILED',
  BEDROCK_STREAM_ERROR: 'BEDROCK_STREAM_ERROR',
  BEDROCK_RATE_LIMIT: 'BEDROCK_RATE_LIMIT',
  BEDROCK_MODEL_ERROR: 'BEDROCK_MODEL_ERROR',
  BEDROCK_TIMEOUT: 'BEDROCK_TIMEOUT',

  // Database Errors
  DB_WRITE_FAILED: 'DB_WRITE_FAILED',
  DB_READ_FAILED: 'DB_READ_FAILED',
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_THROTTLED: 'DB_THROTTLED',

  // Audio Processing Errors
  AUDIO_PROCESSING_ERROR: 'AUDIO_PROCESSING_ERROR',
  AUDIO_FORMAT_INVALID: 'AUDIO_FORMAT_INVALID',
  AUDIO_ENCODING_ERROR: 'AUDIO_ENCODING_ERROR',
  AUDIO_DECODING_ERROR: 'AUDIO_DECODING_ERROR',

  // Questionnaire Logic Errors
  QUESTIONNAIRE_LOGIC_ERROR: 'QUESTIONNAIRE_LOGIC_ERROR',
  QUESTIONNAIRE_NOT_FOUND: 'QUESTIONNAIRE_NOT_FOUND',
  QUESTION_NOT_FOUND: 'QUESTION_NOT_FOUND',
  INVALID_RESPONSE: 'INVALID_RESPONSE',

  // Tool Execution Errors
  TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  TOOL_INVALID_PARAMS: 'TOOL_INVALID_PARAMS',

  // Gemini Live API Errors
  GEMINI_CONNECTION_FAILED: 'GEMINI_CONNECTION_FAILED',
  GEMINI_AUTH_FAILED: 'GEMINI_AUTH_FAILED',
  GEMINI_RATE_LIMITED: 'GEMINI_RATE_LIMITED',
  GEMINI_STREAM_ERROR: 'GEMINI_STREAM_ERROR',
  GEMINI_TOOL_TIMEOUT: 'GEMINI_TOOL_TIMEOUT',
  GEMINI_TOOL_ERROR: 'GEMINI_TOOL_ERROR',
  GEMINI_RECONNECTION_FAILED: 'GEMINI_RECONNECTION_FAILED',
  GEMINI_INVALID_MESSAGE: 'GEMINI_INVALID_MESSAGE',
  GEMINI_SESSION_NOT_FOUND: 'GEMINI_SESSION_NOT_FOUND',
  GEMINI_GO_AWAY: 'GEMINI_GO_AWAY',

  // Session Errors
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_INVALID: 'SESSION_INVALID',

  // General Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * User-friendly error messages for each error code.
 * These messages are safe to send to the frontend.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // WebSocket Errors
  [ERROR_CODES.WS_CONNECTION_FAILED]:
    'Unable to establish connection. Please check your internet connection and try again.',
  [ERROR_CODES.WS_MESSAGE_INVALID]:
    'Invalid message format. Please refresh the page and try again.',
  [ERROR_CODES.WS_DISCONNECTED]:
    'Connection lost. Attempting to reconnect...',
  [ERROR_CODES.WS_RECONNECTION_FAILED]:
    'Unable to reconnect. Please refresh the page to start a new session.',
  [ERROR_CODES.WS_RATE_LIMIT_EXCEEDED]:
    'Too many messages sent. Please slow down and try again.',

  // Bedrock API Errors
  [ERROR_CODES.BEDROCK_INIT_FAILED]:
    'Unable to initialize voice service. Please try again later.',
  [ERROR_CODES.BEDROCK_STREAM_ERROR]:
    'Voice service error occurred. Please try again.',
  [ERROR_CODES.BEDROCK_RATE_LIMIT]:
    'Service is currently busy. Please try again in a few moments.',
  [ERROR_CODES.BEDROCK_MODEL_ERROR]:
    'Voice model error occurred. Please try again later.',
  [ERROR_CODES.BEDROCK_TIMEOUT]:
    'Voice service timed out. Please try again.',

  // Database Errors
  [ERROR_CODES.DB_WRITE_FAILED]:
    'Unable to save your response. Please try again.',
  [ERROR_CODES.DB_READ_FAILED]:
    'Unable to retrieve data. Please try again.',
  [ERROR_CODES.DB_CONNECTION_FAILED]:
    'Database connection error. Please try again later.',
  [ERROR_CODES.DB_THROTTLED]:
    'Service is currently busy. Please try again in a few moments.',

  // Audio Processing Errors
  [ERROR_CODES.AUDIO_PROCESSING_ERROR]:
    'Audio processing error occurred. Please check your microphone and try again.',
  [ERROR_CODES.AUDIO_FORMAT_INVALID]:
    'Invalid audio format. Please check your microphone settings.',
  [ERROR_CODES.AUDIO_ENCODING_ERROR]:
    'Audio encoding error. Please try again.',
  [ERROR_CODES.AUDIO_DECODING_ERROR]:
    'Audio decoding error. Please try again.',

  // Questionnaire Logic Errors
  [ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR]:
    'Survey logic error occurred. Continuing with next question.',
  [ERROR_CODES.QUESTIONNAIRE_NOT_FOUND]:
    'Survey not found. Please select a different demo.',
  [ERROR_CODES.QUESTION_NOT_FOUND]:
    'Question not found. Please try again.',
  [ERROR_CODES.INVALID_RESPONSE]:
    'Invalid response format. Please try again.',

  // Tool Execution Errors
  [ERROR_CODES.TOOL_EXECUTION_ERROR]:
    'An error occurred while processing your response. Please try again.',
  [ERROR_CODES.TOOL_NOT_FOUND]:
    'Service function not found. Please try again.',
  [ERROR_CODES.TOOL_TIMEOUT]:
    'Processing timed out. Please try again.',
  [ERROR_CODES.TOOL_INVALID_PARAMS]:
    'Invalid parameters. Please try again.',

  // Gemini Live API Errors
  [ERROR_CODES.GEMINI_CONNECTION_FAILED]:
    'Unable to connect to voice service. Please try again later.',
  [ERROR_CODES.GEMINI_AUTH_FAILED]:
    'Voice service authentication failed. Please contact support.',
  [ERROR_CODES.GEMINI_RATE_LIMITED]:
    'Voice service is currently busy. Please try again in a few moments.',
  [ERROR_CODES.GEMINI_STREAM_ERROR]:
    'Voice streaming error occurred. Please try again.',
  [ERROR_CODES.GEMINI_TOOL_TIMEOUT]:
    'Tool execution timed out. Please try again.',
  [ERROR_CODES.GEMINI_TOOL_ERROR]:
    'Tool execution failed. Please try again.',
  [ERROR_CODES.GEMINI_RECONNECTION_FAILED]:
    'Unable to reconnect to voice service. Please refresh the page.',
  [ERROR_CODES.GEMINI_INVALID_MESSAGE]:
    'Invalid message received from voice service. Please try again.',
  [ERROR_CODES.GEMINI_SESSION_NOT_FOUND]:
    'Voice session not found. Please start a new session.',
  [ERROR_CODES.GEMINI_GO_AWAY]:
    'Voice service is restarting. Reconnecting...',

  // Session Errors
  [ERROR_CODES.SESSION_EXPIRED]:
    'Your session has expired. Please start a new demo.',
  [ERROR_CODES.SESSION_NOT_FOUND]:
    'Session not found. Please start a new demo.',
  [ERROR_CODES.SESSION_INVALID]:
    'Invalid session. Please start a new demo.',

  // General Errors
  [ERROR_CODES.INTERNAL_ERROR]:
    'An unexpected error occurred. Please try again later.',
  [ERROR_CODES.VALIDATION_ERROR]:
    'Validation error. Please check your input and try again.',
  [ERROR_CODES.TIMEOUT_ERROR]:
    'Request timed out. Please try again.',
  [ERROR_CODES.UNAUTHORIZED]:
    'Unauthorized access. Please log in and try again.',
  [ERROR_CODES.FORBIDDEN]:
    'Access forbidden. You do not have permission to perform this action.',
};

/**
 * Determines if an error is recoverable (user can retry).
 */
export const RECOVERABLE_ERRORS: Set<ErrorCode> = new Set([
  ERROR_CODES.WS_DISCONNECTED,
  ERROR_CODES.BEDROCK_RATE_LIMIT,
  ERROR_CODES.BEDROCK_TIMEOUT,
  ERROR_CODES.DB_WRITE_FAILED,
  ERROR_CODES.DB_READ_FAILED,
  ERROR_CODES.DB_THROTTLED,
  ERROR_CODES.AUDIO_PROCESSING_ERROR,
  ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR,
  ERROR_CODES.TOOL_EXECUTION_ERROR,
  ERROR_CODES.TOOL_TIMEOUT,
  ERROR_CODES.TIMEOUT_ERROR,
  ERROR_CODES.GEMINI_RATE_LIMITED,
  ERROR_CODES.GEMINI_STREAM_ERROR,
  ERROR_CODES.GEMINI_TOOL_TIMEOUT,
  ERROR_CODES.GEMINI_TOOL_ERROR,
  ERROR_CODES.GEMINI_GO_AWAY,
]);

/**
 * Get the error code from an error object.
 * Returns INTERNAL_ERROR for unknown errors.
 *
 * @param error - The error object
 * @returns The error code
 */
export function getErrorCode(error: Error): ErrorCode {
  if ('code' in error && typeof error.code === 'string') {
    // Check if it's a valid error code
    const errorCode = error.code as ErrorCode;
    if (Object.values(ERROR_CODES).includes(errorCode)) {
      return errorCode;
    }
  }
  return ERROR_CODES.INTERNAL_ERROR;
}

/**
 * Get a user-friendly error message for an error code.
 *
 * @param errorCode - The error code
 * @returns User-friendly error message
 */
export function getUserFriendlyMessage(errorCode: ErrorCode): string {
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];
}
