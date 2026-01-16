/**
 * Error handler middleware for the Voiceter Backend Integration system.
 * Provides centralized error handling for all error types.
 */

import { Socket } from 'socket.io';
import { ERROR_CODES, ErrorCode, getErrorCode, RECOVERABLE_ERRORS } from './codes';
import {
  VoiceterError,
  WebSocketError,
  BedrockError,
  DatabaseError,
  AudioError,
  QuestionnaireError,
  ToolError,
  GeminiLiveError,
} from './types';
import {
  formatErrorResponse,
  createErrorLogEntry,
  shouldTerminateSession,
} from './formatter';

/**
 * Logger interface for error handling.
 */
interface Logger {
  error(message: string, context?: Record<string, any>, error?: Error): void;
  warn(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
}

/**
 * Metrics emitter interface for error handling.
 */
interface MetricsEmitter {
  emitError(errorCode?: string): Promise<void>;
}

/**
 * Session manager interface for error handling.
 */
interface SessionManager {
  deleteSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<any>;
}

/**
 * Error context for handling errors.
 */
export interface ErrorContext {
  sessionId?: string;
  socket?: Socket;
  operation?: () => Promise<void>;
  retryCount?: number;
  sessionManager?: SessionManager;
  additionalContext?: Record<string, any>;
}

/**
 * Error handler configuration.
 */
export interface ErrorHandlerConfig {
  logger: Logger;
  metricsEmitter?: MetricsEmitter;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Error handler class that provides centralized error handling.
 */
export class ErrorHandler {
  private logger: Logger;
  private metricsEmitter?: MetricsEmitter;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: ErrorHandlerConfig) {
    this.logger = config.logger;
    this.metricsEmitter = config.metricsEmitter;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  /**
   * Main error handling method with logging, metrics, and propagation.
   * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.7
   *
   * @param error - The error that occurred
   * @param context - Error context including sessionId, socket, etc.
   */
  async handleError(error: Error, context: ErrorContext): Promise<void> {
    const { sessionId, socket, operation, retryCount = 0, sessionManager, additionalContext } = context;

    // 1. Log error with full context (Requirement 8.1)
    this.logger.error(
      'Error occurred',
      createErrorLogEntry(error, sessionId, {
        ...additionalContext,
        retryCount,
      }),
      error
    );

    // 2. Emit CloudWatch metric (Requirement 8.1)
    if (this.metricsEmitter) {
      const errorCode = getErrorCode(error);
      await this.metricsEmitter.emitError(errorCode);
    }

    // 3. Determine if error is recoverable (Requirement 8.2, 8.3)
    const recoverable = this.isRecoverable(error);

    // 4. Send user-friendly error to client (Requirement 8.2)
    if (socket && socket.connected && sessionId) {
      const errorResponse = formatErrorResponse(error, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // 5. Attempt recovery if possible (Requirement 8.3, 8.6)
    if (recoverable && operation && retryCount < this.maxRetries) {
      await this.attemptRecovery(error, context);
      return;
    }

    // 6. Clean up session if not recoverable (Requirement 8.4, 8.7)
    if (!recoverable || shouldTerminateSession(error)) {
      if (sessionId && sessionManager) {
        await this.cleanupSession(sessionId, sessionManager, socket);
      } else if (socket) {
        this.terminateSession(socket, sessionId || 'unknown');
      }
    }
  }

  /**
   * Determines if an error is recoverable.
   * Validates: Requirements 8.2, 8.3
   *
   * @param error - The error to check
   * @returns true if error is recoverable
   */
  isRecoverable(error: Error): boolean {
    // Check if it's a VoiceterError with recoverable flag
    if (error instanceof VoiceterError) {
      return error.recoverable;
    }

    // Check if error code is in recoverable set
    const errorCode = getErrorCode(error);
    return RECOVERABLE_ERRORS.has(errorCode);
  }

  /**
   * Attempts recovery for recoverable errors.
   * Validates: Requirements 8.3, 8.6
   *
   * @param _error - The error that occurred (unused, kept for interface consistency)
   * @param context - Error context
   */
  async attemptRecovery(_error: Error, context: ErrorContext): Promise<void> {
    const { sessionId, operation, retryCount = 0 } = context;

    if (!operation) {
      this.logger.warn('No operation provided for recovery attempt', { sessionId });
      return;
    }

    // Calculate exponential backoff delay (Requirement 7.6, 8.6)
    const delay = Math.min(this.retryDelay * Math.pow(2, retryCount), 10000);

    this.logger.info(`Attempting recovery after ${delay}ms`, {
      sessionId,
      retryCount: retryCount + 1,
      maxRetries: this.maxRetries,
    });

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // Retry the operation
      await operation();
      this.logger.info('Recovery successful', { sessionId, retryCount: retryCount + 1 });
    } catch (retryError) {
      // Recursively handle the retry error
      await this.handleError(retryError as Error, {
        ...context,
        retryCount: retryCount + 1,
      });
    }
  }

  /**
   * Cleans up session for non-recoverable errors.
   * Validates: Requirements 8.4, 8.7
   *
   * @param sessionId - The session ID to clean up
   * @param sessionManager - Session manager instance
   * @param socket - Optional socket to disconnect
   */
  async cleanupSession(
    sessionId: string,
    sessionManager: SessionManager,
    socket?: Socket
  ): Promise<void> {
    this.logger.info('Cleaning up session due to non-recoverable error', { sessionId });

    try {
      // Check if session exists
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        this.logger.warn('Session not found during cleanup', { sessionId });
        return;
      }

      // Delete session from storage
      await sessionManager.deleteSession(sessionId);

      this.logger.info('Session cleaned up successfully', { sessionId });

      // Terminate socket connection if provided
      if (socket) {
        this.terminateSession(socket, sessionId);
      }
    } catch (cleanupError) {
      // Log cleanup error but don't throw (Requirement 8.7)
      this.logger.error(
        'Error during session cleanup',
        {
          sessionId,
          cleanupError: (cleanupError as Error).message,
        },
        cleanupError as Error
      );

      // Still try to terminate socket
      if (socket) {
        this.terminateSession(socket, sessionId);
      }
    }
  }

  /**
   * Handles WebSocket errors.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   */
  handleWebSocketError(err: Error, socket: Socket, sessionId: string): void {
    const error = err;
    const wsError =
      error instanceof WebSocketError
        ? error
        : new WebSocketError(error.message, ERROR_CODES.WS_CONNECTION_FAILED, true, {
            originalError: error.message,
          });

    // Log the error with full context
    this.logger.error('WebSocket error occurred', createErrorLogEntry(wsError, sessionId));

    // Send error response to client if socket is still connected
    if (socket.connected) {
      const errorResponse = formatErrorResponse(wsError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Don't terminate session for recoverable WebSocket errors
    if (!wsError.recoverable) {
      this.terminateSession(socket, sessionId);
    }
  }

  /**
   * Handles Bedrock API errors with retry logic.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   * @param operation - The operation that failed (for retry)
   * @param retryCount - Current retry count
   */
  async handleBedrockError(
    error: Error,
    socket: Socket,
    sessionId: string,
    operation?: () => Promise<void>,
    retryCount: number = 0
  ): Promise<void> {
    const bedrockError =
      error instanceof BedrockError
        ? error
        : new BedrockError(error.message, ERROR_CODES.BEDROCK_STREAM_ERROR, true, {
            originalError: error.message,
          });

    // Log the error
    this.logger.error('Bedrock API error occurred', createErrorLogEntry(bedrockError, sessionId, {
      retryCount,
    }));

    // Check if we should retry
    const shouldRetry =
      bedrockError.recoverable &&
      retryCount < this.maxRetries &&
      operation &&
      (bedrockError.code === ERROR_CODES.BEDROCK_RATE_LIMIT ||
        bedrockError.code === ERROR_CODES.BEDROCK_TIMEOUT);

    if (shouldRetry) {
      // Calculate exponential backoff delay
      const delay = this.retryDelay * Math.pow(2, retryCount);
      this.logger.info(`Retrying Bedrock operation after ${delay}ms`, { sessionId, retryCount });

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await operation();
        return;
      } catch (retryError) {
        return this.handleBedrockError(
          retryError as Error,
          socket,
          sessionId,
          operation,
          retryCount + 1
        );
      }
    }

    // Send error response to client
    if (socket.connected) {
      const errorResponse = formatErrorResponse(bedrockError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Terminate session if error is not recoverable
    if (shouldTerminateSession(bedrockError)) {
      this.terminateSession(socket, sessionId);
    }
  }

  /**
   * Handles DynamoDB errors with retry logic.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   * @param operation - The operation that failed (for retry)
   * @param retryCount - Current retry count
   */
  async handleDatabaseError(
    error: Error,
    socket: Socket,
    sessionId: string,
    operation?: () => Promise<void>,
    retryCount: number = 0
  ): Promise<void> {
    const dbError =
      error instanceof DatabaseError
        ? error
        : new DatabaseError(error.message, ERROR_CODES.DB_WRITE_FAILED, true, {
            originalError: error.message,
          });

    // Log the error
    this.logger.error('Database error occurred', createErrorLogEntry(dbError, sessionId, {
      retryCount,
    }));

    // Check if we should retry
    const shouldRetry =
      dbError.recoverable &&
      retryCount < this.maxRetries &&
      operation &&
      (dbError.code === ERROR_CODES.DB_THROTTLED ||
        dbError.code === ERROR_CODES.DB_CONNECTION_FAILED);

    if (shouldRetry) {
      // Calculate exponential backoff delay
      const delay = this.retryDelay * Math.pow(2, retryCount);
      this.logger.info(`Retrying database operation after ${delay}ms`, { sessionId, retryCount });

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await operation();
        return;
      } catch (retryError) {
        return this.handleDatabaseError(
          retryError as Error,
          socket,
          sessionId,
          operation,
          retryCount + 1
        );
      }
    }

    // Send error response to client
    if (socket.connected) {
      const errorResponse = formatErrorResponse(dbError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Continue session even if database write fails (log the error but don't terminate)
    // Only terminate for critical database errors
    if (dbError.code === ERROR_CODES.DB_CONNECTION_FAILED && !dbError.recoverable) {
      this.terminateSession(socket, sessionId);
    }
  }

  /**
   * Handles audio processing errors.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   */
  handleAudioError(error: Error, socket: Socket, sessionId: string): void {
    const audioError =
      error instanceof AudioError
        ? error
        : new AudioError(error.message, ERROR_CODES.AUDIO_PROCESSING_ERROR, true, {
            originalError: error.message,
          });

    // Log the error
    this.logger.error('Audio processing error occurred', createErrorLogEntry(audioError, sessionId));

    // Send error response to client
    if (socket.connected) {
      const errorResponse = formatErrorResponse(audioError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Continue session - audio errors are usually recoverable
    // Only terminate if audio format is completely invalid
    if (audioError.code === ERROR_CODES.AUDIO_FORMAT_INVALID && !audioError.recoverable) {
      this.terminateSession(socket, sessionId);
    }
  }

  /**
   * Handles questionnaire logic errors with fallback.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   */
  handleQuestionnaireError(error: Error, socket: Socket, sessionId: string): void {
    const questionnaireError =
      error instanceof QuestionnaireError
        ? error
        : new QuestionnaireError(error.message, ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR, true, {
            originalError: error.message,
          });

    // Log the error
    this.logger.error('Questionnaire logic error occurred', createErrorLogEntry(questionnaireError, sessionId));

    // Send error response to client
    if (socket.connected) {
      const errorResponse = formatErrorResponse(questionnaireError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Terminate session if questionnaire not found
    if (questionnaireError.code === ERROR_CODES.QUESTIONNAIRE_NOT_FOUND) {
      this.terminateSession(socket, sessionId);
    }

    // For other questionnaire errors, continue with fallback logic
    // The questionnaire engine should handle fallback to next sequential question
  }

  /**
   * Handles tool execution errors.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   * @returns Error result to return to Nova Sonic
   */
  handleToolError(error: Error, socket: Socket, sessionId: string): { success: false; error: string } {
    const toolError =
      error instanceof ToolError
        ? error
        : new ToolError(error.message, ERROR_CODES.TOOL_EXECUTION_ERROR, true, {
            originalError: error.message,
          });

    // Log the error
    this.logger.error('Tool execution error occurred', createErrorLogEntry(toolError, sessionId));

    // Send error response to client
    if (socket.connected) {
      const errorResponse = formatErrorResponse(toolError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Return error result to Nova Sonic
    // Nova Sonic will handle the error gracefully in the conversation
    return {
      success: false,
      error: toolError.message,
    };
  }

  /**
   * Handles Gemini Live API errors with retry logic.
   *
   * Provides comprehensive error handling for Gemini Live API
   * integration, including connection failures, authentication errors,
   * streaming errors, and tool execution errors.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   * @param operation - The operation that failed (for retry)
   * @param retryCount - Current retry count
   *
   * _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6_
   */
  async handleGeminiLiveError(
    error: Error,
    socket: Socket,
    sessionId: string,
    operation?: () => Promise<void>,
    retryCount: number = 0
  ): Promise<void> {
    // Convert to GeminiLiveError if needed
    const geminiLiveError =
      error instanceof GeminiLiveError
        ? error
        : GeminiLiveError.fromError(error, sessionId);

    // Log the error with full context (Requirement 8.4)
    this.logger.error(
      'Gemini Live API error occurred',
      createErrorLogEntry(geminiLiveError, sessionId, {
        retryCount,
        errorCode: geminiLiveError.code,
        recoverable: geminiLiveError.recoverable,
      })
    );

    // Emit CloudWatch metric
    if (this.metricsEmitter) {
      await this.metricsEmitter.emitError(geminiLiveError.code);
    }

    // Check if we should retry (Requirement 8.2)
    const shouldRetry =
      geminiLiveError.recoverable &&
      retryCount < this.maxRetries &&
      operation &&
      (geminiLiveError.code === ERROR_CODES.GEMINI_RATE_LIMITED ||
        geminiLiveError.code === ERROR_CODES.GEMINI_STREAM_ERROR ||
        geminiLiveError.code === ERROR_CODES.GEMINI_GO_AWAY);

    if (shouldRetry) {
      // Calculate exponential backoff delay
      const delay = this.retryDelay * Math.pow(2, retryCount);
      this.logger.info(`Retrying Gemini Live operation after ${delay}ms`, {
        sessionId,
        retryCount,
        errorCode: geminiLiveError.code,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await operation();
        return;
      } catch (retryError) {
        return this.handleGeminiLiveError(
          retryError as Error,
          socket,
          sessionId,
          operation,
          retryCount + 1
        );
      }
    }

    // Send user-friendly error response to client (Requirement 8.5)
    if (socket.connected) {
      const errorResponse = formatErrorResponse(geminiLiveError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Terminate session if error is not recoverable (Requirement 8.6)
    if (this.shouldTerminateGeminiLiveSession(geminiLiveError)) {
      this.terminateSession(socket, sessionId);
    }
  }

  /**
   * Handles Gemini Live tool execution errors.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   * @param toolName - Name of the tool that failed
   * @returns Error result to return to Gemini Live
   *
   * _Requirements: 5.7, 8.3_
   */
  handleGeminiLiveToolError(
    error: Error,
    socket: Socket,
    sessionId: string,
    toolName: string
  ): { success: false; error: string } {
    // Create Gemini Live tool error
    const toolError =
      error instanceof GeminiLiveError
        ? error
        : GeminiLiveError.toolError(toolName, error.message, sessionId);

    // Log the error with full context
    this.logger.error(
      'Gemini Live tool execution error occurred',
      createErrorLogEntry(toolError, sessionId, { toolName })
    );

    // Send error response to client
    if (socket.connected) {
      const errorResponse = formatErrorResponse(toolError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Return error result to Gemini Live
    // Gemini Live will handle the error gracefully in the conversation
    return {
      success: false,
      error: toolError.message,
    };
  }

  /**
   * Determines if a Gemini Live error should terminate the session.
   *
   * @param error - The Gemini Live error to check
   * @returns true if session should be terminated
   *
   * _Requirements: 8.6_
   */
  private shouldTerminateGeminiLiveSession(error: GeminiLiveError): boolean {
    // Non-recoverable errors should terminate the session
    if (!error.recoverable) {
      return true;
    }

    // Specific error codes that should terminate
    const terminatingErrors = new Set<ErrorCode>([
      ERROR_CODES.GEMINI_AUTH_FAILED,
      ERROR_CODES.GEMINI_RECONNECTION_FAILED,
      ERROR_CODES.GEMINI_SESSION_NOT_FOUND,
    ]);

    return terminatingErrors.has(error.code);
  }

  /**
   * Handles unhandled exceptions.
   *
   * @param error - The error that occurred
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   */
  handleUnhandledException(error: Error, socket: Socket, sessionId: string): void {
    const internalError = new VoiceterError(
      ERROR_CODES.INTERNAL_ERROR,
      error.message,
      false,
      {
        originalError: error.message,
        stack: error.stack,
      }
    );

    // Log the error with full stack trace
    this.logger.error('Unhandled exception occurred', createErrorLogEntry(internalError, sessionId));

    // Send generic error response to client
    if (socket.connected) {
      const errorResponse = formatErrorResponse(internalError, sessionId);
      socket.emit('error', errorResponse.data);
    }

    // Always terminate session for unhandled exceptions
    this.terminateSession(socket, sessionId);
  }

  /**
   * Terminates a session gracefully.
   *
   * @param socket - The WebSocket socket
   * @param sessionId - The session ID
   */
  private terminateSession(socket: Socket, sessionId: string): void {
    this.logger.info('Terminating session due to error', { sessionId });

    try {
      // Emit session complete event with error status
      if (socket.connected) {
        socket.emit('session:complete', {
          event: 'session:complete',
          sessionId,
          timestamp: new Date().toISOString(),
          data: {
            completionStatus: 'terminated',
            reason: 'error',
          },
        });
      }

      // Disconnect the socket
      socket.disconnect(true);
    } catch (error) {
      this.logger.error('Error during session termination', {
        sessionId,
        error: (error as Error).message,
      });
    }
  }
}

/**
 * Creates an error handler instance.
 *
 * @param config - Error handler configuration
 * @returns Error handler instance
 */
export function createErrorHandler(config: ErrorHandlerConfig): ErrorHandler {
  return new ErrorHandler(config);
}
