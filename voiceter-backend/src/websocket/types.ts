/**
 * Type definitions for WebSocket communication
 */

import type { Socket } from 'socket.io';

/**
 * WebSocket message base structure
 */
export interface WebSocketMessage {
  event: string;
  sessionId?: string;
  timestamp: string; // ISO 8601
  data: Record<string, any>;
}

/**
 * Session state for WebSocket connections
 */
export enum WebSocketSessionState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

// ============================================================================
// Client to Server Events
// ============================================================================

/**
 * Initialize connection event data
 */
export interface InitializeConnectionData {
  questionnaireId: string;
  voiceId?: string;
}

/**
 * Initialize connection callback result
 */
export interface InitializeConnectionResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * System prompt event data
 */
export interface SystemPromptData {
  promptContent: string;
}

/**
 * Audio input event data
 */
export interface AudioInputData {
  audioData: string; // base64
}

/**
 * Stop audio event data
 */
export interface StopAudioData {
  reason?: string;
}

/**
 * Client to server event map
 */
export interface ClientToServerEvents {
  initializeConnection: (
    data: InitializeConnectionData,
    callback: (result: InitializeConnectionResult) => void
  ) => void;
  promptStart: () => void;
  systemPrompt: (data: SystemPromptData) => void;
  audioStart: () => void;
  audioInput: (data: AudioInputData) => void;
  stopAudio: (data?: StopAudioData) => void;
}

// ============================================================================
// Server to Client Events
// ============================================================================

/**
 * Audio ready event data
 */
export interface AudioReadyData {
  sessionId: string;
}

/**
 * Text output event data
 */
export interface TextOutputData {
  role: 'USER' | 'ASSISTANT';
  content: string;
  final: boolean;
  interrupted?: boolean;
}

/**
 * Audio output event data
 */
export interface AudioOutputData {
  content: string; // base64
}

/**
 * Tool use event data
 */
export interface ToolUseData {
  toolUseId: string;
  toolName: string;
  parameters: Record<string, any>;
}

/**
 * Tool result event data
 */
export interface ToolResultData {
  toolUseId: string;
  toolName: string;
  result: any;
  success: boolean;
}

/**
 * Content end event data
 */
export interface ContentEndData {
  type: 'TEXT' | 'AUDIO' | 'TOOL';
}

/**
 * Stream complete event data
 */
export interface StreamCompleteData {
  sessionId: string;
}

/**
 * Session closed event data
 */
export interface SessionClosedData {
  sessionId: string;
  reason: string;
}

/**
 * Error event data
 */
export interface ErrorEventData {
  errorCode: string;
  errorMessage: string;
  recoverable: boolean;
  retryAfter?: number;
}

/**
 * Server to client event map
 */
export interface ServerToClientEvents {
  audioReady: (data: AudioReadyData) => void;
  textOutput: (data: TextOutputData) => void;
  audioOutput: (data: AudioOutputData) => void;
  toolUse: (data: ToolUseData) => void;
  toolResult: (data: ToolResultData) => void;
  contentEnd: (data: ContentEndData) => void;
  streamComplete: (data: StreamCompleteData) => void;
  sessionClosed: (data: SessionClosedData) => void;
  error: (data: ErrorEventData) => void;
}

// ============================================================================
// Socket Types
// ============================================================================

/**
 * Extended socket with session data
 */
export interface ExtendedSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  sessionId?: string;
  sessionState?: WebSocketSessionState;
}

/**
 * Socket connection metadata
 */
export interface SocketMetadata {
  socketId: string;
  sessionId?: string;
  sessionState: WebSocketSessionState;
  connectedAt: Date;
  lastActivityAt: Date;
}

/**
 * WebSocket server configuration
 */
export interface WebSocketServerConfig {
  port: number;
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  pingTimeout?: number;
  pingInterval?: number;
}

/**
 * Message validation result
 */
export interface MessageValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxMessagesPerSecond: number;
  windowMs: number;
}

/**
 * Rate limit state
 */
export interface RateLimitState {
  count: number;
  resetTime: number;
}
