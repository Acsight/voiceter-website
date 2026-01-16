/**
 * Unit tests for WebSocket message validation
 */

import {
  validateMessage,
  validateAudioChunk,
  validateSessionId,
} from '../../../src/websocket/validator';
import { SessionManager } from '../../../src/session/manager';
import { InMemorySessionStorage } from '../../../src/session/storage';
import { ERROR_CODES } from '../../../src/errors/codes';

describe('WebSocket Validator', () => {
  describe('validateMessage', () => {
    describe('initializeConnection', () => {
      it('should accept valid initializeConnection data', () => {
        const result = validateMessage('initializeConnection', {
          questionnaireId: 'demo1_csat_nps',
          voiceId: 'matthew',
        });

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid initializeConnection without voiceId', () => {
        const result = validateMessage('initializeConnection', {
          questionnaireId: 'demo1_csat_nps',
        });

        expect(result.valid).toBe(true);
      });

      it('should reject missing questionnaireId', () => {
        const result = validateMessage('initializeConnection', {
          voiceId: 'matthew',
        });

        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
        expect(result.error).toContain('questionnaireId');
      });

      it('should reject empty questionnaireId', () => {
        const result = validateMessage('initializeConnection', {
          questionnaireId: '   ',
        });

        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
      });

      it('should reject invalid voiceId', () => {
        const result = validateMessage('initializeConnection', {
          questionnaireId: 'demo1_csat_nps',
          voiceId: 'invalid_voice',
        });

        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
        expect(result.error).toContain('voiceId');
      });
    });

    describe('systemPrompt', () => {
      it('should accept valid systemPrompt data', () => {
        const result = validateMessage('systemPrompt', {
          promptContent: 'You are a professional survey interviewer.',
        });

        expect(result.valid).toBe(true);
      });

      it('should reject missing promptContent', () => {
        const result = validateMessage('systemPrompt', {});

        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
      });

      it('should reject empty promptContent', () => {
        const result = validateMessage('systemPrompt', {
          promptContent: '   ',
        });

        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
      });
    });

    describe('audioInput', () => {
      it('should accept valid audioInput data', () => {
        const validBase64 = Buffer.from('test audio data').toString('base64');
        const result = validateMessage('audioInput', {
          audioData: validBase64,
        });

        expect(result.valid).toBe(true);
      });

      it('should reject missing audioData', () => {
        const result = validateMessage('audioInput', {});

        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
      });

      it('should reject invalid base64', () => {
        const result = validateMessage('audioInput', {
          audioData: 'not-valid-base64!!!',
        });

        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe(ERROR_CODES.AUDIO_FORMAT_INVALID);
      });
    });

    describe('stopAudio', () => {
      it('should accept valid stopAudio data', () => {
        const result = validateMessage('stopAudio', {
          reason: 'user_requested',
        });

        expect(result.valid).toBe(true);
      });

      it('should accept stopAudio without data', () => {
        const result = validateMessage('stopAudio', undefined);

        expect(result.valid).toBe(true);
      });
    });

    describe('promptStart and audioStart', () => {
      it('should accept promptStart without data', () => {
        const result = validateMessage('promptStart', undefined);

        expect(result.valid).toBe(true);
      });

      it('should accept audioStart without data', () => {
        const result = validateMessage('audioStart', undefined);

        expect(result.valid).toBe(true);
      });
    });

    it('should reject unknown event types', () => {
      const result = validateMessage('unknownEvent', {});

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
      expect(result.error).toContain('Unknown event type');
    });

    it('should reject null data for events that require data', () => {
      const result = validateMessage('initializeConnection', null);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.WS_MESSAGE_INVALID);
    });
  });

  describe('validateAudioChunk', () => {
    it('should accept valid base64 audio data', () => {
      const validBase64 = Buffer.from('test audio data').toString('base64');
      const result = validateAudioChunk(validBase64);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid base64 format', () => {
      const result = validateAudioChunk('not-valid-base64!!!');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.AUDIO_FORMAT_INVALID);
    });

    it('should reject audio chunk exceeding 1MB', () => {
      // Create a base64 string that decodes to > 1MB
      const largeData = 'A'.repeat(1400000); // ~1.4MB when base64 encoded
      const result = validateAudioChunk(largeData);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.AUDIO_FORMAT_INVALID);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('should reject empty string', () => {
      const result = validateAudioChunk('');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.AUDIO_FORMAT_INVALID);
    });

    it('should reject base64 with invalid length', () => {
      // Base64 length must be multiple of 4
      const result = validateAudioChunk('ABC');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.AUDIO_FORMAT_INVALID);
    });
  });

  describe('validateSessionId', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = new SessionManager(new InMemorySessionStorage());
    });

    it('should accept valid active session', async () => {
      // Create a session
      const session = await sessionManager.createSession('test-session-123', {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      });

      const result = await validateSessionId(session.sessionId, sessionManager);

      expect(result.valid).toBe(true);
    });

    it('should reject missing sessionId', async () => {
      const result = await validateSessionId(undefined, sessionManager);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SESSION_INVALID);
    });

    it('should reject empty sessionId', async () => {
      const result = await validateSessionId('   ', sessionManager);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SESSION_INVALID);
    });

    it('should reject non-existent session', async () => {
      const result = await validateSessionId('non-existent-session', sessionManager);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SESSION_NOT_FOUND);
    });

    it('should reject inactive session', async () => {
      // Create a session
      const session = await sessionManager.createSession('test-session-456', {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      });

      // Update session to completed status
      await sessionManager.updateSession(session.sessionId, {
        status: 'completed',
      });

      const result = await validateSessionId(session.sessionId, sessionManager);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SESSION_EXPIRED);
    });
  });
});
