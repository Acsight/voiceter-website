/**
 * Property-based tests for system prompt generation consistency
 *
 * **Property 3: System prompt generation consistency**
 * **Validates: Requirements 4.7, 11.2**
 *
 * Requirement 4.7: THE Session_Manager SHALL provide the system prompt content
 * to the frontend before connection
 *
 * Requirement 11.2: THE Backend SHALL generate system prompts based on the
 * selected questionnaire
 */

import * as fc from 'fast-check';
import { SystemPromptGenerator } from '../../src/questionnaire/prompt-generator';
import type { Questionnaire, Question, Option } from '../../src/questionnaire/types';
import type { Session } from '../../src/session/types';

describe('Property 3: System prompt generation consistency', () => {
  const promptGenerator = new SystemPromptGenerator();

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
    'multiple_choice',
    'single_choice',
    'yes_no',
    'nps',
    'voice_prompt'
  );

  /**
   * Arbitrary for valid voice IDs
   */
  const validVoiceIdArb = fc.constantFrom('matthew', 'tiffany', 'amy');

  /**
   * Arbitrary for question options
   */
  const validOptionArb: fc.Arbitrary<Option> = fc.record({
    value: fc.string({ minLength: 1, maxLength: 20 }),
    optionValue: fc.string({ minLength: 1, maxLength: 20 }),
    text: fc.string({ minLength: 1, maxLength: 100 }),
    optionText: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    optionId: fc.option(fc.uuid(), { nil: undefined }),
    metadata: fc.option(fc.constant({}), { nil: undefined }),
  });

  /**
   * Arbitrary for valid questions
   */
  const validQuestionArb: fc.Arbitrary<Question> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).map(s => `q-${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
    questionId: fc.string({ minLength: 1, maxLength: 30 }).map(s => `q-${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
    text: fc.string({ minLength: 10, maxLength: 200 }),
    questionText: fc.string({ minLength: 10, maxLength: 200 }),
    type: validQuestionTypeArb,
    questionType: validQuestionTypeArb,
    questionNumber: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
    isRequired: fc.option(fc.boolean(), { nil: undefined }),
    options: fc.option(fc.array(validOptionArb, { minLength: 2, maxLength: 5 }), { nil: undefined }),
    metadata: fc.constant({}),
  });


  /**
   * Arbitrary for valid questionnaires
   */
  const validQuestionnaireArb: fc.Arbitrary<Questionnaire> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).map(s => `demo-${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
    questionnaireId: fc.string({ minLength: 1, maxLength: 30 }).map(s => `demo-${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
    name: fc.string({ minLength: 5, maxLength: 100 }),
    questionnaireName: fc.string({ minLength: 5, maxLength: 100 }),
    description: fc.string({ minLength: 10, maxLength: 500 }),
    type: validQuestionnaireTypeArb,
    tone: fc.constantFrom('warm', 'professional', 'friendly', 'neutral'),
    recommendedVoice: validVoiceIdArb,
    questions: fc.array(validQuestionArb, { minLength: 1, maxLength: 10 }),
    totalQuestions: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
    estimatedDuration: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    industry: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    researchObjective: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    metadata: fc.constant({}),
  });

  /**
   * Arbitrary for minimal session state
   */
  const validSessionArb: fc.Arbitrary<Session> = fc.record({
    sessionId: fc.uuid(),
    questionnaireId: fc.string({ minLength: 1, maxLength: 30 }).map(s => `demo-${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
    currentQuestionIndex: fc.integer({ min: 0, max: 20 }),
    responses: fc.constant(new Map()),
    conversationHistory: fc.constant([]),
    bedrockStreamIds: fc.record({
      promptName: fc.string({ minLength: 1, maxLength: 30 }),
      audioContentId: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    }),
    audioConfig: fc.record({
      voiceId: validVoiceIdArb,
      sampleRate: fc.constant(24000),
      channels: fc.constant(1),
      encoding: fc.constant('pcm'),
    }),
    startTime: fc.date(),
    lastActivityTime: fc.date(),
    status: fc.constantFrom('active', 'completed', 'terminated', 'abandoned', 'error'),
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt contains questionnaire context
  it('should include questionnaire context in generated prompt', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validSessionArb,
        (questionnaire, session) => {
          // Ensure questionnaire has at least one question
          if (questionnaire.questions.length === 0) return;

          const currentQuestion = questionnaire.questions[0];
          const prompt = promptGenerator.generateSystemPrompt(
            questionnaire,
            currentQuestion,
            session
          );

          // Requirement 11.2: Prompt should contain questionnaire context
          expect(prompt).toBeDefined();
          expect(typeof prompt).toBe('string');
          expect(prompt.length).toBeGreaterThan(0);

          // Should contain questionnaire name or description
          const hasName = prompt.includes(questionnaire.name) || 
                         prompt.includes(questionnaire.questionnaireName);
          const hasDescription = questionnaire.description && 
                                prompt.includes(questionnaire.description);
          const hasResearchObjective = questionnaire.researchObjective && 
                                       prompt.includes(questionnaire.researchObjective);
          
          expect(hasName || hasDescription || hasResearchObjective).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt contains first question
  it('should include the current question in generated prompt', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validSessionArb,
        (questionnaire, session) => {
          if (questionnaire.questions.length === 0) return;

          const currentQuestion = questionnaire.questions[0];
          const prompt = promptGenerator.generateSystemPrompt(
            questionnaire,
            currentQuestion,
            session
          );

          // Requirement 4.7: Prompt should contain the current question
          const questionText = currentQuestion.text || currentQuestion.questionText;
          
          // The prompt should reference the question text or question type
          const hasQuestionText = prompt.includes(questionText);
          const hasQuestionType = prompt.toLowerCase().includes(
            (currentQuestion.type || currentQuestion.questionType).toLowerCase().replace('_', ' ')
          );
          
          expect(hasQuestionText || hasQuestionType).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt contains tool usage instructions
  it('should include tool usage instructions in generated prompt', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validSessionArb,
        (questionnaire, session) => {
          if (questionnaire.questions.length === 0) return;

          const currentQuestion = questionnaire.questions[0];
          const prompt = promptGenerator.generateSystemPrompt(
            questionnaire,
            currentQuestion,
            session
          );

          // Requirement 4.7: Prompt should contain tool usage instructions
          // Check for tool-related keywords
          const hasRecordResponse = prompt.toLowerCase().includes('record_response') ||
                                   prompt.toLowerCase().includes('record response');
          const hasToolInstructions = prompt.toLowerCase().includes('tool') ||
                                     prompt.toLowerCase().includes('call');
          
          expect(hasRecordResponse || hasToolInstructions).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt is non-empty for all questionnaire types
  it('should generate non-empty prompts for all questionnaire types', () => {
    const questionnaireTypes = ['csat_nps', 'concept_test', 'political_polling', 'brand_tracker'];

    fc.assert(
      fc.property(
        fc.constantFrom(...questionnaireTypes),
        validSessionArb,
        fc.array(validQuestionArb, { minLength: 1, maxLength: 5 }),
        (type, session, questions) => {
          const questionnaire: Questionnaire = {
            id: `demo-${type}`,
            questionnaireId: `demo-${type}`,
            name: `Test ${type} Survey`,
            questionnaireName: `Test ${type} Survey`,
            description: `A test survey for ${type}`,
            type: type as any,
            tone: 'professional',
            recommendedVoice: 'matthew',
            questions,
            metadata: {},
          };

          const prompt = promptGenerator.generateSystemPrompt(
            questionnaire,
            questions[0],
            session
          );

          // Prompt should be non-empty for all types
          expect(prompt).toBeDefined();
          expect(prompt.length).toBeGreaterThan(100); // Should have substantial content
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt contains CATI role
  it('should include CATI system role in generated prompt', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validSessionArb,
        (questionnaire, session) => {
          if (questionnaire.questions.length === 0) return;

          const currentQuestion = questionnaire.questions[0];
          const prompt = promptGenerator.generateSystemPrompt(
            questionnaire,
            currentQuestion,
            session
          );

          // Should contain CATI-related content
          const hasCATI = prompt.includes('CATI') || 
                         prompt.toLowerCase().includes('survey') ||
                         prompt.toLowerCase().includes('interview');
          
          expect(hasCATI).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt includes question options when present
  it('should include question options in prompt when available', () => {
    const questionWithOptionsArb = validQuestionArb.map(q => ({
      ...q,
      options: [
        { value: '1', optionValue: '1', text: 'Option A' },
        { value: '2', optionValue: '2', text: 'Option B' },
        { value: '3', optionValue: '3', text: 'Option C' },
      ],
      type: 'single_choice' as const,
      questionType: 'single_choice' as const,
    }));

    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validSessionArb,
        questionWithOptionsArb,
        (questionnaire, session, questionWithOptions) => {
          // Replace first question with one that has options
          const modifiedQuestionnaire = {
            ...questionnaire,
            questions: [questionWithOptions, ...questionnaire.questions.slice(1)],
          };

          const prompt = promptGenerator.generateSystemPrompt(
            modifiedQuestionnaire,
            questionWithOptions,
            session
          );

          // Should contain at least one option text
          const hasOptions = questionWithOptions.options!.some(
            opt => prompt.includes(opt.text)
          );
          
          expect(hasOptions).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt is deterministic for same inputs
  it('should generate consistent prompts for identical inputs', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validSessionArb,
        (questionnaire, session) => {
          if (questionnaire.questions.length === 0) return;

          const currentQuestion = questionnaire.questions[0];
          
          // Generate prompt twice with same inputs
          const prompt1 = promptGenerator.generateSystemPrompt(
            questionnaire,
            currentQuestion,
            session
          );
          const prompt2 = promptGenerator.generateSystemPrompt(
            questionnaire,
            currentQuestion,
            session
          );

          // Prompts should be identical
          expect(prompt1).toBe(prompt2);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 3: System prompt contains tone guidance
  it('should include tone guidance based on questionnaire type', () => {
    fc.assert(
      fc.property(
        validQuestionnaireArb,
        validSessionArb,
        (questionnaire, session) => {
          if (questionnaire.questions.length === 0) return;

          const currentQuestion = questionnaire.questions[0];
          const prompt = promptGenerator.generateSystemPrompt(
            questionnaire,
            currentQuestion,
            session
          );

          // Should contain tone-related guidance
          const hasToneGuidance = prompt.toLowerCase().includes('tone') ||
                                 prompt.toLowerCase().includes('warm') ||
                                 prompt.toLowerCase().includes('professional') ||
                                 prompt.toLowerCase().includes('friendly') ||
                                 prompt.toLowerCase().includes('neutral') ||
                                 prompt.toLowerCase().includes('empathy') ||
                                 prompt.toLowerCase().includes('empathetic');
          
          expect(hasToneGuidance).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
