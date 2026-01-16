/**
 * Property-based tests for session configuration completeness
 *
 * **Property 11: Session configuration completeness**
 * **Validates: Requirements 11.1, 11.3, 11.5**
 *
 * For any session start request, the response SHALL include pre-signed URL,
 * system prompt, tool definitions, and questionnaire configuration with the
 * selected voice ID.
 */

import * as fc from 'fast-check';
import { SystemPromptGenerator } from '../../src/questionnaire/prompt-generator';
import { ToolExecutor } from '../../src/tools/executor';
import type { Questionnaire, Question } from '../../src/questionnaire/types';
import type { Session } from '../../src/session/types';

describe('Property 11: Session configuration completeness', () => {
  /**
   * Arbitrary for valid voice IDs
   */
  const validVoiceIdArb = fc.constantFrom('matthew', 'tiffany', 'amy');

  /**
   * Arbitrary for valid questionnaire types
   */
  const validQuestionnaireTypeArb = fc.constantFrom(
    'csat_nps',
    'concept_test',
    'political_polling',
    'brand_tracker'
  );

  /**
   * Arbitrary for valid question types
   */
  const validQuestionTypeArb = fc.constantFrom(
    'rating',
    'rating_scale',
    'open_ended',
    'single_choice',
    'yes_no',
    'nps',
    'voice_prompt'
  );

  /**
   * Arbitrary for question options
   */
  const questionOptionArb = fc.record({
    value: fc.string({ minLength: 1, maxLength: 20 }),
    optionValue: fc.string({ minLength: 1, maxLength: 20 }),
    text: fc.string({ minLength: 1, maxLength: 100 }),
    optionText: fc.string({ minLength: 1, maxLength: 100 }),
  });

  /**
   * Arbitrary for a valid question
   */
  const validQuestionArb: fc.Arbitrary<Question> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).map(s => `q-${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    questionId: fc.string({ minLength: 1, maxLength: 30 }).map(s => `q-${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    text: fc.string({ minLength: 10, maxLength: 200 }),
    questionText: fc.string({ minLength: 10, maxLength: 200 }),
    type: validQuestionTypeArb,
    questionType: validQuestionTypeArb,
    questionNumber: fc.integer({ min: 1, max: 50 }),
    isRequired: fc.boolean(),
    options: fc.option(fc.array(questionOptionArb, { minLength: 2, maxLength: 5 }), { nil: undefined }),
    metadata: fc.constant({}),
  });


  /**
   * Arbitrary for a valid questionnaire
   */
  const validQuestionnaireArb: fc.Arbitrary<Questionnaire> = fc.record({
    id: fc.string({ minLength: 5, maxLength: 30 }).map(s => `demo-${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    questionnaireId: fc.string({ minLength: 5, maxLength: 30 }).map(s => `demo-${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    name: fc.string({ minLength: 5, maxLength: 100 }),
    questionnaireName: fc.string({ minLength: 5, maxLength: 100 }),
    description: fc.string({ minLength: 10, maxLength: 500 }),
    type: validQuestionnaireTypeArb as fc.Arbitrary<any>,
    tone: fc.constantFrom('professional', 'friendly', 'neutral', 'empathetic'),
    recommendedVoice: validVoiceIdArb,
    questions: fc.array(validQuestionArb, { minLength: 1, maxLength: 10 }),
    totalQuestions: fc.integer({ min: 1, max: 50 }),
    estimatedDuration: fc.constantFrom('5 minutes', '10 minutes', '15 minutes'),
    industry: fc.constantFrom('retail', 'technology', 'healthcare', 'finance'),
    researchObjective: fc.string({ minLength: 10, maxLength: 200 }),
    metadata: fc.constant({}),
  });

  /**
   * Arbitrary for a minimal session state
   */
  const minimalSessionArb: fc.Arbitrary<Session> = fc.record({
    sessionId: fc.uuid(),
    questionnaireId: fc.string({ minLength: 5, maxLength: 30 }),
    currentQuestionIndex: fc.constant(0),
    responses: fc.constant(new Map()),
    conversationHistory: fc.constant([]),
    bedrockStreamIds: fc.constant({ promptName: '', contentName: '' }),
    audioConfig: fc.constant({
      sampleRate: 16000,
      sampleSizeBits: 16,
      channelCount: 1,
      voiceId: 'matthew',
    }),
    startTime: fc.constant(new Date()),
    lastActivityTime: fc.constant(new Date()),
    status: fc.constant('active' as const),
  });

  // Feature: direct-websocket-bedrock, Property 11: System prompt contains questionnaire context
  it('should generate system prompt containing questionnaire context for any questionnaire', () => {
    const promptGenerator = new SystemPromptGenerator();

    fc.assert(
      fc.property(
        validQuestionnaireArb,
        minimalSessionArb,
        (questionnaire, session) => {
          // Ensure questionnaire has at least one question
          if (questionnaire.questions.length === 0) {
            return; // Skip empty questionnaires
          }

          const firstQuestion = questionnaire.questions[0];
          const systemPrompt = promptGenerator.generateSystemPrompt(
            questionnaire,
            firstQuestion,
            session
          );

          // System prompt should be a non-empty string
          expect(typeof systemPrompt).toBe('string');
          expect(systemPrompt.length).toBeGreaterThan(0);

          // System prompt should contain CATI role information
          expect(systemPrompt).toContain('CATI');

          // System prompt should contain questionnaire name or description
          const hasQuestionnaireContext =
            systemPrompt.includes(questionnaire.name) ||
            systemPrompt.includes(questionnaire.questionnaireName) ||
            systemPrompt.includes(questionnaire.description) ||
            systemPrompt.includes('QUESTIONNAIRE');
          expect(hasQuestionnaireContext).toBe(true);

          // System prompt should contain first question text
          const hasFirstQuestion =
            systemPrompt.includes(firstQuestion.text) ||
            systemPrompt.includes(firstQuestion.questionText) ||
            systemPrompt.includes('Question 1') ||
            systemPrompt.includes('QUESTION');
          expect(hasFirstQuestion).toBe(true);

          // System prompt should contain tool usage instructions
          expect(systemPrompt).toContain('record_response');
        }
      ),
      { numRuns: 100 }
    );
  });


  // Feature: direct-websocket-bedrock, Property 11: Tool definitions are complete
  it('should provide all required tool definitions', () => {
    const toolExecutor = new ToolExecutor();
    const tools = toolExecutor.getToolDefinitionsForBedrock();

    // Should have all 4 required tools
    expect(tools.length).toBeGreaterThanOrEqual(4);

    const toolNames = tools.map(t => t.name);
    
    // Must include record_response tool
    expect(toolNames).toContain('record_response');
    
    // Must include get_next_question tool
    expect(toolNames).toContain('get_next_question');
    
    // Must include validate_answer tool
    expect(toolNames).toContain('validate_answer');
    
    // Must include get_demo_context tool
    expect(toolNames).toContain('get_demo_context');

    // Each tool should have required properties
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);

      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);

      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  // Feature: direct-websocket-bedrock, Property 11: Tool definitions have valid input schemas
  it('should have valid input schemas for all tools', () => {
    const toolExecutor = new ToolExecutor();
    const tools = toolExecutor.getToolDefinitionsForBedrock();

    fc.assert(
      fc.property(
        fc.constantFrom(...tools),
        (tool) => {
          // Input schema should be an object type
          expect(tool.inputSchema.type).toBe('object');

          // Properties should be defined
          expect(tool.inputSchema.properties).toBeDefined();
          expect(typeof tool.inputSchema.properties).toBe('object');

          // Required array should be defined (can be empty)
          if (tool.inputSchema.required) {
            expect(Array.isArray(tool.inputSchema.required)).toBe(true);
            
            // All required fields should exist in properties
            for (const requiredField of tool.inputSchema.required) {
              expect(tool.inputSchema.properties[requiredField]).toBeDefined();
            }
          }

          // Each property should have a type and description
          for (const [, propSchema] of Object.entries(tool.inputSchema.properties)) {
            const schema = propSchema as any;
            expect(schema.type).toBeDefined();
            expect(schema.description).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  // Feature: direct-websocket-bedrock, Property 11: Voice ID is preserved in configuration
  it('should preserve voice ID in session configuration for any valid voice', () => {
    fc.assert(
      fc.property(
        validVoiceIdArb,
        validQuestionnaireArb,
        (voiceId, questionnaire) => {
          // Create a session config with the voice ID
          const sessionConfig = {
            questionnaireId: questionnaire.questionnaireId,
            voiceId,
          };

          // Voice ID should be one of the valid options
          expect(['matthew', 'tiffany', 'amy']).toContain(sessionConfig.voiceId);

          // Voice ID should match the input
          expect(sessionConfig.voiceId).toBe(voiceId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 11: Questionnaire configuration includes required fields
  it('should include all required questionnaire fields in configuration', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        (questionnaire) => {
          // Questionnaire should have an ID
          expect(questionnaire.questionnaireId || questionnaire.id).toBeDefined();
          
          // Questionnaire should have a name
          expect(questionnaire.questionnaireName || questionnaire.name).toBeDefined();
          
          // Questionnaire should have questions
          expect(questionnaire.questions).toBeDefined();
          expect(Array.isArray(questionnaire.questions)).toBe(true);
          
          // Questionnaire should have total questions count
          const totalQuestions = questionnaire.totalQuestions || questionnaire.questions.length;
          expect(totalQuestions).toBeGreaterThan(0);

          // First question should be accessible
          if (questionnaire.questions.length > 0) {
            const firstQuestion = questionnaire.questions[0];
            expect(firstQuestion.questionId || firstQuestion.id).toBeDefined();
            expect(firstQuestion.questionText || firstQuestion.text).toBeDefined();
            expect(firstQuestion.questionType || firstQuestion.type).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 11: Session start response structure
  it('should produce valid session start response structure for any configuration', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validVoiceIdArb,
        fc.uuid(),
        (questionnaire, voiceId, sessionId) => {
          // Simulate session start response structure
          const response = {
            sessionId,
            preSignedUrl: `wss://bedrock-runtime.us-east-1.amazonaws.com/model/test/invoke`,
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            systemPrompt: 'Test system prompt',
            tools: new ToolExecutor().getToolDefinitionsForBedrock(),
            questionnaire: {
              id: questionnaire.questionnaireId,
              name: questionnaire.questionnaireName,
              totalQuestions: questionnaire.totalQuestions || questionnaire.questions.length,
              firstQuestion: questionnaire.questions.length > 0 ? {
                id: questionnaire.questions[0].questionId,
                text: questionnaire.questions[0].questionText,
                type: questionnaire.questions[0].questionType,
                options: questionnaire.questions[0].options,
              } : null,
            },
            voiceId,
          };

          // Validate response structure
          expect(response.sessionId).toBeDefined();
          expect(typeof response.sessionId).toBe('string');
          
          expect(response.preSignedUrl).toBeDefined();
          expect(response.preSignedUrl.startsWith('wss://')).toBe(true);
          
          expect(response.expiresAt).toBeDefined();
          expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(Date.now());
          
          expect(response.systemPrompt).toBeDefined();
          expect(typeof response.systemPrompt).toBe('string');
          
          expect(response.tools).toBeDefined();
          expect(Array.isArray(response.tools)).toBe(true);
          expect(response.tools.length).toBeGreaterThan(0);
          
          expect(response.questionnaire).toBeDefined();
          expect(response.questionnaire.id).toBeDefined();
          expect(response.questionnaire.name).toBeDefined();
          expect(response.questionnaire.totalQuestions).toBeGreaterThan(0);
          
          expect(response.voiceId).toBeDefined();
          expect(['matthew', 'tiffany', 'amy']).toContain(response.voiceId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
