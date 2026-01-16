/**
 * WebSocket Event Handler
 * 
 * This module handles incoming WebSocket events, validates them,
 * and routes them to appropriate handlers.
 * 
 * Note: Direct WebSocket mode is now the only supported architecture.
 * The proxy mode has been removed. WebSocket is now only used for
 * real-time events like transcription updates and session status.
 * 
 * REQ-SEC-005: Implements rate limiting (100 messages/second per session)
 * REQ-SEC-004: Implements input sanitization
 * 
 * Gemini Live Integration:
 * When USE_GEMINI_LIVE feature flag is enabled, this handler routes
 * audio and session events to Google Gemini Live API instead of Bedrock.
 * 
 * _Requirements: 1.2, 2.1, 6.3, 9.1, 9.2, 9.3, 9.4, 12.6, 13.4, 14.1-14.10_
 */

import { SessionSocket } from './server';
import { validateMessage } from './validator';
import { ClientToServerEvent } from './events';
import { Logger } from '../monitoring/logger';
import { getMetricsEmitter } from '../monitoring/metrics';
import { getSessionManager } from '../session/manager';
import { RateLimiter } from './rate-limiter';
import { getInputSanitizer } from '../security/input-sanitizer';
import { getToolExecutor } from '../tools/executor';

// Gemini Live imports (Requirement 13.4)
import { createGeminiLiveClient, GeminiLiveClient } from '../gemini-live/client';
import { mapVoice } from '../gemini-live/voice-config';
import { toGeminiFormat } from '../gemini-live/tool-adapter';
import { getGeminiTranscriptionHandler } from '../gemini-live/transcription-handler';
import { getGeminiConfig } from '../gemini-live/config';
import type { 
  GeminiSessionConfig, 
  ToolCallEventData, 
  AudioOutputEventData,
  TranscriptionEventData,
  GeminiErrorEventData,
  GoAwayEventData,
} from '../gemini-live/types';

export class WebSocketEventHandler {
  private logger: Logger;
  private rateLimiter: RateLimiter;
  private geminiClients: Map<string, GeminiLiveClient> = new Map();
  private useGeminiLive: boolean;

  constructor(logger: Logger) {
    this.logger = logger;
    // Initialize rate limiter with 100 messages per second (REQ-SEC-005)
    this.rateLimiter = new RateLimiter({
      maxMessagesPerSecond: 100,
      windowMs: 1000,
    });
    
    // Check if Gemini Live is enabled
    const geminiConfig = getGeminiConfig();
    this.useGeminiLive = geminiConfig.enabled;
    
    if (this.useGeminiLive) {
      this.logger.info('Gemini Live integration enabled', {
        event: 'gemini_live_enabled',
        model: geminiConfig.model,
        region: geminiConfig.region,
      });
    }
  }

  /**
   * Get or create Gemini Live client instance for a session
   * 
   * @param sessionId - The session ID
   * @returns GeminiLiveClient instance
   */
  private getGeminiClientForSession(sessionId: string): GeminiLiveClient {
    let client = this.geminiClients.get(sessionId);
    if (!client) {
      client = createGeminiLiveClient(sessionId);
      this.geminiClients.set(sessionId, client);
    }
    return client;
  }

  /**
   * Remove Gemini Live client for a session
   * 
   * @param sessionId - The session ID
   */
  private removeGeminiClient(sessionId: string): void {
    this.geminiClients.delete(sessionId);
  }

  /**
   * Register event handlers for a socket
   */
  public registerHandlers(socket: SessionSocket): void {
    const sessionId = socket.sessionId!;

    // Register handlers for all client-to-server events
    socket.on('session:start', (data: any) => {
      //console.log('🔥 session:start event received!', { sessionId, data });
      this.logger.info('session:start event handler triggered', {
        event: 'session_start_handler_triggered',
        sessionId,
        data,
      });
      this.handleEvent(socket, 'session:start', data).catch((error) => {
        this.logger.error('Error handling session:start', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    socket.on('session:end', (data: any) => {
      this.handleEvent(socket, 'session:end', data).catch((error) => {
        this.logger.error('Error handling session:end', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    socket.on('audio:chunk', (data: any) => {
      this.handleEvent(socket, 'audio:chunk', data).catch((error) => {
        this.logger.error('Error handling audio:chunk', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    socket.on('config:update', (data: any) => {
      this.handleEvent(socket, 'config:update', data).catch((error) => {
        this.logger.error('Error handling config:update', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    socket.on('questionnaire:select', (data: any) => {
      this.handleEvent(socket, 'questionnaire:select', data).catch((error) => {
        this.logger.error('Error handling questionnaire:select', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    socket.on('text:message', (data: any) => {
      this.handleEvent(socket, 'text:message', data).catch((error) => {
        this.logger.error('Error handling text:message', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    socket.on('user:speaking', (data: any) => {
      this.handleEvent(socket, 'user:speaking', data).catch((error) => {
        this.logger.error('Error handling user:speaking', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    this.logger.debug('Event handlers registered', {
      event: 'ws_handlers_registered',
      sessionId,
    });
  }

  /**
   * Handle incoming event with validation and rate limiting
   * 
   * REQ-SEC-005: Rate limiting (100 messages/second per session)
   * REQ-SEC-004: Input sanitization
   */
  private async handleEvent(socket: SessionSocket, eventType: string, data: any): Promise<void> {
    const sessionId = socket.sessionId!;

    // REQ-SEC-005: Check rate limit
    if (!this.rateLimiter.checkRateLimit(sessionId)) {
      const rateLimitError = this.rateLimiter.getRateLimitError(sessionId);
      
      this.logger.warn('Rate limit exceeded', {
        event: 'ws_rate_limit_exceeded',
        sessionId,
        data: {
          eventType,
          retryAfter: rateLimitError.retryAfter,
        },
      });

      // Send rate limit error with headers info
      socket.emit('error', {
        event: 'error',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          errorCode: rateLimitError.errorCode,
          errorMessage: rateLimitError.errorMessage,
          recoverable: true,
          retryAfter: rateLimitError.retryAfter,
        },
      });

      return;
    }

    // REQ-SEC-004: Sanitize input data
    // Skip sanitization for audio:chunk events - audioData is binary base64, not user text
    let sanitizedData = data;
    if (data && typeof data === 'object' && eventType !== 'audio:chunk') {
      try {
        const sanitizer = getInputSanitizer();
        const result = sanitizer.sanitizeObject(data, { logThreats: true });
        sanitizedData = result.sanitized;
        
        if (result.threats.length > 0) {
          this.logger.warn('Potential injection attempt detected', {
            event: 'injection_attempt',
            sessionId,
            data: {
              eventType,
              threats: result.threats,
            },
          });
        }
      } catch (error) {
        this.logger.error('Input sanitization failed', {
          event: 'sanitization_error',
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Construct full event object
    const event = {
      event: eventType,
      sessionId,
      timestamp: new Date().toISOString(),
      data: sanitizedData,
    };

    // Validate event
    const validation = validateMessage(eventType, sanitizedData);

    if (!validation.valid) {
      this.logger.warn('Invalid WebSocket message received', {
        event: 'ws_invalid_message',
        sessionId,
        data: {
          eventType,
          error: validation.error,
          errorCode: validation.errorCode,
        },
      });

      // Send error response to client
      socket.emit('error', {
        event: 'error',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          errorCode: validation.errorCode || 'WS_MESSAGE_INVALID',
          errorMessage: validation.error || 'Invalid message format',
          recoverable: true
        }
      });

      return;
    }

    // Update lastActivityTime on every event (requirement 5.2, 5.8)
    try {
      const sessionManager = getSessionManager();
      await sessionManager.updateLastActivityTime(sessionId);
    } catch (error) {
      // Log but don't fail - session might not exist yet
      this.logger.debug('Failed to update lastActivityTime', {
        event: 'update_activity_time_failed',
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Log valid event
    /* this.logger.info('WebSocket event received', {
      event: 'ws_event_received',
      sessionId,
      data: {
        eventType,
      },
    }); */

    // Route to specific handler
    this.routeEvent(socket, event as ClientToServerEvent);
  }

  /**
   * Route validated event to specific handler
   */
  private routeEvent(socket: SessionSocket, event: ClientToServerEvent): void {
    const sessionId = socket.sessionId!;

    switch (event.event) {
      case 'session:start':
        this.handleSessionStart(socket, event);
        break;
      case 'session:end':
        this.handleSessionEnd(socket, event);
        break;
      case 'audio:chunk':
        this.handleAudioChunk(socket, event);
        break;
      case 'config:update':
        this.handleConfigUpdate(socket, event);
        break;
      case 'questionnaire:select':
        this.handleQuestionnaireSelect(socket, event);
        break;
      case 'text:message':
        this.handleTextMessage(socket, event);
        break;
      case 'user:speaking':
        this.handleUserSpeaking(socket, event);
        break;
      default:
        this.logger.error('Unhandled event type', {
          event: 'ws_unhandled_event',
          sessionId,
          data: {
            eventType: (event as any).event,
          },
        });
    }
  }

  /**
   * Handle session:start event
   * 
   * In direct mode, this is primarily used for WebSocket-based session initialization.
   * The actual Bedrock connection is established via REST API (/api/session/start).
   * 
   * When USE_GEMINI_LIVE is enabled, this handler initializes a Gemini Live
   * session instead.
   * 
   * _Requirements: 1.2, 12.6, 13.4_
   */
  private async handleSessionStart(socket: SessionSocket, event: ClientToServerEvent): Promise<void> {
    const sessionId = socket.sessionId!;
    const { questionnaireId, voiceId, language, userId } = event.data as any;

    // Debug: Log received language with full event details
    /* console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           SESSION START - LANGUAGE DEBUG                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('📥 Raw event.data:', JSON.stringify(event.data, null, 2));
    console.log('📥 Extracted language:', language);
    console.log('📥 Type of language:', typeof language);
    console.log('📥 questionnaireId:', questionnaireId);
    console.log('📥 voiceId:', voiceId);
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
 */
    this.logger.info('Session start requested via WebSocket', {
      event: 'session_start_requested',
      sessionId,
      data: event.data,
      useGeminiLive: this.useGeminiLive,
    });

    /* console.log('🚀 handleSessionStart called for session:', sessionId);
    console.log('🚀 Data:', { questionnaireId, voiceId, language, userId });
    console.log('🚀 Using Gemini Live:', this.useGeminiLive); */

    try {
      //console.log('🔍 Step 1: Loading questionnaire...');
      // 1. Load questionnaire
      const { getQuestionnaireLoader } = await import('../questionnaire/loader');
      const loader = getQuestionnaireLoader();
      const questionnaire = loader.getQuestionnaire(questionnaireId);

      if (!questionnaire) {
        throw new Error(`Questionnaire not found: ${questionnaireId}`);
      }
      //console.log('✅ Step 1: Questionnaire loaded:', questionnaire.questionnaireName);

      //console.log('🔍 Step 2: Creating session in DynamoDB...');
      // 2. Create session in DynamoDB with all REQ-DATA-002 required fields
      try {
        const { getSessionRepository } = await import('../data/session-repository');
        const sessionRepo = getSessionRepository();
        
        // Get IP address and user agent from socket handshake
        const xForwardedFor = socket.handshake?.headers?.['x-forwarded-for'];
        const ipAddress = typeof xForwardedFor === 'string' 
          ? xForwardedFor.split(',')[0].trim()
          : Array.isArray(xForwardedFor) 
            ? xForwardedFor[0] 
            : socket.handshake?.address || '';
        const userAgent = socket.handshake?.headers?.['user-agent'] || '';
        
        await sessionRepo.create({
          sessionId,
          questionnaireId,
          questionnaireName: questionnaire.questionnaireName || questionnaire.name,
          voiceId,
          userId,
          startTime: new Date().toISOString(),
          status: 'active',
          lastActivityTime: new Date().toISOString(),
          currentQuestionIndex: 0,
          completionRate: 0,
          ipAddress,
          userAgent,
          metadata: {
            provider: this.useGeminiLive ? 'gemini-live' : 'bedrock',
          },
        });
        //console.log('✅ Step 2: Session created in DynamoDB');
      } catch (dbError) {
        console.warn('⚠️  Step 2: DynamoDB error (continuing anyway):', dbError instanceof Error ? dbError.message : String(dbError));
      }

      //console.log('🔍 Step 3: Initializing session state in memory...');
      // 3. Initialize session state in memory
      const sessionManager = getSessionManager();
      await sessionManager.createSession(sessionId, {
        questionnaireId,
        voiceId,
        userId,
        language, // Pass language for NLP analysis
      });
      //console.log('✅ Step 3: Session state initialized');

      // 3.5. Initialize audio recording buffer for S3
      //console.log('🔍 Step 3.5: Initializing audio recording buffer...');
      try {
        const { getRecordingRepository } = await import('../data/recording-repository');
        const recordingRepo = getRecordingRepository();
        recordingRepo.initializeBuffer(sessionId);
        //console.log('✅ Step 3.5: Audio recording buffer initialized');
      } catch (recordingError) {
        console.warn('⚠️  Step 3.5: Recording buffer error (continuing anyway):', recordingError instanceof Error ? recordingError.message : String(recordingError));
      }

      // 4. If Gemini Live is enabled, initialize Gemini Live connection
      if (this.useGeminiLive) {
        //console.log('🔍 Step 4: Initializing Gemini Live connection...');
        await this.initializeGeminiLiveSession(socket, sessionId, questionnaire, voiceId, language);
        //console.log('✅ Step 4: Gemini Live connection initialized');
      } else {
        // 4. Get first question (Bedrock mode)
        const firstQuestion = questionnaire.questions[0];

        // 5. Send session:ready event
        // In direct mode, the frontend will use REST API to get pre-signed URL
        socket.emit('session:ready', {
          event: 'session:ready',
          sessionId,
          timestamp: new Date().toISOString(),
          data: {
            questionnaireName: questionnaire.questionnaireName,
            estimatedDuration: questionnaire.estimatedDuration,
            firstQuestion: {
              questionId: firstQuestion.questionId,
              questionNumber: firstQuestion.questionNumber,
              questionType: firstQuestion.questionType,
              questionText: firstQuestion.questionText,
              options: firstQuestion.options,
            },
            mode: 'direct', // Always direct mode now
          },
        });

        //console.log('✅ Step 4: session:ready sent to frontend (Bedrock mode)');
      }

      this.logger.info('Session started successfully', {
        event: 'session_started',
        sessionId,
        questionnaireId,
        mode: this.useGeminiLive ? 'gemini-live' : 'direct',
      });
    } catch (error) {
      console.error('❌ ERROR in handleSessionStart:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      this.logger.error('Failed to start session', {
        event: 'session_start_failed',
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      socket.emit('error', {
        event: 'error',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          errorCode: 'SESSION_START_FAILED',
          errorMessage: 'Failed to start session. Please try again.',
          recoverable: true,
        },
      });
    }
  }

  /**
   * Initialize Gemini Live session and wire up event handlers
   * 
   * @param socket - The WebSocket connection
   * @param sessionId - The session ID
   * @param questionnaire - The questionnaire to use
   * @param voiceId - The voice ID to use
   * 
   * _Requirements: 1.2, 2.1, 2.2, 9.1, 9.2, 9.3, 9.4, 14.1-14.10_
   */
  private async initializeGeminiLiveSession(
    socket: SessionSocket,
    sessionId: string,
    questionnaire: any,
    voiceId: string,
    language?: string
  ): Promise<void> {
    const client = this.getGeminiClientForSession(sessionId);
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found after creation');
    }

    // Map voice to Gemini voice name
    const geminiVoice = mapVoice(voiceId);

    // Determine language code for system prompt (default to English)
    const languageCode = language || 'en-US';
    // Map BCP-47 language codes to system prompt folder names
    const languageMap: Record<string, string> = {
      // English variants
      'en-US': 'EN',
      'en-IN': 'EN',
      // Turkish
      'tr-TR': 'TR',
      // Spanish
      'es-US': 'ES',
      // French
      'fr-FR': 'FR',
      // German
      'de-DE': 'DE',
      // Portuguese
      'pt-BR': 'PT',
      // Hindi
      'hi-IN': 'HI',
      // Arabic
      'ar-EG': 'AR',
      // Bengali
      'bn-BD': 'BN',
      // Dutch
      'nl-NL': 'NL',
      // Indonesian
      'id-ID': 'ID',
      // Italian
      'it-IT': 'IT',
      // Japanese
      'ja-JP': 'JA',
      // Korean
      'ko-KR': 'KO',
      // Marathi
      'mr-IN': 'MR',
      // Polish
      'pl-PL': 'PL',
      // Romanian
      'ro-RO': 'RO',
      // Russian
      'ru-RU': 'RU',
      // Tamil
      'ta-IN': 'TA',
      // Telugu
      'te-IN': 'TE',
      // Thai
      'th-TH': 'TH',
      // Ukrainian
      'uk-UA': 'UK',
      // Vietnamese
      'vi-VN': 'VI',
      // Legacy codes (for backward compatibility)
      'en-us': 'EN',
      'en-gb': 'EN',
      'tr': 'TR',
      'es': 'ES',
      'fr': 'FR',
      'de': 'DE',
      'pt-br': 'PT',
      'hi': 'HI',
    };
    const promptLanguage = languageMap[languageCode] || 'EN';

    // Debug logging for language flow
    /* console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           LANGUAGE MAPPING DEBUG                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('📥 Received language parameter:', language);
    console.log('📥 Type:', typeof language);
    console.log('🔄 languageCode (after default):', languageCode);
    console.log('🔄 promptLanguage (folder name):', promptLanguage);
    console.log('📋 questionnaireId:', questionnaire.questionnaireId || questionnaire.id);
    console.log('🗂️  Will load prompt from: system_prompts/' + promptLanguage + '/');
    console.log('╚════════════════════════════════════════════════════════════════╝\n'); */

    // Build system prompt from questionnaire with language
    const systemPrompt = this.buildSystemPrompt(questionnaire, session, promptLanguage);

    // Get Gemini config to check if tools are disabled
    const geminiConfig = getGeminiConfig();
    const disableTools = geminiConfig.disableTools;

    // DEBUG: Log the disableTools value to verify config is loaded correctly
    /* console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           GEMINI TOOLS CONFIGURATION CHECK                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('GEMINI_DISABLE_TOOLS env value:', process.env.GEMINI_DISABLE_TOOLS);
    console.log('disableTools from config:', disableTools);
    console.log('Tools will be:', disableTools ? 'DISABLED ❌' : 'ENABLED ✅');
    console.log('╚════════════════════════════════════════════════════════════════╝\n'); */

    // Get tool definitions and convert to Gemini format (unless disabled)
    let geminiTools: any[] = [];
    if (!disableTools) {
      const toolExecutor = getToolExecutor();
      const tools = toolExecutor.getToolDefinitions();
      geminiTools = toGeminiFormat(tools);
      
      // DEBUG: Log the tools being sent to Gemini
      /* console.log('📦 Tools being sent to Gemini Live:');
      console.log('   Tool count:', geminiTools.length);
      console.log('   Tool names:', tools.map((t: any) => t.name).join(', ')); */
    } 
    /* else {
      console.log('⚠️  Tools are DISABLED - Gemini will NOT call record_response');
      console.log('   NLP analysis will NOT be triggered');
      console.log('   To enable tools, set GEMINI_DISABLE_TOOLS=false in .env and RESTART the server');
    } */

    this.logger.info('Building Gemini Live session configuration', {
      sessionId,
      voiceName: geminiVoice,
      systemPromptLength: systemPrompt.length,
      toolCount: geminiTools.length,
      toolsDisabled: disableTools,
    });

    // Wire up Gemini Live event handlers for this session
    this.wireGeminiLiveEvents(socket, sessionId, client);

    // Build session config with language code for speech recognition
    const sessionConfig: GeminiSessionConfig = {
      voiceName: geminiVoice,
      systemPrompt,
      tools: geminiTools, // Empty array if tools disabled
      languageCode: languageCode, // Pass BCP-47 language code for ASR
    };

    console.log('🎤 Gemini Session Config:', {
      voiceName: geminiVoice,
      languageCode,
      systemPromptLength: systemPrompt.length,
      toolCount: geminiTools.length,
      toolsDisabled: disableTools,
    });

    // Connect to Gemini Live
    await client.connect(sessionConfig);

    // Update session with Gemini-specific fields
    const geminiSessionId = client.getGeminiSessionId();
    await sessionManager.updateSession(sessionId, {
      gemini: {
        geminiSessionId: geminiSessionId || undefined,
        voiceName: geminiVoice,
        isConnected: true,
        connectionAttempts: client.getConnectionAttempts(),
        turnCount: 0,
        audioChunksReceived: 0,
        audioChunksSent: 0,
        toolCallsExecuted: 0,
        totalToolExecutionTimeMs: 0,
      },
    });

    // Get first question
    const firstQuestion = questionnaire.questions[0];

    // Send session:ready event (Requirement 14.1)
    socket.emit('session:ready', {
      event: 'session:ready',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        questionnaireName: questionnaire.questionnaireName,
        estimatedDuration: questionnaire.estimatedDuration,
        firstQuestion: {
          questionId: firstQuestion.questionId,
          questionNumber: firstQuestion.questionNumber,
          questionType: firstQuestion.questionType,
          questionText: firstQuestion.questionText,
          options: firstQuestion.options,
        },
        mode: 'gemini-live',
        geminiSessionId,
      },
    });

    // NOTE: Removed initial trigger text that was causing duplicate greetings.
    // The system prompt already instructs the AI to initiate the call.
    // Gemini Live will start speaking based on the system prompt instructions.
    // If the AI doesn't start automatically, we can send a minimal trigger.
    setTimeout(() => {
      if (client.isConnected()) {
        //console.log('📞 Sending minimal trigger to start conversation...');
        // Send empty audio or minimal trigger - just to signal "ready"
        // The system prompt tells the AI what to say, we just need to signal "start"
        client.sendText('.');
      }
    }, 500); // Small delay to ensure everything is ready

    this.logger.info('Gemini Live session initialized', {
      event: 'gemini_live_session_initialized',
      sessionId,
      geminiSessionId,
    });
  }

  /**
   * Build system prompt from questionnaire for Gemini Live
   * 
   * Loads pre-defined system prompts from the system_prompts folder.
   * Falls back to generating a basic prompt if no pre-defined prompt exists.
   * When tools are enabled, appends tool usage instructions.
   * 
   * @param questionnaire - The questionnaire configuration
   * @param session - The current session state
   * @param language - Language code (default: EN)
   * @returns System prompt string
   */
  private buildSystemPrompt(questionnaire: any, session: any, language: string = 'EN'): string {
    const questionnaireId = questionnaire.questionnaireId || questionnaire.id;

    // Load pre-defined system prompt from file
    const { getSystemPromptForQuestionnaire } = require('../questionnaire/system-prompt-loader');
    const preDefinedPrompt = getSystemPromptForQuestionnaire(questionnaireId, language);

    if (!preDefinedPrompt) {
      const errorMsg = `System prompt not found for questionnaire: ${questionnaireId}, language: ${language}`;
      this.logger.error('System prompt not found', {
        event: 'system_prompt_not_found',
        sessionId: session.sessionId,
        questionnaireId,
        language,
      });
      throw new Error(errorMsg);
    }

    this.logger.info('Using pre-defined system prompt', {
      event: 'system_prompt_loaded',
      sessionId: session.sessionId,
      questionnaireId,
      language,
      promptLength: preDefinedPrompt.length,
    });

    // Log the prompt being sent to Gemini Live
    /* console.log('\n========== SYSTEM PROMPT SENT TO GEMINI LIVE ==========');
    console.log(`Questionnaire: ${questionnaireId}`);
    console.log(`Language: ${language}`);
    console.log(`Prompt Length: ${preDefinedPrompt.length} characters`);
    console.log('--- PROMPT CONTENT ---');
    console.log(preDefinedPrompt.substring(0, 2000) + (preDefinedPrompt.length > 2000 ? '\n... [truncated for logging]' : ''));
    console.log('========== END OF SYSTEM PROMPT ==========\n'); */

    return preDefinedPrompt;
  }

  /**
   * Wire Gemini Live client events to frontend WebSocket
   * 
   * @param socket - The WebSocket connection to the frontend
   * @param sessionId - The session ID
   * @param client - The Gemini Live client instance
   * 
   * _Requirements: 9.1, 9.2, 9.3, 9.4, 14.2-14.8_
   */
  private wireGeminiLiveEvents(
    socket: SessionSocket,
    sessionId: string,
    client: GeminiLiveClient
  ): void {
    // Get transcription handler for processing transcriptions
    const transcriptionHandler = getGeminiTranscriptionHandler();

    // Forward user transcription events (Requirement 14.2)
    client.on('inputTranscription', (data: TranscriptionEventData) => {
      this.logger.debug('Forwarding user transcript to frontend', {
        sessionId,
        transcriptLength: data.text?.length,
      });

      // Store in conversation history
      transcriptionHandler.handleInputTranscription(sessionId, data.text);

      socket.emit('transcription:user', {
        event: 'transcription:user',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          text: data.text,
          role: 'user',
          isFinal: true,
        },
      });
    });

    // Forward assistant transcription events (Requirement 14.3)
    client.on('outputTranscription', (data: TranscriptionEventData) => {
      this.logger.debug('Forwarding assistant transcript to frontend', {
        sessionId,
        transcriptLength: data.text?.length,
      });

      // Store in conversation history
      transcriptionHandler.handleOutputTranscription(sessionId, data.text);

      socket.emit('transcription:assistant', {
        event: 'transcription:assistant',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          text: data.text,
          role: 'assistant',
          isFinal: true,
        },
      });
    });

    // Track when a new AI turn starts to emit turn:start event
    // This helps frontend pause audio capture to avoid echo/feedback
    let firstAudioChunkInTurn = true;

    // Forward audio output events (Requirement 14.4)
    // CRITICAL: This handler must be synchronous to avoid audio chunk loss!
    // The async import was causing delays that resulted in dropped audio chunks.
    client.on('audioOutput', (data: AudioOutputEventData) => {
      // Emit turn:start on first audio chunk of a new turn
      // This tells the frontend to pause sending audio to avoid echo
      if (firstAudioChunkInTurn) {
        firstAudioChunkInTurn = false;
        socket.emit('turn:start', {
          event: 'turn:start',
          sessionId,
          timestamp: new Date().toISOString(),
          data: { role: 'assistant' },
        });
        this.logger.debug('AI turn started - frontend should pause audio capture', {
          sessionId,
          event: 'turn_start',
        });
      }

      // IMMEDIATELY forward audio to frontend - this is the critical path
      socket.emit('audio:chunk', {
        event: 'audio:chunk',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          audioData: data.data,
          format: 'pcm_24000', // Gemini Live output format is 24kHz
          sequenceNumber: data.sequenceNumber,
        },
      });

      // Log after sending (non-blocking)
      this.logger.debug('Forwarded audio chunk to frontend', {
        sessionId,
        audioLength: data.data?.length,
        sequenceNumber: data.sequenceNumber,
      });

      // Buffer assistant audio for S3 recording in background (fire and forget)
      // This must NOT block the audio forwarding
      if (data.data) {
        setImmediate(async () => {
          try {
            const { getRecordingRepository } = await import('../data/recording-repository');
            const recordingRepo = getRecordingRepository();
            const audioBuffer = Buffer.from(data.data, 'base64');
            recordingRepo.addAssistantAudioChunk(sessionId, audioBuffer);
          } catch (error) {
            this.logger.debug('Failed to buffer assistant audio for recording', {
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      }

      // Update metrics (non-blocking)
      this.updateGeminiMetrics(sessionId, 'audioChunksReceived');
    });

    // Forward interruption events (barge-in) (Requirement 14.7)
    client.on('interrupted', () => {
      this.logger.info('Forwarding interruption event to frontend', {
        sessionId,
        event: 'gemini_interruption_forwarded',
      });

      // Reset turn state on interruption - ready for next AI turn
      firstAudioChunkInTurn = true;

      socket.emit('interruption', {
        event: 'interruption',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {},
      });
    });

    // Handle tool calls (Requirement 7.1, 7.2)
    // IMPORTANT: Do NOT await here - tool execution should run in parallel with audio streaming
    // Using await would block the event loop and could cause audio issues
    client.on('toolCall', (data: ToolCallEventData) => {
      // Fire and forget - don't await
      this.handleGeminiToolCall(socket, sessionId, data, client).catch((error) => {
        this.logger.error('Unhandled error in tool call handler', {
          sessionId,
          event: 'gemini_tool_call_unhandled_error',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    // Handle tool call cancellation (Requirement 6.4)
    client.on('toolCallCancellation', (ids: string[]) => {
      this.logger.info('Tool calls cancelled due to interruption', {
        sessionId,
        event: 'gemini_tool_calls_cancelled',
        cancelledIds: ids,
      });
    });

    // Handle setup complete
    client.on('setupComplete', (data: { sessionId: string }) => {
      this.logger.info('Gemini Live setup complete', {
        sessionId,
        geminiSessionId: data.sessionId,
      });

      // Update session with Gemini session ID
      this.updateSessionGeminiId(sessionId, data.sessionId);
    });

    // Handle turn complete - AI finished speaking
    client.on('turnComplete', () => {
      this.logger.debug('Gemini Live turn complete', {
        sessionId,
        event: 'gemini_turn_complete',
      });

      // Reset turn state - ready for next AI turn
      firstAudioChunkInTurn = true;

      // Emit turn:complete to frontend so it can resume sending audio
      socket.emit('turn:complete', {
        event: 'turn:complete',
        sessionId,
        timestamp: new Date().toISOString(),
        data: { role: 'assistant' },
      });
      this.logger.debug('AI turn complete - frontend can resume audio capture', {
        sessionId,
        event: 'turn_complete',
      });
    });

    // Handle goAway event (Requirement 2.6)
    client.on('goAway', (data: GoAwayEventData) => {
      this.logger.warn('Gemini Live goAway received', {
        sessionId,
        event: 'gemini_go_away',
        timeLeft: data.timeLeft,
      });
    });

    // Handle errors with graceful session termination (Requirements 8.4, 8.5, 8.6, 14.8)
    client.on('error', async (data: GeminiErrorEventData) => {
      const errorCode = data.errorCode || 'GEMINI_ERROR';
      const errorMessage = data.errorMessage || 'Unknown error';
      const recoverable = data.recoverable ?? true;

      // Log error with full context (Requirement 8.4)
      this.logger.error('Gemini Live error', {
        sessionId,
        event: 'gemini_error',
        errorCode,
        errorMessage,
        recoverable,
      });

      // Send sanitized error to frontend (Requirement 8.5, 14.8)
      socket.emit('error', {
        event: 'error',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          errorCode,
          errorMessage: 'An error occurred during the conversation.',
          recoverable,
          retryAfter: data.retryAfter,
        },
      });

      // Graceful session termination for unrecoverable errors (Requirement 8.6)
      if (!recoverable) {
        await this.terminateGeminiSessionGracefully(socket, sessionId, client, errorCode);
      }
    });

    // Handle state changes
    client.on('stateChange', (state: string) => {
      this.logger.debug('Gemini Live state changed', {
        sessionId,
        event: 'gemini_state_change',
        state,
      });
    });

    this.logger.debug('Gemini Live event handlers wired', {
      sessionId,
      event: 'gemini_events_wired',
    });
  }

  /**
   * Handle tool call from Gemini Live
   * 
   * @param socket - The WebSocket connection
   * @param sessionId - The session ID
   * @param toolCallData - The tool call data from Gemini Live
   * @param client - The Gemini Live client
   * 
   * _Requirements: 7.1, 7.2, 7.3, 7.4, 11.3, 11.5_
   */
  private async handleGeminiToolCall(
    socket: SessionSocket,
    sessionId: string,
    toolCallData: ToolCallEventData,
    client: GeminiLiveClient
  ): Promise<void> {
    const startTime = Date.now();

    // Log tool call with structured format (Requirement 11.5)
    this.logger.info('Handling Gemini Live tool call', {
      sessionId,
      event: 'gemini_tool_call_received',
      toolCallId: toolCallData.id,
      toolName: toolCallData.name,
    });

    // DEBUG: Prominent console log for tool call
    /* console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           GEMINI TOOL CALL RECEIVED                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('Tool Name:', toolCallData.name);
    console.log('Tool Call ID:', toolCallData.id);
    console.log('Session ID:', sessionId);
    console.log('Arguments:', JSON.stringify(toolCallData.args, null, 2));
    console.log('╚════════════════════════════════════════════════════════════════╝\n'); */

    // IMPORTANT: Tool execution is async and should NOT block audio streaming
    // The audio events from Gemini Live are handled by separate event handlers
    // and will continue to be processed while this tool executes
    
    try {
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      const toolExecutor = getToolExecutor();
      const geminiConfig = getGeminiConfig();

      // Execute tool with timeout (Requirement 7.4)
      // This is async and runs in parallel with audio processing
      const result = await toolExecutor.executeFromGeminiWithTimeout(
        toolCallData,
        {
          sessionId,
          session,
          questionnaireId: session.questionnaireId,
        },
        geminiConfig.toolTimeoutMs
      );

      const executionTime = Date.now() - startTime;

      // Send result back to Gemini Live (Requirement 7.3)
      // The result is a GeminiToolResponseMessage, extract the response
      const functionResponse = result.toolResponse.functionResponses[0];
      
      // Log before sending tool response
      this.logger.debug('Sending tool response to Gemini Live', {
        sessionId,
        event: 'gemini_tool_response_sending',
        toolCallId: toolCallData.id,
        toolName: toolCallData.name,
        executionTimeMs: executionTime,
      });
      
      client.sendToolResponse(functionResponse.id, functionResponse.response);

      // Update metrics
      this.updateGeminiMetrics(sessionId, 'toolCallsExecuted');
      this.updateGeminiToolExecutionTime(sessionId, executionTime);

      // Emit tool execution latency metric (Requirement 11.3)
      try {
        const metricsEmitter = getMetricsEmitter();
        await metricsEmitter.emitToolExecutionLatency(executionTime, toolCallData.name);
      } catch (error) {
        // Metrics emitter not initialized, skip
      }

      // Log tool call completion with structured format (Requirement 11.5)
      // Check if the response indicates success (response object may have success field)
      const responseData = functionResponse.response as any;
      const isSuccess = responseData?.success !== false;
      
      this.logger.info('Gemini Live tool call completed', {
        sessionId,
        event: 'gemini_tool_call_completed',
        toolCallId: toolCallData.id,
        toolName: toolCallData.name,
        success: isSuccess,
        executionTimeMs: executionTime,
      });

      // Emit response:recorded event to frontend for record_response tool
      if (toolCallData.name === 'record_response' && responseData?.recordedData) {
        this.logger.info('Emitting response:recorded to frontend', {
          sessionId,
          questionId: responseData.recordedData.qid,
          hasNlpAnalysis: !!responseData.recordedData.nlpAnalysis,
        });

        socket.emit('response:recorded', {
          event: 'response:recorded',
          sessionId,
          timestamp: new Date().toISOString(),
          data: responseData.recordedData,
        });

        // Also emit NLP analysis separately if available
        if (responseData.recordedData.nlpAnalysis) {
          /* console.log('\n');
          console.log('╔════════════════════════════════════════════════════════════════╗');
          console.log('║           EMITTING NLP:ANALYSIS TO FRONTEND                    ║');
          console.log('╚════════════════════════════════════════════════════════════════╝');
          console.log('Session ID:', sessionId);
          console.log('Question ID:', responseData.recordedData.qid);
          console.log('Overall Sentiment Score:', responseData.recordedData.nlpAnalysis.overall_sentiment_score);
          console.log('Topic Count:', responseData.recordedData.nlpAnalysis.analyzed_topics?.length || 0);
          console.log('Topics:', responseData.recordedData.nlpAnalysis.analyzed_topics?.map((t: any) => t.topic).join(', '));
          console.log('╚════════════════════════════════════════════════════════════════╝\n'); */

          this.logger.info('Emitting nlp:analysis to frontend', {
            sessionId,
            questionId: responseData.recordedData.qid,
            topicCount: responseData.recordedData.nlpAnalysis.analyzed_topics?.length || 0,
          });

          socket.emit('nlp:analysis', {
            event: 'nlp:analysis',
            sessionId,
            timestamp: new Date().toISOString(),
            data: {
              questionId: responseData.recordedData.qid,
              analysis: responseData.recordedData.nlpAnalysis,
            },
          });
        }
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Log tool call error with structured format (Requirement 11.5)
      this.logger.error('Failed to handle Gemini Live tool call', {
        sessionId,
        event: 'gemini_tool_call_error',
        toolCallId: toolCallData.id,
        toolName: toolCallData.name,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : String(error),
      });

      // Emit error metric (Requirement 11.4)
      try {
        const metricsEmitter = getMetricsEmitter();
        await metricsEmitter.emitError('GEMINI_TOOL_ERROR');
      } catch (metricsError) {
        // Metrics emitter not initialized, skip
      }

      // Send error result back to Gemini Live
      client.sendToolResponse(toolCallData.id, {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      });
    }
  }

  /**
   * Update session Gemini session ID
   */
  private async updateSessionGeminiId(sessionId: string, geminiSessionId: string): Promise<void> {
    try {
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(sessionId);

      if (session?.gemini) {
        await sessionManager.updateSession(sessionId, {
          gemini: {
            ...session.gemini,
            geminiSessionId,
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to update session Gemini ID', {
        sessionId,
        geminiSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update Gemini Live session metrics
   */
  private async updateGeminiMetrics(
    sessionId: string,
    metric: 'audioChunksReceived' | 'audioChunksSent' | 'toolCallsExecuted'
  ): Promise<void> {
    try {
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(sessionId);

      if (session?.gemini) {
        const updatedMetrics = { ...session.gemini } as any;
        updatedMetrics[metric] = (updatedMetrics[metric] || 0) + 1;

        await sessionManager.updateSession(sessionId, {
          gemini: updatedMetrics,
        });
      }
    } catch (error) {
      this.logger.debug('Failed to update Gemini metrics', {
        sessionId,
        metric,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update Gemini Live tool execution time
   */
  private async updateGeminiToolExecutionTime(
    sessionId: string,
    executionTime: number
  ): Promise<void> {
    try {
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(sessionId);

      if (session?.gemini) {
        await sessionManager.updateSession(sessionId, {
          gemini: {
            ...session.gemini,
            totalToolExecutionTimeMs: ((session.gemini as any).totalToolExecutionTimeMs || 0) + executionTime,
          },
        });
      }
    } catch (error) {
      this.logger.debug('Failed to update Gemini tool execution time', {
        sessionId,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle session:end event
   * 
   * When Gemini Live is enabled, this also closes the Gemini Live WebSocket connection.
   * 
   * _Requirements: 6.3, 14.6_
   */
  private async handleSessionEnd(socket: SessionSocket, event: ClientToServerEvent): Promise<void> {
    const sessionId = socket.sessionId!;
    const { reason } = event.data as any;

    this.logger.info('Session end requested', {
      event: 'session_end_requested',
      sessionId,
      data: event.data,
      useGeminiLive: this.useGeminiLive,
    });

    try {
      // 1. Get session state
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      // 2. If Gemini Live is enabled and connected, close the connection
      if (this.useGeminiLive && session.gemini?.isConnected) {
        this.logger.info('Closing Gemini Live connection', {
          sessionId,
          geminiSessionId: session.gemini.geminiSessionId,
        });

        try {
          const client = this.geminiClients.get(sessionId);
          if (client) {
            await client.disconnect();
            this.removeGeminiClient(sessionId);
          }

          // Update session state
          await sessionManager.updateSession(sessionId, {
            gemini: {
              ...session.gemini,
              isConnected: false,
            },
          });

          this.logger.info('Gemini Live connection closed', {
            sessionId,
            event: 'gemini_connection_closed',
          });
        } catch (geminiError) {
          this.logger.error('Failed to close Gemini Live connection', {
            sessionId,
            error: geminiError instanceof Error ? geminiError.message : String(geminiError),
          });
          // Continue with session cleanup even if Gemini disconnect fails
        }
      }

      // 3. Calculate session metrics
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
      const answeredQuestions = session.responses.size;

      // 4. Load questionnaire to get total questions
      const { getQuestionnaireLoader } = await import('../questionnaire/loader');
      const loader = getQuestionnaireLoader();
      const questionnaire = loader.getQuestionnaire(session.questionnaireId);
      const totalQuestions = questionnaire?.totalQuestions || 0;

      // 5. Determine completion status
      const completionThreshold = 0.8;
      const isActuallyCompleted = totalQuestions > 0 && (answeredQuestions / totalQuestions) >= completionThreshold;
      
      let status: 'completed' | 'terminated' | 'abandoned' | 'error' = 'terminated';
      if (reason === 'completed' || isActuallyCompleted) {
        status = 'completed';
      } else if (reason === 'error') {
        status = 'error';
      } else if (reason === 'user_ended' && !isActuallyCompleted) {
        status = 'abandoned';
      }

      // 6. Calculate completion rate
      const completionRate = totalQuestions > 0 
        ? Math.round((answeredQuestions / totalQuestions) * 100) 
        : 0;

      // 7. Update session in DynamoDB
      const { getSessionRepository } = await import('../data/session-repository');
      const sessionRepo = getSessionRepository();
      await sessionRepo.update(sessionId, {
        endTime: endTime.toISOString(),
        duration,
        status,
        completionRate,
        currentQuestionIndex: answeredQuestions,
        lastActivityTime: endTime.toISOString(),
      });

      // 8. Update session state
      await sessionManager.updateSession(sessionId, {
        status,
      });

      // 8.5. Save audio recording to S3
      let recordingUrl: string | undefined;
      try {
        const { getRecordingRepository } = await import('../data/recording-repository');
        const recordingRepo = getRecordingRepository();
        
        if (recordingRepo.hasBuffer(sessionId)) {
          this.logger.info('Saving audio recording to S3', { sessionId });
          const recordingMetadata = await recordingRepo.saveRecording(sessionId, session.questionnaireId);
          
          if (recordingMetadata) {
            recordingUrl = `s3://${recordingMetadata.s3Bucket}/${recordingMetadata.s3Key}`;
            
            // Update session with audio file reference
            await sessionRepo.update(sessionId, {
              audioFileId: recordingMetadata.s3Key,
            });
            
            this.logger.info('Audio recording saved to S3', {
              sessionId,
              s3Key: recordingMetadata.s3Key,
              duration: recordingMetadata.duration,
            });
          }
        } else {
          this.logger.debug('No audio buffer to save', { sessionId });
        }
      } catch (recordingError) {
        this.logger.error('Failed to save audio recording', {
          sessionId,
          error: recordingError instanceof Error ? recordingError.message : String(recordingError),
        });
        // Continue with session completion even if recording fails
      }

      // 8.6. Extract survey answers using Bedrock Prompt Management
      /* console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║           POST-SESSION: SURVEY EXTRACTION                      ║');
      console.log('╚════════════════════════════════════════════════════════════════╝'); */
      
      let surveyAnswers: any = null;
      try {
        // Get transcripts from in-memory conversation history (more reliable than DynamoDB)
        const transcriptionHandler = getGeminiTranscriptionHandler();
        const conversationHistory = transcriptionHandler.getConversationHistory(sessionId);
        
        //console.log('📋 Conversation history from memory:', conversationHistory.length, 'turns');
        
        // Also try DynamoDB as fallback
        const { getTranscriptRepository } = await import('../data/transcript-repository');
        const transcriptRepo = getTranscriptRepository();
        const dbTranscripts = await transcriptRepo.getFinalTranscripts(sessionId, true);
        
        //console.log('📋 Transcripts from DynamoDB:', dbTranscripts.length, 'records');
        
        // Use whichever source has more data
        const useMemory = conversationHistory.length >= dbTranscripts.length;
        //console.log('📋 Using source:', useMemory ? 'MEMORY' : 'DYNAMODB');
        
        // Convert to transcript entries format
        let transcriptEntries: Array<{role: 'USER' | 'ASSISTANT', content: string, timestamp: any, isFinal: boolean}> = [];
        
        if (useMemory && conversationHistory.length > 0) {
          transcriptEntries = conversationHistory.map(t => ({
            role: (t.role === 'user' ? 'USER' : 'ASSISTANT') as 'USER' | 'ASSISTANT',
            content: t.text || '',
            timestamp: t.timestamp,
            isFinal: true,
          }));
        } else if (dbTranscripts.length > 0) {
          transcriptEntries = dbTranscripts.map(t => ({
            role: t.role as 'USER' | 'ASSISTANT',
            content: t.content || '',
            timestamp: t.timestamp,
            isFinal: t.isFinal ?? true,
          }));
        }
        
        //console.log('📋 Total transcript entries:', transcriptEntries.length);
        /* transcriptEntries.forEach((t, i) => {
          console.log(`   [${i + 1}] ${t.role}: "${t.content?.substring(0, 50)}..."`);
        }); */
        
        if (transcriptEntries.length > 0 && questionnaire) {
          //console.log('🚀 Calling AWS Bedrock for Survey Extraction...');
          
          const { extractSurveyAnswers } = await import('../nlp/survey-output-service');
          
          surveyAnswers = await extractSurveyAnswers(
            sessionId,
            session.questionnaireId,
            questionnaire,
            transcriptEntries
          );
          
          if (surveyAnswers) {
            //console.log('✅ Survey answers extracted:', surveyAnswers.answers?.length || 0, 'answers');
            //console.log('   Processing time:', surveyAnswers.processingTimeMs, 'ms');
            
            // Combine duplicate answers with same questionId before sending to frontend
            // This handles cases where the AI extracts multiple sentences as separate answers
            const combinedAnswersMap = new Map<string, any>();
            for (const answer of surveyAnswers.answers) {
              const qid = answer.questionId || '';
              if (combinedAnswersMap.has(qid)) {
                // Combine with existing answer
                const existing = combinedAnswersMap.get(qid);
                existing.answer = existing.answer + ' ' + answer.answer;
                // Keep the lower confidence if combining
                if (answer.confidence && existing.confidence) {
                  existing.confidence = Math.min(existing.confidence, answer.confidence);
                }
              } else {
                // Add new answer
                combinedAnswersMap.set(qid, { ...answer });
              }
            }
            
            // Replace answers with combined version
            const combinedAnswers = Array.from(combinedAnswersMap.values());
            //console.log('📋 Combined survey answers:', combinedAnswers.length, '(from', surveyAnswers.answers.length, 'raw)');
            surveyAnswers.answers = combinedAnswers;
            
            // Emit survey:answers event to frontend
            socket.emit('survey:answers', {
              event: 'survey:answers',
              sessionId,
              timestamp: new Date().toISOString(),
              data: surveyAnswers,
            });
            //console.log('📤 Emitted survey:answers to frontend');
          } else {
            console.log('⚠️ Survey extraction returned null');
          }
        } 
        /* else {
          console.log('⚠️ Skipping survey extraction - no transcripts or questionnaire');
          console.log('   transcriptEntries.length:', transcriptEntries.length);
          console.log('   questionnaire:', questionnaire ? 'exists' : 'null');
        } */
      } catch (surveyError) {
        //console.error('❌ Survey extraction error:', surveyError instanceof Error ? surveyError.message : String(surveyError));
        this.logger.error('Failed to extract survey answers', {
          sessionId,
          error: surveyError instanceof Error ? surveyError.message : String(surveyError),
        });
      }
      //console.log('╚════════════════════════════════════════════════════════════════╝\n');

      // 8.7. Run NLP analysis on open-ended responses (ONCE after session ends)
      /* console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║           POST-SESSION: NLP ANALYSIS                           ║');
      console.log('╚════════════════════════════════════════════════════════════════╝'); */
      
      let nlpAnalysisResults: any[] = [];
      try {
        // Use open-ended answers from Survey Extraction for NLP analysis
        // This is more accurate than raw transcripts because:
        // 1. Survey extraction combines fragmented responses
        // 2. It identifies which responses are open-ended vs numeric
        
        // Debug: Log all survey answers to see their format
        //console.log('📋 Survey answers from extraction:', surveyAnswers?.answers?.length || 0);
        /* if (surveyAnswers?.answers) {
          surveyAnswers.answers.forEach((a: any, i: number) => {
            console.log(`   [${i + 1}] qid=${a.questionId}, answer="${String(a.answer || '').substring(0, 50)}...", type=${a.answerType}`);
          });
        } */
        
        // First, combine survey answers with the same questionId
        let combinedSurveyAnswers: any[] = [];
        if (surveyAnswers?.answers && surveyAnswers.answers.length > 0) {
          const answersByQuestionId = new Map<string, string[]>();
          
          for (const answer of surveyAnswers.answers) {
            const qid = answer.questionId || '';
            const answerText = String(answer.answer || '');
            
            // Skip numeric answers (ratings, NPS scores, etc.) - only pure numbers
            if (/^\d+$/.test(answerText.trim())) {
              //console.log(`   ⏭️ Skipping numeric answer: qid=${qid}, answer="${answerText}"`);
              continue;
            }
            
            // Skip "Yes", "No", "Evet", "Hayır" type answers
            const normalizedAnswer = answerText.trim().toLowerCase();
            if (['yes', 'no', 'evet', 'hayır', 'hayir'].includes(normalizedAnswer)) {
              //console.log(`   ⏭️ Skipping yes/no answer: qid=${qid}, answer="${answerText}"`);
              continue;
            }
            
            // Skip very short answers (likely not open-ended) - but be more lenient
            if (answerText.length < 5) {
              //console.log(`   ⏭️ Skipping short answer: qid=${qid}, answer="${answerText}" (len=${answerText.length})`);
              continue;
            }
            
            if (!answersByQuestionId.has(qid)) {
              answersByQuestionId.set(qid, []);
            }
            answersByQuestionId.get(qid)!.push(answerText);
            //console.log(`   ✅ Added to combine: qid=${qid}, answer="${answerText.substring(0, 50)}..."`);
          }
          
          // Combine answers for each questionId
          for (const [qid, answers] of answersByQuestionId) {
            combinedSurveyAnswers.push({
              questionId: qid,
              combinedAnswer: answers.join(' '),
              answerCount: answers.length,
            });
          }
          
          //console.log('📋 Combined open-ended answers from Survey Extraction:', combinedSurveyAnswers.length);
          /* combinedSurveyAnswers.forEach((a, i) => {
            console.log(`   [${i + 1}] ${a.questionId}: "${a.combinedAnswer.substring(0, 80)}..." (${a.answerCount} parts)`);
          }); */
        }
        
        // If we have combined survey answers, use them for NLP
        // Otherwise fall back to raw conversation history
        let responsesToAnalyze: Array<{questionId: string, text: string}> = [];
        
        if (combinedSurveyAnswers.length > 0) {
          responsesToAnalyze = combinedSurveyAnswers.map(a => ({
            questionId: a.questionId,
            text: a.combinedAnswer,
          }));
         // console.log('📋 Using combined survey answers for NLP analysis');
        } else {
          // Fallback: Get user responses from conversation history
          //console.log('📋 No combined survey answers, falling back to conversation history');
          const transcriptionHandler = getGeminiTranscriptionHandler();
          const conversationHistory = transcriptionHandler.getConversationHistory(sessionId);
          //console.log('📋 Conversation history entries:', conversationHistory.length);
          const userResponses = conversationHistory.filter(t => t.role === 'user' && t.text && t.text.length > 20);
          //console.log('📋 User responses from memory:', userResponses.length);
          /* userResponses.forEach((t, i) => {
            console.log(`   [${i + 1}] "${t.text?.substring(0, 50)}..."`);
          }); */
          
          responsesToAnalyze = userResponses.map((t, i) => ({
            questionId: `response-${i + 1}`,
            text: t.text || '',
          }));
        }
        
        //console.log('📋 Responses to analyze:', responsesToAnalyze.length);
        /* responsesToAnalyze.forEach((r, i) => {
          console.log(`   [${i + 1}] ${r.questionId}: "${r.text.substring(0, 80)}..."`);
        }); */
        
        if (responsesToAnalyze.length > 0 && questionnaire) {
          //console.log('🚀 Calling AWS Bedrock for NLP Analysis...');
          
          const { analyzeOpenEndedResponse } = await import('../nlp/bedrock-nlp-service');
          
          // Determine language from session or questionnaire
          const language = (session as any).language || (questionnaire as any).language || 'EN';
          const langCode = language.includes('-') ? language.split('-')[0].toUpperCase() : language.toUpperCase();
          //console.log('🌍 Language for NLP:', langCode);
          
          // Analyze each combined response
          for (let i = 0; i < responsesToAnalyze.length; i++) {
            const response = responsesToAnalyze[i];
            
            /* console.log(`\n   Analyzing response ${i + 1}/${responsesToAnalyze.length}...`);
            console.log(`   QuestionId: ${response.questionId}`);
            console.log(`   Text: "${response.text.substring(0, 80)}..."`); */
            
            try {
              const nlpResult = await analyzeOpenEndedResponse(
                response.text,
                session.questionnaireId,
                response.questionId,
                langCode
              );
              
              if (nlpResult) {
                nlpAnalysisResults.push(nlpResult);
                //console.log(`   ✅ NLP result: score=${nlpResult.overall_sentiment_score}, topics=${nlpResult.analyzed_topics?.length || 0}`);
              } else {
                console.log(`   ⚠️ NLP returned null for response ${i + 1}`);
              }
            } catch (nlpError) {
              console.error(`   ❌ NLP error for response ${i + 1}:`, nlpError instanceof Error ? nlpError.message : String(nlpError));
            }
          }
          
          // Emit NLP analysis results to frontend
          if (nlpAnalysisResults.length > 0) {
            //console.log('\n✅ Total NLP results:', nlpAnalysisResults.length);
            
            socket.emit('nlp:analysis', {
              event: 'nlp:analysis',
              sessionId,
              timestamp: new Date().toISOString(),
              data: {
                analyses: nlpAnalysisResults,
                totalResponses: responsesToAnalyze.length,
                analyzedResponses: nlpAnalysisResults.length,
              },
            });
            //console.log('📤 Emitted nlp:analysis to frontend');
          } else {
            console.log('⚠️ No NLP results to emit');
          }
        } 
        /* else {
          console.log('⚠️ Skipping NLP analysis - no responses or questionnaire');
          console.log('   responsesToAnalyze.length:', responsesToAnalyze.length);
          console.log('   questionnaire:', questionnaire ? 'exists' : 'null');
        } */
      } catch (nlpError) {
        //console.error('❌ NLP analysis error:', nlpError instanceof Error ? nlpError.message : String(nlpError));
        this.logger.error('Failed to run NLP analysis', {
          sessionId,
          error: nlpError instanceof Error ? nlpError.message : String(nlpError),
        });
      }
      //console.log('╚════════════════════════════════════════════════════════════════╝\n');

      // 9. Send session:complete (Requirement 14.6)
      socket.emit('session:complete', {
        event: 'session:complete',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          completionStatus: status,
          totalQuestions,
          answeredQuestions,
          duration,
          recordingUrl,
          surveyAnswers: surveyAnswers?.answers || null,
          nlpAnalysis: nlpAnalysisResults.length > 0 ? nlpAnalysisResults : null,
          // Include Gemini metrics if available
          ...(session.gemini && {
            geminiMetrics: {
              geminiSessionId: session.gemini.geminiSessionId,
              connectionAttempts: session.gemini.connectionAttempts,
              audioChunksReceived: (session.gemini as any).audioChunksReceived,
              audioChunksSent: (session.gemini as any).audioChunksSent,
              toolCallsExecuted: (session.gemini as any).toolCallsExecuted,
              totalToolExecutionTimeMs: (session.gemini as any).totalToolExecutionTimeMs,
            },
          }),
        },
      });

      this.logger.info('Session ended successfully', {
        event: 'session_ended',
        sessionId,
        completionStatus: status,
        duration,
        useGeminiLive: this.useGeminiLive,
      });

      // 10. Clean up session state after a delay
      setTimeout(async () => {
        await sessionManager.deleteSession(sessionId);
        this.logger.debug('Session state cleaned up', { sessionId });
      }, 5000);
    } catch (error) {
      this.logger.error('Failed to end session', {
        event: 'session_end_failed',
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      socket.emit('error', {
        event: 'error',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          errorCode: 'SESSION_END_FAILED',
          errorMessage: 'Failed to end session properly.',
          recoverable: false,
        },
      });
    }
  }

  /**
   * Handle audio:chunk event
   * 
   * In direct mode, audio is sent directly to Bedrock via WebSocket.
   * When Gemini Live is enabled, audio is forwarded to Gemini Live client.
   * This handler is kept for recording purposes only in Bedrock mode.
   * 
   * _Requirements: 2.1, 4.1_
   */
  private async handleAudioChunk(socket: SessionSocket, event: ClientToServerEvent): Promise<void> {
    const sessionId = socket.sessionId!;
    const { audioData, sequenceNumber } = event.data as any;

    this.logger.debug('Audio chunk received', {
      event: 'audio_chunk_received',
      sessionId,
      data: {
        sequenceNumber,
        dataLength: audioData?.length || 0,
        useGeminiLive: this.useGeminiLive,
      },
    });

    // Emit audio chunks processed metric (inbound)
    try {
      const metricsEmitter = getMetricsEmitter();
      await metricsEmitter.emitAudioChunksProcessed(1, 'inbound');
    } catch (error) {
      // Metrics emitter not initialized, skip
    }

    // Buffer audio for S3 recording (both Gemini Live and Bedrock modes)
    try {
      const { getRecordingRepository } = await import('../data/recording-repository');
      const recordingRepo = getRecordingRepository();
      
      if (audioData) {
        const audioBuffer = Buffer.from(audioData, 'base64');
        recordingRepo.addUserAudioChunk(sessionId, audioBuffer);
      }
    } catch (error) {
      this.logger.debug('Failed to buffer audio for recording', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // If Gemini Live is enabled, forward audio to Gemini Live client (Requirement 4.1)
    if (this.useGeminiLive) {
      try {
        const client = this.geminiClients.get(sessionId);
        
        // Check if session is connected to Gemini Live
        if (client && client.isConnected()) {
          // Forward audio chunk to Gemini Live
          client.sendAudioChunk(audioData);
          
          // Update metrics
          this.updateGeminiMetrics(sessionId, 'audioChunksSent');
          
          this.logger.debug('Audio chunk forwarded to Gemini Live', {
            sessionId,
            audioLength: audioData?.length || 0,
          });
        } else {
          this.logger.warn('Cannot forward audio, Gemini Live not connected', {
            sessionId,
            event: 'gemini_audio_forward_failed',
          });
        }
      } catch (error) {
        this.logger.error('Failed to forward audio to Gemini Live', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Handle config:update event
   */
  private handleConfigUpdate(socket: SessionSocket, event: ClientToServerEvent): void {
    const sessionId = socket.sessionId!;

    this.logger.info('Config update requested', {
      event: 'config_update_requested',
      sessionId,
      data: event.data,
    });

    // TODO: Update session configuration
  }

  /**
   * Handle questionnaire:select event
   */
  private handleQuestionnaireSelect(socket: SessionSocket, event: ClientToServerEvent): void {
    const sessionId = socket.sessionId!;

    this.logger.info('Questionnaire select requested', {
      event: 'questionnaire_select_requested',
      sessionId,
      data: event.data,
    });

    // TODO: Load selected questionnaire
  }

  /**
   * Handle text:message event
   * 
   * In direct mode, text messages are sent directly to Bedrock.
   * This handler is kept for logging and session tracking.
   */
  private async handleTextMessage(socket: SessionSocket, event: ClientToServerEvent): Promise<void> {
    const sessionId = socket.sessionId!;
    const { text } = event.data as any;

    this.logger.info('Text message received', {
      event: 'text_message_received',
      sessionId,
      text,
    });

    // In direct mode, text is sent directly to Bedrock via the frontend
    // This handler just logs the event for tracking
    this.logger.info('Text message logged (direct mode - sent via frontend)', {
      event: 'text_message_logged',
      sessionId,
    });
  }

  /**
   * Handle user:speaking event
   * 
   * In direct mode, this is used for UI state tracking only.
   */
  private async handleUserSpeaking(socket: SessionSocket, _event: ClientToServerEvent): Promise<void> {
    const sessionId = socket.sessionId!;

    this.logger.info('User started speaking', {
      event: 'user_speaking',
      sessionId,
    });

    // In direct mode, this is just for UI state tracking
    this.logger.debug('User speaking event logged (direct mode)', {
      sessionId,
    });
  }

  /**
   * Gracefully terminate a Gemini Live session on unrecoverable error
   * 
   * Cleans up all resources associated with the session:
   * 1. Disconnects from Gemini Live WebSocket
   * 2. Updates session state to 'error'
   * 3. Persists session data to database
   * 4. Sends session:complete event to frontend
   * 5. Cleans up session from memory
   * 
   * @param socket - The WebSocket connection
   * @param sessionId - The session ID
   * @param client - The Gemini Live client
   * @param errorCode - The error code that triggered termination
   * 
   * _Requirements: 8.6, 14.6_
   */
  private async terminateGeminiSessionGracefully(
    socket: SessionSocket,
    sessionId: string,
    client: GeminiLiveClient,
    errorCode: string
  ): Promise<void> {
    this.logger.info('Gracefully terminating Gemini Live session due to unrecoverable error', {
      sessionId,
      event: 'gemini_session_terminating',
      errorCode,
    });

    try {
      // 1. Disconnect from Gemini Live
      if (client.isConnected()) {
        try {
          await client.disconnect();
          this.removeGeminiClient(sessionId);
          this.logger.info('Gemini Live connection closed during graceful termination', {
            sessionId,
            event: 'gemini_disconnected_graceful',
          });
        } catch (disconnectError) {
          this.logger.error('Failed to disconnect Gemini Live during graceful termination', {
            sessionId,
            error: disconnectError instanceof Error ? disconnectError.message : String(disconnectError),
          });
          // Continue with cleanup even if disconnect fails
        }
      }

      // 2. Get session manager and update session state
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(sessionId);

      if (session) {
        // 3. Calculate session metrics
        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
        const answeredQuestions = session.responses.size;

        // 4. Update session state to error
        await sessionManager.updateSession(sessionId, {
          status: 'error',
          gemini: session.gemini ? {
            ...session.gemini,
            isConnected: false,
          } : undefined,
        });

        // 5. Persist session to database
        try {
          const { getSessionRepository } = await import('../data/session-repository');
          const sessionRepo = getSessionRepository();
          await sessionRepo.update(sessionId, {
            endTime: endTime.toISOString(),
            duration,
            status: 'error',
            lastActivityTime: endTime.toISOString(),
          });
        } catch (dbError) {
          this.logger.error('Failed to persist session during graceful termination', {
            sessionId,
            error: dbError instanceof Error ? dbError.message : String(dbError),
          });
          // Continue with cleanup even if database update fails
        }

        // 6. Send session:complete event to frontend (Requirement 14.6)
        if (socket.connected) {
          socket.emit('session:complete', {
            event: 'session:complete',
            sessionId,
            timestamp: new Date().toISOString(),
            data: {
              completionStatus: 'error',
              reason: errorCode,
              totalQuestions: 0,
              answeredQuestions,
              duration,
              ...(session.gemini && {
                geminiMetrics: {
                  geminiSessionId: session.gemini.geminiSessionId,
                  connectionAttempts: session.gemini.connectionAttempts,
                  audioChunksReceived: (session.gemini as any).audioChunksReceived,
                  audioChunksSent: (session.gemini as any).audioChunksSent,
                  toolCallsExecuted: (session.gemini as any).toolCallsExecuted,
                  totalToolExecutionTimeMs: (session.gemini as any).totalToolExecutionTimeMs,
                },
              }),
            },
          });
        }

        // 7. Clean up session from memory after a short delay
        setTimeout(async () => {
          try {
            await sessionManager.deleteSession(sessionId);
            this.logger.debug('Session state cleaned up after graceful termination', { sessionId });
          } catch (cleanupError) {
            this.logger.error('Failed to clean up session after graceful termination', {
              sessionId,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          }
        }, 2000);
      }

      this.logger.info('Gemini Live session gracefully terminated', {
        sessionId,
        event: 'gemini_session_terminated',
        errorCode,
      });
    } catch (error) {
      this.logger.error('Error during graceful session termination', {
        sessionId,
        event: 'gemini_termination_error',
        error: error instanceof Error ? error.message : String(error),
      });

      // Last resort: try to disconnect socket
      if (socket.connected) {
        socket.disconnect(true);
      }
    }
  }

  /**
   * Handle socket disconnect - run post-session processing
   * 
   * This method is called from server.ts when a socket disconnects
   * to ensure NLP analysis and Survey extraction run even if
   * session:end event was not sent.
   * 
   * @param sessionId - The session ID
   * @param socket - Optional socket to emit results to frontend
   */
  public async handleDisconnect(sessionId: string, socket?: SessionSocket): Promise<void> {
    /* console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           SOCKET DISCONNECT - POST-SESSION PROCESSING          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('📋 Session ID:', sessionId);
    console.log('📋 Socket connected:', socket?.connected || false); */

    try {
      // 1. Get session state
      const sessionManager = getSessionManager();
      const session = await sessionManager.getSession(sessionId);

      if (!session) {
        //console.log('⚠️ Session not found - may have already been cleaned up');
        return;
      }

      //console.log('📋 Session found:', session.questionnaireId);

      // 2. Close Gemini Live connection if active
      if (this.useGeminiLive && session.gemini?.isConnected) {
        //console.log('🔌 Closing Gemini Live connection...');
        try {
          const client = this.geminiClients.get(sessionId);
          if (client) {
            await client.disconnect();
            this.removeGeminiClient(sessionId);
          }
        } catch (geminiError) {
          console.error('❌ Failed to close Gemini connection:', geminiError instanceof Error ? geminiError.message : String(geminiError));
        }
      }

      // 3. Load questionnaire
      const { getQuestionnaireLoader } = await import('../questionnaire/loader');
      const loader = getQuestionnaireLoader();
      const questionnaire = loader.getQuestionnaire(session.questionnaireId);

      if (!questionnaire) {
        //console.log('⚠️ Questionnaire not found:', session.questionnaireId);
        return;
      }

      // 4. Run Survey Extraction
      /* console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║           POST-SESSION: SURVEY EXTRACTION                      ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
 */
      let surveyAnswers: any = null;
      try {
        const transcriptionHandler = getGeminiTranscriptionHandler();
        const conversationHistory = transcriptionHandler.getConversationHistory(sessionId);

        //console.log('📋 Conversation history from memory:', conversationHistory.length, 'turns');

        if (conversationHistory.length > 0) {
          const transcriptEntries = conversationHistory.map(t => ({
            role: (t.role === 'user' ? 'USER' : 'ASSISTANT') as 'USER' | 'ASSISTANT',
            content: t.text || '',
            timestamp: t.timestamp instanceof Date ? t.timestamp.getTime() : t.timestamp,
            isFinal: true,
          }));

          //console.log('📋 Total transcript entries:', transcriptEntries.length);
          transcriptEntries.slice(-10).forEach((t, i) => {
            console.log(`   [${transcriptEntries.length - 10 + i + 1}] ${t.role}: "${t.content?.substring(0, 50)}..."`);
          });

          //console.log('🚀 Calling AWS Bedrock for Survey Extraction...');

          const { extractSurveyAnswers } = await import('../nlp/survey-output-service');

          surveyAnswers = await extractSurveyAnswers(
            sessionId,
            session.questionnaireId,
            questionnaire,
            transcriptEntries
          );

          if (surveyAnswers) {
            //console.log('✅ Survey answers extracted:', surveyAnswers.answers?.length || 0, 'answers');
            //console.log('   Processing time:', surveyAnswers.processingTimeMs, 'ms');
            
            // Emit survey:answers event to frontend if socket provided
            if (socket && socket.connected) {
              //console.log('📤 Emitting survey:answers to frontend...');
              socket.emit('survey:answers', {
                event: 'survey:answers',
                sessionId,
                timestamp: new Date().toISOString(),
                data: {
                  answers: surveyAnswers.answers,
                  source: 'bedrock-prompt-management',
                  processingTimeMs: surveyAnswers.processingTimeMs,
                },
              });
            }
          } else {
            console.log('⚠️ Survey extraction returned null');
          }
        } else {
          console.log('⚠️ No conversation history available');
        }
      } catch (surveyError) {
        console.error('❌ Survey extraction error:', surveyError instanceof Error ? surveyError.message : String(surveyError));
      }
      //console.log('╚════════════════════════════════════════════════════════════════╝\n');

      // 5. Run NLP Analysis
      /* console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║           POST-SESSION: NLP ANALYSIS                           ║');
      console.log('╚════════════════════════════════════════════════════════════════╝'); */

      let nlpAnalysisResults: any[] = [];
      try {
        const transcriptionHandler = getGeminiTranscriptionHandler();
        const conversationHistory = transcriptionHandler.getConversationHistory(sessionId);

        const userResponses = conversationHistory.filter(t => t.role === 'user' && t.text && t.text.length > 20);

        //console.log('📋 User responses from memory:', userResponses.length);
        userResponses.forEach((t, i) => {
          console.log(`   [${i + 1}] "${t.text?.substring(0, 80)}..."`);
        });

        if (userResponses.length > 0) {
          //console.log('🚀 Calling AWS Bedrock for NLP Analysis...');

          const { analyzeOpenEndedResponse } = await import('../nlp/bedrock-nlp-service');

          const language = (session as any).language || (questionnaire as any).language || 'EN';
          const langCode = language.includes('-') ? language.split('-')[0].toUpperCase() : language.toUpperCase();
          //console.log('🌍 Language for NLP:', langCode);

          for (let i = 0; i < userResponses.length; i++) {
            const response = userResponses[i];
            const questionId = `response-${i + 1}`;

            //console.log(`\n   Analyzing response ${i + 1}/${userResponses.length}...`);
            //console.log(`   Text: "${response.text?.substring(0, 50)}..."`);

            try {
              const nlpResult = await analyzeOpenEndedResponse(
                response.text || '',
                session.questionnaireId,
                questionId,
                langCode
              );

              if (nlpResult) {
                nlpAnalysisResults.push(nlpResult);
                //console.log(`   ✅ NLP result: score=${nlpResult.overall_sentiment_score}, topics=${nlpResult.analyzed_topics?.length || 0}`);
              } else {
                console.log(`   ⚠️ NLP returned null for response ${i + 1}`);
              }
            } catch (nlpError) {
              console.error(`   ❌ NLP error for response ${i + 1}:`, nlpError instanceof Error ? nlpError.message : String(nlpError));
            }
          }

          //console.log('\n✅ Total NLP results:', nlpAnalysisResults.length);
        } else {
          console.log('⚠️ No user responses available for NLP analysis');
        }
      } catch (nlpError) {
        console.error('❌ NLP analysis error:', nlpError instanceof Error ? nlpError.message : String(nlpError));
      }
      //console.log('╚════════════════════════════════════════════════════════════════╝\n');

      // 6. Save results to database AND emit to frontend
      try {
        const { getSessionRepository } = await import('../data/session-repository');
        const sessionRepo = getSessionRepository();

        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);

        await sessionRepo.update(sessionId, {
          endTime: endTime.toISOString(),
          duration,
          status: 'completed',
          lastActivityTime: endTime.toISOString(),
          // Store survey answers and NLP results in metadata
          metadata: {
            ...(session as any).metadata,
            surveyAnswers: surveyAnswers?.answers || null,
            nlpAnalysis: nlpAnalysisResults.length > 0 ? nlpAnalysisResults : null,
          },
        });

        //console.log('✅ Session updated in DynamoDB with survey answers and NLP results');

        // Emit NLP analysis results to frontend if socket provided
        if (socket && socket.connected && nlpAnalysisResults.length > 0) {
          //console.log('📤 Emitting nlp:analysis to frontend...');
          // Emit each NLP result
          for (const nlpResult of nlpAnalysisResults) {
            socket.emit('nlp:analysis', {
              event: 'nlp:analysis',
              sessionId,
              timestamp: new Date().toISOString(),
              data: {
                questionId: nlpResult.questionId,
                analysis: {
                  overall_sentiment_score: nlpResult.overall_sentiment_score,
                  analyzed_topics: nlpResult.analyzed_topics,
                },
              },
            });
          }
        }

        // Emit session:complete with all results
        if (socket && socket.connected) {
          //console.log('📤 Emitting session:complete with results to frontend...');
          socket.emit('session:complete', {
            event: 'session:complete',
            sessionId,
            timestamp: new Date().toISOString(),
            data: {
              completionStatus: 'completed',
              reason: 'session_ended',
              totalQuestions: questionnaire.questions?.length || 0,
              answeredQuestions: surveyAnswers?.answers?.length || 0,
              duration,
              surveyAnswers: surveyAnswers?.answers || [],
              nlpAnalysis: nlpAnalysisResults,
            },
          });
        }
      } catch (dbError) {
        console.error('❌ Failed to update session in DynamoDB:', dbError instanceof Error ? dbError.message : String(dbError));
      }

      // 7. Clean up transcription handler state
      const transcriptionHandler = getGeminiTranscriptionHandler();
      transcriptionHandler.cleanupSession(sessionId);

      //console.log('✅ Post-session processing complete for session:', sessionId);
      //console.log('╚════════════════════════════════════════════════════════════════╝\n');

    } catch (error) {
      console.error('❌ Error in handleDisconnect:', error instanceof Error ? error.message : String(error));
      this.logger.error('Error in handleDisconnect', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
