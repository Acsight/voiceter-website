/**
 * Custom error types for the Voiceter Backend Integration system.
 */

import { ErrorCode, ERROR_CODES, RECOVERABLE_ERRORS } from './codes';

/**
 * Base error class for all Voiceter errors.
 */
export class VoiceterError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, any>;

  constructor(
    code: ErrorCode,
    message: string,
    recoverable?: boolean,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'VoiceterError';
    this.code = code;
    this.recoverable = recoverable ?? RECOVERABLE_ERRORS.has(code);
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * WebSocket-related errors.
 */
export class WebSocketError extends VoiceterError {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.WS_CONNECTION_FAILED,
    recoverable: boolean = true,
    context?: Record<string, any>
  ) {
    super(code, message, recoverable, context);
    this.name = 'WebSocketError';
  }
}

/**
 * Bedrock API-related errors.
 */
export class BedrockError extends VoiceterError {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.BEDROCK_STREAM_ERROR,
    recoverable: boolean = true,
    context?: Record<string, any>
  ) {
    super(code, message, recoverable, context);
    this.name = 'BedrockError';
  }
}

/**
 * Database-related errors.
 */
export class DatabaseError extends VoiceterError {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.DB_WRITE_FAILED,
    recoverable: boolean = true,
    context?: Record<string, any>
  ) {
    super(code, message, recoverable, context);
    this.name = 'DatabaseError';
  }
}

/**
 * Audio processing-related errors.
 */
export class AudioError extends VoiceterError {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.AUDIO_PROCESSING_ERROR,
    recoverable: boolean = true,
    context?: Record<string, any>
  ) {
    super(code, message, recoverable, context);
    this.name = 'AudioError';
  }
}

/**
 * Questionnaire logic-related errors.
 */
export class QuestionnaireError extends VoiceterError {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR,
    recoverable: boolean = true,
    context?: Record<string, any>
  ) {
    super(code, message, recoverable, context);
    this.name = 'QuestionnaireError';
  }
}

/**
 * Tool execution-related errors.
 */
export class ToolError extends VoiceterError {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.TOOL_EXECUTION_ERROR,
    recoverable: boolean = true,
    context?: Record<string, any>
  ) {
    super(code, message, recoverable, context);
    this.name = 'ToolError';
  }
}

/**
 * Session-related errors.
 */
export class SessionError extends VoiceterError {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.SESSION_INVALID,
    recoverable: boolean = false,
    context?: Record<string, any>
  ) {
    super(code, message, recoverable, context);
    this.name = 'SessionError';
  }
}

/**
 * Gemini Live API-related errors.
 *
 * Used for all errors related to Gemini Live API integration,
 * including connection failures, authentication errors, streaming errors,
 * and tool execution errors.
 *
 * _Requirements: 8.1_
 */
export class GeminiLiveError extends VoiceterError {
  /** Session ID associated with this error */
  public readonly sessionId?: string;

  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.GEMINI_STREAM_ERROR,
    recoverable: boolean = true,
    context?: Record<string, any>,
    sessionId?: string
  ) {
    super(code, message, recoverable, context);
    this.name = 'GeminiLiveError';
    this.sessionId = sessionId;
  }

  /**
   * Create a GeminiLiveError from an unknown error
   */
  static fromError(
    error: unknown,
    sessionId?: string,
    defaultCode: ErrorCode = ERROR_CODES.GEMINI_STREAM_ERROR
  ): GeminiLiveError {
    if (error instanceof GeminiLiveError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    return new GeminiLiveError(
      message,
      defaultCode,
      RECOVERABLE_ERRORS.has(defaultCode),
      { originalError: message, stack },
      sessionId
    );
  }

  /**
   * Create a connection failed error
   */
  static connectionFailed(message: string, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      message,
      ERROR_CODES.GEMINI_CONNECTION_FAILED,
      true,
      undefined,
      sessionId
    );
  }

  /**
   * Create an authentication failed error
   */
  static authFailed(message: string, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      message,
      ERROR_CODES.GEMINI_AUTH_FAILED,
      false,
      undefined,
      sessionId
    );
  }

  /**
   * Create a rate limited error
   */
  static rateLimited(message: string, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      message,
      ERROR_CODES.GEMINI_RATE_LIMITED,
      true,
      undefined,
      sessionId
    );
  }

  /**
   * Create a stream error
   */
  static streamError(message: string, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      message,
      ERROR_CODES.GEMINI_STREAM_ERROR,
      true,
      undefined,
      sessionId
    );
  }

  /**
   * Create a tool timeout error
   */
  static toolTimeout(toolName: string, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      `Tool '${toolName}' execution timed out`,
      ERROR_CODES.GEMINI_TOOL_TIMEOUT,
      true,
      { toolName },
      sessionId
    );
  }

  /**
   * Create a tool error
   */
  static toolError(toolName: string, message: string, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      message,
      ERROR_CODES.GEMINI_TOOL_ERROR,
      true,
      { toolName },
      sessionId
    );
  }

  /**
   * Create a reconnection failed error
   */
  static reconnectionFailed(retryCount: number, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      `Failed to reconnect after ${retryCount} attempts`,
      ERROR_CODES.GEMINI_RECONNECTION_FAILED,
      false,
      { retryCount },
      sessionId
    );
  }

  /**
   * Create a go away error (server requested disconnect)
   */
  static goAway(timeLeft: string, sessionId?: string): GeminiLiveError {
    return new GeminiLiveError(
      `Server requested disconnect, time left: ${timeLeft}`,
      ERROR_CODES.GEMINI_GO_AWAY,
      true,
      { timeLeft },
      sessionId
    );
  }

  /**
   * Create a session not found error
   */
  static sessionNotFound(sessionId: string): GeminiLiveError {
    return new GeminiLiveError(
      `Gemini session '${sessionId}' not found`,
      ERROR_CODES.GEMINI_SESSION_NOT_FOUND,
      false,
      undefined,
      sessionId
    );
  }
}


