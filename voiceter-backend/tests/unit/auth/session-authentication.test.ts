/**
 * Unit tests for REQ-BE-002: Session Authentication
 * 
 * Tests:
 * - Session ID generation (UUID v4 format)
 * - Invalid connection rejection (401/403)
 * - Session tracking functionality
 * - Origin/referrer validation
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { validateSessionId, sanitizeSessionId, extractValidSessionId } from '../../../src/auth/session';
import { AuthenticationMiddleware } from '../../../src/auth/middleware';
import { Socket } from 'socket.io';
import { Config } from '../../../src/server/config';

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock config
const createMockConfig = (authEnabled: boolean = true): Config => ({
  aws: {
    region: 'us-east-1',
    dynamodbTablePrefix: 'test-',
    sessionsTable: 'test-sessions',
    responsesTable: 'test-responses',
    transcriptsTable: 'test-transcripts',
    s3BucketName: 'test-bucket',
    s3AudioPrefix: 'recordings/',
  },
  server: {
    port: 8080,
    logLevel: 'INFO',
    nodeEnv: 'test',
  },
  auth: {
    enabled: authEnabled,
    cognitoUserPoolId: undefined,
  },
  features: {
    enableAudioRecording: false,
    enableSentimentAnalysis: false,
    useGeminiLive: true,
  },
  rateLimiting: {
    maxMessagesPerSecond: 100,
    maxAudioChunkSizeMB: 1,
  },
  timeouts: {
    sessionTimeoutMinutes: 30,
    cleanupTimeoutSeconds: 5,
    disconnectCleanupTimeoutSeconds: 3,
  },
  monitoring: {
    cloudwatchNamespace: 'Test/Backend',
    enableXrayTracing: false,
  },
  questionnaires: {
    directory: './questionnaires',
  },
  geminiLive: {
    projectId: 'test-project',
    region: 'us-central1',
    model: 'gemini-live-2.5-flash-preview-native-audio',
    defaultVoice: 'Charon',
    voiceMapping: {
      matthew: 'Charon',
      tiffany: 'Aoede',
      amy: 'Kore',
    },
    reconnectMaxRetries: 3,
    reconnectBaseDelayMs: 1000,
    toolTimeoutMs: 5000,
    disableTools: false,
    enabled: true,
  },
});

// Mock socket factory
const createMockSocket = (overrides: Partial<{
  id: string;
  origin: string;
  referer: string;
  sessionId: string;
  authorization: string;
  cookie: string;
}>): Partial<Socket> => ({
  id: overrides.id || 'test-socket-id',
  handshake: {
    headers: {
      origin: overrides.origin,
      referer: overrides.referer,
      authorization: overrides.authorization,
      cookie: overrides.cookie,
      'x-session-id': overrides.sessionId,
    },
    query: {
      sessionId: overrides.sessionId,
    },
    address: '127.0.0.1',
  } as any,
});

describe('REQ-BE-002: Session Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Session ID Generation (validateSessionId)', () => {
    it('should accept valid UUID v4 session IDs', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-41d4-80b4-00c04fd430c8',
      ];

      validUUIDs.forEach((uuid) => {
        const result = validateSessionId(uuid);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    it('should reject empty session IDs', () => {
      const result = validateSessionId('');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Session ID is required');
    });

    it('should reject session IDs with wrong length', () => {
      const result = validateSessionId('too-short');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Session ID must be 36 characters long');
    });

    it('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        '550e8400-e29b-31d4-a716-446655440000', // v3 UUID (not v4)
        '550e8400-e29b-51d4-a716-446655440000', // v5 UUID (not v4)
        'not-a-valid-uuid-format-at-all-here',
        '550e8400-e29b-41d4-c716-446655440000', // invalid variant
      ];

      invalidUUIDs.forEach((uuid) => {
        const result = validateSessionId(uuid);
        expect(result.valid).toBe(false);
      });
    });

    it('should accept valid UUID v4 even with many zeros', () => {
      // This is a valid UUID v4 format - the suspicious pattern check
      // only catches ALL zeros/f's after removing hyphens
      const result = validateSessionId('00000000-0000-4000-8000-000000000000');
      expect(result.valid).toBe(true);
    });

    it('should accept valid UUID v4 even with many f characters', () => {
      // This is a valid UUID v4 format - the suspicious pattern check
      // only catches ALL zeros/f's after removing hyphens
      const result = validateSessionId('ffffffff-ffff-4fff-bfff-ffffffffffff');
      expect(result.valid).toBe(true);
    });
  });

  describe('Session ID Sanitization', () => {
    it('should mask middle portion of session ID', () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const sanitized = sanitizeSessionId(sessionId);
      expect(sanitized).toBe('550e8400...0000');
    });

    it('should return **** for short or empty session IDs', () => {
      expect(sanitizeSessionId('')).toBe('****');
      expect(sanitizeSessionId('short')).toBe('****');
    });
  });

  describe('Session ID Extraction', () => {
    it('should extract session ID from query parameter (highest priority)', () => {
      const result = extractValidSessionId({
        query: '550e8400-e29b-41d4-a716-446655440000',
        header: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        cookie: '6ba7b810-9dad-41d4-80b4-00c04fd430c8',
      });
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should fall back to header if query is invalid', () => {
      const result = extractValidSessionId({
        query: 'invalid',
        header: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        cookie: '6ba7b810-9dad-41d4-80b4-00c04fd430c8',
      });
      expect(result).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    });

    it('should fall back to cookie if query and header are invalid', () => {
      const result = extractValidSessionId({
        query: 'invalid',
        header: 'also-invalid',
        cookie: '6ba7b810-9dad-41d4-80b4-00c04fd430c8',
      });
      expect(result).toBe('6ba7b810-9dad-41d4-80b4-00c04fd430c8');
    });

    it('should return null if all sources are invalid', () => {
      const result = extractValidSessionId({
        query: 'invalid',
        header: 'also-invalid',
        cookie: 'still-invalid',
      });
      expect(result).toBeNull();
    });
  });

  describe('Authentication Middleware - Origin Validation', () => {
    it('should allow connections from allowed origins', async () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      const socket = createMockSocket({
        origin: 'http://localhost:3000',
      });

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(true);
    });

    it('should reject connections from disallowed origins', async () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      const socket = createMockSocket({
        origin: 'http://malicious-site.com',
      });

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(403);
      expect(result.error?.code).toBe('FORBIDDEN');
    });

    it('should reject connections with missing origin and referer', async () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      const socket = createMockSocket({});

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(403);
    });

    it('should allow connections when auth is disabled', async () => {
      const config = createMockConfig(false);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      const socket = createMockSocket({
        origin: 'http://any-origin.com',
      });

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(true);
    });
  });

  describe('Authentication Middleware - Session ID Validation', () => {
    it('should validate session ID from header', async () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      const socket = createMockSocket({
        origin: 'http://localhost:3000',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(true);
      expect(result.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should reject invalid session ID format', async () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      const socket = createMockSocket({
        origin: 'http://localhost:3000',
        sessionId: 'invalid-session-id',
      });

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.code).toBe('SESSION_INVALID');
    });
  });

  describe('Authentication Middleware - Allowed Origins Management', () => {
    it('should allow adding new origins', async () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      middleware.addAllowedOrigin('https://new-domain.com');
      
      const socket = createMockSocket({
        origin: 'https://new-domain.com',
      });

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(true);
    });

    it('should allow removing origins', async () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      middleware.removeAllowedOrigin('http://localhost:3000');
      
      const socket = createMockSocket({
        origin: 'http://localhost:3000',
      });

      const result = await middleware.authenticate(socket as Socket);
      expect(result.authenticated).toBe(false);
    });

    it('should return list of allowed origins', () => {
      const config = createMockConfig(true);
      const middleware = new AuthenticationMiddleware(config, mockLogger as any);
      
      const origins = middleware.getAllowedOrigins();
      expect(origins).toContain('http://localhost:3000');
      expect(origins).toContain('https://voiceter.ai');
    });
  });
});
