
/**
 * Unit tests for SystemPromptGenerator
 */

import { SystemPromptGenerator } from '../../../src/questionnaire/prompt-generator';
import type { Questionnaire, Question } from '../../../src/questionnaire/types';
import type { Session } from '../../../src/session/types';

describe('SystemPromptGenerator', () => {
  let generator: SystemPromptGenerator;

  beforeEach(() => {
    generator = new SystemPromptGenerator();
  });

  const createSession = (): Session => ({
    sessionId: 'test-123',
    questionnaireId: 'test',
    currentQuestionIndex: 0,
    responses: new Map(),
    conversationHistory: [],
    bedrockStreamIds: { promptName: 'test' },
    audioConfig: {
      input: {
        audioType: 'SPEECH',
        encoding: 'base64',
        mediaType: 'audio/lpcm',
        sampleRateHertz: 24000,
        sampleSizeBits: 16,
        channelCount: 1,
      },
      output: {
        audioType: 'SPEECH',
        encoding: 'base64',
        mediaType: 'audio/lpcm',
        sampleRateHertz: 24000,
        sampleSizeBits: 16,
        channelCount: 1,
        voiceId: 'matthew',
      },
    },
    startTime: new Date(),
    lastActivityTime: new Date(),
    status: 'active',
  });

  it('should generate a complete system prompt', () => {
    const questionnaire: Questionnaire = {
      id: 'test',
      questionnaireId: 'test',
      name: 'Test Survey',
      questionnaireName: 'Test Survey',
      description: 'Test description',
      type: 'csat_nps',
      tone: 'professional',
      recommendedVoice: 'matthew',
      questions: [],
      totalQuestions: 5,
      metadata: {},
    };

    const question: Question = {
      id: 'q1',
      questionId: 'q1',
      text: 'Test question',
      questionText: 'Test question',
      type: 'rating',
      questionType: 'rating',
      metadata: {},
    };

    const session = createSession();
    const prompt = generator.generateSystemPrompt(questionnaire, question, session);
    
    expect(prompt).toContain('You are a professional survey interviewer');
    expect(prompt).toContain('QUESTIONNAIRE:');
    expect(prompt).toContain('Test Survey');
    expect(prompt).toContain('START WITH QUESTION 1');
    expect(prompt).toContain('Test question');
    expect(prompt).toContain('CONVERSATION FLOW');
    expect(prompt).toContain('record_response');
    expect(prompt).toContain('TONE:');
  });

  it('should include options for multiple choice questions', () => {
    const questionnaire: Questionnaire = {
      id: 'test',
      questionnaireId: 'test',
      name: 'Test',
      questionnaireName: 'Test',
      description: 'Test',
      type: 'csat_nps',
      tone: 'professional',
      recommendedVoice: 'matthew',
      questions: [],
      totalQuestions: 5,
      metadata: {},
    };

    const question: Question = {
      id: 'q1',
      questionId: 'q1',
      text: 'Choose',
      questionText: 'Choose',
      type: 'multiple_choice',
      questionType: 'multiple_choice',
      options: [
        { value: 'opt1', optionValue: 'opt1', text: 'Option 1' },
        { value: 'opt2', optionValue: 'opt2', text: 'Option 2' },
      ],
      metadata: {},
    };

    const session = createSession();
    const prompt = generator.generateSystemPrompt(questionnaire, question, session);
    
    expect(prompt).toContain('OPTIONS: Option 1, Option 2');
  });

  it('should adapt tone for political polling', () => {
    const questionnaire: Questionnaire = {
      id: 'test',
      questionnaireId: 'test',
      name: 'Test',
      questionnaireName: 'Test',
      description: 'Test',
      type: 'political_polling',
      tone: 'neutral',
      recommendedVoice: 'matthew',
      questions: [],
      totalQuestions: 5,
      metadata: {},
    };

    const question: Question = {
      id: 'q1',
      questionId: 'q1',
      text: 'Test',
      questionText: 'Test',
      type: 'rating',
      questionType: 'rating',
      metadata: {},
    };

    const session = createSession();
    const prompt = generator.generateSystemPrompt(questionnaire, question, session);
    
    expect(prompt).toContain('Maintain complete neutrality');
  });

  it('should include NPS response guidelines', () => {
    const questionnaire: Questionnaire = {
      id: 'test',
      questionnaireId: 'test',
      name: 'Test',
      questionnaireName: 'Test',
      description: 'Test',
      type: 'csat_nps',
      tone: 'professional',
      recommendedVoice: 'matthew',
      questions: [],
      totalQuestions: 5,
      metadata: {},
    };

    const question: Question = {
      id: 'q1',
      questionId: 'q1',
      text: 'NPS question',
      questionText: 'NPS question',
      type: 'nps',
      questionType: 'nps',
      metadata: {},
    };

    const session = createSession();
    const prompt = generator.generateSystemPrompt(questionnaire, question, session);
    
    expect(prompt).toContain('RESPONSE GUIDELINES:');
    expect(prompt).toContain('0 to 10');
    expect(prompt).toContain('Detractors');
  });
});
