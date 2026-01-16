/**
 * Gemini Live API Type Definitions
 *
 * This module defines all TypeScript interfaces and types for the Gemini Live API
 * integration, including client-to-server messages, server-to-client events,
 * and session configuration.
 */

// ============================================================================
// Tool Declaration Types
// ============================================================================

/**
 * JSON Schema parameter definition for tool parameters.
 */
export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
}

/**
 * Gemini function declaration format for tool definitions.
 * Requirement 7.7: Format tool declarations for Gemini Live
 */
export interface GeminiFunctionDeclaration {
  /** Function name */
  name: string;
  /** Function description */
  description: string;
  /** Function parameters schema */
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required: string[];
  };
}

/**
 * Tool declaration wrapper for Gemini Live setup message.
 */
export interface GeminiToolDeclaration {
  functionDeclarations: GeminiFunctionDeclaration[];
}

// ============================================================================
// Session Configuration Types
// ============================================================================

/**
 * Configuration for a Gemini Live session.
 * Used when connecting to the Gemini Live API.
 */
export interface GeminiSessionConfig {
  /** Voice name for audio generation */
  voiceName: string;
  /** System prompt/instruction for the AI */
  systemPrompt: string;
  /** Tool declarations for function calling */
  tools: GeminiFunctionDeclaration[];
  /** Language code for speech recognition (BCP-47 format, e.g., 'tr-TR', 'en-US') */
  languageCode?: string;
}

// ============================================================================
// Client to Server Message Types (Requirement 2.2)
// ============================================================================

/**
 * Setup message sent to Gemini Live to initialize a session.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
export interface GeminiSetupMessage {
  setup: {
    /** Model identifier (Requirement 3.1) */
    model: string;
    /** Generation configuration */
    generationConfig: {
      /** Response modalities - AUDIO for voice (Requirement 3.2) */
      responseModalities: ['AUDIO'];
      /** Speech configuration including voice */
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            /** Voice name for audio generation (Requirement 3.6) */
            voiceName: string;
          };
        };
      };
    };
    /** System instruction for the AI (Requirement 3.3) */
    systemInstruction: {
      parts: Array<{ text: string }>;
    };
    /** Tool declarations for function calling (Requirement 3.4) */
    tools: Array<{
      functionDeclarations: GeminiFunctionDeclaration[];
    }>;
    /** Enable input audio transcription (Requirement 3.5) */
    inputAudioTranscription: Record<string, never>;
    /** Enable output audio transcription (Requirement 3.5) */
    outputAudioTranscription: Record<string, never>;
    /** Real-time input configuration including VAD */
    realtimeInputConfig?: {
      /** Automatic voice activity detection settings */
      automaticActivityDetection: {
        /** Start of speech sensitivity */
        startOfSpeechSensitivity: string;
        /** End of speech sensitivity */
        endOfSpeechSensitivity: string;
        /** Prefix padding in milliseconds */
        prefixPaddingMs: number;
        /** Silence duration to detect end of speech */
        silenceDurationMs: number;
      };
      /** Activity handling mode for interruptions */
      activityHandling: 'START_OF_ACTIVITY_INTERRUPTS';
    };
  };
}

/**
 * Audio input message sent to Gemini Live.
 * Requirement 4.1: Forward audio as realtimeInput with mimeType audio/pcm;rate=16000
 */
export interface GeminiAudioInputMessage {
  realtimeInput: {
    audio: {
      /** Audio MIME type - PCM at 16kHz */
      mimeType: 'audio/pcm;rate=16000';
      /** Base64-encoded audio data */
      data: string;
    };
  };
}

/**
 * Tool response message sent to Gemini Live after tool execution.
 * Requirement 7.3: Send toolResponse with functionResponses
 */
export interface GeminiToolResponseMessage {
  toolResponse: {
    functionResponses: Array<{
      /** Call ID from the original tool call */
      id: string;
      /** Tool execution result */
      response: unknown;
    }>;
  };
}

/**
 * Client content message for sending text or context to Gemini Live.
 */
export interface GeminiClientContentMessage {
  clientContent: {
    turns: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string }>;
    }>;
    turnComplete: boolean;
  };
}

// ============================================================================
// Server to Client Event Types
// ============================================================================

/**
 * Inline data structure for audio output from Gemini Live.
 */
export interface GeminiInlineData {
  /** MIME type of the data (e.g., audio/pcm) */
  mimeType: string;
  /** Base64-encoded data */
  data: string;
}

/**
 * Part of a model turn, may contain inline audio data.
 */
export interface GeminiModelTurnPart {
  /** Inline data (audio) if present */
  inlineData?: GeminiInlineData;
  /** Text content if present */
  text?: string;
}

/**
 * Server content event from Gemini Live.
 * Contains audio output, transcriptions, and turn status.
 */
export interface GeminiServerContentEvent {
  serverContent: {
    /** Model's turn with audio/text parts */
    modelTurn?: {
      parts: GeminiModelTurnPart[];
    };
    /** User's input transcription (ASR) */
    inputTranscription?: {
      text: string;
    };
    /** Model's output transcription */
    outputTranscription?: {
      text: string;
    };
    /** Whether the user interrupted the model */
    interrupted?: boolean;
    /** Whether the model's turn is complete */
    turnComplete?: boolean;
  };
}

/**
 * Function call from Gemini Live requesting tool execution.
 */
export interface GeminiFunctionCall {
  /** Unique call ID for response matching */
  id: string;
  /** Function name to execute */
  name: string;
  /** Function arguments */
  args: Record<string, unknown>;
}

/**
 * Tool call event from Gemini Live.
 * Requirement 7.1, 7.2: Extract and execute function calls
 */
export interface GeminiToolCallEvent {
  toolCall: {
    functionCalls: GeminiFunctionCall[];
  };
}

/**
 * Tool call cancellation event from Gemini Live.
 * Sent when tool calls should be cancelled (e.g., on interruption).
 */
export interface GeminiToolCallCancellationEvent {
  toolCallCancellation: {
    /** IDs of tool calls to cancel */
    ids: string[];
  };
}

/**
 * Setup complete event from Gemini Live.
 * Indicates the session is ready for audio streaming.
 * Requirement 2.3: Emit session ready event with Gemini session ID
 */
export interface GeminiSetupCompleteEvent {
  setupComplete: {
    /** Gemini session ID */
    sessionId: string;
  };
}

/**
 * Go away event from Gemini Live.
 * Indicates the server will disconnect soon.
 * Requirement 2.6: Handle goAway message
 */
export interface GeminiGoAwayEvent {
  goAway: {
    /** Time remaining before disconnect (duration format) */
    timeLeft: string;
  };
}

// ============================================================================
// Union Types for Message Handling
// ============================================================================

/**
 * All possible client-to-server message types.
 */
export type GeminiClientMessage =
  | GeminiSetupMessage
  | GeminiAudioInputMessage
  | GeminiToolResponseMessage
  | GeminiClientContentMessage;

/**
 * All possible server-to-client event types.
 */
export type GeminiServerEvent =
  | GeminiServerContentEvent
  | GeminiToolCallEvent
  | GeminiToolCallCancellationEvent
  | GeminiSetupCompleteEvent
  | GeminiGoAwayEvent;

// ============================================================================
// Event Handler Types
// ============================================================================

/**
 * Setup complete event data emitted by GeminiLiveClient.
 */
export interface SetupCompleteEventData {
  /** Gemini session ID */
  sessionId: string;
}

/**
 * Audio output event data emitted by GeminiLiveClient.
 * Requirement 4.4: Include sequence number for ordering
 */
export interface AudioOutputEventData {
  /** MIME type of the audio */
  mimeType: string;
  /** Base64-encoded audio data */
  data: string;
  /** Sequence number for ordering (Requirement 4.4) */
  sequenceNumber?: number;
}

/**
 * Transcription event data emitted by GeminiLiveClient.
 */
export interface TranscriptionEventData {
  /** Transcribed text */
  text: string;
  /** Role: user for input, assistant for output */
  role: 'user' | 'assistant';
  /** Timestamp of the transcription */
  timestamp: Date;
}

/**
 * Tool call event data emitted by GeminiLiveClient.
 */
export interface ToolCallEventData {
  /** Unique call ID */
  id: string;
  /** Function name */
  name: string;
  /** Function arguments */
  args: Record<string, unknown>;
}

/**
 * Go away event data emitted by GeminiLiveClient.
 */
export interface GoAwayEventData {
  /** Time remaining before disconnect */
  timeLeft: string;
}

/**
 * Error event data emitted by GeminiLiveClient.
 */
export interface GeminiErrorEventData {
  /** Error code */
  errorCode: string;
  /** Error message */
  errorMessage: string;
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Session ID if available */
  sessionId?: string;
  /** Timestamp of the error */
  timestamp: string;
  /** Retry after duration in milliseconds (for rate limiting) */
  retryAfter?: number;
}

// ============================================================================
// Session State Types
// ============================================================================

/**
 * Gemini-specific session fields.
 * Used to track Gemini Live connection state within a session.
 */
export interface GeminiSessionFields {
  /** Gemini session ID from setupComplete */
  geminiSessionId?: string;
  /** Voice name being used */
  voiceName: string;
  /** Whether currently connected to Gemini Live */
  isConnected: boolean;
  /** Number of connection attempts */
  connectionAttempts: number;
  /** Last reconnection attempt time */
  lastReconnectTime?: Date;
}

/**
 * Conversation turn for history tracking.
 */
export interface ConversationTurn {
  /** Role: user or assistant */
  role: 'user' | 'assistant';
  /** Text content */
  text: string;
  /** Timestamp of the turn */
  timestamp: Date;
}

// ============================================================================
// Tool Response Types
// ============================================================================

/**
 * Tool execution result.
 */
export interface ToolResult {
  /** Whether execution was successful */
  success: boolean;
  /** Result data if successful */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}

/**
 * Parsed tool call from Gemini event.
 */
export interface ParsedToolCall {
  /** Call ID */
  id: string;
  /** Function name */
  name: string;
  /** Function arguments */
  args: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for GeminiServerContentEvent.
 */
export function isServerContentEvent(
  event: GeminiServerEvent
): event is GeminiServerContentEvent {
  return 'serverContent' in event;
}

/**
 * Type guard for GeminiToolCallEvent.
 */
export function isToolCallEvent(
  event: GeminiServerEvent
): event is GeminiToolCallEvent {
  return 'toolCall' in event;
}

/**
 * Type guard for GeminiToolCallCancellationEvent.
 */
export function isToolCallCancellationEvent(
  event: GeminiServerEvent
): event is GeminiToolCallCancellationEvent {
  return 'toolCallCancellation' in event;
}

/**
 * Type guard for GeminiSetupCompleteEvent.
 */
export function isSetupCompleteEvent(
  event: GeminiServerEvent
): event is GeminiSetupCompleteEvent {
  return 'setupComplete' in event;
}

/**
 * Type guard for GeminiGoAwayEvent.
 */
export function isGoAwayEvent(
  event: GeminiServerEvent
): event is GeminiGoAwayEvent {
  return 'goAway' in event;
}
