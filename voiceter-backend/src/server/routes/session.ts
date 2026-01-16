/**
 * REST API Routes for Gemini Live Mode
 * 
 * Provides endpoints for session management, tool execution, transcript handling,
 * audio recording, and session completion for Gemini Live API.
 * 
 * Note: Gemini Live mode is now the primary architecture.
 * 
 * Requirements:
 * - 6.2, 6.3: Tool execution endpoint
 * - 8.3, 8.4, 8.6: Transcript persistence with guardrails
 * - 10.1, 10.2, 10.3: Audio chunk buffering
 * - 7.7, 10.4, 10.5: Session end with audio upload
 * - 11.1, 11.5: Session configuration completeness
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../monitoring/logger';
import { getSessionManager } from '../../session/manager';
import { getQuestionnaireLoader } from '../../questionnaire/loader';
import { SystemPromptGenerator } from '../../questionnaire/prompt-generator';
import { getToolExecutor } from '../../tools/executor';
import { getTranscriptRepository } from '../../data/transcript-repository';
import { getRecordingRepository } from '../../data/recording-repository';
import { getGuardrailsService } from '../../bedrock/guardrails';
import { analyzeOpenEndedResponse } from '../../nlp';
import type { Response as QuestionnaireResponse } from '../../questionnaire/types';

const logger = getLogger();
const router = Router();

/**
 * Request/Response interfaces
 */
interface SessionStartRequest {
  questionnaireId: string;
  voiceId?: string;
}

interface SessionStartResponse {
  sessionId: string;
  systemPrompt: string;
  tools: any[];
  questionnaire: {
    id: string;
    name: string;
    totalQuestions: number;
    firstQuestion: any;
  };
  voiceId: string;
}

interface ToolExecuteRequest {
  sessionId: string;
  toolName: string;
  toolUseId: string;
  parameters: Record<string, any>;
}

interface ToolExecuteResponse {
  success: boolean;
  toolUseId: string;
  result?: any;
  error?: string;
}

interface TranscriptRequest {
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isFinal?: boolean;
  turnNumber?: number;
}

interface TranscriptResponse {
  success: boolean;
  guardrailBlocked?: boolean;
  blockedReason?: string;
}

interface AudioChunkRequest {
  sessionId: string;
  source: 'user' | 'assistant';
  audioData: string; // base64 encoded
}

interface AudioChunkResponse {
  success: boolean;
}

interface SessionEndRequest {
  sessionId: string;
  reason?: 'completed' | 'terminated' | 'error';
}

interface SessionEndResponse {
  success: boolean;
  summary: {
    duration: number;
    questionsAnswered: number;
    recordingUrl?: string;
  };
}

/**
 * POST /api/session/start
 * 
 * Creates a new session for Gemini Live API.
 * 
 * Requirements:
 * - 11.1: Provide questionnaire configuration
 * - 11.5: Provide tool definitions
 */
router.post('/start', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { questionnaireId, voiceId = 'matthew' } = req.body as SessionStartRequest;

    // Validate required fields
    if (!questionnaireId) {
      return res.status(400).json({
        error: 'Missing required field: questionnaireId',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Load questionnaire
    const questionnaireLoader = getQuestionnaireLoader();
    const questionnaire = questionnaireLoader.getQuestionnaire(questionnaireId);
    
    if (!questionnaire) {
      return res.status(404).json({
        error: `Questionnaire not found: ${questionnaireId}`,
        errorCode: 'QUESTIONNAIRE_NOT_FOUND',
      });
    }

    // Generate session ID
    const sessionId = uuidv4();

    // Create session in session manager
    const sessionManager = getSessionManager();
    const session = await sessionManager.createSession(sessionId, {
      questionnaireId,
      voiceId,
    });

    // Generate system prompt
    const promptGenerator = new SystemPromptGenerator();
    const firstQuestion = questionnaire.questions[0];
    const systemPrompt = promptGenerator.generateSystemPrompt(
      questionnaire,
      firstQuestion,
      session
    );

    // Get tool definitions
    const toolExecutor = getToolExecutor();
    const tools = toolExecutor.getToolDefinitionsForBedrock();

    // Initialize audio buffer for recording
    const recordingRepository = getRecordingRepository();
    recordingRepository.initializeBuffer(sessionId);

    const duration = Date.now() - startTime;
    logger.info('Session started (Gemini Live mode)', {
      sessionId,
      questionnaireId,
      voiceId,
      duration,
    });

    const response: SessionStartResponse = {
      sessionId,
      systemPrompt,
      tools,
      questionnaire: {
        id: questionnaire.questionnaireId,
        name: questionnaire.questionnaireName,
        totalQuestions: questionnaire.totalQuestions || questionnaire.questions.length,
        firstQuestion: {
          id: firstQuestion.questionId,
          text: firstQuestion.questionText,
          type: firstQuestion.questionType,
          options: firstQuestion.options,
        },
      },
      voiceId,
    };

    return res.status(200).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to start session', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return res.status(500).json({
      error: 'Failed to start session',
      errorCode: 'SESSION_START_FAILED',
    });
  }
});


/**
 * POST /api/tool/execute
 * 
 * Executes a tool requested by Bedrock and returns the result.
 * 
 * Requirements:
 * - 6.2: Execute tool via ToolExecutor
 * - 6.3: Return result in format suitable for Bedrock toolResult event
 */
router.post('/tool/execute', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { sessionId, toolName, toolUseId, parameters } = req.body as ToolExecuteRequest;

    // Validate required fields
    if (!sessionId || !toolName || !toolUseId) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, toolName, toolUseId',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Get session
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: `Session not found: ${sessionId}`,
        errorCode: 'SESSION_NOT_FOUND',
      });
    }

    // Update session activity
    await sessionManager.updateLastActivityTime(sessionId);

    // Execute tool
    const toolExecutor = getToolExecutor();
    const result = await toolExecutor.executeTool(
      toolName,
      parameters || {},
      {
        sessionId,
        questionnaireId: session.questionnaireId,
        session: {
          questionnaireId: session.questionnaireId,
          currentQuestionIndex: session.currentQuestionIndex,
          responses: session.responses,
          visitedQuestions: new Set(),
        },
      }
    );

    // Update session state if tool modified it
    if (result.success && result.data) {
      // Update current question index if get_next_question was called
      if (toolName === 'get_next_question' && result.data.questionIndex !== undefined) {
        await sessionManager.updateSession(sessionId, {
          currentQuestionIndex: result.data.questionIndex,
        });
      }
      
      // Store response if record_response was called
      if (toolName === 'record_response' && result.recordedData) {
        const updatedSession = await sessionManager.getSession(sessionId);
        if (updatedSession) {
          const responseData: QuestionnaireResponse = {
            questionId: result.recordedData.qid,
            response: result.recordedData.answer,
            responseType: parameters.responseType || 'text',
            timestamp: new Date(),
          };
          updatedSession.responses.set(result.recordedData.qid, responseData);
          await sessionManager.updateSession(sessionId, {
            responses: updatedSession.responses,
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Tool executed', {
      sessionId,
      toolName,
      toolUseId,
      success: result.success,
      duration,
    });

    const response: ToolExecuteResponse = {
      success: result.success,
      toolUseId,
      result: result.data,
      error: result.error,
    };

    return res.status(200).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to execute tool', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return res.status(500).json({
      error: 'Failed to execute tool',
      errorCode: 'TOOL_EXECUTION_FAILED',
    });
  }
});


/**
 * POST /api/transcript
 * 
 * Records a transcript and applies guardrails checking.
 * 
 * Requirements:
 * - 8.3: Aggregate user transcriptions
 * - 8.4: Persist transcriptions to DynamoDB with turn numbers
 * - 8.6: Apply guardrails checking
 */
router.post('/transcript', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { 
      sessionId, 
      role, 
      content, 
      timestamp, 
      isFinal = true,
      turnNumber 
    } = req.body as TranscriptRequest;

    // Validate required fields
    if (!sessionId || !role || content === undefined || !timestamp) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, role, content, timestamp',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Validate role
    if (role !== 'user' && role !== 'assistant') {
      return res.status(400).json({
        error: 'Invalid role: must be "user" or "assistant"',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Get session to verify it exists
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: `Session not found: ${sessionId}`,
        errorCode: 'SESSION_NOT_FOUND',
      });
    }

    // Update session activity
    await sessionManager.updateLastActivityTime(sessionId);

    // Apply guardrails checking
    const guardrailsService = getGuardrailsService();
    let guardrailBlocked = false;
    let blockedReason: string | undefined;

    if (guardrailsService.isEnabled() && content.trim().length > 0) {
      const checkResult = role === 'user'
        ? await guardrailsService.checkUserInput(content, sessionId)
        : await guardrailsService.checkAIOutput(content, sessionId);

      if (!checkResult.allowed) {
        guardrailBlocked = true;
        blockedReason = checkResult.blockedReason;
        
        logger.warn('Transcript blocked by guardrails', {
          sessionId,
          role,
          blockedReason,
        });
      }
    }

    // Persist transcript to DynamoDB
    const transcriptRepository = getTranscriptRepository();
    await transcriptRepository.create({
      sessionId,
      timestamp,
      role: role === 'user' ? 'USER' : 'ASSISTANT',
      content,
      isFinal,
      turnNumber,
      guardrailBlocked,
    });

    // Add to conversation history
    session.conversationHistory.push({
      speaker: role === 'user' ? 'USER' : 'ASSISTANT',
      text: content,
      timestamp: new Date(timestamp),
      isFinal,
    });
    await sessionManager.updateSession(sessionId, {
      conversationHistory: session.conversationHistory,
    });

    const duration = Date.now() - startTime;
    logger.debug('Transcript recorded', {
      sessionId,
      role,
      contentLength: content.length,
      isFinal,
      guardrailBlocked,
      duration,
    });

    const response: TranscriptResponse = {
      success: true,
      guardrailBlocked,
      blockedReason,
    };

    return res.status(200).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to record transcript', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return res.status(500).json({
      error: 'Failed to record transcript',
      errorCode: 'TRANSCRIPT_FAILED',
    });
  }
});


/**
 * POST /api/audio/chunk
 * 
 * Buffers audio chunks for recording.
 * 
 * Requirements:
 * - 10.1: Capture user audio chunks
 * - 10.2: Capture assistant audio chunks
 * - 10.3: Buffer audio chunks during session
 */
router.post('/audio/chunk', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { sessionId, source, audioData } = req.body as AudioChunkRequest;

    // Validate required fields
    if (!sessionId || !source || !audioData) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, source, audioData',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Validate source
    if (source !== 'user' && source !== 'assistant') {
      return res.status(400).json({
        error: 'Invalid source: must be "user" or "assistant"',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Get session to verify it exists
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: `Session not found: ${sessionId}`,
        errorCode: 'SESSION_NOT_FOUND',
      });
    }

    // Decode base64 audio data
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Add to recording buffer
    const recordingRepository = getRecordingRepository();
    
    // Initialize buffer if not exists
    if (!recordingRepository.hasBuffer(sessionId)) {
      recordingRepository.initializeBuffer(sessionId);
    }

    if (source === 'user') {
      recordingRepository.addUserAudioChunk(sessionId, audioBuffer);
    } else {
      recordingRepository.addAssistantAudioChunk(sessionId, audioBuffer);
    }

    const duration = Date.now() - startTime;
    logger.debug('Audio chunk buffered', {
      sessionId,
      source,
      chunkSize: audioBuffer.length,
      duration,
    });

    const response: AudioChunkResponse = {
      success: true,
    };

    return res.status(200).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to buffer audio chunk', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return res.status(500).json({
      error: 'Failed to buffer audio chunk',
      errorCode: 'AUDIO_CHUNK_FAILED',
    });
  }
});


/**
 * POST /api/session/end
 * 
 * Ends a session, finalizes audio recording, and cleans up.
 * 
 * Requirements:
 * - 7.7: Clean up session state
 * - 10.4: Upload combined audio to S3
 * - 10.5: Store S3 URL in session record
 */
router.post('/end', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { sessionId, reason = 'completed' } = req.body as SessionEndRequest;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing required field: sessionId',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Get session
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: `Session not found: ${sessionId}`,
        errorCode: 'SESSION_NOT_FOUND',
      });
    }

    // Calculate session duration
    const durationMs = Date.now() - session.startTime.getTime();
    const durationSeconds = Math.floor(durationMs / 1000);

    // Finalize audio recording (upload to S3)
    const recordingRepository = getRecordingRepository();
    let recordingUrl: string | undefined;

    if (recordingRepository.hasBuffer(sessionId)) {
      const recordingMetadata = await recordingRepository.saveRecording(
        sessionId,
        session.questionnaireId
      );
      
      if (recordingMetadata) {
        recordingUrl = `s3://${recordingMetadata.s3Bucket}/${recordingMetadata.s3Key}`;
        logger.info('Audio recording saved', {
          sessionId,
          s3Key: recordingMetadata.s3Key,
        });
      }
    }

    // Update session status
    const statusMap: Record<string, 'completed' | 'terminated' | 'error'> = {
      completed: 'completed',
      terminated: 'terminated',
      error: 'error',
    };
    
    await sessionManager.updateSession(sessionId, {
      status: statusMap[reason] || 'completed',
    });

    // Get questions answered count
    const questionsAnswered = session.responses.size;

    // Clean up session state
    await sessionManager.deleteSession(sessionId);

    const duration = Date.now() - startTime;
    logger.info('Session ended', {
      sessionId,
      reason,
      durationSeconds,
      questionsAnswered,
      hasRecording: !!recordingUrl,
      duration,
    });

    const response: SessionEndResponse = {
      success: true,
      summary: {
        duration: durationSeconds,
        questionsAnswered,
        recordingUrl,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to end session', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return res.status(500).json({
      error: 'Failed to end session',
      errorCode: 'SESSION_END_FAILED',
    });
  }
});


/**
 * POST /api/nlp/analyze
 * 
 * Analyzes open-ended text using NLP to extract sentiment, topics, and key phrases.
 * 
 * Requirements:
 * - Sentiment detection on open-ended responses
 * - Key phrase extraction with position information
 * - Topic analysis with sentiment, intent, and emotion
 */
interface NLPAnalyzeRequest {
  text: string;
  questionnaireId?: string;
  questionId?: string;
}

router.post('/nlp/analyze', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { text, questionnaireId = 'demo-01', questionId = 'open-ended' } = req.body as NLPAnalyzeRequest;

    // Validate required fields
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing required field: text',
        errorCode: 'INVALID_REQUEST',
      });
    }

    // Analyze the text using NLP service
    const nlpResult = await analyzeOpenEndedResponse(text, questionnaireId, questionId);

    const duration = Date.now() - startTime;
    logger.info('NLP analysis completed', {
      textLength: text.length,
      topicsFound: nlpResult?.analyzed_topics?.length || 0,
      overallSentiment: nlpResult?.overall_sentiment_score,
      duration,
    });

    if (!nlpResult) {
      return res.status(500).json({
        error: 'NLP analysis failed',
        errorCode: 'NLP_ANALYSIS_FAILED',
      });
    }

    return res.status(200).json({
      success: true,
      analysis: nlpResult,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Failed to analyze text', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return res.status(500).json({
      error: 'Failed to analyze text',
      errorCode: 'NLP_ANALYSIS_FAILED',
    });
  }
});

export default router;
