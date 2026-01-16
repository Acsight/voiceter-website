/**
 * Type definitions for Amazon Bedrock API integration
 * 
 * Note: Direct WebSocket mode is now the only supported architecture.
 * The proxy mode (BiDirectional stream client) has been removed.
 */

/**
 * Inference configuration for Nova Sonic model
 */
export interface InferenceConfig {
  maxTokens: number;
  topP: number;
  temperature: number;
}

/**
 * Audio input configuration
 */
export interface AudioInputConfiguration {
  audioType: 'SPEECH';
  encoding: 'base64';
  mediaType: 'audio/lpcm';
  sampleRateHertz: 24000;
  sampleSizeBits: 16;
  channelCount: 1;
}

/**
 * Voice response timing options
 */
export type VoiceResponseTiming = 'fast' | 'medium' | 'slow';

/**
 * Audio output configuration
 */
export interface AudioOutputConfiguration {
  audioType: 'SPEECH';
  encoding: 'base64';
  mediaType: 'audio/lpcm';
  sampleRateHertz: 24000;
  sampleSizeBits: 16;
  channelCount: 1;
  voiceId: string;
  voiceResponseTiming?: VoiceResponseTiming;
}

/**
 * Complete audio configuration
 */
export interface AudioConfiguration {
  input?: AudioInputConfiguration;
  output?: AudioOutputConfiguration;
  // Backward compatibility properties
  sampleRate?: number;
  sampleSizeBits?: number;
  channelCount?: number;
  voiceId?: string;
}

/**
 * Tool specification for Nova Sonic
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Stream configuration for Bedrock streaming (used by converse-streaming)
 */
export interface StreamConfig {
  sessionId: string;
  modelId: string;
  voiceId: string;
  systemPrompt: string;
  tools: ToolSpec[];
  inferenceConfig: InferenceConfig;
}

/**
 * Bedrock stream interface (used by converse-streaming)
 */
export interface BedrockStream {
  sessionId: string;
  promptName: string;
  contentName: string;
  isActive: boolean;
  status?: 'ready' | 'active' | 'closing' | 'closed' | 'error';
}

/**
 * Nova event base type
 */
export interface NovaEvent {
  type: string;
  [key: string]: any;
}

// ============================================================================
// Nova Sonic Events (Outgoing to Bedrock)
// These types are used by the frontend for direct WebSocket communication
// The payload structure does NOT have an outer "event" wrapper - the event type
// is specified in the Event Stream headers (:event-type)
// ============================================================================

/**
 * Session start event payload
 */
export interface SessionStartEvent {
  sessionStart: {
    inferenceConfiguration: InferenceConfig;
  };
}

/**
 * Prompt start event payload
 */
export interface PromptStartEvent {
  promptStart: {
    promptName: string;
    textOutputConfiguration: { mediaType: 'text/plain' };
    audioOutputConfiguration: AudioOutputConfiguration;
    toolUseOutputConfiguration: { mediaType: 'application/json' };
    toolConfiguration?: { tools: ToolSpec[] };
  };
}

/**
 * Content start event payload
 */
export interface ContentStartEvent {
  contentStart: {
    promptName: string;
    contentName: string;
    type: 'TEXT' | 'AUDIO' | 'TOOL';
    interactive: boolean;
    role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL';
    textInputConfiguration?: { mediaType: 'text/plain' };
    audioInputConfiguration?: AudioInputConfiguration;
    toolResultInputConfiguration?: {
      toolUseId: string;
      type: 'TEXT';
      textInputConfiguration: { mediaType: 'text/plain' };
    };
  };
}

/**
 * Audio input event payload
 */
export interface AudioInputEvent {
  audioInput: {
    promptName: string;
    contentName: string;
    content: string; // base64
  };
}

/**
 * Text input event payload
 */
export interface TextInputEvent {
  textInput: {
    promptName: string;
    contentName: string;
    content: string;
  };
}

/**
 * Tool result event payload
 */
export interface ToolResultEvent {
  toolResult: {
    promptName: string;
    contentName: string;
    content: string;
  };
}

/**
 * Content end event payload
 */
export interface ContentEndEvent {
  contentEnd: {
    promptName: string;
    contentName: string;
  };
}

/**
 * Prompt end event payload
 */
export interface PromptEndEvent {
  promptEnd: {
    promptName: string;
  };
}

/**
 * Session end event payload
 */
export interface SessionEndEvent {
  sessionEnd: Record<string, never>;
}

// ============================================================================
// Nova Sonic Events (Incoming from Bedrock)
// ============================================================================

/**
 * Text output event from Nova Sonic
 */
export interface TextOutputEvent {
  role: 'USER' | 'ASSISTANT';
  content: string;
  text: string; // Alias for content
  final: boolean;
  isFinal: boolean; // Alias for final
  interrupted?: boolean;
}

/**
 * Audio output event from Nova Sonic
 */
export interface AudioOutputEvent {
  content: string; // base64
  audioData: string; // Alias for content
}

/**
 * Tool use event from Nova Sonic
 */
export interface ToolUseEvent {
  toolUseId: string;
  toolName: string;
  content: string; // JSON string with parameters
  parameters: Record<string, any>; // Parsed parameters
}

/**
 * Completion end event from Nova Sonic
 */
export interface CompletionEndEvent {
  timestamp?: string;
}

/**
 * Union type for all outgoing events
 */
export type OutgoingEvent =
  | SessionStartEvent
  | PromptStartEvent
  | ContentStartEvent
  | AudioInputEvent
  | TextInputEvent
  | ToolResultEvent
  | ContentEndEvent
  | PromptEndEvent
  | SessionEndEvent;

/**
 * Union type for all incoming events
 */
export type IncomingEvent =
  | TextOutputEvent
  | AudioOutputEvent
  | ToolUseEvent
  | CompletionEndEvent;
