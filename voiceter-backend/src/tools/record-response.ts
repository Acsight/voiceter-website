/**
 * record_response Tool Handler
 * Records user's response to a survey question
 * 
 * Requirements:
 * - REQ-DATA-003: Store Survey Responses with all required fields
 * - NLP analysis for open-ended questions via Bedrock
 */

import { getResponseRepository } from '../data/response-repository';
import { getQuestionnaireLoader } from '../questionnaire/loader';
import { getLogger } from '../monitoring/logger';
import { ToolExecutionContext } from './types';
import { Response } from '../questionnaire/types';
import { analyzeOpenEndedResponse, NLPAnalysisResult } from '../nlp';

const logger = getLogger();

export interface RecordResponseInput {
  questionId: string;
  response: string;
  responseType?: string;
}

export interface RecordedResponseData {
  qid: string;
  question: string;
  answer: string;
  nlpAnalysis?: NLPAnalysisResult;
}

// Track question start times for response time calculation
const questionStartTimes: Map<string, number> = new Map();

/**
 * Mark when a question is asked (for response time tracking)
 */
export function markQuestionAsked(sessionId: string, questionId: string): void {
  const key = `${sessionId}:${questionId}`;
  questionStartTimes.set(key, Date.now());
}

/**
 * Get response time for a question
 */
function getResponseTime(sessionId: string, questionId: string): number | undefined {
  const key = `${sessionId}:${questionId}`;
  const startTime = questionStartTimes.get(key);
  if (startTime) {
    const responseTime = (Date.now() - startTime) / 1000; // Convert to seconds
    questionStartTimes.delete(key); // Clean up
    return Math.round(responseTime * 10) / 10; // Round to 1 decimal
  }
  return undefined;
}

/**
 * Record a user's response to a question
 * 
 * Requirements:
 * - REQ-DATA-003: Store structured responses when answers are validated
 *   - questionNumber, questionType, questionText
 *   - response, responseType, timestamp
 *   - responseTime, clarificationCount
 */
export async function recordResponseHandler(
  input: RecordResponseInput,
  context: ToolExecutionContext
): Promise<any> {
  const { questionId, response, responseType } = input;
  const { sessionId, questionnaireId, session } = context;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           RECORD_RESPONSE HANDLER CALLED                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('SessionId:', sessionId);
  console.log('QuestionnaireId:', questionnaireId);
  console.log('QuestionId:', questionId);
  console.log('Response:', response?.substring(0, 100));
  console.log('ResponseType:', responseType);

  logger.info('Recording response', {
    sessionId,
    questionId,
    response,
    responseType,
  });

  try {
    // 1. Get question details from questionnaire
    let questionText = '';
    let questionNumber: number | undefined;
    let questionType: string | undefined;
    
    console.log('\n--- LOOKING UP QUESTION TYPE ---');
    
    try {
      const loader = getQuestionnaireLoader();
      const questionnaire = loader.getQuestionnaire(questionnaireId);
      console.log('Questionnaire loaded:', !!questionnaire);
      console.log('Questionnaire ID:', questionnaire?.questionnaireId || questionnaire?.id);
      console.log('Question count:', questionnaire?.questions?.length);
      
      if (questionnaire) {
        // Try exact match first
        let question = questionnaire.questions.find(q => q.questionId === questionId || q.id === questionId);
        console.log('Exact match found:', !!question);
        
        // If not found, try fuzzy match (AI might use slightly different IDs)
        if (!question) {
          // Extract the question number from the ID (e.g., "q1-greeting-consent" -> "1")
          const qNumMatch = questionId.match(/q(\d+)/i);
          console.log('Trying fuzzy match, qNumMatch:', qNumMatch);
          if (qNumMatch) {
            const qNum = parseInt(qNumMatch[1], 10);
            question = questionnaire.questions.find(q => q.questionNumber === qNum);
            console.log('Fuzzy match found:', !!question);
          }
        }
        
        if (question) {
          // Handle dynamic question text (e.g., {{dynamic_nps_followup}})
          questionText = question.questionText || question.text || '';
          if (questionText.includes('{{') && question.dynamicQuestionText) {
            // Try to resolve dynamic text based on prior responses
            const npsResponse = session.responses.get('q6-nps') || session.responses.get('q6-nps-score');
            if (npsResponse) {
              const npsScore = parseInt(String(npsResponse.response), 10);
              if (!isNaN(npsScore)) {
                if (npsScore <= 6) {
                  questionText = question.dynamicQuestionText.detractors || questionText;
                } else if (npsScore <= 8) {
                  questionText = question.dynamicQuestionText.passives || questionText;
                } else {
                  questionText = question.dynamicQuestionText.promoters || questionText;
                }
              }
            }
          }
          questionNumber = question.questionNumber;
          questionType = question.questionType || question.type;
          
          console.log('✅ Question found!');
          console.log('   questionNumber:', questionNumber);
          console.log('   questionType:', questionType);
          console.log('   questionText:', questionText?.substring(0, 50));
          
          logger.debug('Question details found', { 
            sessionId, 
            questionId, 
            matchedQuestionId: question.questionId,
            questionNumber,
            questionText: questionText.substring(0, 50)
          });
        } else {
          console.log('❌ Question NOT found in questionnaire');
          console.log('   Looking for questionId:', questionId);
          console.log('   Available IDs:', questionnaire.questions.map(q => q.questionId).join(', '));
          
          logger.warn('Question not found in questionnaire', { 
            sessionId, 
            questionId, 
            availableIds: questionnaire.questions.map(q => q.questionId).join(', ')
          });
        }
      } else {
        console.log('❌ Questionnaire NOT loaded');
        console.log('   questionnaireId:', questionnaireId);
      }
    } catch (err) {
      console.log('❌ Error loading questionnaire:', err);
      logger.warn('Failed to get question details', { sessionId, questionId, error: err });
    }
    
    console.log('--- END QUESTION LOOKUP ---');
    console.log('Final questionType:', questionType);

    // 2. Calculate response time
    const responseTime = getResponseTime(sessionId, questionId);

    // 3. Get clarification count from session (if tracked)
    const clarificationCount = session.metadata?.clarificationCounts?.[questionId] || 0;

    // 4. Save to database with all REQ-DATA-003 required fields
    const responseRepo = getResponseRepository();
    await responseRepo.create({
      sessionId,
      questionId,
      questionNumber,
      questionType,
      questionText,
      response: response,
      responseType: responseType || 'structured',
      timestamp: new Date().toISOString(),
      responseTime,
      clarificationCount,
      metadata: {},
    });

    // 5. Update session state
    const responseObj: Response = {
      questionId,
      response: response,
      responseType: responseType || 'structured',
      timestamp: new Date(),
    };
    session.responses.set(questionId, responseObj);

    // 6. Update session in DynamoDB with currentQuestionIndex
    try {
      const { getSessionRepository } = await import('../data/session-repository');
      const sessionRepo = getSessionRepository();
      await sessionRepo.update(sessionId, {
        currentQuestionIndex: questionNumber || session.responses.size,
        lastActivityTime: new Date().toISOString(),
      });
    } catch (dbError) {
      logger.warn('Failed to update session in DynamoDB', { sessionId, error: dbError });
    }

    logger.info('Response recorded successfully', {
      sessionId,
      questionId,
      questionNumber,
      questionType,
      responseTime,
    });

    // 7. Run NLP analysis for open-ended questions
    // Check both questionType (from questionnaire) and responseType (from Gemini)
    // Also check if the response is long enough to be meaningful open-ended feedback
    let nlpAnalysis: NLPAnalysisResult | undefined;
    const isOpenEndedByQuestionType = questionType === 'open_ended' || questionType === 'open-ended';
    const isOpenEndedByResponseType = responseType === 'open_ended' || responseType === 'open-ended' || responseType === 'text';
    // Consider responses longer than 20 chars as potential open-ended (for NPS follow-ups, feedback, etc.)
    const isLongTextResponse = response && response.length > 20 && !response.match(/^[0-9]+$/);
    const isOpenEndedQuestion = isOpenEndedByQuestionType || isOpenEndedByResponseType || isLongTextResponse;
    
    console.log('=== NLP CHECK START ===');
    console.log('SessionId:', sessionId);
    console.log('QuestionId:', questionId);
    console.log('QuestionType:', questionType);
    console.log('ResponseType:', responseType);
    console.log('IsOpenEndedByQuestionType:', isOpenEndedByQuestionType);
    console.log('IsOpenEndedByResponseType:', isOpenEndedByResponseType);
    console.log('IsLongTextResponse:', isLongTextResponse);
    console.log('IsOpenEnded (final):', isOpenEndedQuestion);
    console.log('Response:', response);
    console.log('Response Length:', response?.length);
    console.log('=== NLP CHECK END ===');
    
    if (isOpenEndedQuestion) {
      logger.info('Running NLP analysis for open-ended response', {
        sessionId,
        questionId,
        questionType,
        responseLength: response.length,
        responsePreview: response.substring(0, 100),
      });

      console.log('=== CALLING NLP SERVICE ===');
      console.log('About to call analyzeOpenEndedResponse with:');
      console.log('  response:', response);
      console.log('  questionnaireId:', questionnaireId);
      console.log('  questionId:', questionId);
      console.log('  analyzeOpenEndedResponse function exists:', typeof analyzeOpenEndedResponse);
      
      // Get language from session (default to EN if not set)
      // Extract language code (e.g., 'en-US' -> 'EN', 'tr-TR' -> 'TR')
      const sessionLanguage = (session as any).language || 'en-US';
      const languageCode = sessionLanguage.split('-')[0].toUpperCase();
      console.log('  language:', languageCode, '(from session:', sessionLanguage, ')');
      
      try {
        console.log('>>> Entering try block, calling analyzeOpenEndedResponse NOW...');
        const nlpResult = await analyzeOpenEndedResponse(response, questionnaireId, questionId, languageCode);
        console.log('<<< analyzeOpenEndedResponse returned');
        console.log('=== NLP SERVICE RETURNED ===');
        console.log('NLP Result:', nlpResult ? 'SUCCESS' : 'NULL');
        
        if (nlpResult) {
          nlpAnalysis = nlpResult;
          
          console.log('=== NLP ANALYSIS RESULT ===');
          console.log('Overall Sentiment Score:', nlpResult.overall_sentiment_score);
          console.log('Topic Count:', nlpResult.analyzed_topics?.length || 0);
          console.log('Topics:', nlpResult.analyzed_topics?.map(t => t.topic).join(', '));
          console.log('Full NLP Result:', JSON.stringify(nlpResult, null, 2));
          console.log('=== END NLP ANALYSIS RESULT ===');
          
          logger.info('NLP analysis completed', {
            sessionId,
            questionId,
            overallScore: nlpResult.overall_sentiment_score,
            topicCount: nlpResult.analyzed_topics.length,
            topics: nlpResult.analyzed_topics.map(t => ({ topic: t.topic, sentiment: t.sentiment })),
          });
        }
      } catch (nlpError: any) {
        console.error('=== NLP ERROR CAUGHT ===');
        console.error('Error type:', typeof nlpError);
        console.error('Error name:', nlpError?.name);
        console.error('Error message:', nlpError?.message);
        console.error('Error stack:', nlpError?.stack);
        console.error('Full error:', nlpError);
        console.error('=== END NLP ERROR ===');
        
        logger.warn('NLP analysis failed, continuing without it', {
          sessionId,
          questionId,
          error: nlpError instanceof Error ? nlpError.message : String(nlpError),
          stack: nlpError instanceof Error ? nlpError.stack : undefined,
        });
      }
    } else {
      console.log('=== SKIPPING NLP (not open-ended) ===');
      console.log('QuestionType:', questionType);
      console.log('ResponseType:', responseType);
      console.log('Response Length:', response?.length);
      console.log('Criteria: questionType must be open_ended/open-ended, OR responseType must be open_ended/open-ended/text, OR response > 20 chars and not numeric');
    }

    // 8. Return simple confirmation to Gemini - avoid including question text
    // which might cause Gemini to repeat it
    // The recordedData is sent separately via WebSocket event to frontend
    
    // Log what's being sent to frontend (via separate event)
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           RECORDED DATA BEING SENT TO FRONTEND                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('QuestionId:', questionId);
    console.log('Answer:', response.substring(0, 100) + (response.length > 100 ? '...' : ''));
    console.log('Has NLP Analysis:', !!nlpAnalysis);
    if (nlpAnalysis) {
      console.log('NLP Overall Score:', nlpAnalysis.overall_sentiment_score);
      console.log('NLP Topic Count:', nlpAnalysis.analyzed_topics?.length || 0);
    }
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Return minimal response to Gemini to avoid repetition
    // The detailed recordedData is passed separately for frontend display
    return {
      success: true,
      recorded: true,
      questionId,
      // Include recordedData for the WebSocket handler to emit to frontend
      // but Gemini should only see the simple confirmation above
      recordedData: {
        qid: questionId,
        question: questionText,
        answer: response,
        nlpAnalysis,
      },
    };
  } catch (error) {
    logger.error('Failed to record response', {
      sessionId,
      questionId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      message: 'Failed to record response',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
