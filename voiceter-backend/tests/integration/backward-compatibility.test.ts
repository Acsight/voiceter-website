/**
 * Integration Test: Backward Compatibility for Gemini Live Migration
 *
 * Tests that the Gemini Live migration maintains backward compatibility with:
 * - Existing WebSocket event types (session:start, session:end, audio:chunk, etc.)
 * - Existing tool definitions and execution flow
 * - Existing session state structure
 * - Existing error codes and error handling behavior
 *
 * Requirements: 12.1, 12.3, 12.4, 12.5
 */

import {
  SessionStartEvent,
  SessionEndEvent,
  AudioChunkEvent,
  ConfigUpdateEvent,
  QuestionnaireSelectEvent,
  SessionReadyEvent,
  TranscriptionUserEvent,
  TranscriptionAssistantEvent,
  AudioChunkResponseEvent,
  QuestionAdvanceEvent,
  SessionCompleteEvent,
  BargeInEvent,
  ErrorEvent,
  isSessionStartEvent,
  isSessionEndEvent,
  isAudioChunkEvent,
  isConfigUpdateEvent,
  isQuestionnaireSelectEvent,
} from '../../src/websocket/events';
import { ERROR_CODES, ERROR_MESSAGES, RECOVERABLE_ERRORS, ErrorCode } from '../../src/errors/codes';
import { Session, SessionStatus, GeminiSessionFields } from '../../src/session/types';
import { ToolExecutor, getToolExecutor } from '../../src/tools/executor';

describe('Backward Compatibility Tests', () => {
  /**
   * Task 18.1: Verify WebSocket event compatibility
   * Requirements: 12.1
   */
  describe('18.1 WebSocket Event Compatibility', () => {
    describe('Client to Server Events', () => {
      it('should preserve session:start event structure', () => {
        const event: SessionStartEvent = {
          event: 'session:start',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            questionnaireId: 'demo1_csat_nps',
            voiceId: 'matthew',
            userId: 'user-123',
          },
        };

        expect(isSessionStartEvent(event)).toBe(true);
        expect(event.event).toBe('session:start');
        expect(event.data.questionnaireId).toBeDefined();
        expect(event.data.voiceId).toBeDefined();
      });

      it('should preserve session:end event structure', () => {
        const event: SessionEndEvent = {
          event: 'session:end',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            reason: 'completed',
          },
        };

        expect(isSessionEndEvent(event)).toBe(true);
        expect(event.event).toBe('session:end');
        expect(['user_ended', 'completed', 'timeout', 'error']).toContain(event.data.reason);
      });

      it('should preserve audio:chunk event structure', () => {
        const event: AudioChunkEvent = {
          event: 'audio:chunk',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            audioData: Buffer.from('test audio').toString('base64'),
            sequenceNumber: 1,
          },
        };

        expect(isAudioChunkEvent(event)).toBe(true);
        expect(event.event).toBe('audio:chunk');
        expect(typeof event.data.audioData).toBe('string');
        expect(typeof event.data.sequenceNumber).toBe('number');
      });

      it('should preserve config:update event structure', () => {
        const event: ConfigUpdateEvent = {
          event: 'config:update',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            voiceId: 'tiffany',
            audioConfig: {
              sampleRate: 16000,
              sampleSizeBits: 16,
              channelCount: 1,
            },
          },
        };

        expect(isConfigUpdateEvent(event)).toBe(true);
        expect(event.event).toBe('config:update');
      });

      it('should preserve questionnaire:select event structure', () => {
        const event: QuestionnaireSelectEvent = {
          event: 'questionnaire:select',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            questionnaireId: 'demo2_concept_test',
          },
        };

        expect(isQuestionnaireSelectEvent(event)).toBe(true);
        expect(event.event).toBe('questionnaire:select');
        expect(event.data.questionnaireId).toBeDefined();
      });

      it('should support all valid session:end reasons', () => {
        const validReasons: Array<'user_ended' | 'completed' | 'timeout' | 'error'> = [
          'user_ended',
          'completed',
          'timeout',
          'error',
        ];

        validReasons.forEach((reason) => {
          const event: SessionEndEvent = {
            event: 'session:end',
            sessionId: 'test-session-123',
            timestamp: new Date().toISOString(),
            data: { reason },
          };

          expect(isSessionEndEvent(event)).toBe(true);
        });
      });
    });

    describe('Server to Client Events', () => {
      it('should preserve session:ready event structure', () => {
        const event: SessionReadyEvent = {
          event: 'session:ready',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            questionnaireName: 'Customer Satisfaction Survey',
            estimatedDuration: 5,
            firstQuestion: {
              questionId: 'q1',
              questionNumber: 1,
              questionType: 'rating',
              questionText: 'How satisfied are you?',
              options: [
                { optionId: 'opt1', optionText: 'Very Satisfied', optionValue: '5' },
              ],
            },
          },
        };

        expect(event.event).toBe('session:ready');
        expect(event.data.questionnaireName).toBeDefined();
        expect(event.data.firstQuestion).toBeDefined();
        expect(event.data.firstQuestion.questionId).toBeDefined();
      });

      it('should preserve transcription:user event structure', () => {
        const event: TranscriptionUserEvent = {
          event: 'transcription:user',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            transcript: 'I am very satisfied with the service',
            isFinal: true,
          },
        };

        expect(event.event).toBe('transcription:user');
        expect(typeof event.data.transcript).toBe('string');
        expect(typeof event.data.isFinal).toBe('boolean');
      });

      it('should preserve transcription:assistant event structure', () => {
        const event: TranscriptionAssistantEvent = {
          event: 'transcription:assistant',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            transcript: 'Thank you for your feedback!',
            isFinal: true,
          },
        };

        expect(event.event).toBe('transcription:assistant');
        expect(typeof event.data.transcript).toBe('string');
        expect(typeof event.data.isFinal).toBe('boolean');
      });

      it('should preserve audio:chunk response event structure', () => {
        const event: AudioChunkResponseEvent = {
          event: 'audio:chunk',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            audioData: Buffer.from('response audio').toString('base64'),
            sequenceNumber: 1,
          },
        };

        expect(event.event).toBe('audio:chunk');
        expect(typeof event.data.audioData).toBe('string');
        expect(typeof event.data.sequenceNumber).toBe('number');
      });

      it('should preserve question:advance event structure', () => {
        const event: QuestionAdvanceEvent = {
          event: 'question:advance',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            question: {
              questionId: 'q2',
              questionNumber: 2,
              questionType: 'open_ended',
              questionText: 'What could we improve?',
              isRequired: true,
            },
            progress: {
              current: 2,
              total: 5,
              percentage: 40,
            },
          },
        };

        expect(event.event).toBe('question:advance');
        expect(event.data.question).toBeDefined();
        expect(event.data.progress).toBeDefined();
        expect(event.data.progress.current).toBeLessThanOrEqual(event.data.progress.total);
      });

      it('should preserve session:complete event structure', () => {
        const event: SessionCompleteEvent = {
          event: 'session:complete',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            completionStatus: 'completed',
            totalQuestions: 5,
            answeredQuestions: 5,
            duration: 300,
          },
        };

        expect(event.event).toBe('session:complete');
        expect(['completed', 'terminated']).toContain(event.data.completionStatus);
        expect(typeof event.data.totalQuestions).toBe('number');
        expect(typeof event.data.answeredQuestions).toBe('number');
        expect(typeof event.data.duration).toBe('number');
      });

      it('should preserve barge-in event structure', () => {
        const event: BargeInEvent = {
          event: 'barge-in',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            timestamp: new Date().toISOString(),
            message: 'User interrupted AI speech',
          },
        };

        expect(event.event).toBe('barge-in');
        expect(event.data.message).toBeDefined();
      });

      it('should preserve error event structure', () => {
        const event: ErrorEvent = {
          event: 'error',
          sessionId: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            errorCode: 'SESSION_NOT_FOUND',
            errorMessage: 'Session not found',
            recoverable: false,
          },
        };

        expect(event.event).toBe('error');
        expect(typeof event.data.errorCode).toBe('string');
        expect(typeof event.data.errorMessage).toBe('string');
        expect(typeof event.data.recoverable).toBe('boolean');
      });
    });
  });

  /**
   * Task 18.2: Verify tool definition compatibility
   * Requirements: 12.3
   */
  describe('18.2 Tool Definition Compatibility', () => {
    let toolExecutor: ToolExecutor;

    beforeAll(() => {
      toolExecutor = getToolExecutor();
    });

    it('should have all required tools registered', () => {
      const toolDefinitions = toolExecutor.getToolDefinitions();
      const toolNames = toolDefinitions.map((t) => t.name);

      expect(toolNames).toContain('record_response');
      expect(toolNames).toContain('get_next_question');
      expect(toolNames).toContain('validate_answer');
      expect(toolNames).toContain('get_demo_context');
    });

    it('should preserve record_response tool schema', () => {
      const toolDefinitions = toolExecutor.getToolDefinitions();
      const recordResponse = toolDefinitions.find((t) => t.name === 'record_response');

      expect(recordResponse).toBeDefined();
      expect(recordResponse!.inputSchema.type).toBe('object');
      expect(recordResponse!.inputSchema.properties).toHaveProperty('questionId');
      expect(recordResponse!.inputSchema.properties).toHaveProperty('response');
      expect(recordResponse!.inputSchema.required).toContain('questionId');
      expect(recordResponse!.inputSchema.required).toContain('response');
    });

    it('should preserve get_next_question tool schema', () => {
      const toolDefinitions = toolExecutor.getToolDefinitions();
      const getNextQuestion = toolDefinitions.find((t) => t.name === 'get_next_question');

      expect(getNextQuestion).toBeDefined();
      expect(getNextQuestion!.inputSchema.type).toBe('object');
      expect(getNextQuestion!.inputSchema.properties).toHaveProperty('currentQuestionId');
      expect(getNextQuestion!.inputSchema.required).toContain('currentQuestionId');
    });

    it('should preserve validate_answer tool schema', () => {
      const toolDefinitions = toolExecutor.getToolDefinitions();
      const validateAnswer = toolDefinitions.find((t) => t.name === 'validate_answer');

      expect(validateAnswer).toBeDefined();
      expect(validateAnswer!.inputSchema.type).toBe('object');
      expect(validateAnswer!.inputSchema.properties).toHaveProperty('questionId');
      expect(validateAnswer!.inputSchema.properties).toHaveProperty('response');
      expect(validateAnswer!.inputSchema.required).toContain('questionId');
      expect(validateAnswer!.inputSchema.required).toContain('response');
    });

    it('should preserve get_demo_context tool schema', () => {
      const toolDefinitions = toolExecutor.getToolDefinitions();
      const getDemoContext = toolDefinitions.find((t) => t.name === 'get_demo_context');

      expect(getDemoContext).toBeDefined();
      expect(getDemoContext!.inputSchema.type).toBe('object');
    });

    it('should validate tool parameters correctly', () => {
      // Valid parameters
      const validResult = toolExecutor.validateToolParameters('record_response', {
        questionId: 'q1',
        response: 'test response',
      });
      expect(validResult.valid).toBe(true);

      // Missing required parameter
      const invalidResult = toolExecutor.validateToolParameters('record_response', {
        response: 'test response',
      });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Missing required parameter: questionId');
    });

    it('should return error for unknown tool', () => {
      const result = toolExecutor.validateToolParameters('unknown_tool', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Tool 'unknown_tool' not found");
    });
  });

  /**
   * Task 18.3: Verify session state compatibility
   * Requirements: 12.4
   */
  describe('18.3 Session State Compatibility', () => {
    it('should preserve core session fields', () => {
      const session: Session = {
        sessionId: 'test-session-123',
        socketId: 'socket-123',
        userId: 'user-123',
        questionnaireId: 'demo1_csat_nps',
        currentQuestionIndex: 0,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: {
          promptName: 'prompt-123',
          audioContentId: 'content-123',
        },
        audioConfig: {
          sampleRate: 16000,
          sampleSizeBits: 16,
          channelCount: 1,
        },
        voiceId: 'matthew',
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      // Verify all core fields exist
      expect(session.sessionId).toBeDefined();
      expect(session.questionnaireId).toBeDefined();
      expect(session.currentQuestionIndex).toBeDefined();
      expect(session.responses).toBeInstanceOf(Map);
      expect(session.conversationHistory).toBeInstanceOf(Array);
      expect(session.bedrockStreamIds).toBeDefined();
      expect(session.audioConfig).toBeDefined();
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.lastActivityTime).toBeInstanceOf(Date);
      expect(session.status).toBeDefined();
    });

    it('should support all valid session statuses', () => {
      const validStatuses: SessionStatus[] = ['active', 'completed', 'terminated', 'abandoned', 'error'];

      validStatuses.forEach((status) => {
        const session: Partial<Session> = {
          sessionId: 'test-session',
          status,
        };
        expect(['active', 'completed', 'terminated', 'abandoned', 'error']).toContain(session.status);
      });
    });

    it('should support optional Gemini fields without breaking existing structure', () => {
      // Session without Gemini fields (Bedrock mode)
      const bedrockSession: Session = {
        sessionId: 'bedrock-session',
        questionnaireId: 'demo1',
        currentQuestionIndex: 0,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'prompt-1' },
        audioConfig: { sampleRate: 16000, sampleSizeBits: 16, channelCount: 1 },
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      expect(bedrockSession.gemini).toBeUndefined();

      // Session with Gemini fields
      const geminiFields: GeminiSessionFields = {
        geminiSessionId: 'gemini-session-123',
        voiceName: 'Charon',
        isConnected: true,
        connectionAttempts: 1,
        turnCount: 5,
        audioChunksReceived: 100,
        audioChunksSent: 50,
        toolCallsExecuted: 3,
        totalToolExecutionTimeMs: 1500,
      };

      const geminiSession: Session = {
        ...bedrockSession,
        sessionId: 'gemini-session',
        gemini: geminiFields,
      };

      expect(geminiSession.gemini).toBeDefined();
      expect(geminiSession.gemini!.geminiSessionId).toBe('gemini-session-123');
      expect(geminiSession.gemini!.isConnected).toBe(true);

      // Core fields should still be accessible
      expect(geminiSession.sessionId).toBe('gemini-session');
      expect(geminiSession.questionnaireId).toBe('demo1');
    });

    it('should preserve conversation history structure', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'demo1',
        currentQuestionIndex: 1,
        responses: new Map(),
        conversationHistory: [
          {
            speaker: 'ASSISTANT',
            text: 'Welcome to the survey!',
            timestamp: new Date(),
            isFinal: true,
          },
          {
            speaker: 'USER',
            text: 'Hello!',
            timestamp: new Date(),
            isFinal: true,
          },
        ],
        bedrockStreamIds: { promptName: 'prompt-1' },
        audioConfig: { sampleRate: 16000, sampleSizeBits: 16, channelCount: 1 },
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      expect(session.conversationHistory.length).toBe(2);
      expect(session.conversationHistory[0].speaker).toBe('ASSISTANT');
      expect(session.conversationHistory[1].speaker).toBe('USER');
      expect(session.conversationHistory[0].isFinal).toBe(true);
    });

    it('should preserve response map structure', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'demo1',
        currentQuestionIndex: 2,
        responses: new Map([
          ['q1', { questionId: 'q1', response: '5', responseType: 'rating' } as any],
          ['q2', { questionId: 'q2', response: 'Great service!', responseType: 'text' } as any],
        ]),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'prompt-1' },
        audioConfig: { sampleRate: 16000, sampleSizeBits: 16, channelCount: 1 },
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      expect(session.responses.size).toBe(2);
      expect(session.responses.get('q1')).toBeDefined();
      expect(session.responses.get('q2')).toBeDefined();
    });
  });

  /**
   * Task 18.4: Verify error code compatibility
   * Requirements: 12.5
   */
  describe('18.4 Error Code Compatibility', () => {
    it('should preserve all existing WebSocket error codes', () => {
      expect(ERROR_CODES.WS_CONNECTION_FAILED).toBe('WS_CONNECTION_FAILED');
      expect(ERROR_CODES.WS_MESSAGE_INVALID).toBe('WS_MESSAGE_INVALID');
      expect(ERROR_CODES.WS_DISCONNECTED).toBe('WS_DISCONNECTED');
      expect(ERROR_CODES.WS_RECONNECTION_FAILED).toBe('WS_RECONNECTION_FAILED');
      expect(ERROR_CODES.WS_RATE_LIMIT_EXCEEDED).toBe('WS_RATE_LIMIT_EXCEEDED');
    });

    it('should preserve all existing Bedrock error codes', () => {
      expect(ERROR_CODES.BEDROCK_INIT_FAILED).toBe('BEDROCK_INIT_FAILED');
      expect(ERROR_CODES.BEDROCK_STREAM_ERROR).toBe('BEDROCK_STREAM_ERROR');
      expect(ERROR_CODES.BEDROCK_RATE_LIMIT).toBe('BEDROCK_RATE_LIMIT');
      expect(ERROR_CODES.BEDROCK_MODEL_ERROR).toBe('BEDROCK_MODEL_ERROR');
      expect(ERROR_CODES.BEDROCK_TIMEOUT).toBe('BEDROCK_TIMEOUT');
    });

    it('should preserve all existing database error codes', () => {
      expect(ERROR_CODES.DB_WRITE_FAILED).toBe('DB_WRITE_FAILED');
      expect(ERROR_CODES.DB_READ_FAILED).toBe('DB_READ_FAILED');
      expect(ERROR_CODES.DB_CONNECTION_FAILED).toBe('DB_CONNECTION_FAILED');
      expect(ERROR_CODES.DB_THROTTLED).toBe('DB_THROTTLED');
    });

    it('should preserve all existing audio error codes', () => {
      expect(ERROR_CODES.AUDIO_PROCESSING_ERROR).toBe('AUDIO_PROCESSING_ERROR');
      expect(ERROR_CODES.AUDIO_FORMAT_INVALID).toBe('AUDIO_FORMAT_INVALID');
      expect(ERROR_CODES.AUDIO_ENCODING_ERROR).toBe('AUDIO_ENCODING_ERROR');
      expect(ERROR_CODES.AUDIO_DECODING_ERROR).toBe('AUDIO_DECODING_ERROR');
    });

    it('should preserve all existing questionnaire error codes', () => {
      expect(ERROR_CODES.QUESTIONNAIRE_LOGIC_ERROR).toBe('QUESTIONNAIRE_LOGIC_ERROR');
      expect(ERROR_CODES.QUESTIONNAIRE_NOT_FOUND).toBe('QUESTIONNAIRE_NOT_FOUND');
      expect(ERROR_CODES.QUESTION_NOT_FOUND).toBe('QUESTION_NOT_FOUND');
      expect(ERROR_CODES.INVALID_RESPONSE).toBe('INVALID_RESPONSE');
    });

    it('should preserve all existing tool error codes', () => {
      expect(ERROR_CODES.TOOL_EXECUTION_ERROR).toBe('TOOL_EXECUTION_ERROR');
      expect(ERROR_CODES.TOOL_NOT_FOUND).toBe('TOOL_NOT_FOUND');
      expect(ERROR_CODES.TOOL_TIMEOUT).toBe('TOOL_TIMEOUT');
      expect(ERROR_CODES.TOOL_INVALID_PARAMS).toBe('TOOL_INVALID_PARAMS');
    });

    it('should preserve all existing session error codes', () => {
      expect(ERROR_CODES.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
      expect(ERROR_CODES.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND');
      expect(ERROR_CODES.SESSION_INVALID).toBe('SESSION_INVALID');
    });

    it('should preserve all existing general error codes', () => {
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ERROR_CODES.TIMEOUT_ERROR).toBe('TIMEOUT_ERROR');
      expect(ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN');
    });

    it('should have Gemini error codes added without removing existing codes', () => {
      // New Gemini error codes
      expect(ERROR_CODES.GEMINI_CONNECTION_FAILED).toBe('GEMINI_CONNECTION_FAILED');
      expect(ERROR_CODES.GEMINI_AUTH_FAILED).toBe('GEMINI_AUTH_FAILED');
      expect(ERROR_CODES.GEMINI_RATE_LIMITED).toBe('GEMINI_RATE_LIMITED');
      expect(ERROR_CODES.GEMINI_STREAM_ERROR).toBe('GEMINI_STREAM_ERROR');
      expect(ERROR_CODES.GEMINI_TOOL_TIMEOUT).toBe('GEMINI_TOOL_TIMEOUT');
      expect(ERROR_CODES.GEMINI_TOOL_ERROR).toBe('GEMINI_TOOL_ERROR');

      // Verify existing codes still exist
      expect(ERROR_CODES.BEDROCK_INIT_FAILED).toBeDefined();
      expect(ERROR_CODES.SESSION_NOT_FOUND).toBeDefined();
    });

    it('should have user-friendly messages for all error codes', () => {
      const allErrorCodes = Object.values(ERROR_CODES) as ErrorCode[];

      allErrorCodes.forEach((code) => {
        expect(ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof ERROR_MESSAGES[code]).toBe('string');
        expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      });
    });

    it('should preserve recoverable error classification', () => {
      // These errors should be recoverable
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.WS_DISCONNECTED)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.BEDROCK_RATE_LIMIT)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.BEDROCK_TIMEOUT)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.DB_WRITE_FAILED)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.TOOL_TIMEOUT)).toBe(true);

      // These errors should NOT be recoverable
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.SESSION_NOT_FOUND)).toBe(false);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.SESSION_EXPIRED)).toBe(false);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.UNAUTHORIZED)).toBe(false);
    });

    it('should have Gemini recoverable errors properly classified', () => {
      // Gemini recoverable errors
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.GEMINI_RATE_LIMITED)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.GEMINI_STREAM_ERROR)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.GEMINI_TOOL_TIMEOUT)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.GEMINI_TOOL_ERROR)).toBe(true);
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.GEMINI_GO_AWAY)).toBe(true);

      // Gemini non-recoverable errors
      expect(RECOVERABLE_ERRORS.has(ERROR_CODES.GEMINI_AUTH_FAILED)).toBe(false);
    });

    it('should not expose internal details in user-friendly messages', () => {
      const allErrorCodes = Object.values(ERROR_CODES) as ErrorCode[];

      allErrorCodes.forEach((code) => {
        const message = ERROR_MESSAGES[code];
        
        // Messages should not contain stack traces
        expect(message).not.toMatch(/at\s+\w+\s+\(/);
        
        // Messages should not contain file paths
        expect(message).not.toMatch(/\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(ts|js)/);
        
        // Messages should not contain API keys or secrets
        expect(message.toLowerCase()).not.toContain('api_key');
        expect(message.toLowerCase()).not.toContain('secret');
        expect(message.toLowerCase()).not.toContain('password');
      });
    });
  });
});
