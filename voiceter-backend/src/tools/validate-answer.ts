/**
 * validate_answer Tool Handler
 * Validates user's response against question constraints
 */

import { QuestionnaireEngine } from '../questionnaire/engine';
import { getLogger } from '../monitoring/logger';
import { ToolExecutionContext } from './types';

const logger = getLogger();

export interface ValidateAnswerInput {
  questionId: string;
  response: string;
}

/**
 * Validate a user's response against question constraints
 */
export async function validateAnswerHandler(
  input: ValidateAnswerInput,
  context: ToolExecutionContext
): Promise<any> {
  const { questionId, response } = input;
  const { sessionId, questionnaireId } = context;

  logger.info('Validating answer', {
    sessionId,
    questionId,
    response,
  });

  try {
    // Get the questionnaire
    const engine = new QuestionnaireEngine();
    const questionnaire = await engine.loadQuestionnaire(questionnaireId);

    if (!questionnaire) {
      logger.error('Questionnaire not found', {
        sessionId,
        questionnaireId,
      });

      return {
        valid: false,
        message: 'Questionnaire not found',
      };
    }

    // Find the question
    const question = questionnaire.questions.find(q => q.questionId === questionId);

    if (!question) {
      logger.error('Question not found', {
        sessionId,
        questionId,
      });

      return {
        valid: false,
        message: 'Question not found',
      };
    }

    // Basic validation - for now just check if response is not empty
    if (!response || response.trim().length === 0) {
      logger.info('Response validation failed - empty response', {
        sessionId,
        questionId,
      });

      return {
        valid: false,
        message: 'Response cannot be empty',
      };
    }

    logger.info('Response validated successfully', {
      sessionId,
      questionId,
    });

    return {
      valid: true,
      message: 'Response is valid',
    };
  } catch (error) {
    logger.error('Failed to validate answer', {
      sessionId,
      questionId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      valid: false,
      message: 'Failed to validate answer',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
