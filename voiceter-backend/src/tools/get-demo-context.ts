/**
 * get_demo_context Tool Handler
 * Gets questionnaire metadata and current progress
 */

import { QuestionnaireEngine } from '../questionnaire/engine';
import { getLogger } from '../monitoring/logger';
import { ToolExecutionContext } from './types';
import type { Session } from '../session/types';

const logger = getLogger();

export interface GetDemoContextInput {
  // No input parameters required
}

/**
 * Get demo context including questionnaire metadata and progress
 */
export async function getDemoContextHandler(
  _input: GetDemoContextInput,
  context: ToolExecutionContext
): Promise<any> {
  const { sessionId, questionnaireId, session } = context;

  logger.info('Getting demo context', {
    sessionId,
    questionnaireId,
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
        success: false,
        message: 'Questionnaire not found',
      };
    }

    // Create a compatible session object for the engine
    const engineSession = {
      questionnaireId,
      currentQuestionIndex: session.currentQuestionIndex,
      responses: session.responses,
    } as Session;

    // Get progress information
    const progress = engine.getProgress(engineSession);

    logger.info('Demo context retrieved', {
      sessionId,
      questionnaireId,
      currentIndex: session.currentQuestionIndex,
      totalQuestions: questionnaire.questions.length,
      progress,
    });

    return {
      success: true,
      questionnaireId: questionnaire.id,
      questionnaireName: questionnaire.name,
      questionnaireDescription: questionnaire.description,
      questionnaireType: questionnaire.type,
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: questionnaire.questions.length,
      progress,
      responsesRecorded: session.responses.size,
    };
  } catch (error) {
    logger.error('Failed to get demo context', {
      sessionId,
      questionnaireId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      message: 'Failed to get demo context',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
