/**
 * Gemini Live Transcription Handler
 *
 * Handles transcription events from Gemini Live API and transforms them
 * to the format expected by the frontend. Stores transcriptions in
 * conversation history and persists them to the database.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 *
 * @module gemini-live/transcription-handler
 */

import { EventEmitter } from 'events';
import { getLogger } from '../monitoring/logger';
import { getTranscriptRepository } from '../data/transcript-repository';
import { ConversationTurn } from './types';

const logger = getLogger();

// ============================================================================
// Types
// ============================================================================

/**
 * Transcription event emitted to frontend
 *
 * This is the format expected by the frontend for displaying transcriptions.
 * The event type is either 'transcription:user' or 'transcription:assistant'.
 *
 * Requirements: 8.3 - Include session ID and timestamp
 */
export interface TranscriptionEvent {
  /** Event type for Socket.IO */
  event: 'transcription:user' | 'transcription:assistant';
  /** Session ID */
  sessionId: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event data */
  data: {
    /** Transcript text */
    text: string;
    /** Role of the speaker */
    role: 'user' | 'assistant';
    /** Whether this is a final transcript */
    isFinal: boolean;
    /** Turn number in the conversation */
    turnNumber?: number;
  };
}

/**
 * Session transcription state
 */
interface SessionTranscriptionState {
  /** Current turn number */
  turnNumber: number;
  /** Conversation history for this session */
  conversationHistory: ConversationTurn[];
  /** Last user transcript text (for deduplication) */
  lastUserText?: string;
  /** Last assistant transcript text (for deduplication) */
  lastAssistantText?: string;
}

// ============================================================================
// Transcription Handler Class
// ============================================================================

/**
 * Handles transcription events from Gemini Live
 *
 * Transforms Gemini Live transcription events to the format expected by
 * the frontend and persists transcripts to the database.
 *
 * Requirements:
 * - 8.1: Handle inputTranscription for user speech
 * - 8.2: Handle outputTranscription for assistant speech
 * - 8.3: Include session ID and timestamp in events
 * - 8.4: Store transcriptions in conversation history
 *
 * @example
 * ```typescript
 * const handler = new GeminiTranscriptionHandler();
 *
 * // Listen for transformed events
 * handler.on('transcription', (event) => {
 *   socket.emit(event.event, event);
 * });
 *
 * // Handle incoming Gemini Live transcription
 * handler.handleInputTranscription('session-123', 'Hello, how are you?');
 * ```
 */
export class GeminiTranscriptionHandler extends EventEmitter {
  private sessionStates: Map<string, SessionTranscriptionState> = new Map();
  private transcriptRepository = getTranscriptRepository();

  constructor() {
    super();
  }

  // ==========================================================================
  // Session State Management
  // ==========================================================================

  /**
   * Get or create session transcription state
   */
  private getSessionState(sessionId: string): SessionTranscriptionState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        turnNumber: 0,
        conversationHistory: [],
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Clean up session state
   *
   * @param sessionId - Session ID to clean up
   */
  cleanupSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    logger.debug('Transcription state cleaned up', {
      sessionId,
      event: 'transcription_state_cleanup',
    });
  }

  // ==========================================================================
  // Input Transcription Handling (User Speech)
  // ==========================================================================

  /**
   * Handle input transcription (user speech) from Gemini Live
   *
   * Transforms the transcription to 'transcription:user' format and emits it.
   * User transcripts are persisted to the database.
   *
   * Requirement 8.1: Handle serverContent.inputTranscription for user speech
   * Requirement 8.3: Include session ID and timestamp
   * Requirement 8.4: Store in conversation history
   *
   * @param sessionId - Session ID
   * @param text - Transcribed text from user speech
   */
  handleInputTranscription(sessionId: string, text: string): void {
    // 🔍 DETAILED LOGGING
    /* console.log(`\n🎤 [TranscriptionHandler] handleInputTranscription called`);
    console.log(`   Session: ${sessionId.substring(0, 8)}...`);
    console.log(`   Text: "${text}"`);
    console.log(`   Text length: ${text?.length || 0}`); */

    // Validate transcript
    if (!text || text.trim().length === 0) {
      //console.log(`   ⚠️ SKIPPED: Empty input transcription`);
      logger.debug('Ignoring empty input transcription', {
        sessionId,
        event: 'empty_input_transcription',
      });
      return;
    }

    const state = this.getSessionState(sessionId);

    // Deduplicate consecutive identical transcriptions
    if (state.lastUserText === text) {
      //console.log(`   ⚠️ SKIPPED: Duplicate input transcription`);
      logger.debug('Ignoring duplicate input transcription', {
        sessionId,
        event: 'duplicate_input_transcription',
      });
      return;
    }
    state.lastUserText = text;

    state.turnNumber++;
    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();

    // Create conversation turn for history (Requirement 8.4)
    const conversationTurn: ConversationTurn = {
      role: 'user',
      text,
      timestamp,
    };
    state.conversationHistory.push(conversationTurn);

    // Create frontend event (Requirement 8.3)
    const transcriptionEvent: TranscriptionEvent = {
      event: 'transcription:user',
      sessionId,
      timestamp: timestampISO,
      data: {
        text,
        role: 'user',
        isFinal: true,
        turnNumber: state.turnNumber,
      },
    };

    logger.info('Input transcription received', {
      sessionId,
      event: 'input_transcription_received',
      textLength: text.length,
      turnNumber: state.turnNumber,
    });

    // Emit event for forwarding to frontend
    //console.log(`   ✅ EMITTING 'transcription' event for USER`);
    this.emit('transcription', transcriptionEvent);

    // Persist transcript (async, don't block)
    this.persistTranscript(sessionId, 'user', text, timestamp, state.turnNumber).catch(
      (error) => {
        logger.error('Failed to persist input transcription', {
          sessionId,
          event: 'input_transcription_persist_failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    );
  }

  // ==========================================================================
  // Output Transcription Handling (Assistant Speech)
  // ==========================================================================

  /**
   * Handle output transcription (assistant speech) from Gemini Live
   *
   * Transforms the transcription to 'transcription:assistant' format and emits it.
   * Assistant transcripts are persisted to the database.
   *
   * Requirement 8.2: Handle serverContent.outputTranscription for assistant speech
   * Requirement 8.3: Include session ID and timestamp
   * Requirement 8.4: Store in conversation history
   *
   * @param sessionId - Session ID
   * @param text - Transcribed text from assistant speech
   */
  handleOutputTranscription(sessionId: string, text: string): void {
    // 🔍 DETAILED LOGGING
    /* console.log(`\n🔊 [TranscriptionHandler] handleOutputTranscription called`);
    console.log(`   Session: ${sessionId.substring(0, 8)}...`);
    console.log(`   Text: "${text}"`);
    console.log(`   Text length: ${text?.length || 0}`); */

    // Validate transcript
    if (!text || text.trim().length === 0) {
      //console.log(`   ⚠️ SKIPPED: Empty output transcription`);
      logger.debug('Ignoring empty output transcription', {
        sessionId,
        event: 'empty_output_transcription',
      });
      return;
    }

    const state = this.getSessionState(sessionId);

    // Deduplicate consecutive identical transcriptions
    if (state.lastAssistantText === text) {
      //console.log(`   ⚠️ SKIPPED: Duplicate output transcription`);
      logger.debug('Ignoring duplicate output transcription', {
        sessionId,
        event: 'duplicate_output_transcription',
      });
      return;
    }
    state.lastAssistantText = text;

    const timestamp = new Date();
    const timestampISO = timestamp.toISOString();

    // Create conversation turn for history (Requirement 8.4)
    const conversationTurn: ConversationTurn = {
      role: 'assistant',
      text,
      timestamp,
    };
    state.conversationHistory.push(conversationTurn);

    // Create frontend event (Requirement 8.3)
    const transcriptionEvent: TranscriptionEvent = {
      event: 'transcription:assistant',
      sessionId,
      timestamp: timestampISO,
      data: {
        text,
        role: 'assistant',
        isFinal: true,
        turnNumber: state.turnNumber,
      },
    };

    logger.info('Output transcription received', {
      sessionId,
      event: 'output_transcription_received',
      textLength: text.length,
      turnNumber: state.turnNumber,
    });

    // Emit event for forwarding to frontend
    //console.log(`   ✅ EMITTING 'transcription' event for ASSISTANT`);
    this.emit('transcription', transcriptionEvent);

    // Persist transcript (async, don't block)
    this.persistTranscript(
      sessionId,
      'assistant',
      text,
      timestamp,
      state.turnNumber
    ).catch((error) => {
      logger.error('Failed to persist output transcription', {
        sessionId,
        event: 'output_transcription_persist_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  // ==========================================================================
  // Transcript Persistence
  // ==========================================================================

  /**
   * Persist a transcript to the database
   *
   * @param sessionId - Session ID
   * @param role - Speaker role (user or assistant)
   * @param text - Transcript text
   * @param timestamp - Timestamp of the transcription
   * @param turnNumber - Turn number in the conversation
   */
  private async persistTranscript(
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
    timestamp: Date,
    turnNumber: number
  ): Promise<void> {
    try {
      await this.transcriptRepository.create({
        sessionId,
        timestamp: timestamp.getTime(),
        role,
        content: text,
        turnNumber,
        isFinal: true,
        transcriptionType: 'FINAL',
      });

      logger.debug('Transcript persisted', {
        sessionId,
        event: 'transcript_persisted',
        role,
        contentLength: text.length,
      });
    } catch (error) {
      // Log error but don't throw - transcript persistence should not block the session
      logger.error('Failed to persist transcript', {
        sessionId,
        event: 'transcript_persist_error',
        role,
        error: error instanceof Error ? error.message : String(error),
      });
      // Re-throw to allow caller to handle if needed
      throw error;
    }
  }

  // ==========================================================================
  // Conversation History Access
  // ==========================================================================

  /**
   * Get conversation history for a session
   *
   * Requirement 8.4: Store transcriptions in conversation history
   *
   * @param sessionId - Session ID
   * @returns Array of conversation turns
   */
  getConversationHistory(sessionId: string): ConversationTurn[] {
    const state = this.sessionStates.get(sessionId);
    if (!state) {
      return [];
    }
    return [...state.conversationHistory];
  }

  /**
   * Get the current turn number for a session
   *
   * @param sessionId - Session ID
   * @returns Current turn number or 0 if session not found
   */
  getTurnNumber(sessionId: string): number {
    const state = this.sessionStates.get(sessionId);
    return state?.turnNumber ?? 0;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get transcription statistics for a session
   *
   * @param sessionId - Session ID
   * @returns Session statistics or null if session not found
   */
  getSessionStats(sessionId: string): {
    turnNumber: number;
    conversationHistoryLength: number;
    userTranscriptCount: number;
    assistantTranscriptCount: number;
  } | null {
    const state = this.sessionStates.get(sessionId);
    if (!state) {
      return null;
    }

    const userCount = state.conversationHistory.filter(
      (t) => t.role === 'user'
    ).length;
    const assistantCount = state.conversationHistory.filter(
      (t) => t.role === 'assistant'
    ).length;

    return {
      turnNumber: state.turnNumber,
      conversationHistoryLength: state.conversationHistory.length,
      userTranscriptCount: userCount,
      assistantTranscriptCount: assistantCount,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let handlerInstance: GeminiTranscriptionHandler | null = null;

/**
 * Get the singleton transcription handler instance
 */
export function getGeminiTranscriptionHandler(): GeminiTranscriptionHandler {
  if (!handlerInstance) {
    handlerInstance = new GeminiTranscriptionHandler();
  }
  return handlerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetGeminiTranscriptionHandler(): void {
  if (handlerInstance) {
    handlerInstance.removeAllListeners();
    handlerInstance = null;
  }
}

export default GeminiTranscriptionHandler;
