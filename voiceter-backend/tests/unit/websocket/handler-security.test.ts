/**
 * Unit tests for WebSocket Handler Security Features
 * 
 * REQ-SEC-004: Input sanitization integration
 * REQ-SEC-005: Rate limiting integration
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { WebSocketEventHandler } from '../../../src/websocket/handler';
import { Logger } from '../../../src/monitoring/logger';
import { initializeInputSanitizer } from '../../../src/security/input-sanitizer';

// Mock dependencies
jest.mock('../../../src/session/manager', () => ({
  getSessionManager: jest.fn<any>().mockReturnValue({
    updateLastActivityTime: jest.fn<any>().mockResolvedValue(undefined),
    getSession: jest.fn<any>().mockResolvedValue(null),
    createSession: jest.fn<any>().mockResolvedValue(undefined),
  }),
}));

jest.mock('../../../src/monitoring/metrics', () => ({
  getMetricsEmitter: jest.fn<any>().mockReturnValue({
    emitAudioChunksProcessed: jest.fn<any>().mockResolvedValue(undefined),
  }),
}));

describe('WebSocketEventHandler Security', () => {
  let handler: WebSocketEventHandler;
  let mockLogger: jest.Mocked<Logger>;
  let mockSocket: any;

  beforeEach(() => {
    // Initialize input sanitizer
    initializeInputSanitizer();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockSocket = {
      sessionId: 'test-session-123',
      emit: jest.fn(),
      on: jest.fn(),
      handshake: {
        address: '127.0.0.1',
        headers: {
          'user-agent': 'test-agent',
        },
      },
    };

    handler = new WebSocketEventHandler(mockLogger);
  });

  describe('Rate Limiting (REQ-SEC-005)', () => {
    it('should allow messages within rate limit', async () => {
      // Register handlers
      handler.registerHandlers(mockSocket);

      // Get the session:start handler
      const sessionStartHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'session:start'
      )?.[1];

      expect(sessionStartHandler).toBeDefined();

      // Send a few messages - should not trigger rate limit
      for (let i = 0; i < 5; i++) {
        await sessionStartHandler({ questionnaireId: 'demo1_csat_nps', voiceId: 'matthew' });
      }

      // Should not have emitted rate limit error
      const errorCalls = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'error' && call[1]?.data?.errorCode === 'WS_RATE_LIMIT_EXCEEDED'
      );
      expect(errorCalls.length).toBe(0);
    });

    it('should reject messages exceeding rate limit', async () => {
      handler.registerHandlers(mockSocket);

      const audioChunkHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'audio:chunk'
      )?.[1];

      expect(audioChunkHandler).toBeDefined();

      // Send 101 messages rapidly (exceeds 100/second limit)
      for (let i = 0; i < 101; i++) {
        await audioChunkHandler({ audioData: 'dGVzdA==', sequenceNumber: i });
      }

      // Should have emitted rate limit error
      const errorCalls = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'error' && call[1]?.data?.errorCode === 'WS_RATE_LIMIT_EXCEEDED'
      );
      expect(errorCalls.length).toBeGreaterThan(0);

      // Error should include retryAfter
      const rateLimitError = errorCalls[0][1];
      expect(rateLimitError.data.retryAfter).toBeGreaterThan(0);
      expect(rateLimitError.data.recoverable).toBe(true);
    });

    it('should log rate limit exceeded events', async () => {
      handler.registerHandlers(mockSocket);

      const audioChunkHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'audio:chunk'
      )?.[1];

      // Exceed rate limit
      for (let i = 0; i < 101; i++) {
        await audioChunkHandler({ audioData: 'dGVzdA==', sequenceNumber: i });
      }

      // Should have logged warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          event: 'ws_rate_limit_exceeded',
          sessionId: 'test-session-123',
        })
      );
    });
  });

  describe('Input Sanitization (REQ-SEC-004)', () => {
    it('should sanitize input data with potential XSS', async () => {
      handler.registerHandlers(mockSocket);

      const textMessageHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'text:message'
      )?.[1];

      expect(textMessageHandler).toBeDefined();

      // Send message with XSS attempt
      await textMessageHandler({ text: '<script>alert("xss")</script>' });

      // Should have logged warning about injection attempt
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Potential injection attempt detected',
        expect.objectContaining({
          event: 'injection_attempt',
          data: expect.objectContaining({
            threats: expect.arrayContaining(['XSS']),
          }),
        })
      );
    });

    it('should sanitize input data with potential SQL injection', async () => {
      handler.registerHandlers(mockSocket);

      const textMessageHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'text:message'
      )?.[1];

      // Send message with SQL injection attempt
      await textMessageHandler({ text: "'; DROP TABLE users; --" });

      // Should have logged warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Potential injection attempt detected',
        expect.objectContaining({
          event: 'injection_attempt',
          data: expect.objectContaining({
            threats: expect.arrayContaining(['SQL_INJECTION']),
          }),
        })
      );
    });

    it('should allow normal text without triggering sanitization warnings', async () => {
      handler.registerHandlers(mockSocket);

      const textMessageHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'text:message'
      )?.[1];

      // Send normal message
      await textMessageHandler({ text: 'I rate this product 8 out of 10' });

      // Should NOT have logged injection warning
      const injectionWarnings = mockLogger.warn.mock.calls.filter(
        (call: any[]) => call[1]?.event === 'injection_attempt'
      );
      expect(injectionWarnings.length).toBe(0);
    });
  });

  describe('Event Handler Registration', () => {
    it('should register all required event handlers', () => {
      handler.registerHandlers(mockSocket);

      const registeredEvents = mockSocket.on.mock.calls.map((call: any[]) => call[0]);

      expect(registeredEvents).toContain('session:start');
      expect(registeredEvents).toContain('session:end');
      expect(registeredEvents).toContain('audio:chunk');
      expect(registeredEvents).toContain('config:update');
      expect(registeredEvents).toContain('questionnaire:select');
      expect(registeredEvents).toContain('text:message');
      expect(registeredEvents).toContain('user:speaking');
    });
  });
});
