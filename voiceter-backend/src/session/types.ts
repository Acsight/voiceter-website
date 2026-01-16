/**
 * Type definitions for session management
 */

import type { Questionnaire, Response } from '../questionnaire/types';
import type { AudioConfiguration, InferenceConfig, ToolSpec } from '../bedrock/types';

/**
 * Session status
 */
export enum SessionState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

/**
 * Session status for database
 * 
 * _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
 */
export type SessionStatus = 'connecting' | 'active' | 'completed' | 'terminated' | 'abandoned' | 'error';

/**
 * Conversation turn in session history
 */
export interface ConversationTurn {
  speaker: 'USER' | 'ASSISTANT';
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

/**
 * BiDirectional stream identifiers
 */
export interface BedrockStreamIds {
  promptName: string;
  audioContentId?: string;
  contentName?: string; // Alias for audioContentId
}

/**
 * Gemini Live-specific session state fields
 * 
 * @remarks
 * These fields are used when the session is connected to Google Gemini Live API
 * for speech-to-speech conversations.
 * 
 * _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
 */
export interface GeminiSessionFields {
  /** Gemini session ID from setupComplete event */
  geminiSessionId?: string;
  /** Voice name being used for this session */
  voiceName: string;
  /** Whether the Gemini Live WebSocket is currently connected */
  isConnected: boolean;
  /** Number of connection attempts for reconnection tracking */
  connectionAttempts: number;
  /** Last reconnection attempt time */
  lastReconnectTime?: Date;
  /** Number of conversation turns in this session */
  turnCount: number;
  /** Number of audio chunks received from Gemini Live */
  audioChunksReceived: number;
  /** Number of audio chunks sent to Gemini Live */
  audioChunksSent: number;
  /** Number of tool calls executed in this session */
  toolCallsExecuted: number;
  /** Total tool execution time in milliseconds */
  totalToolExecutionTimeMs: number;
}

/**
 * Complete session state
 */
export interface Session {
  // Identity
  sessionId: string;
  socketId?: string;
  userId?: string;

  // Questionnaire Context
  questionnaireId: string;
  questionnaire?: Questionnaire;
  currentQuestionIndex: number;

  // Language
  language?: string; // BCP-47 language code (e.g., 'en-US', 'tr-TR')

  // Response History
  responses: Map<string, Response>;

  // Conversation History
  conversationHistory: ConversationTurn[];

  // BiDirectional Stream IDs (only used in proxy mode)
  bedrockStreamIds: BedrockStreamIds;

  // Configuration
  audioConfig: AudioConfiguration;
  voiceId?: string;
  inferenceConfig?: InferenceConfig;

  // Timing
  startTime: Date;
  lastActivityTime: Date;

  // Status
  status: SessionStatus;

  // Gemini Live-specific fields (optional, only set when using Gemini Live)
  // _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  gemini?: GeminiSessionFields;
}

/**
 * Session info returned when starting a session in direct mode
 */
export interface DirectModeSessionInfo {
  sessionId: string;
  preSignedUrl: string;
  expiresAt: Date;
  systemPrompt: string;
  tools: ToolSpec[];
  questionnaire: {
    id: string;
    name: string;
    totalQuestions: number;
    firstQuestion: any;
  };
  voiceId: string;
}

/**
 * Session metadata for storage
 */
export interface SessionMetadata {
  sessionId?: string;
  questionnaireId: string;
  currentQuestionIndex?: number;
  startTime?: string;
  lastActivityTime?: string;
  status?: SessionStatus;
  voiceId: string;
  userId?: string;
  language?: string; // BCP-47 language code (e.g., 'en-US', 'tr-TR')
  metadata?: Record<string, any>;
}

/**
 * Session creation parameters
 */
export interface CreateSessionParams {
  questionnaireId: string;
  voiceId?: string;
  socketId: string;
}

/**
 * Session update parameters
 */
export interface UpdateSessionParams {
  currentQuestionIndex?: number;
  lastActivityTime?: Date;
  status?: SessionStatus;
  metadata?: Record<string, any>;
}

/**
 * Session cleanup options
 */
export interface SessionCleanupOptions {
  timeout?: number; // milliseconds
  force?: boolean;
}
