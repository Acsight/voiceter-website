/**
 * WebSocket Message Validation
 * 
 * Validates incoming WebSocket messages for schema compliance,
 * audio chunk size/format, and session ID validity.
 * 
 * Requirements: 14.1, 14.2, 14.3
 */

import type {
  InitializeConnectionData,
  SystemPromptData,
  AudioInputData,
  StopAudioData,
  MessageValidationResult,
} from './types';
import { ERROR_CODES } from '../errors/codes';
import { SessionManager } from '../session/manager';

/**
 * Maximum audio chunk size (1MB as per requirement 14.2)
 */
const MAX_AUDIO_CHUNK_SIZE = 1024 * 1024; // 1MB

/**
 * Maximum message size (10MB)
 */
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate a WebSocket message against expected schema
 * 
 * @param eventName - The event name
 * @param data - The message data
 * @returns Validation result with error details if invalid
 * 
 * Requirement 14.1: Validate message format against expected schema
 */
export function validateMessage(
  eventName: string,
  data: any
): MessageValidationResult {
  // Validate based on event type
  switch (eventName) {
    // New event names (current protocol)
    case 'session:start':
      return validateSessionStart(data);
    
    case 'session:end':
      return validateSessionEnd(data);
    
    case 'audio:chunk':
      if (data === undefined || data === null) {
        return {
          valid: false,
          error: 'Message data is required',
          errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
        };
      }
      return validateAudioChunkEvent(data);
    
    case 'config:update':
    case 'questionnaire:select':
    case 'text:message':
    case 'user:speaking':
      // These events have optional or flexible data
      return { valid: true };
    
    case 'transcript:update':
      return validateTranscriptUpdate(data);
    
    // Legacy event names (backward compatibility)
    case 'initializeConnection':
      // Check if data exists for events that require it
      if (data === undefined || data === null) {
        return {
          valid: false,
          error: 'Message data is required',
          errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
        };
      }
      return validateInitializeConnection(data);
    
    case 'systemPrompt':
      if (data === undefined || data === null) {
        return {
          valid: false,
          error: 'Message data is required',
          errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
        };
      }
      return validateSystemPrompt(data);
    
    case 'audioInput':
      if (data === undefined || data === null) {
        return {
          valid: false,
          error: 'Message data is required',
          errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
        };
      }
      return validateAudioInput(data);
    
    case 'stopAudio':
      // stopAudio data is optional
      return validateStopAudio(data);
    
    case 'promptStart':
    case 'audioStart':
      // These events don't require data validation
      return { valid: true };
    
    default:
      return {
        valid: false,
        error: `Unknown event type: ${eventName}`,
        errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
      };
  }
}

/**
 * Validate session:start event data
 */
function validateSessionStart(data: any): MessageValidationResult {
  if (data === undefined || data === null) {
    return {
      valid: false,
      error: 'Message data is required',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'session:start data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate questionnaireId (required)
  if (!data.questionnaireId || typeof data.questionnaireId !== 'string') {
    return {
      valid: false,
      error: 'questionnaireId is required and must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate voiceId (optional)
  if (data.voiceId !== undefined && typeof data.voiceId !== 'string') {
    return {
      valid: false,
      error: 'voiceId must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  return { valid: true };
}

/**
 * Validate session:end event data
 */
function validateSessionEnd(data: any): MessageValidationResult {
  // Data is optional for session:end
  if (data === undefined || data === null) {
    return { valid: true };
  }

  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'session:end data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate reason (optional)
  if (data.reason !== undefined && typeof data.reason !== 'string') {
    return {
      valid: false,
      error: 'reason must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  return { valid: true };
}

/**
 * Validate audio:chunk event data
 */
function validateAudioChunkEvent(data: any): MessageValidationResult {
  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'audio:chunk data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate audioData (required)
  if (!data.audioData || typeof data.audioData !== 'string') {
    return {
      valid: false,
      error: 'audioData is required and must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate audio chunk (size and format)
  return validateAudioChunk(data.audioData);
}

/**
 * Validate initializeConnection event data
 */
function validateInitializeConnection(
  data: any
): MessageValidationResult {
  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'initializeConnection data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  const typedData = data as Partial<InitializeConnectionData>;

  // Validate questionnaireId (required)
  if (!typedData.questionnaireId || typeof typedData.questionnaireId !== 'string') {
    return {
      valid: false,
      error: 'questionnaireId is required and must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  if (typedData.questionnaireId.trim().length === 0) {
    return {
      valid: false,
      error: 'questionnaireId cannot be empty',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate voiceId (optional)
  if (typedData.voiceId !== undefined) {
    if (typeof typedData.voiceId !== 'string') {
      return {
        valid: false,
        error: 'voiceId must be a string',
        errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
      };
    }

    // Validate against allowed Nova 2 Sonic voices (requirement 12.1)
    const allowedVoices = [
      // English (US)
      'matthew', 'tiffany',
      // English (GB)
      'amy',
      // English (Indian)
      'kajal', 'nikhil',
      // English (Australian)
      'olivia', 'liam',
      // Spanish
      'lupe', 'carlos',
      // French
      'ambre', 'florian',
      // German
      'greta', 'lennart',
      // Italian
      'beatrice', 'lorenzo',
      // Portuguese (Brazilian)
      'vitoria', 'thiago',
      // Hindi
      'aditi', 'arjun',
    ];
    if (!allowedVoices.includes(typedData.voiceId)) {
      return {
        valid: false,
        error: `Invalid voiceId. Allowed values: ${allowedVoices.join(', ')}`,
        errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate systemPrompt event data
 */
function validateSystemPrompt(
  data: any
): MessageValidationResult {
  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'systemPrompt data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  const typedData = data as Partial<SystemPromptData>;

  // Validate promptContent (required)
  if (!typedData.promptContent || typeof typedData.promptContent !== 'string') {
    return {
      valid: false,
      error: 'promptContent is required and must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  if (typedData.promptContent.trim().length === 0) {
    return {
      valid: false,
      error: 'promptContent cannot be empty',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Check message size
  const messageSize = Buffer.byteLength(typedData.promptContent, 'utf8');
  if (messageSize > MAX_MESSAGE_SIZE) {
    return {
      valid: false,
      error: `promptContent exceeds maximum size of ${MAX_MESSAGE_SIZE} bytes`,
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  return { valid: true };
}

/**
 * Validate audioInput event data
 */
function validateAudioInput(
  data: any
): MessageValidationResult {
  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'audioInput data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  const typedData = data as Partial<AudioInputData>;

  // Validate audioData (required)
  if (!typedData.audioData || typeof typedData.audioData !== 'string') {
    return {
      valid: false,
      error: 'audioData is required and must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate audio chunk (size and format)
  return validateAudioChunk(typedData.audioData);
}

/**
 * Validate stopAudio event data
 */
function validateStopAudio(
  data: any
): MessageValidationResult {
  // stopAudio data is optional
  if (data === undefined || data === null) {
    return { valid: true };
  }

  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'stopAudio data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  const typedData = data as Partial<StopAudioData>;

  // Validate reason (optional)
  if (typedData.reason !== undefined && typeof typedData.reason !== 'string') {
    return {
      valid: false,
      error: 'reason must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  return { valid: true };
}

/**
 * Validate audio chunk size and format
 * 
 * @param audioData - Base64-encoded audio data
 * @returns Validation result with error details if invalid
 * 
 * Requirement 14.2: Validate audio chunk size does not exceed 1MB
 * Requirement 3.1: Accept base64-encoded PCM audio at 16kHz, 16-bit, mono
 */
export function validateAudioChunk(
  audioData: string
): MessageValidationResult {
  // Debug logging
  const dataType = typeof audioData;
  const dataLength = audioData?.length ?? 0;
  const first20Chars = typeof audioData === 'string' ? audioData.substring(0, 20) : 'N/A';
  
  // Validate base64 format
  if (!isValidBase64(audioData)) {
    console.warn('[validateAudioChunk] Invalid base64:', {
      type: dataType,
      length: dataLength,
      first20Chars,
      lengthMod4: dataLength % 4,
    });
    return {
      valid: false,
      error: 'audioData must be valid base64-encoded string',
      errorCode: ERROR_CODES.AUDIO_FORMAT_INVALID,
    };
  }

  // Calculate decoded size (base64 encoding increases size by ~33%)
  const decodedSize = Math.floor((audioData.length * 3) / 4);

  // Validate size (requirement 14.2: max 1MB)
  if (decodedSize > MAX_AUDIO_CHUNK_SIZE) {
    return {
      valid: false,
      error: `Audio chunk exceeds maximum size of ${MAX_AUDIO_CHUNK_SIZE} bytes (decoded size: ${decodedSize} bytes)`,
      errorCode: ERROR_CODES.AUDIO_FORMAT_INVALID,
    };
  }

  // Note: We cannot validate the actual audio format (16kHz, 16-bit, mono)
  // without decoding and analyzing the audio data, which would be too expensive.
  // Format validation is handled by the audio processor and Bedrock API.

  return { valid: true };
}

/**
 * Validate session ID exists and is active
 * 
 * @param sessionId - Session identifier
 * @param sessionManager - SessionManager instance
 * @returns Validation result with error details if invalid
 * 
 * Requirement 14.3: Validate sessionId exists and is active
 */
export async function validateSessionId(
  sessionId: string | undefined,
  sessionManager: SessionManager
): Promise<MessageValidationResult> {
  // Check if sessionId is provided
  if (!sessionId || typeof sessionId !== 'string') {
    return {
      valid: false,
      error: 'sessionId is required',
      errorCode: ERROR_CODES.SESSION_INVALID,
    };
  }

  if (sessionId.trim().length === 0) {
    return {
      valid: false,
      error: 'sessionId cannot be empty',
      errorCode: ERROR_CODES.SESSION_INVALID,
    };
  }

  // Check if session exists
  const session = await sessionManager.getSession(sessionId);
  if (!session) {
    return {
      valid: false,
      error: 'Session not found',
      errorCode: ERROR_CODES.SESSION_NOT_FOUND,
    };
  }

  // Check if session is active
  if (session.status !== 'active') {
    return {
      valid: false,
      error: `Session is not active (status: ${session.status})`,
      errorCode: ERROR_CODES.SESSION_EXPIRED,
    };
  }

  return { valid: true };
}

/**
 * Validate transcript:update event data
 */
function validateTranscriptUpdate(data: any): MessageValidationResult {
  if (data === undefined || data === null) {
    return {
      valid: false,
      error: 'Message data is required',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  if (typeof data !== 'object') {
    return {
      valid: false,
      error: 'transcript:update data must be an object',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate transcript (required)
  if (!data.transcript || typeof data.transcript !== 'string') {
    return {
      valid: false,
      error: 'transcript is required and must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  // Validate questionnaireId (required)
  if (!data.questionnaireId || typeof data.questionnaireId !== 'string') {
    return {
      valid: false,
      error: 'questionnaireId is required and must be a string',
      errorCode: ERROR_CODES.WS_MESSAGE_INVALID,
    };
  }

  return { valid: true };
}

/**
 * Check if a string is valid base64
 * 
 * @param str - String to validate
 * @returns true if valid base64, false otherwise
 */
function isValidBase64(str: string): boolean {
  if (typeof str !== 'string' || str.length === 0) {
    return false;
  }

  // Base64 regex pattern
  // Allows standard base64 characters (A-Z, a-z, 0-9, +, /) and padding (=)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  
  // Check if string matches base64 pattern
  if (!base64Regex.test(str)) {
    return false;
  }

  // Check if length is valid (must be multiple of 4)
  if (str.length % 4 !== 0) {
    return false;
  }

  return true;
}
