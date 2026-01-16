/**
 * Logic evaluation for questionnaire display and skip logic
 */

import type {
  Condition,
  DisplayLogic,
  SkipLogic,
  Response,
  ComparisonOperator,
} from './types';

/**
 * Evaluates display logic to determine if a question should be shown
 * 
 * @param displayLogic - The display logic configuration
 * @param responses - Map of prior responses
 * @returns true if the question should be displayed, false otherwise
 */
export function evaluateDisplayLogic(
  displayLogic: DisplayLogic,
  responses: Map<string, Response>
): boolean {
  if (!displayLogic || !displayLogic.conditions || displayLogic.conditions.length === 0) {
    return true; // No display logic means always display
  }

  const { operator, conditions } = displayLogic;

  if (operator === 'AND') {
    // All conditions must be true
    return conditions.every((condition) => evaluateCondition(condition, responses));
  } else if (operator === 'OR') {
    // At least one condition must be true
    return conditions.some((condition) => evaluateCondition(condition, responses));
  }

  // Default to true if operator is not recognized
  return true;
}

/**
 * Evaluates skip logic to determine the target question
 * 
 * @param skipLogic - The skip logic configuration
 * @param responses - Map of prior responses
 * @returns target questionId if skip conditions are met, null otherwise
 */
export function evaluateSkipLogic(
  skipLogic: SkipLogic,
  responses: Map<string, Response>
): string | null {
  if (!skipLogic || !skipLogic.conditions || skipLogic.conditions.length === 0) {
    return null; // No skip logic
  }

  // Find the first skip condition that evaluates to true
  for (const skipCondition of skipLogic.conditions) {
    if (evaluateCondition(skipCondition, responses)) {
      return skipCondition.targetQuestionId;
    }
  }

  return null; // No skip conditions met
}

/**
 * Evaluates a single condition against prior responses
 * 
 * @param condition - The condition to evaluate
 * @param responses - Map of prior responses
 * @returns true if the condition is met, false otherwise
 */
export function evaluateCondition(
  condition: Condition,
  responses: Map<string, Response>
): boolean {
  const { questionId, operator, value } = condition;

  // Get the response for the referenced question
  const response = responses.get(questionId);

  // Handle special operators that check for answer existence
  if (operator === 'is_answered') {
    return response !== undefined && response.response !== undefined && response.response !== null && response.response !== '';
  }

  if (operator === 'is_not_answered') {
    return response === undefined || response.response === undefined || response.response === null || response.response === '';
  }

  if (operator === 'always_display_after') {
    // This is a special operator that always returns true if the question is answered
    return response !== undefined && response.response !== undefined;
  }

  // If no response exists, condition is false (except for the special operators above)
  if (!response || response.response === undefined || response.response === null) {
    return false;
  }

  // Get the response value
  const responseValue = response.responseValue !== undefined ? response.responseValue : response.response;

  // Evaluate based on operator
  return evaluateOperator(operator, responseValue, value);
}

/**
 * Evaluates a comparison operator
 * 
 * @param operator - The comparison operator
 * @param responseValue - The actual response value
 * @param expectedValue - The expected value to compare against
 * @returns true if the comparison is true, false otherwise
 */
function evaluateOperator(
  operator: ComparisonOperator,
  responseValue: any,
  expectedValue: any
): boolean {
  // Normalize operator aliases
  const normalizedOperator = normalizeOperator(operator);

  switch (normalizedOperator) {
    case 'equals':
      return responseValue == expectedValue; // Loose equality

    case 'strict_equals':
      return responseValue === expectedValue; // Strict equality

    case 'not_equals':
      return responseValue != expectedValue; // Loose inequality

    case 'strict_not_equals':
      return responseValue !== expectedValue; // Strict inequality

    case 'contains':
      if (typeof responseValue === 'string' && typeof expectedValue === 'string') {
        return responseValue.toLowerCase().includes(expectedValue.toLowerCase());
      }
      if (Array.isArray(responseValue)) {
        return responseValue.includes(expectedValue);
      }
      return false;

    case 'not_contains':
      if (typeof responseValue === 'string' && typeof expectedValue === 'string') {
        return !responseValue.toLowerCase().includes(expectedValue.toLowerCase());
      }
      if (Array.isArray(responseValue)) {
        return !responseValue.includes(expectedValue);
      }
      return true;

    case 'greater_than':
      return Number(responseValue) > Number(expectedValue);

    case 'greater_than_or_equal':
      return Number(responseValue) >= Number(expectedValue);

    case 'less_than':
      return Number(responseValue) < Number(expectedValue);

    case 'less_than_or_equal':
      return Number(responseValue) <= Number(expectedValue);

    case 'in':
      if (Array.isArray(expectedValue)) {
        return expectedValue.includes(responseValue);
      }
      return false;

    case 'not_in':
      if (Array.isArray(expectedValue)) {
        return !expectedValue.includes(responseValue);
      }
      return true;

    default:
      // Unknown operator, return false
      return false;
  }
}

/**
 * Normalizes operator aliases to standard operators
 * 
 * @param operator - The operator to normalize
 * @returns normalized operator
 */
function normalizeOperator(operator: ComparisonOperator): string {
  const operatorMap: Record<string, string> = {
    '==': 'equals',
    '===': 'strict_equals',
    '!=': 'not_equals',
    '!==': 'strict_not_equals',
    '>': 'greater_than',
    '>=': 'greater_than_or_equal',
    '<': 'less_than',
    '<=': 'less_than_or_equal',
  };

  return operatorMap[operator] || operator;
}
