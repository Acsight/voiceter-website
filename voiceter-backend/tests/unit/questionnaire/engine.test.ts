/**
 * Unit tests for questionnaire engine
 */

import * as fs from 'fs';
import { QuestionnaireEngine } from '../../../src/questionnaire/engine';
import type { Session } from '../../../src/session/types';
import type { Questionnaire, Question, Response } from '../../../src/questionnaire/types';

// Mock fs module
jest.mock('fs');

describe('QuestionnaireEngine', () => {
  let engine: QuestionnaireEngine;
  const mockQuestionnairesPath = '/mock/questionnaires';

  const mockQuestionnaire: Questionnaire = {
    id: 'test-questionnaire',
    questionnaireId: 'test-questionnaire',
    name: 'Test Questionnaire',
    questionnaireName: 'Test Questionnaire',
    description: 'A test questionnaire',
    type: 'csat_nps',
    tone: 'professional',
    recommendedVoice: 'matthew',
    totalQuestions: 5,
    questions: [
      {
        id: 'q1',
        questionId: 'q1',
        text: 'Question 1',
        questionText: 'Question 1',
        type: 'single_choice',
        questionType: 'single_choice',
        metadata: {},
      },
      {
        id: 'q2',
        questionId: 'q2',
        text: 'Question 2',
        questionText: 'Question 2',
        type: 'rating',
        questionType: 'rating',
        displayLogic: {
          operator: 'AND',
          conditions: [
            { questionId: 'q1', operator: 'equals', value: 'yes' },
          ],
        },
        metadata: {},
      },
      {
        id: 'q3',
        questionId: 'q3',
        text: 'Question 3',
        questionText: 'Question 3',
        type: 'open_ended',
        questionType: 'open_ended',
        metadata: {},
      },
      {
        id: 'q4',
        questionId: 'q4',
        text: 'Question 4',
        questionText: 'Question 4',
        type: 'nps',
        questionType: 'nps',
        metadata: {},
      },
      {
        id: 'q5',
        questionId: 'q5',
        text: '{{dynamic_text}}',
        questionText: '{{dynamic_text}}',
        type: 'open_ended',
        questionType: 'open_ended',
        dynamicQuestionText: {
          basedOn: 'q4',
          detractors: 'What could we improve?',
          passives: 'What would make it better?',
          promoters: 'What did we do well?',
          rules: [],
        },
        metadata: {},
      },
    ],
    metadata: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new QuestionnaireEngine(mockQuestionnairesPath);

    // Mock fs.existsSync
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock fs.readFileSync
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockQuestionnaire));
  });

  describe('loadQuestionnaire', () => {
    it('should load questionnaire from file', () => {
      const questionnaire = engine.loadQuestionnaire('test-questionnaire');

      expect(questionnaire).toBeDefined();
      expect(questionnaire.id).toBe('test-questionnaire');
      expect(questionnaire.questions).toHaveLength(5);
    });

    it('should cache loaded questionnaires', () => {
      engine.loadQuestionnaire('test-questionnaire');
      engine.loadQuestionnaire('test-questionnaire');

      // Should only read file once
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should throw error if file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => engine.loadQuestionnaire('nonexistent')).toThrow('Questionnaire file not found');
    });

    it('should throw error if JSON is invalid', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      expect(() => engine.loadQuestionnaire('test-questionnaire')).toThrow('Failed to load questionnaire');
    });
  });

  describe('getNextQuestion', () => {
    it('should return first question when starting', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'test-questionnaire',
        questionnaire: mockQuestionnaire,
        currentQuestionIndex: -1,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'test' },
        audioConfig: {} as any,
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      const result = engine.getNextQuestion(session);

      expect(result.question).toBeDefined();
      expect(result.question?.id).toBe('q1');
      expect(result.isComplete).toBe(false);
    });

    it('should skip questions with false display logic', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'test-questionnaire',
        questionnaire: mockQuestionnaire,
        currentQuestionIndex: 0,
        responses: new Map([
          ['q1', { questionId: 'q1', response: 'no', responseType: 'choice', timestamp: new Date() }],
        ]),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'test' },
        audioConfig: {} as any,
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      const result = engine.getNextQuestion(session);

      // Should skip q2 (display logic requires q1 = 'yes') and return q3
      expect(result.question).toBeDefined();
      expect(result.question?.id).toBe('q3');
    });

    it('should return completion when all questions are done', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'test-questionnaire',
        questionnaire: mockQuestionnaire,
        currentQuestionIndex: 4,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'test' },
        audioConfig: {} as any,
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      const result = engine.getNextQuestion(session);

      expect(result.question).toBeNull();
      expect(result.isComplete).toBe(true);
    });
  });

  describe('applyDynamicQuestionText', () => {
    const question: Question = {
      id: 'q5',
      questionId: 'q5',
      text: '{{dynamic_text}}',
      questionText: '{{dynamic_text}}',
      type: 'open_ended',
      questionType: 'open_ended',
      dynamicQuestionText: {
        basedOn: 'q4',
        detractors: 'What could we improve?',
        passives: 'What would make it better?',
        promoters: 'What did we do well?',
        rules: [],
      },
      metadata: {},
    };

    it('should return detractors text for NPS score 0-6', () => {
      const responses = new Map<string, Response>([
        ['q4', { questionId: 'q4', response: '5', responseType: 'nps', timestamp: new Date() }],
      ]);

      const text = engine.applyDynamicQuestionText(question, responses);

      expect(text).toBe('What could we improve?');
    });

    it('should return passives text for NPS score 7-8', () => {
      const responses = new Map<string, Response>([
        ['q4', { questionId: 'q4', response: '7', responseType: 'nps', timestamp: new Date() }],
      ]);

      const text = engine.applyDynamicQuestionText(question, responses);

      expect(text).toBe('What would make it better?');
    });

    it('should return promoters text for NPS score 9-10', () => {
      const responses = new Map<string, Response>([
        ['q4', { questionId: 'q4', response: '10', responseType: 'nps', timestamp: new Date() }],
      ]);

      const text = engine.applyDynamicQuestionText(question, responses);

      expect(text).toBe('What did we do well?');
    });

    it('should return default text if no prior response', () => {
      const responses = new Map<string, Response>();

      const text = engine.applyDynamicQuestionText(question, responses);

      expect(text).toBe('{{dynamic_text}}');
    });

    it('should apply rule-based dynamic text when condition matches', () => {
      const questionWithRules: Question = {
        id: 'q6',
        questionId: 'q6',
        text: '{{dynamic_text}}',
        questionText: '{{dynamic_text}}',
        type: 'open_ended',
        questionType: 'open_ended',
        dynamicQuestionText: {
          basedOn: 'q1',
          rules: [
            {
              condition: { questionId: 'q1', operator: 'equals', value: 'yes' },
              questionText: 'Why did you choose yes?',
            },
            {
              condition: { questionId: 'q1', operator: 'equals', value: 'no' },
              questionText: 'Why did you choose no?',
            },
          ],
        },
        metadata: {},
      };

      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: 'yes', responseType: 'choice', timestamp: new Date() }],
      ]);

      const text = engine.applyDynamicQuestionText(questionWithRules, responses);

      expect(text).toBe('Why did you choose yes?');
    });

    it('should return default text when no rule matches', () => {
      const questionWithRules: Question = {
        id: 'q6',
        questionId: 'q6',
        text: 'Default question text',
        questionText: 'Default question text',
        type: 'open_ended',
        questionType: 'open_ended',
        dynamicQuestionText: {
          basedOn: 'q1',
          rules: [
            {
              condition: { questionId: 'q1', operator: 'equals', value: 'yes' },
              questionText: 'Why did you choose yes?',
            },
          ],
        },
        metadata: {},
      };

      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: 'maybe', responseType: 'choice', timestamp: new Date() }],
      ]);

      const text = engine.applyDynamicQuestionText(questionWithRules, responses);

      expect(text).toBe('Default question text');
    });
  });

  describe('filterDynamicOptions', () => {
    const question: Question = {
      id: 'q6',
      questionId: 'q6',
      text: 'Which brands do you prefer?',
      questionText: 'Which brands do you prefer?',
      type: 'multiple_choice',
      questionType: 'multiple_choice',
      options: [
        { value: 'brand1', optionValue: 'brand1', text: 'Brand 1' },
        { value: 'brand2', optionValue: 'brand2', text: 'Brand 2' },
        { value: 'brand3', optionValue: 'brand3', text: 'Brand 3' },
        { value: 'brand4', optionValue: 'brand4', text: 'Brand 4' },
      ],
      dynamicOptions: {
        sourceQuestionId: 'q5',
        filterType: 'include',
      },
      metadata: {},
    };

    it('should include only selected options with include filter', () => {
      const responses = new Map<string, Response>([
        ['q5', { questionId: 'q5', response: 'brand1,brand3', responseValue: ['brand1', 'brand3'], responseType: 'choice', timestamp: new Date() }],
      ]);

      const filtered = engine.filterDynamicOptions(question, responses);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((o) => o.value)).toEqual(['brand1', 'brand3']);
    });

    it('should exclude selected options with exclude filter', () => {
      const questionWithExclude: Question = {
        ...question,
        dynamicOptions: {
          sourceQuestionId: 'q5',
          filterType: 'exclude',
        },
      };

      const responses = new Map<string, Response>([
        ['q5', { questionId: 'q5', response: 'brand1,brand3', responseValue: ['brand1', 'brand3'], responseType: 'choice', timestamp: new Date() }],
      ]);

      const filtered = engine.filterDynamicOptions(questionWithExclude, responses);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((o) => o.value)).toEqual(['brand2', 'brand4']);
    });

    it('should return all options if no prior response', () => {
      const responses = new Map<string, Response>();

      const filtered = engine.filterDynamicOptions(question, responses);

      expect(filtered).toHaveLength(4);
    });
  });

  describe('getProgress', () => {
    it('should calculate progress correctly', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'test-questionnaire',
        questionnaire: mockQuestionnaire,
        currentQuestionIndex: 2,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'test' },
        audioConfig: {} as any,
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      const progress = engine.getProgress(session);

      expect(progress.current).toBe(2);
      expect(progress.total).toBe(5);
      expect(progress.percentComplete).toBe(40);
    });
  });

  describe('isQuestionnaireComplete', () => {
    it('should return true when all questions are answered', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'test-questionnaire',
        questionnaire: mockQuestionnaire,
        currentQuestionIndex: 5,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'test' },
        audioConfig: {} as any,
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      expect(engine.isQuestionnaireComplete(session)).toBe(true);
    });

    it('should return false when questions remain', () => {
      const session: Session = {
        sessionId: 'test-session',
        questionnaireId: 'test-questionnaire',
        questionnaire: mockQuestionnaire,
        currentQuestionIndex: 2,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: { promptName: 'test' },
        audioConfig: {} as any,
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      };

      expect(engine.isQuestionnaireComplete(session)).toBe(false);
    });
  });
});
