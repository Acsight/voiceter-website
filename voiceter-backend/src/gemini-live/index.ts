/**
 * Gemini Live API Module
 *
 * This module provides the complete integration with Google's Gemini Live API
 * for real-time bidirectional audio streaming and voice conversations.
 *
 * @module gemini-live
 *
 * @example
 * ```typescript
 * import {
 *   GeminiLiveClient,
 *   GeminiAuthManager,
 *   VoiceConfigManager,
 *   GeminiTranscriptionHandler,
 *   toGeminiFormat,
 *   parseToolCall,
 *   formatToolResponse,
 * } from './gemini-live';
 *
 * // Create a client for a session
 * const client = new GeminiLiveClient('session-123');
 *
 * // Connect with configuration
 * await client.connect({
 *   voiceName: 'Charon',
 *   systemPrompt: 'You are a helpful assistant.',
 *   tools: toGeminiFormat(myTools),
 * });
 *
 * // Handle events
 * client.on('audioOutput', (data) => {
 *   // Forward audio to frontend
 * });
 *
 * client.on('toolCall', async (data) => {
 *   const result = await executeMyTool(data);
 *   client.sendToolResponse(data.id, result);
 * });
 * ```
 */

// ============================================================================
// Client and Connection Management
// ============================================================================

export {
  GeminiLiveClient,
  createGeminiLiveClient,
  ConnectionState,
  categorizeGeminiError,
  categorizeWebSocketCloseCode,
  isRecoverableError,
  createGeminiErrorEvent,
} from './client';

export type { GeminiLiveClientEvents } from './client';

// ============================================================================
// Authentication
// ============================================================================

export {
  GeminiAuthManager,
  createGeminiAuthManager,
} from './auth';

export type { AuthErrorEvent } from './auth';

// ============================================================================
// Configuration
// ============================================================================

export {
  loadGeminiConfig,
  getGeminiConfig,
  resetGeminiConfig,
  buildGeminiWebSocketUrl,
} from './config';

export type { GeminiLiveConfig } from './config';

// ============================================================================
// Voice Configuration
// ============================================================================

export {
  VoiceConfigManager,
  getVoiceConfigManager,
  resetVoiceConfigManager,
  mapVoice,
  getDefaultVoice,
  isValidVoice,
  getAvailableVoices,
  GEMINI_VOICES,
  VOICE_MAPPING,
} from './voice-config';

export type { GeminiVoice } from './voice-config';

// ============================================================================
// Tool Adapter
// ============================================================================

export {
  // Conversion functions
  toGeminiFormat,
  parseToolCall,
  parseGeminiFunctionCall,
  convertFromGeminiEventData,
  formatToolResponse,
  formatMultipleToolResponses,
  convertToolResultToResponse,
  // Result creation helpers
  createErrorToolResult,
  createSuccessToolResult,
  // Error handling
  GeminiToolError,
  GeminiToolErrorType,
  createToolNotFoundError,
  createToolTimeoutError,
  createToolExecutionError,
  createInvalidParametersError,
  createToolCancelledError,
  isGeminiToolError,
  sanitizeToolErrorMessage,
} from './tool-adapter';

export type { GeminiToolCall, GeminiToolResult } from './tool-adapter';

// ============================================================================
// Transcription Handler
// ============================================================================

export {
  GeminiTranscriptionHandler,
  getGeminiTranscriptionHandler,
  resetGeminiTranscriptionHandler,
} from './transcription-handler';

export type { TranscriptionEvent } from './transcription-handler';

// ============================================================================
// Message Builder
// ============================================================================

export {
  buildSetupMessage,
  buildAudioInputMessage,
  buildToolResponseMessage,
  buildMultipleToolResponseMessage,
} from './message-builder';

// ============================================================================
// Types
// ============================================================================

export type {
  // Parameter and tool declaration types
  ParameterSchema,
  GeminiFunctionDeclaration,
  GeminiToolDeclaration,
  // Session configuration
  GeminiSessionConfig,
  // Client to server message types
  GeminiSetupMessage,
  GeminiAudioInputMessage,
  GeminiToolResponseMessage,
  GeminiClientContentMessage,
  GeminiClientMessage,
  // Server to client event types
  GeminiInlineData,
  GeminiModelTurnPart,
  GeminiServerContentEvent,
  GeminiFunctionCall,
  GeminiToolCallEvent,
  GeminiToolCallCancellationEvent,
  GeminiSetupCompleteEvent,
  GeminiGoAwayEvent,
  GeminiServerEvent,
  // Event handler data types
  SetupCompleteEventData,
  AudioOutputEventData,
  TranscriptionEventData,
  ToolCallEventData,
  GoAwayEventData,
  GeminiErrorEventData,
  // Session state types
  GeminiSessionFields,
  ConversationTurn,
  // Tool types
  ToolResult,
  ParsedToolCall,
} from './types';

// Type guards
export {
  isServerContentEvent,
  isToolCallEvent,
  isToolCallCancellationEvent,
  isSetupCompleteEvent,
  isGoAwayEvent,
} from './types';
