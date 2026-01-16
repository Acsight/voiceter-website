/**
 * WebSocket Event Type Definitions
 * 
 * This file defines all WebSocket event schemas for client-to-server
 * and server-to-client communication.
 */

// ============================================================================
// Base Event Structure
// ============================================================================

export interface BaseEvent {
  event: string;
  sessionId: string;
  timestamp: string; // ISO 8601 format
  data: any;
}

// ============================================================================
// Client to Server Events
// ============================================================================

export interface SessionStartEvent extends BaseEvent {
  event: 'session:start';
  data: {
    questionnaireId: string;
    voiceId: string;
    userId?: string;
  };
}

export interface SessionEndEvent extends BaseEvent {
  event: 'session:end';
  data: {
    reason: 'user_ended' | 'completed' | 'timeout' | 'error';
  };
}

export interface AudioChunkEvent extends BaseEvent {
  event: 'audio:chunk';
  data: {
    audioData: string; // base64 encoded PCM
    sequenceNumber: number;
  };
}

export interface ConfigUpdateEvent extends BaseEvent {
  event: 'config:update';
  data: {
    voiceId?: string;
    audioConfig?: {
      sampleRate?: number;
      sampleSizeBits?: number;
      channelCount?: number;
    };
  };
}

export interface QuestionnaireSelectEvent extends BaseEvent {
  event: 'questionnaire:select';
  data: {
    questionnaireId: string;
  };
}

export interface MockResponseEvent extends BaseEvent {
  event: 'mock:response';
  data: {
    questionId: string;
    response: string;
    responseType?: string;
  };
}

export interface TextMessageEvent extends BaseEvent {
  event: 'text:message';
  data: {
    text: string;
  };
}

export interface UserSpeakingEvent extends BaseEvent {
  event: 'user:speaking';
  data: Record<string, never>; // Empty object
}

export interface TranscriptUpdateEvent extends BaseEvent {
  event: 'transcript:update';
  data: {
    transcript: string; // Full conversation transcript
    questionnaireId: string;
  };
}

export type ClientToServerEvent =
  | SessionStartEvent
  | SessionEndEvent
  | AudioChunkEvent
  | ConfigUpdateEvent
  | QuestionnaireSelectEvent
  | MockResponseEvent
  | TextMessageEvent
  | UserSpeakingEvent
  | TranscriptUpdateEvent;

// ============================================================================
// Server to Client Events
// ============================================================================

export interface SessionReadyEvent extends BaseEvent {
  event: 'session:ready';
  data: {
    questionnaireName: string;
    estimatedDuration: number;
    firstQuestion: {
      questionId: string;
      questionNumber: number;
      questionType: string;
      questionText: string;
      options?: Array<{
        optionId: string;
        optionText: string;
        optionValue: string;
      }>;
    };
  };
}

export interface TranscriptionUserEvent extends BaseEvent {
  event: 'transcription:user';
  data: {
    transcript: string;
    isFinal: boolean;
  };
}

export interface TranscriptionAssistantEvent extends BaseEvent {
  event: 'transcription:assistant';
  data: {
    transcript: string;
    isFinal: boolean;
  };
}

export interface AudioChunkResponseEvent extends BaseEvent {
  event: 'audio:chunk';
  data: {
    audioData: string; // base64 encoded PCM
    sequenceNumber: number;
  };
}

export interface QuestionAdvanceEvent extends BaseEvent {
  event: 'question:advance';
  data: {
    question: {
      questionId: string;
      questionNumber: number;
      questionType: string;
      questionText: string;
      isRequired: boolean;
      options?: Array<{
        optionId: string;
        optionText: string;
        optionValue: string;
      }>;
      configuration?: any;
      agentNotes?: string;
    };
    progress: {
      current: number;
      total: number;
      percentage: number;
    };
  };
}

export interface SessionCompleteEvent extends BaseEvent {
  event: 'session:complete';
  data: {
    completionStatus: 'completed' | 'terminated';
    totalQuestions: number;
    answeredQuestions: number;
    duration: number; // in seconds
  };
}

export interface BargeInEvent extends BaseEvent {
  event: 'barge-in';
  data: {
    timestamp: string;
    message: string;
  };
}

export interface SurveyAnswersEvent extends BaseEvent {
  event: 'survey:answers';
  data: {
    answers: Array<{
      questionId: string;
      question: string;
      answer: string;
      confidence?: number;
    }>;
    source: 'prompt_management';
  };
}

export interface ErrorEvent extends BaseEvent {
  event: 'error';
  data: {
    errorCode: string;
    errorMessage: string;
    recoverable: boolean;
  };
}

export type ServerToClientEvent =
  | SessionReadyEvent
  | TranscriptionUserEvent
  | TranscriptionAssistantEvent
  | AudioChunkResponseEvent
  | QuestionAdvanceEvent
  | SessionCompleteEvent
  | BargeInEvent
  | SurveyAnswersEvent
  | ErrorEvent;

// ============================================================================
// Event Type Guards
// ============================================================================

export function isSessionStartEvent(event: any): event is SessionStartEvent {
  return (
    event?.event === 'session:start' &&
    typeof event?.sessionId === 'string' &&
    typeof event?.timestamp === 'string' &&
    typeof event?.data?.questionnaireId === 'string' &&
    typeof event?.data?.voiceId === 'string'
  );
}

export function isSessionEndEvent(event: any): event is SessionEndEvent {
  return (
    event?.event === 'session:end' &&
    typeof event?.sessionId === 'string' &&
    typeof event?.timestamp === 'string' &&
    typeof event?.data?.reason === 'string' &&
    ['user_ended', 'completed', 'timeout', 'error'].includes(event?.data?.reason)
  );
}

export function isAudioChunkEvent(event: any): event is AudioChunkEvent {
  return (
    event?.event === 'audio:chunk' &&
    typeof event?.sessionId === 'string' &&
    typeof event?.timestamp === 'string' &&
    typeof event?.data?.audioData === 'string' &&
    typeof event?.data?.sequenceNumber === 'number'
  );
}

export function isConfigUpdateEvent(event: any): event is ConfigUpdateEvent {
  return (
    event?.event === 'config:update' &&
    typeof event?.sessionId === 'string' &&
    typeof event?.timestamp === 'string' &&
    typeof event?.data === 'object'
  );
}

export function isQuestionnaireSelectEvent(event: any): event is QuestionnaireSelectEvent {
  return (
    event?.event === 'questionnaire:select' &&
    typeof event?.sessionId === 'string' &&
    typeof event?.timestamp === 'string' &&
    typeof event?.data?.questionnaireId === 'string'
  );
}

export function isMockResponseEvent(event: any): event is MockResponseEvent {
  return (
    event?.event === 'mock:response' &&
    typeof event?.sessionId === 'string' &&
    typeof event?.timestamp === 'string' &&
    typeof event?.data?.questionId === 'string' &&
    typeof event?.data?.response === 'string'
  );
}

export function isClientToServerEvent(event: any): event is ClientToServerEvent {
  return (
    isSessionStartEvent(event) ||
    isSessionEndEvent(event) ||
    isAudioChunkEvent(event) ||
    isConfigUpdateEvent(event) ||
    isQuestionnaireSelectEvent(event) ||
    isMockResponseEvent(event)
  );
}
