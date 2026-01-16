/**
 * Unit tests for questionnaire logic evaluation
 */

import { evaluateDisplayLogic, evaluateSkipLogic, evaluateCondition } from '../../../src/questionnaire/logic';
import type { DisplayLogic, SkipLogic, Condition, Response } from '../../../src/questionnaire/types';

describe('Questionnaire Logic', () => {
  describe('evaluateCondition', () => {
    it('should return true for is_answered when response exists', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: 'yes', responseType: 'text', timestamp: new Date() }],
      ]);

      const condition: Condition = {
        questionId: 'q1',
        operator: 'is_answered',
        value: null,
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });

    it('should return false for is_answered when response does not exist', () => {
      const responses = new Map<string, Response>();

      const condition: Condition = {
        questionId: 'q1',
        operator: 'is_answered',
        value: null,
      };

      expect(evaluateCondition(condition, responses)).toBe(false);
    });

    it('should return true for is_not_answered when response does not exist', () => {
      const responses = new Map<string, Response>();

      const condition: Condition = {
        questionId: 'q1',
        operator: 'is_not_answered',
        value: null,
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });

    it('should evaluate equals operator correctly', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '5', responseType: 'rating', timestamp: new Date() }],
      ]);

      const condition: Condition = {
        questionId: 'q1',
        operator: 'equals',
        value: '5',
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });

    it('should evaluate greater_than operator correctly', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '8', responseType: 'nps', timestamp: new Date() }],
      ]);

      const condition: Condition = {
        questionId: 'q1',
        operator: 'greater_than',
        value: 6,
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });

    it('should evaluate less_than operator correctly', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '4', responseType: 'nps', timestamp: new Date() }],
      ]);

      const condition: Condition = {
        questionId: 'q1',
        operator: 'less_than',
        value: 7,
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });

    it('should evaluate contains operator for strings', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: 'I love this product', responseType: 'text', timestamp: new Date() }],
      ]);

      const condition: Condition = {
        questionId: 'q1',
        operator: 'contains',
        value: 'love',
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });

    it('should evaluate in operator for arrays', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: 'option2', responseType: 'choice', timestamp: new Date() }],
      ]);

      const condition: Condition = {
        questionId: 'q1',
        operator: 'in',
        value: ['option1', 'option2', 'option3'],
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });

    it('should handle operator aliases (>= for greater_than_or_equal)', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '7', responseType: 'nps', timestamp: new Date() }],
      ]);

      const condition: Condition = {
        questionId: 'q1',
        operator: '>=',
        value: 7,
      };

      expect(evaluateCondition(condition, responses)).toBe(true);
    });
  });

  describe('evaluateDisplayLogic', () => {
    it('should return true when no display logic is provided', () => {
      const responses = new Map<string, Response>();
      const displayLogic: DisplayLogic = {
        operator: 'AND',
        conditions: [],
      };

      expect(evaluateDisplayLogic(displayLogic, responses)).toBe(true);
    });

    it('should evaluate AND operator correctly (all conditions true)', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '8', responseType: 'nps', timestamp: new Date() }],
        ['q2', { questionId: 'q2', response: 'yes', responseType: 'text', timestamp: new Date() }],
      ]);

      const displayLogic: DisplayLogic = {
        operator: 'AND',
        conditions: [
          { questionId: 'q1', operator: 'greater_than', value: 6 },
          { questionId: 'q2', operator: 'equals', value: 'yes' },
        ],
      };

      expect(evaluateDisplayLogic(displayLogic, responses)).toBe(true);
    });

    it('should evaluate AND operator correctly (one condition false)', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '5', responseType: 'nps', timestamp: new Date() }],
        ['q2', { questionId: 'q2', response: 'yes', responseType: 'text', timestamp: new Date() }],
      ]);

      const displayLogic: DisplayLogic = {
        operator: 'AND',
        conditions: [
          { questionId: 'q1', operator: 'greater_than', value: 6 },
          { questionId: 'q2', operator: 'equals', value: 'yes' },
        ],
      };

      expect(evaluateDisplayLogic(displayLogic, responses)).toBe(false);
    });

    it('should evaluate OR operator correctly (at least one condition true)', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '5', responseType: 'nps', timestamp: new Date() }],
        ['q2', { questionId: 'q2', response: 'yes', responseType: 'text', timestamp: new Date() }],
      ]);

      const displayLogic: DisplayLogic = {
        operator: 'OR',
        conditions: [
          { questionId: 'q1', operator: 'greater_than', value: 6 },
          { questionId: 'q2', operator: 'equals', value: 'yes' },
        ],
      };

      expect(evaluateDisplayLogic(displayLogic, responses)).toBe(true);
    });

    it('should evaluate OR operator correctly (all conditions false)', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '5', responseType: 'nps', timestamp: new Date() }],
        ['q2', { questionId: 'q2', response: 'no', responseType: 'text', timestamp: new Date() }],
      ]);

      const displayLogic: DisplayLogic = {
        operator: 'OR',
        conditions: [
          { questionId: 'q1', operator: 'greater_than', value: 6 },
          { questionId: 'q2', operator: 'equals', value: 'yes' },
        ],
      };

      expect(evaluateDisplayLogic(displayLogic, responses)).toBe(false);
    });
  });

  describe('evaluateSkipLogic', () => {
    it('should return null when no skip logic is provided', () => {
      const responses = new Map<string, Response>();
      const skipLogic: SkipLogic = {
        conditions: [],
      };

      expect(evaluateSkipLogic(skipLogic, responses)).toBeNull();
    });

    it('should return target question ID when condition is met', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: 'no', responseType: 'text', timestamp: new Date() }],
      ]);

      const skipLogic: SkipLogic = {
        conditions: [
          {
            questionId: 'q1',
            operator: 'equals',
            value: 'no',
            targetQuestionId: 'q5',
          },
        ],
      };

      expect(evaluateSkipLogic(skipLogic, responses)).toBe('q5');
    });

    it('should return null when no skip conditions are met', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: 'yes', responseType: 'text', timestamp: new Date() }],
      ]);

      const skipLogic: SkipLogic = {
        conditions: [
          {
            questionId: 'q1',
            operator: 'equals',
            value: 'no',
            targetQuestionId: 'q5',
          },
        ],
      };

      expect(evaluateSkipLogic(skipLogic, responses)).toBeNull();
    });

    it('should return first matching skip target when multiple conditions exist', () => {
      const responses = new Map<string, Response>([
        ['q1', { questionId: 'q1', response: '3', responseType: 'rating', timestamp: new Date() }],
      ]);

      const skipLogic: SkipLogic = {
        conditions: [
          {
            questionId: 'q1',
            operator: 'less_than',
            value: 5,
            targetQuestionId: 'q10',
          },
          {
            questionId: 'q1',
            operator: 'greater_than',
            value: 7,
            targetQuestionId: 'q15',
          },
        ],
      };

      expect(evaluateSkipLogic(skipLogic, responses)).toBe('q10');
    });
  });
});
