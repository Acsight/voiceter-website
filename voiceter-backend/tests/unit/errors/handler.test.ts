/**
 * Tests for Error Handler
 * 
 * Validates centralized error handling for all error types
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.7
 */

import { ErrorHandler, createErrorHandler, ErrorContext } from '../../../src/errors/handler';
import { ERROR_CODES } from '../../../src/errors/codes';
import {
  VoiceterError,
  WebSocketError,
  BedrockError,
  DatabaseError,
  AudioError,
  QuestionnaireError,
  ToolError,
} from '../../../src/errors/types';
import { describe, it, beforeEach } from '@jest/globals';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: any;
  let mockMetricsEmitter: any;
  let mockSessionManager: any;
  let mockSocket: any;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    };

    // Mock metrics emitter
    mockMetricsEmitter = {
      emitError: jest.fn().mockResolvedValue(undefined),
    };

    // Mock session manager
    mockSessionManager = {
      getSession: jest.fn().mockResolvedValue({ sessionId: 'test-session' }),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    };

    // Mock socket
    mockSocket = {
      connected: true,
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    // Create error handler
    errorHandler = createErrorHandler({
      logger: mockLogger,
      metricsEmitter: mockMetricsEmitter,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  describe('handleError', () => {
    it('should log error with full context (Requirement 8.1)', async () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        sessionId: 'test-session',
        socket: mockSocket,
      };

      await errorHandler.handleError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
          event: 'error_occurred',
          error: expect.objectContaining({
            message: 'Test error',
          }),
        }),
        error
      );
    });

    it('should emit CloudWatch metric (Requirement 8.1)', async () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        sessionId: 'test-session',
        socket: mockSocket,
      };

      await errorHandler.handleError(error, context);

      expect(mockMetricsEmitter.emitError).toHaveBeenCalledWith(ERROR_CODES.INTERNAL_ERROR);
    });

    it('should send user-friendly error to client (Requirement 8.2)', async () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        sessionId: 'test-session',
        socket: mockSocket,
      };

      await errorHandler.handleError(error, context);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          errorCode: ERROR_CODES.INTERNAL_ERROR,
          errorMessage: expect.any(String),
        })
      );
    });

    it('should not send error if socket is disconnected', async () => {
      mockSocket.connected = false;
      const error = new Error('Test error');
      const context: ErrorContext = {
        sessionId: 'test-session',
        socket: mockSocket,
      };

      await errorHandler.handleError(error, context);

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should clean up session for non-recoverable errors (Requirement 8.4)', async () => {
      const error = new VoiceterError(ERROR_CODES.INTERNAL_ERROR, 'Test error', false);
      const context: ErrorContext = {
        sessionId: 'test-session',
        socket: mockSocket,
        sessionManager: mockSessionManager,
      };

      await errorHandler.handleError(error, context);

      expect(mockSessionManager.deleteSession).toHaveBeenCalledWith('test-session');
    });
  });

  describe('isRecoverable', () => {
    it('should identify recoverable VoiceterError', () => {
      const error = new VoiceterError(ERROR_CODES.WS_CONNECTION_FAILED, 'Test', true);
      expect(errorHandler.isRecoverable(error)).toBe(true);
    });

    it('should identify non-recoverable VoiceterError', () => {
      const error = new VoiceterError(ERROR_CODES.INTERNAL_ERROR, 'Test', false);
      expect(errorHandler.isRecoverable(error)).toBe(false);
    });

    it('should identify recoverable error codes', () => {
      const error = new Error('Throttling');
      (error as any).code = ERROR_CODES.BEDROCK_RATE_LIMIT;
      expect(errorHandler.isRecoverable(error)).toBe(true);
    });
  });

  describe('attemptRecovery', () => {
    it('should retry operation with exponential backoff (Requirement 8.6)', async () => {
      const operation = jest.fn().mockResolvedValue(undefined);
      const error = new VoiceterError(ERROR_CODES.BEDROCK_RATE_LIMIT, 'Test', true);
      const context: ErrorContext = {
        sessionId: 'test-session',
        operation,
        retryCount: 0,
      };

      await errorHandler.attemptRecovery(error, context);

      expect(operation).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting recovery'),
        expect.any(Object)
      );
    });

    it('should log warning if no operation provided', async () => {
      const error = new VoiceterError(ERROR_CODES.BEDROCK_RATE_LIMIT, 'Test', true);
      const context: ErrorContext = {
        sessionId: 'test-session',
      };

      await errorHandler.attemptRecovery(error, context);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No operation provided for recovery attempt',
        expect.any(Object)
      );
    });
  });

  describe('cleanupSession', () => {
    it('should delete session from storage (Requirement 8.4)', async () => {
      await errorHandler.cleanupSession('test-session', mockSessionManager, mockSocket);

      expect(mockSessionManager.deleteSession).toHaveBeenCalledWith('test-session');
    });

    it('should disconnect socket if provided', async () => {
      await errorHandler.cleanupSession('test-session', mockSessionManager, mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle cleanup errors gracefully (Requirement 8.7)', async () => {
      mockSessionManager.deleteSession.mockRejectedValue(new Error('Cleanup failed'));

      await errorHandler.cleanupSession('test-session', mockSessionManager, mockSocket);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during session cleanup',
        expect.any(Object),
        expect.any(Error)
      );
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should handle non-existent session', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      await errorHandler.cleanupSession('test-session', mockSessionManager, mockSocket);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Session not found during cleanup',
        expect.any(Object)
      );
    });
  });

  describe('handleWebSocketError', () => {
    it('should log WebSocket error', () => {
      const error = new Error('WebSocket error');
      errorHandler.handleWebSocketError(error, mockSocket, 'test-session');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('should send error to client if connected', () => {
      const error = new WebSocketError('Test error', ERROR_CODES.WS_CONNECTION_FAILED, true);
      errorHandler.handleWebSocketError(error, mockSocket, 'test-session');

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('should not terminate session for recoverable errors', () => {
      const error = new WebSocketError('Test error', ERROR_CODES.WS_CONNECTION_FAILED, true);
      errorHandler.handleWebSocketError(error, mockSocket, 'test-session');

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });

    it('should terminate session for non-recoverable errors', () => {
      const error = new WebSocketError('Test error', ERROR_CODES.WS_MESSAGE_INVALID, false);
      errorHandler.handleWebSocketError(error, mockSocket, 'test-session');

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleBedrockError', () => {
    it('should log Bedrock error', async () => {
      const error = new BedrockError('Test error', ERROR_CODES.BEDROCK_STREAM_ERROR, true);
      await errorHandler.handleBedrockError(error, mockSocket, 'test-session');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Bedrock API error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('should retry on rate limit errors', async () => {
      const operation = jest.fn().mockResolvedValue(undefined);
      const error = new BedrockError('Rate limited', ERROR_CODES.BEDROCK_RATE_LIMIT, true);

      await errorHandler.handleBedrockError(error, mockSocket, 'test-session', operation, 0);

      expect(operation).toHaveBeenCalled();
    });

    it('should not retry after max retries', async () => {
      const operation = jest.fn().mockResolvedValue(undefined);
      const error = new BedrockError('Rate limited', ERROR_CODES.BEDROCK_RATE_LIMIT, true);

      await errorHandler.handleBedrockError(error, mockSocket, 'test-session', operation, 3);

      expect(operation).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });
  });

  describe('handleDatabaseError', () => {
    it('should log database error', async () => {
      const error = new DatabaseError('Test error', ERROR_CODES.DB_WRITE_FAILED, true);
      await errorHandler.handleDatabaseError(error, mockSocket, 'test-session');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('should retry on throttling errors', async () => {
      const operation = jest.fn().mockResolvedValue(undefined);
      const error = new DatabaseError('Throttled', ERROR_CODES.DB_THROTTLED, true);

      await errorHandler.handleDatabaseError(error, mockSocket, 'test-session', operation, 0);

      expect(operation).toHaveBeenCalled();
    });

    it('should continue session after database failure (Requirement 7.7)', async () => {
      const error = new DatabaseError('Write failed', ERROR_CODES.DB_WRITE_FAILED, true);
      await errorHandler.handleDatabaseError(error, mockSocket, 'test-session');

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleAudioError', () => {
    it('should log audio error', () => {
      const error = new AudioError('Test error', ERROR_CODES.AUDIO_PROCESSING_ERROR, true);
      errorHandler.handleAudioError(error, mockSocket, 'test-session');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Audio processing error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('should continue session for recoverable audio errors', () => {
      const error = new AudioError('Test error', ERROR_CODES.AUDIO_PROCESSING_ERROR, true);
      errorHandler.handleAudioError(error, mockSocket, 'test-session');

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleQuestionnaireError', () => {
    it('should log questionnaire error', () => {
      const error = new QuestionnaireError('Test error', ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR, true);
      errorHandler.handleQuestionnaireError(error, mockSocket, 'test-session');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Questionnaire logic error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('should terminate session if questionnaire not found', () => {
      const error = new QuestionnaireError('Not found', ERROR_CODES.QUESTIONNAIRE_NOT_FOUND, false);
      errorHandler.handleQuestionnaireError(error, mockSocket, 'test-session');

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleToolError', () => {
    it('should log tool error', () => {
      const error = new ToolError('Test error', ERROR_CODES.TOOL_EXECUTION_ERROR, true);
      const result = errorHandler.handleToolError(error, mockSocket, 'test-session');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Tool execution error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
      expect(result).toEqual({
        success: false,
        error: 'Test error',
      });
    });
  });

  describe('handleUnhandledException', () => {
    it('should log unhandled exception with stack trace', () => {
      const error = new Error('Unhandled error');
      errorHandler.handleUnhandledException(error, mockSocket, 'test-session');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unhandled exception occurred',
        expect.objectContaining({
          sessionId: 'test-session',
        })
      );
    });

    it('should always terminate session for unhandled exceptions', () => {
      const error = new Error('Unhandled error');
      errorHandler.handleUnhandledException(error, mockSocket, 'test-session');

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('Requirements Validation', () => {
    it('should meet Requirement 8.1: log error with sessionId, error code, message, and stack trace', async () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      const context: ErrorContext = {
        sessionId: 'test-session',
        socket: mockSocket,
      };

      await errorHandler.handleError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          sessionId: 'test-session',
          event: 'error_occurred',
          error: expect.objectContaining({
            message: 'Test error',
            stack: 'Error stack trace',
          }),
        }),
        error
      );
    });

    it('should meet Requirement 8.2: emit error event to client with user-friendly message', async () => {
      const error = new Error('Internal database connection failed');
      const context: ErrorContext = {
        sessionId: 'test-session',
        socket: mockSocket,
      };

      await errorHandler.handleError(error, context);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          errorMessage: expect.not.stringContaining('database'),
        })
      );
    });
  });
});
