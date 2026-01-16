/**
 * Property-based tests for error logging completeness
 *
 * **Property 9: Error logging completeness**
 * **Validates: Requirements 9.5, 9.6**
 *
 * Requirement 9.5: THE Backend SHALL log all errors with session context for debugging
 *
 * Requirement 9.6: THE Frontend SHALL display user-friendly error messages without
 * exposing technical details
 */

import * as fc from 'fast-check';
import { formatErrorResponse, createErrorLogEntry, sanitizeErrorMessage } from '../../src/errors/formatter';
import { ERROR_CODES } from '../../src/errors/codes';
import {
  VoiceterError,
  WebSocketError,
  BedrockError,
  DatabaseError,
  AudioError,
  QuestionnaireError,
  ToolError,
} from '../../src/errors/types';

describe('Property 9: Error logging completeness', () => {
  /**
   * Arbitrary for valid session IDs (UUID format)
   */
  const validSessionIdArb = fc.uuid();

  /**
   * Arbitrary for error codes
   */
  const validErrorCodeArb = fc.constantFrom(
    ERROR_CODES.WS_CONNECTION_FAILED,
    ERROR_CODES.WS_MESSAGE_INVALID,
    ERROR_CODES.BEDROCK_INIT_FAILED,
    ERROR_CODES.BEDROCK_STREAM_ERROR,
    ERROR_CODES.DB_WRITE_FAILED,
    ERROR_CODES.AUDIO_PROCESSING_ERROR,
    ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR,
    ERROR_CODES.TOOL_EXECUTION_ERROR,
    ERROR_CODES.SESSION_EXPIRED,
    ERROR_CODES.INTERNAL_ERROR
  );

  /**
   * Arbitrary for error messages (including potentially sensitive content)
   */
  const errorMessageArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 200 }),
    // Messages that might contain sensitive info
    fc.constant('Error at /home/user/project/src/file.ts:123:45'),
    fc.constant('Connection failed: password=secret123'),
    fc.constant('AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE'),
    fc.constant('Stack trace: at Object.<anonymous> (/app/src/index.js:10:15)'),
    fc.constant('Database error: user@localhost:5432/mydb'),
    fc.constant('Error: ECONNREFUSED 192.168.1.100:3000')
  );

  /**
   * Arbitrary for additional context data
   */
  const additionalContextArb = fc.record({
    operation: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    retryCount: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
    duration: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
  });

  /**
   * Arbitrary for VoiceterError instances
   */
  const voiceterErrorArb = fc.tuple(
    validErrorCodeArb,
    errorMessageArb,
    fc.boolean()
  ).map(([code, message, recoverable]) => new VoiceterError(code, message, recoverable));

  /**
   * Arbitrary for WebSocketError instances
   */
  const webSocketErrorArb = fc.tuple(
    errorMessageArb,
    fc.constantFrom(ERROR_CODES.WS_CONNECTION_FAILED, ERROR_CODES.WS_MESSAGE_INVALID),
    fc.boolean()
  ).map(([message, code, recoverable]) => new WebSocketError(message, code, recoverable));

  /**
   * Arbitrary for BedrockError instances
   */
  const bedrockErrorArb = fc.tuple(
    errorMessageArb,
    fc.constantFrom(ERROR_CODES.BEDROCK_INIT_FAILED, ERROR_CODES.BEDROCK_STREAM_ERROR),
    fc.boolean()
  ).map(([message, code, recoverable]) => new BedrockError(message, code, recoverable));

  /**
   * Arbitrary for any error type
   */
  const anyErrorArb = fc.oneof(
    voiceterErrorArb,
    webSocketErrorArb,
    bedrockErrorArb,
    errorMessageArb.map(msg => new Error(msg))
  );

  // Feature: direct-websocket-bedrock, Property 9: Log entries contain session context
  it('should include sessionId in all error log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const logEntry = createErrorLogEntry(error, sessionId);

          // Requirement 9.5: Log entries must include session context
          expect(logEntry).toHaveProperty('sessionId');
          expect(logEntry.sessionId).toBe(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Log entries contain timestamp
  it('should include timestamp in all error log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const logEntry = createErrorLogEntry(error, sessionId);

          // Requirement 9.5: Log entries must include timestamp
          expect(logEntry).toHaveProperty('timestamp');
          expect(typeof logEntry.timestamp).toBe('string');
          
          // Timestamp should be valid ISO 8601 format
          const parsedDate = new Date(logEntry.timestamp);
          expect(parsedDate.toString()).not.toBe('Invalid Date');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Log entries contain error code
  it('should include error code in all error log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const logEntry = createErrorLogEntry(error, sessionId);

          // Requirement 9.5: Log entries must include error code
          expect(logEntry).toHaveProperty('errorCode');
          expect(typeof logEntry.errorCode).toBe('string');
          expect(logEntry.errorCode.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Log entries preserve additional context
  it('should preserve additional context in log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        additionalContextArb,
        async (error, sessionId, additionalContext) => {
          const logEntry = createErrorLogEntry(error, sessionId, additionalContext);

          // Requirement 9.5: Additional context should be preserved
          if (additionalContext.operation !== undefined) {
            expect(logEntry.operation).toBe(additionalContext.operation);
          }
          if (additionalContext.retryCount !== undefined) {
            expect(logEntry.retryCount).toBe(additionalContext.retryCount);
          }
          if (additionalContext.duration !== undefined) {
            expect(logEntry.duration).toBe(additionalContext.duration);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: User-facing messages don't expose stack traces
  it('should not expose stack traces in user-facing error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);
          const userMessage = errorResponse.data.errorMessage;

          // Requirement 9.6: User-facing messages should not contain stack traces
          expect(userMessage).not.toMatch(/at\s+\w+\s*\(/); // "at Function ("
          expect(userMessage).not.toMatch(/:\d+:\d+/); // ":123:45" line:column
          expect(userMessage).not.toMatch(/\.ts:\d+/); // ".ts:123"
          expect(userMessage).not.toMatch(/\.js:\d+/); // ".js:123"
          expect(userMessage).not.toMatch(/node_modules/);
          expect(userMessage).not.toMatch(/Stack trace/i);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: User-facing messages don't expose file paths
  it('should not expose file paths in user-facing error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);
          const userMessage = errorResponse.data.errorMessage;

          // Requirement 9.6: User-facing messages should not contain file paths
          expect(userMessage).not.toMatch(/\/home\//);
          expect(userMessage).not.toMatch(/\/app\//);
          expect(userMessage).not.toMatch(/\/src\//);
          expect(userMessage).not.toMatch(/C:\\/);
          expect(userMessage).not.toMatch(/\\Users\\/);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: User-facing messages don't expose credentials
  it('should not expose credentials in user-facing error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);
          const userMessage = errorResponse.data.errorMessage;

          // Requirement 9.6: User-facing messages should not contain credentials
          expect(userMessage).not.toMatch(/password\s*=/i);
          expect(userMessage).not.toMatch(/secret\s*=/i);
          expect(userMessage).not.toMatch(/AWS_SECRET/i);
          expect(userMessage).not.toMatch(/AWS_ACCESS_KEY/i);
          expect(userMessage).not.toMatch(/AKIA[A-Z0-9]{16}/); // AWS access key pattern
          expect(userMessage).not.toMatch(/api[_-]?key\s*=/i);
          expect(userMessage).not.toMatch(/token\s*=/i);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: User-facing messages don't expose IP addresses
  it('should not expose internal IP addresses in user-facing error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);
          const userMessage = errorResponse.data.errorMessage;

          // Requirement 9.6: User-facing messages should not contain internal IPs
          expect(userMessage).not.toMatch(/192\.168\.\d+\.\d+/);
          expect(userMessage).not.toMatch(/10\.\d+\.\d+\.\d+/);
          expect(userMessage).not.toMatch(/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/);
          expect(userMessage).not.toMatch(/localhost:\d+/);
          expect(userMessage).not.toMatch(/127\.0\.0\.1/);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Error responses include recoverable flag
  it('should include recoverable flag in error responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);

          // Error response should include recoverable flag
          expect(errorResponse.data).toHaveProperty('recoverable');
          expect(typeof errorResponse.data.recoverable).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Error responses include error code
  it('should include error code in error responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);

          // Error response should include error code
          expect(errorResponse.data).toHaveProperty('errorCode');
          expect(typeof errorResponse.data.errorCode).toBe('string');
          expect(errorResponse.data.errorCode.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Sanitized messages are user-friendly
  it('should produce user-friendly sanitized messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        async (rawMessage) => {
          const sanitized = sanitizeErrorMessage(rawMessage);

          // Sanitized message should be non-empty
          expect(sanitized.length).toBeGreaterThan(0);

          // Sanitized message should not be excessively long
          expect(sanitized.length).toBeLessThanOrEqual(200);

          // Sanitized message should not contain technical jargon patterns
          expect(sanitized).not.toMatch(/ECONNREFUSED/);
          expect(sanitized).not.toMatch(/ETIMEDOUT/);
          expect(sanitized).not.toMatch(/ENOTFOUND/);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: VoiceterError preserves error code
  it('should preserve error code from VoiceterError in log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        voiceterErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const logEntry = createErrorLogEntry(error, sessionId);

          // VoiceterError code should be preserved in log entry
          expect(logEntry.errorCode).toBe(error.code);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Error response format is consistent
  it('should produce consistent error response format', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);

          // Response should have consistent structure
          expect(errorResponse).toHaveProperty('event', 'error');
          expect(errorResponse).toHaveProperty('sessionId', sessionId);
          expect(errorResponse).toHaveProperty('timestamp');
          expect(errorResponse).toHaveProperty('data');
          expect(errorResponse.data).toHaveProperty('errorCode');
          expect(errorResponse.data).toHaveProperty('errorMessage');
          expect(errorResponse.data).toHaveProperty('recoverable');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Log entries include error message
  it('should include error message in log entries for debugging', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyErrorArb,
        validSessionIdArb,
        async (error, sessionId) => {
          const logEntry = createErrorLogEntry(error, sessionId);

          // Requirement 9.5: Log entries should include error message for debugging
          expect(logEntry).toHaveProperty('errorMessage');
          expect(typeof logEntry.errorMessage).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 9: Different error types produce valid responses
  it('should handle all error types and produce valid responses', async () => {
    const errorTypes = [
      new VoiceterError(ERROR_CODES.INTERNAL_ERROR, 'Test error', false),
      new WebSocketError('WS error', ERROR_CODES.WS_CONNECTION_FAILED, true),
      new BedrockError('Bedrock error', ERROR_CODES.BEDROCK_STREAM_ERROR, false),
      new DatabaseError('DB error', ERROR_CODES.DB_WRITE_FAILED, true),
      new AudioError('Audio error', ERROR_CODES.AUDIO_PROCESSING_ERROR, true),
      new QuestionnaireError('Questionnaire error', ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR, true),
      new ToolError('Tool error', ERROR_CODES.TOOL_EXECUTION_ERROR, true),
      new Error('Generic error'),
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...errorTypes),
        validSessionIdArb,
        async (error, sessionId) => {
          const errorResponse = formatErrorResponse(error, sessionId);
          const logEntry = createErrorLogEntry(error, sessionId);

          // Both should be valid
          expect(errorResponse.data.errorCode).toBeTruthy();
          expect(errorResponse.data.errorMessage).toBeTruthy();
          expect(logEntry.errorCode).toBeTruthy();
          expect(logEntry.sessionId).toBe(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
