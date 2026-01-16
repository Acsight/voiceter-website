/**
 * WebSocket Service Module
 * 
 * Exports WebSocket service and related types for easy importing
 */

export {
  WebSocketService,
  getWebSocketService,
  resetWebSocketService,
  ConnectionState,
} from './WebSocketService';

export type {
  WebSocketEvents,
  WebSocketServiceConfig,
  SessionReadyData,
  SessionCompleteData,
  TranscriptionData,
  AudioChunkData,
  QuestionAdvanceData,
  ErrorData,
} from './WebSocketService';
