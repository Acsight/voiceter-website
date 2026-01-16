/**
 * get_next_question Tool Handler
 * Gets the next question in the survey
 */

import { getQuestionnaireLoader } from '../questionnaire/loader';
import { getLogger } from '../monitoring/logger';
import { ToolExecutionContext } from './types';

const logger = getLogger();

export interface GetNextQuestionInput {
  currentQuestionId?: string;
}

/**
 * Get the next question in the survey
 */
export async function getNextQuestionHandler(
  input: GetNextQuestionInput,
  context: ToolExecutionContext
): Promise<any> {
  const { currentQuestionId } = input;
  const { sessionId, questionnaireId, session } = context;

  logger.info('Getting next question', {
    sessionId,
    questionnaireId,
    currentQuestionId,
    currentIndex: session.currentQuestionIndex,
    responsesCount: session.responses.size,
  });

  try {
    // Use the loader which has pre-loaded questionnaires
    const loader = getQuestionnaireLoader();
    const questionnaire = loader.getQuestionnaire(questionnaireId);
    
    if (!questionnaire) {
      logger.error('Questionnaire not found', { sessionId, questionnaireId });
      return {
        success: false,
        message: `Questionnaire not found: ${questionnaireId}`,
      };
    }

    const questions = questionnaire.questions || [];
    const totalQuestions = questions.length;
    
    // Calculate next index
    let nextIndex = session.currentQuestionIndex + 1;
    
    // If currentQuestionId is provided, find its index and go to next
    if (currentQuestionId) {
      const currentIdx = questions.findIndex(q => 
        q.questionId === currentQuestionId || 
        q.id === currentQuestionId ||
        q.questionId?.includes(currentQuestionId.replace(/q(\d+).*/, 'q$1')) ||
        q.questionNumber === parseInt(currentQuestionId.match(/q(\d+)/i)?.[1] || '0', 10)
      );
      if (currentIdx !== -1) {
        nextIndex = currentIdx + 1;
      }
    }

    // Check if survey is complete
    if (nextIndex >= totalQuestions) {
      logger.info('Survey completed', {
        sessionId,
        questionnaireId,
        totalResponses: session.responses.size,
      });

      return {
        success: true,
        completed: true,
        message: 'Survey completed! Thank you for your time.',
        progress: 100,
      };
    }

    // Get the next question
    const nextQuestion = questions[nextIndex];
    
    // Apply dynamic question text if needed
    let questionText = nextQuestion.questionText || nextQuestion.text || '';
    if (questionText.includes('{{') && nextQuestion.dynamicQuestionText) {
      // Try to resolve dynamic text based on prior responses
      // Look for NPS response
      const npsQuestionId = questions.find(q => q.questionType === 'nps')?.questionId;
      const npsResponse = npsQuestionId ? session.responses.get(npsQuestionId) : null;
      
      if (npsResponse) {
        const npsScore = parseInt(String(npsResponse.response), 10);
        if (!isNaN(npsScore)) {
          if (npsScore <= 6 && nextQuestion.dynamicQuestionText.detractors) {
            questionText = nextQuestion.dynamicQuestionText.detractors;
          } else if (npsScore <= 8 && nextQuestion.dynamicQuestionText.passives) {
            questionText = nextQuestion.dynamicQuestionText.passives;
          } else if (nextQuestion.dynamicQuestionText.promoters) {
            questionText = nextQuestion.dynamicQuestionText.promoters;
          }
        }
      }
    }

    // Calculate progress
    const progress = Math.round((nextIndex / totalQuestions) * 100);

    logger.info('Next question retrieved', {
      sessionId,
      nextQuestionId: nextQuestion.questionId,
      nextIndex,
      progress,
    });

    // Return minimal info to Gemini - it already has the questions in its system prompt
    // Returning the full question text can cause Gemini to repeat it
    return {
      success: true,
      completed: false,
      nextQuestionId: nextQuestion.questionId || nextQuestion.id,
      questionNumber: nextQuestion.questionNumber,
      questionType: nextQuestion.questionType || nextQuestion.type,
      questionIndex: nextIndex,
      progress,
      // Note: Don't include questionText to avoid Gemini repeating it
      // Gemini should use the question from its system prompt
    };
  } catch (error) {
    logger.error('Failed to get next question', {
      sessionId,
      currentQuestionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      message: 'Failed to get next question',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
