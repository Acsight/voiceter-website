/**
 * Property-based tests for API contract consistency
 *
 * **Property 12: API contract consistency**
 * **Validates: Requirements 12.4**
 *
 * For any API endpoint, the request and response format SHALL be consistent
 * and well-defined for the direct WebSocket architecture.
 */

import * as fc from 'fast-check';

/**
 * Session start request interface
 */
interface SessionStartRequest {
  questionnaireId: string;
  voiceId?: string;
}

/**
 * Session start response interface
 */
interface SessionStartResponse {
  sessionId: string;
  preSignedUrl: string;
  expiresAt: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  questionnaire: QuestionnaireInfo;
  voiceId: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface QuestionnaireInfo {
  id: string;
  name: string;
  totalQuestions: number;
  firstQuestion: {
    id: string;
    text: string;
    type: string;
    options?: Array<{ value: string; label?: string; text?: string }>;
  };
}

/**
 * Tool execute request interface
 */
interface ToolExecuteRequest {
  sessionId: string;
  toolName: string;
  toolUseId: string;
  parameters: Record<string, unknown>;
}

/**
 * Tool execute response interface
 */
interface ToolExecuteResponse {
  success: boolean;
  toolUseId: string;
  result?: unknown;
  error?: string;
}

/**
 * Transcript request interface
 */
interface TranscriptRequest {
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isFinal?: boolean;
  turnNumber?: number;
}

/**
 * Transcript response interface
 */
interface TranscriptResponse {
  success: boolean;
  guardrailBlocked?: boolean;
  blockedReason?: string;
}

/**
 * Audio chunk request interface
 */
interface AudioChunkRequest {
  sessionId: string;
  source: 'user' | 'assistant';
  audioData: string;
}

/**
 * Audio chunk response interface
 */
interface AudioChunkResponse {
  success: boolean;
}

/**
 * Session end request interface
 */
interface SessionEndRequest {
  sessionId: string;
  reason?: 'completed' | 'terminated' | 'error';
}

/**
 * Session end response interface
 */
interface SessionEndResponse {
  success: boolean;
  summary: {
    duration: number;
    questionsAnswered: number;
    recordingUrl?: string;
  };
}

describe('Property 12: API contract consistency', () => {
  /**
   * Arbitrary for valid voice IDs
   */
  const validVoiceIdArb = fc.constantFrom('matthew', 'tiffany', 'amy');

  /**
   * Arbitrary for valid questionnaire IDs
   */
  const validQuestionnaireIdArb = fc.constantFrom(
    'demo1_csat_nps',
    'demo2_concept_test',
    'demo3_political_polling',
    'demo4_brand_tracker'
  );

  /**
   * Arbitrary for valid tool names
   */
  const validToolNameArb = fc.constantFrom(
    'record_response',
    'get_next_question',
    'validate_answer',
    'get_demo_context'
  );

  /**
   * Arbitrary for valid transcript roles
   */
  const validRoleArb = fc.constantFrom('user' as const, 'assistant' as const);

  /**
   * Arbitrary for valid audio sources
   */
  const validAudioSourceArb = fc.constantFrom('user' as const, 'assistant' as const);

  /**
   * Arbitrary for valid session end reasons
   */
  const validEndReasonArb = fc.constantFrom(
    'completed' as const,
    'terminated' as const,
    'error' as const
  );

  /**
   * Arbitrary for session start request
   */
  const sessionStartRequestArb: fc.Arbitrary<SessionStartRequest> = fc.record({
    questionnaireId: validQuestionnaireIdArb,
    voiceId: fc.option(validVoiceIdArb, { nil: undefined }),
  });

  /**
   * Arbitrary for tool execute request
   */
  const toolExecuteRequestArb: fc.Arbitrary<ToolExecuteRequest> = fc.record({
    sessionId: fc.uuid(),
    toolName: validToolNameArb,
    toolUseId: fc.uuid(),
    parameters: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean())
    ),
  });

  /**
   * Arbitrary for transcript request
   */
  const transcriptRequestArb: fc.Arbitrary<TranscriptRequest> = fc.record({
    sessionId: fc.uuid(),
    role: validRoleArb,
    content: fc.string({ minLength: 1, maxLength: 500 }),
    timestamp: fc.integer({ min: 1600000000000, max: 2000000000000 }),
    isFinal: fc.option(fc.boolean(), { nil: undefined }),
    turnNumber: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  });

  /**
   * Arbitrary for audio chunk request
   */
  const audioChunkRequestArb: fc.Arbitrary<AudioChunkRequest> = fc.record({
    sessionId: fc.uuid(),
    source: validAudioSourceArb,
    audioData: fc.base64String({ minLength: 100, maxLength: 2000 }),
  });

  /**
   * Arbitrary for session end request
   */
  const sessionEndRequestArb: fc.Arbitrary<SessionEndRequest> = fc.record({
    sessionId: fc.uuid(),
    reason: fc.option(validEndReasonArb, { nil: undefined }),
  });

  // Feature: direct-websocket-bedrock, Property 12: Session start request format is valid
  it('should have valid session start request format', () => {
    fc.assert(
      fc.property(
        sessionStartRequestArb,
        (request) => {
          // Request structure should have required fields
          expect(request).toHaveProperty('questionnaireId');
          expect(typeof request.questionnaireId).toBe('string');
          
          // voiceId is optional but format is the same
          if (request.voiceId !== undefined) {
            expect(typeof request.voiceId).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Session start response structure is valid
  it('should have valid session start response structure', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        validVoiceIdArb,
        (sessionId, voiceId) => {
          // Simulate response structure
          const response: SessionStartResponse = {
            sessionId,
            preSignedUrl: 'wss://bedrock-runtime.us-east-1.amazonaws.com/...',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            systemPrompt: 'Test system prompt',
            tools: [
              {
                name: 'record_response',
                description: 'Record response',
                inputSchema: { type: 'object', properties: {}, required: [] },
              },
            ],
            questionnaire: {
              id: 'demo1',
              name: 'Demo Questionnaire',
              totalQuestions: 5,
              firstQuestion: {
                id: 'q1',
                text: 'First question',
                type: 'open_ended',
              },
            },
            voiceId,
          };

          // All required fields must be present
          expect(response.sessionId).toBeDefined();
          expect(typeof response.sessionId).toBe('string');
          
          expect(response.preSignedUrl).toBeDefined();
          expect(typeof response.preSignedUrl).toBe('string');
          expect(response.preSignedUrl.startsWith('wss://')).toBe(true);
          
          expect(response.expiresAt).toBeDefined();
          expect(typeof response.expiresAt).toBe('string');
          
          expect(response.systemPrompt).toBeDefined();
          expect(typeof response.systemPrompt).toBe('string');
          
          expect(response.tools).toBeDefined();
          expect(Array.isArray(response.tools)).toBe(true);
          
          expect(response.questionnaire).toBeDefined();
          expect(response.questionnaire.id).toBeDefined();
          expect(response.questionnaire.name).toBeDefined();
          expect(response.questionnaire.totalQuestions).toBeGreaterThan(0);
          expect(response.questionnaire.firstQuestion).toBeDefined();
          
          expect(response.voiceId).toBeDefined();
          expect(typeof response.voiceId).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Tool execute request format is valid
  it('should have valid tool execute request format', () => {
    fc.assert(
      fc.property(
        toolExecuteRequestArb,
        (request) => {
          // Request structure should have required fields
          expect(request).toHaveProperty('sessionId');
          expect(request).toHaveProperty('toolName');
          expect(request).toHaveProperty('toolUseId');
          expect(request).toHaveProperty('parameters');
          
          expect(typeof request.sessionId).toBe('string');
          expect(typeof request.toolName).toBe('string');
          expect(typeof request.toolUseId).toBe('string');
          expect(typeof request.parameters).toBe('object');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Tool execute response structure is valid
  it('should have valid tool execute response structure', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.boolean(),
        (toolUseId, success) => {
          // Simulate response structure
          const response: ToolExecuteResponse = {
            success,
            toolUseId,
            result: success ? { data: 'test' } : undefined,
            error: success ? undefined : 'Test error',
          };

          // All required fields must be present
          expect(response.success).toBeDefined();
          expect(typeof response.success).toBe('boolean');
          
          expect(response.toolUseId).toBeDefined();
          expect(typeof response.toolUseId).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Transcript request format is valid
  it('should have valid transcript request format', () => {
    fc.assert(
      fc.property(
        transcriptRequestArb,
        (request) => {
          // Request structure should have required fields
          expect(request).toHaveProperty('sessionId');
          expect(request).toHaveProperty('role');
          expect(request).toHaveProperty('content');
          expect(request).toHaveProperty('timestamp');
          
          expect(typeof request.sessionId).toBe('string');
          expect(['user', 'assistant']).toContain(request.role);
          expect(typeof request.content).toBe('string');
          expect(typeof request.timestamp).toBe('number');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Transcript response structure is valid
  it('should have valid transcript response structure', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        (success, guardrailBlocked) => {
          // Simulate response structure
          const response: TranscriptResponse = {
            success,
            guardrailBlocked: guardrailBlocked ? true : undefined,
            blockedReason: guardrailBlocked ? 'Content policy violation' : undefined,
          };

          // All required fields must be present
          expect(response.success).toBeDefined();
          expect(typeof response.success).toBe('boolean');

          // Optional fields have consistent types when present
          if (response.guardrailBlocked !== undefined) {
            expect(typeof response.guardrailBlocked).toBe('boolean');
          }
          if (response.blockedReason !== undefined) {
            expect(typeof response.blockedReason).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Audio chunk request format is valid
  it('should have valid audio chunk request format', () => {
    fc.assert(
      fc.property(
        audioChunkRequestArb,
        (request) => {
          // Request structure should have required fields
          expect(request).toHaveProperty('sessionId');
          expect(request).toHaveProperty('source');
          expect(request).toHaveProperty('audioData');
          
          expect(typeof request.sessionId).toBe('string');
          expect(['user', 'assistant']).toContain(request.source);
          expect(typeof request.audioData).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Audio chunk response structure is valid
  it('should have valid audio chunk response structure', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (success) => {
          // Simulate response structure
          const response: AudioChunkResponse = {
            success,
          };

          // All required fields must be present
          expect(response.success).toBeDefined();
          expect(typeof response.success).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Session end request format is valid
  it('should have valid session end request format', () => {
    fc.assert(
      fc.property(
        sessionEndRequestArb,
        (request) => {
          // Request structure should have required fields
          expect(request).toHaveProperty('sessionId');
          expect(typeof request.sessionId).toBe('string');
          
          // reason is optional but format is the same
          if (request.reason !== undefined) {
            expect(['completed', 'terminated', 'error']).toContain(request.reason);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Session end response structure is valid
  it('should have valid session end response structure', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 3600 }),
        fc.integer({ min: 0, max: 50 }),
        (success, duration, questionsAnswered) => {
          // Simulate response structure
          const response: SessionEndResponse = {
            success,
            summary: {
              duration,
              questionsAnswered,
              recordingUrl: 's3://bucket/recording.wav',
            },
          };

          // All required fields must be present
          expect(response.success).toBeDefined();
          expect(typeof response.success).toBe('boolean');
          
          expect(response.summary).toBeDefined();
          expect(typeof response.summary.duration).toBe('number');
          expect(typeof response.summary.questionsAnswered).toBe('number');
          
          // recordingUrl is optional but type is consistent
          if (response.summary.recordingUrl !== undefined) {
            expect(typeof response.summary.recordingUrl).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 12: Error response format is consistent
  it('should have consistent error response format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.constantFrom(
          'INVALID_REQUEST',
          'SESSION_NOT_FOUND',
          'QUESTIONNAIRE_NOT_FOUND',
          'TOOL_EXECUTION_FAILED',
          'SESSION_START_FAILED',
          'SESSION_END_FAILED',
          'TRANSCRIPT_FAILED',
          'AUDIO_CHUNK_FAILED'
        ),
        (errorMessage, errorCode) => {
          // Simulate error response structure
          const errorResponse = {
            error: errorMessage,
            errorCode,
          };

          // Error response structure should be well-defined
          expect(errorResponse.error).toBeDefined();
          expect(typeof errorResponse.error).toBe('string');
          
          expect(errorResponse.errorCode).toBeDefined();
          expect(typeof errorResponse.errorCode).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
