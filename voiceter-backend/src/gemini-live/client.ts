/**
 * Gemini Live WebSocket Client
 *
 * This module provides the GeminiLiveClient class for managing WebSocket
 * connections to the Gemini Live API via Vertex AI. It handles connection
 * lifecycle, audio streaming, tool execution, and event processing.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { getLogger } from '../monitoring/logger';
import { GeminiAuthManager, createGeminiAuthManager } from './auth';
import {
  getGeminiConfig,
  buildGeminiWebSocketUrl,
  GeminiLiveConfig,
} from './config';
import {
  buildSetupMessage,
  buildAudioInputMessage,
  buildToolResponseMessage,
} from './message-builder';
import {
  GeminiSessionConfig,
  GeminiServerEvent,
  SetupCompleteEventData,
  AudioOutputEventData,
  TranscriptionEventData,
  ToolCallEventData,
  GoAwayEventData,
  GeminiErrorEventData,
  isServerContentEvent,
  isToolCallEvent,
  isToolCallCancellationEvent,
  isSetupCompleteEvent,
  isGoAwayEvent,
} from './types';
import { ERROR_CODES, RECOVERABLE_ERRORS, ErrorCode } from '../errors/codes';

const logger = getLogger();

/**
 * Error categorization for Gemini Live WebSocket errors.
 *
 * This module provides functions to categorize WebSocket errors into
 * appropriate Gemini error codes and determine recoverability.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7
 */

/**
 * Categorize a WebSocket error into the appropriate Gemini error code.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 *
 * @param error - The error to categorize
 * @param context - Additional context about where the error occurred
 * @returns The appropriate Gemini error code
 */
export function categorizeGeminiError(
  error: Error,
  context?: {
    isAuthError?: boolean;
    isRateLimitError?: boolean;
    isStreamError?: boolean;
    isToolTimeout?: boolean;
  }
): ErrorCode {
  const errorMessage = error.message.toLowerCase();

  // Requirement 11.2: Authentication errors
  if (
    context?.isAuthError ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('auth') ||
    errorMessage.includes('401') ||
    errorMessage.includes('403') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('invalid token') ||
    errorMessage.includes('token expired')
  ) {
    return ERROR_CODES.GEMINI_AUTH_FAILED;
  }

  // Requirement 11.3: Rate limit errors
  if (
    context?.isRateLimitError ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    errorMessage.includes('429') ||
    errorMessage.includes('quota exceeded') ||
    errorMessage.includes('resource exhausted')
  ) {
    return ERROR_CODES.GEMINI_RATE_LIMITED;
  }

  // Requirement 11.4: Streaming errors
  if (
    context?.isStreamError ||
    errorMessage.includes('stream') ||
    errorMessage.includes('eof') ||
    errorMessage.includes('unexpected end') ||
    errorMessage.includes('connection reset') ||
    errorMessage.includes('broken pipe')
  ) {
    return ERROR_CODES.GEMINI_STREAM_ERROR;
  }

  // Requirement 11.5: Tool timeout errors
  if (
    context?.isToolTimeout ||
    errorMessage.includes('tool timeout') ||
    errorMessage.includes('function timeout')
  ) {
    return ERROR_CODES.GEMINI_TOOL_TIMEOUT;
  }

  // Check for invalid message errors
  if (
    errorMessage.includes('invalid message') ||
    errorMessage.includes('parse error') ||
    errorMessage.includes('malformed') ||
    errorMessage.includes('json')
  ) {
    return ERROR_CODES.GEMINI_INVALID_MESSAGE;
  }

  // Check for session not found errors
  if (
    errorMessage.includes('session not found') ||
    errorMessage.includes('session expired') ||
    errorMessage.includes('no session')
  ) {
    return ERROR_CODES.GEMINI_SESSION_NOT_FOUND;
  }

  // Requirement 11.1: Default to connection failed for other errors
  return ERROR_CODES.GEMINI_CONNECTION_FAILED;
}

/**
 * Categorize a WebSocket close code into the appropriate Gemini error code.
 *
 * @param code - The WebSocket close code
 * @param reason - The close reason string
 * @returns The appropriate Gemini error code
 */
export function categorizeWebSocketCloseCode(
  code: number,
  reason: string
): ErrorCode {
  const reasonLower = reason.toLowerCase();

  // Normal closure - not an error
  if (code === 1000) {
    return ERROR_CODES.GEMINI_CONNECTION_FAILED; // Will be handled as non-error
  }

  // Going away (server shutdown, etc.)
  if (code === 1001) {
    return ERROR_CODES.GEMINI_GO_AWAY;
  }

  // Protocol error
  if (code === 1002) {
    return ERROR_CODES.GEMINI_INVALID_MESSAGE;
  }

  // Unsupported data
  if (code === 1003) {
    return ERROR_CODES.GEMINI_INVALID_MESSAGE;
  }

  // Policy violation (often auth-related)
  if (code === 1008) {
    if (
      reasonLower.includes('auth') ||
      reasonLower.includes('unauthorized')
    ) {
      return ERROR_CODES.GEMINI_AUTH_FAILED;
    }
    return ERROR_CODES.GEMINI_CONNECTION_FAILED;
  }

  // Message too big
  if (code === 1009) {
    return ERROR_CODES.GEMINI_STREAM_ERROR;
  }

  // Internal server error
  if (code === 1011) {
    return ERROR_CODES.GEMINI_STREAM_ERROR;
  }

  // Service restart
  if (code === 1012) {
    return ERROR_CODES.GEMINI_GO_AWAY;
  }

  // Try again later (rate limiting)
  if (code === 1013) {
    return ERROR_CODES.GEMINI_RATE_LIMITED;
  }

  // Check reason string for additional context
  if (reasonLower.includes('rate') || reasonLower.includes('limit')) {
    return ERROR_CODES.GEMINI_RATE_LIMITED;
  }

  if (reasonLower.includes('auth') || reasonLower.includes('unauthorized')) {
    return ERROR_CODES.GEMINI_AUTH_FAILED;
  }

  // Default to connection failed
  return ERROR_CODES.GEMINI_CONNECTION_FAILED;
}

/**
 * Determine if an error code represents a recoverable error.
 *
 * Requirement 11.7: Determine recoverability for each error type
 *
 * @param errorCode - The error code to check
 * @returns true if the error is recoverable, false otherwise
 */
export function isRecoverableError(errorCode: ErrorCode): boolean {
  return RECOVERABLE_ERRORS.has(errorCode);
}

/**
 * Create a GeminiErrorEventData object with proper categorization.
 *
 * Requirements: 11.6, 11.8
 *
 * @param error - The error that occurred
 * @param sessionId - The session ID
 * @param context - Additional context for error categorization
 * @returns A properly formatted GeminiErrorEventData object
 */
export function createGeminiErrorEvent(
  error: Error,
  sessionId: string,
  context?: {
    isAuthError?: boolean;
    isRateLimitError?: boolean;
    isStreamError?: boolean;
    isToolTimeout?: boolean;
    retryAfter?: number;
    overrideRecoverable?: boolean;
  }
): GeminiErrorEventData {
  const errorCode = categorizeGeminiError(error, context);
  const recoverable =
    context?.overrideRecoverable !== undefined
      ? context.overrideRecoverable
      : isRecoverableError(errorCode);

  return {
    errorCode,
    errorMessage: error.message,
    recoverable,
    sessionId,
    timestamp: new Date().toISOString(),
    retryAfter: context?.retryAfter,
  };
}

/**
 * Connection state for the GeminiLiveClient.
 * Requirement 2.7: Maintain connection state and emit state change events
 */
export enum ConnectionState {
  /** Initial state, not connected */
  DISCONNECTED = 'disconnected',
  /** Attempting to connect */
  CONNECTING = 'connecting',
  /** WebSocket connected, waiting for setupComplete */
  CONNECTED = 'connected',
  /** Setup complete, ready for audio streaming */
  READY = 'ready',
  /** Reconnecting after connection loss */
  RECONNECTING = 'reconnecting',
  /** Connection closed intentionally */
  CLOSED = 'closed',
  /** Connection failed with error */
  ERROR = 'error',
}

/**
 * Events emitted by GeminiLiveClient.
 */
export interface GeminiLiveClientEvents {
  /** Emitted when setup is complete and session is ready */
  setupComplete: (data: SetupCompleteEventData) => void;
  /** Emitted when audio output is received from Gemini */
  audioOutput: (data: AudioOutputEventData) => void;
  /** Emitted when user input transcription is received */
  inputTranscription: (data: TranscriptionEventData) => void;
  /** Emitted when model output transcription is received */
  outputTranscription: (data: TranscriptionEventData) => void;
  /** Emitted when a tool call is requested */
  toolCall: (data: ToolCallEventData) => void;
  /** Emitted when tool calls are cancelled */
  toolCallCancellation: (ids: string[]) => void;
  /** Emitted when user interrupts the model */
  interrupted: () => void;
  /** Emitted when model's turn is complete */
  turnComplete: () => void;
  /** Emitted when an error occurs */
  error: (error: GeminiErrorEventData) => void;
  /** Emitted when goAway message is received */
  goAway: (data: GoAwayEventData) => void;
  /** Emitted when connection state changes */
  stateChange: (state: ConnectionState) => void;
}

/**
 * GeminiLiveClient manages WebSocket connections to the Gemini Live API.
 *
 * This class handles:
 * - WebSocket connection lifecycle (connect, disconnect, reconnect)
 * - Authentication with Google Cloud via GeminiAuthManager
 * - Session setup and configuration
 * - Audio streaming (input and output)
 * - Tool call handling
 * - Transcription events
 * - Error handling and recovery
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
export class GeminiLiveClient extends EventEmitter {
  /** Current connection state */
  private state: ConnectionState = ConnectionState.DISCONNECTED;

  /** WebSocket connection to Gemini Live */
  private ws: WebSocket | null = null;

  /** Authentication manager for Google Cloud */
  private authManager: GeminiAuthManager;

  /** Gemini Live configuration */
  private config: GeminiLiveConfig;

  /** Session ID for this client */
  private sessionId: string;

  /** Gemini session ID received from setupComplete */
  private geminiSessionId: string | null = null;

  /** Session configuration for setup message */
  private sessionConfig: GeminiSessionConfig | null = null;

  /** Number of connection attempts for reconnection */
  private connectionAttempts: number = 0;

  /** Whether setup is complete and audio can be sent */
  private setupComplete: boolean = false;

  /** Pending audio chunks to send after setup completes */
  private pendingAudioChunks: string[] = [];

  /** Reconnection timer */
  private reconnectTimer: NodeJS.Timeout | null = null;

  /** Whether the client is intentionally closing */
  private isClosing: boolean = false;

  /** Sequence number for audio chunk ordering (Requirement 4.4) */
  private audioSequenceNumber: number = 0;

  /** Sequence number for received audio output ordering (Requirement 4.4) */
  private audioOutputSequenceNumber: number = 0;

  /** Pending audio output buffers to be cleared on interruption (Requirement 6.2) */
  private pendingAudioOutputBuffers: AudioOutputEventData[] = [];

  /**
   * Creates a new GeminiLiveClient instance.
   *
   * @param sessionId - Unique session identifier for logging and tracking
   */
  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    this.config = getGeminiConfig();
    this.authManager = createGeminiAuthManager(sessionId);

    logger.debug('GeminiLiveClient created', {
      sessionId: this.sessionId,
      event: 'client_created',
      model: this.config.model,
      region: this.config.region,
    });
  }

  /**
   * Connect to the Gemini Live API.
   *
   * This method establishes a WebSocket connection to Vertex AI,
   * authenticates using the GeminiAuthManager, and sends the setup message.
   *
   * Requirement 2.1: Connect to Vertex AI endpoint
   * Requirement 2.2: Send setup message before any audio data
   *
   * @param config - Session configuration including voice, system prompt, and tools
   * @returns Promise that resolves when setup is complete
   * @throws Error if connection fails after max retries
   */
  async connect(config: GeminiSessionConfig): Promise<void> {
    if (this.state === ConnectionState.READY) {
      logger.warn('Already connected to Gemini Live', {
        sessionId: this.sessionId,
        event: 'connect_already_connected',
      });
      return;
    }

    this.sessionConfig = config;
    this.isClosing = false;
    this.setupComplete = false;
    this.pendingAudioChunks = [];
    // Reset sequence numbers for new connection (Requirement 4.4)
    this.audioSequenceNumber = 0;
    this.audioOutputSequenceNumber = 0;
    // Clear pending audio output buffers (Requirement 6.2)
    this.pendingAudioOutputBuffers = [];

    logger.info('Connecting to Gemini Live', {
      sessionId: this.sessionId,
      event: 'connect_start',
      voiceName: config.voiceName,
      toolCount: config.tools.length,
    });

    this.setState(ConnectionState.CONNECTING);

    try {
      await this.establishConnection();
    } catch (error) {
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  /**
   * Disconnect from the Gemini Live API.
   *
   * This method gracefully closes the WebSocket connection and cleans up resources.
   *
   * @returns Promise that resolves when disconnection is complete
   */
  async disconnect(): Promise<void> {
    logger.info('Disconnecting from Gemini Live', {
      sessionId: this.sessionId,
      event: 'disconnect_start',
      currentState: this.state,
    });

    this.isClosing = true;
    this.clearReconnectTimer();

    if (this.ws) {
      try {
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close(1000, 'Client disconnecting');
        }
      } catch (error) {
        logger.warn('Error closing WebSocket', {
          sessionId: this.sessionId,
          event: 'disconnect_error',
          error: (error as Error).message,
        });
      }
      this.ws = null;
    }

    this.setState(ConnectionState.CLOSED);
    this.setupComplete = false;
    this.geminiSessionId = null;
    this.pendingAudioChunks = [];
    // Clear pending audio output buffers (Requirement 6.2)
    this.pendingAudioOutputBuffers = [];

    logger.info('Disconnected from Gemini Live', {
      sessionId: this.sessionId,
      event: 'disconnect_complete',
    });
  }

  /**
   * Check if the client is connected and ready for audio streaming.
   *
   * @returns true if connected and setup is complete
   */
  isConnected(): boolean {
    return this.state === ConnectionState.READY && this.setupComplete;
  }

  /**
   * Get the current connection state.
   *
   * @returns Current ConnectionState
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the Gemini session ID.
   *
   * @returns Gemini session ID or null if not connected
   */
  getGeminiSessionId(): string | null {
    return this.geminiSessionId;
  }

  /**
   * Get the number of connection attempts.
   *
   * @returns Number of connection attempts
   */
  getConnectionAttempts(): number {
    return this.connectionAttempts;
  }

  /**
   * Get the count of pending audio output buffers.
   * Useful for monitoring and testing interruption handling.
   *
   * @returns Number of pending audio output buffers
   */
  getPendingAudioOutputBufferCount(): number {
    return this.pendingAudioOutputBuffers.length;
  }

  /**
   * Clear pending audio output buffers.
   * Called internally on interruption, but exposed for testing.
   *
   * Requirement 6.2: Clear pending audio output buffers on interruption
   *
   * @returns Number of buffers that were cleared
   */
  clearPendingAudioOutputBuffers(): number {
    const count = this.pendingAudioOutputBuffers.length;
    this.pendingAudioOutputBuffers = [];
    return count;
  }

  /**
   * Send an audio chunk to Gemini Live.
   *
   * If setup is not complete, the audio chunk is queued and sent after setup.
   * Invalid audio chunks are logged and skipped without terminating the session.
   *
   * Requirement 4.1: Forward audio as realtimeInput with mimeType audio/pcm;rate=16000
   * Requirement 4.4: Maintain audio chunk ordering
   * Requirement 4.5: Handle invalid audio gracefully
   *
   * @param audioData - Base64-encoded PCM audio data
   */
  sendAudioChunk(audioData: string): void {
    // Requirement 4.5: Validate audio format before sending
    if (!this.isValidAudioChunk(audioData)) {
      logger.warn('Invalid audio chunk skipped', {
        sessionId: this.sessionId,
        event: 'audio_invalid_skipped',
        sequenceNumber: this.audioSequenceNumber,
      });
      return;
    }

    // Requirement 4.4: Track sequence number for ordering
    const sequenceNumber = this.audioSequenceNumber++;
    
    // 🎵 LOG: Audio chunk being sent to Gemini for Speech-to-Text
    // Log every 30 chunks (~1 second of audio at 32ms per chunk)
    if (sequenceNumber % 30 === 0) {
      try {
        const decodedLength = Buffer.from(audioData, 'base64').length;
        console.log(`🎵 AUDIO → GEMINI [chunk #${sequenceNumber}] | ${decodedLength} bytes | base64: ${audioData.length} chars`);
      } catch (e) {
        console.log(`🎵 AUDIO → GEMINI [chunk #${sequenceNumber}] | ⚠️ decode error`);
      }
    }

    if (!this.setupComplete) {
      // Queue audio until setup is complete
      this.pendingAudioChunks.push(audioData);
      console.log(`⏳ AUDIO QUEUED [chunk #${sequenceNumber}] - waiting for Gemini setup`);
      logger.debug('Audio chunk queued (setup not complete)', {
        sessionId: this.sessionId,
        event: 'audio_queued',
        queueSize: this.pendingAudioChunks.length,
        sequenceNumber,
      });
      return;
    }

    logger.debug('Sending audio chunk', {
      sessionId: this.sessionId,
      event: 'audio_send',
      sequenceNumber,
    });

    this.sendMessage(buildAudioInputMessage(audioData));
  }

  /**
   * Validate an audio chunk before sending.
   *
   * Requirement 4.5: Validate audio format before sending
   *
   * @param audioData - Base64-encoded audio data to validate
   * @returns true if the audio chunk is valid, false otherwise
   */
  private isValidAudioChunk(audioData: string): boolean {
    // Check if audioData is a non-empty string
    if (!audioData || typeof audioData !== 'string') {
      logger.warn('Audio chunk validation failed: empty or non-string data', {
        sessionId: this.sessionId,
        event: 'audio_validation_failed',
        reason: 'empty_or_non_string',
      });
      return false;
    }

    // Check if it's valid base64 (basic validation)
    // Base64 strings should only contain A-Z, a-z, 0-9, +, /, and = for padding
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(audioData)) {
      logger.warn('Audio chunk validation failed: invalid base64 encoding', {
        sessionId: this.sessionId,
        event: 'audio_validation_failed',
        reason: 'invalid_base64',
      });
      return false;
    }

    // Check minimum length (at least some audio data)
    // An empty base64 string would decode to empty buffer
    if (audioData.length < 4) {
      logger.warn('Audio chunk validation failed: data too short', {
        sessionId: this.sessionId,
        event: 'audio_validation_failed',
        reason: 'data_too_short',
        length: audioData.length,
      });
      return false;
    }

    return true;
  }

  /**
   * Send a tool response to Gemini Live.
   *
   * Requirement 7.3: Send toolResponse with functionResponses
   *
   * @param callId - The call ID from the original tool call
   * @param response - The tool execution result
   */
  sendToolResponse(callId: string, response: unknown): void {
    if (!this.isConnected()) {
      logger.warn('Cannot send tool response - not connected', {
        sessionId: this.sessionId,
        event: 'tool_response_not_connected',
        callId,
      });
      return;
    }

    logger.debug('Sending tool response', {
      sessionId: this.sessionId,
      event: 'tool_response_send',
      callId,
    });

    this.sendMessage(buildToolResponseMessage(callId, response));
  }

  /**
   * Send a text message to Gemini Live to trigger a response.
   * This is useful for starting the conversation or sending context.
   *
   * @param text - The text message to send
   * @param role - The role of the message sender (default: 'user')
   */
  sendText(text: string, role: 'user' | 'model' = 'user'): void {
    if (!this.isConnected()) {
      logger.warn('Cannot send text - not connected', {
        sessionId: this.sessionId,
        event: 'text_send_not_connected',
      });
      return;
    }

    logger.info('Sending text message to trigger AI response', {
      sessionId: this.sessionId,
      event: 'text_send',
      textLength: text.length,
      role,
    });

    const message = {
      clientContent: {
        turns: [
          {
            role,
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.sendMessage(message);
  }

  /**
   * Establish the WebSocket connection to Gemini Live.
   *
   * @returns Promise that resolves when connection is established
   */
  private async establishConnection(): Promise<void> {
    // Get access token for authentication
    const authHeader = await this.authManager.getAuthorizationHeader();

    // Build WebSocket URL
    const wsUrl = buildGeminiWebSocketUrl(this.config);

    logger.debug('Establishing WebSocket connection', {
      sessionId: this.sessionId,
      event: 'ws_connect_start',
      url: wsUrl,
    });

    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket with authorization header
        // Requirement 1.5: Include Access_Token in Authorization header as Bearer token
        this.ws = new WebSocket(wsUrl, {
          headers: {
            Authorization: authHeader,
          },
        });

        // Set up event handlers
        this.ws.on('open', () => this.handleOpen(resolve));
        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('close', (code, reason) =>
          this.handleClose(code, reason.toString())
        );
        this.ws.on('error', (error) => this.handleError(error, reject));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle WebSocket open event.
   *
   * Requirement 2.2: Send setup message on connection open
   */
  private handleOpen(resolve: () => void): void {
    logger.info('WebSocket connection opened', {
      sessionId: this.sessionId,
      event: 'ws_open',
    });

    this.setState(ConnectionState.CONNECTED);
    this.connectionAttempts = 0;

    // Send setup message
    if (this.sessionConfig) {
      const setupMessage = buildSetupMessage(this.sessionConfig);
      
      // Log the setup message details including language code for debugging ASR issues
      /* console.log('🔧 Gemini Live Setup Message:', JSON.stringify({
        voiceName: this.sessionConfig.voiceName,
        languageCode: this.sessionConfig.languageCode,
        speechConfig: setupMessage.setup?.generationConfig?.speechConfig,
        toolCount: this.sessionConfig.tools?.length || 0,
      }, null, 2));
       */
      this.sendMessage(setupMessage);

      logger.debug('Setup message sent', {
        sessionId: this.sessionId,
        event: 'setup_message_sent',
        voiceName: this.sessionConfig.voiceName,
        languageCode: this.sessionConfig.languageCode,
      });
    }

    // Resolve immediately after sending setup
    // The actual "ready" state will be set when setupComplete is received
    resolve();
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      // Explicitly decode as UTF-8 to handle international characters (Turkish, etc.)
      const messageText = Buffer.isBuffer(data) 
        ? data.toString('utf8') 
        : data.toString();
      const message = JSON.parse(messageText) as GeminiServerEvent;
      
      // 🔍 DETAILED LOGGING: Log raw message structure for debugging
      //console.log(`\n📨 [${this.sessionId.substring(0, 8)}] Gemini Message Received:`);
      //console.log(`   Keys: ${Object.keys(message).join(', ')}`);
      
      // Log specific event types
      /* if ((message as any).setupComplete) {
        console.log(`   ✅ setupComplete event`);
      }
      if ((message as any).serverContent) {
        const sc = (message as any).serverContent;
        console.log(`   📦 serverContent event - Keys: ${Object.keys(sc).join(', ')}`);
        
        // Check for transcription fields
        if (sc.inputTranscription) {
          console.log(`   🎤 INPUT TRANSCRIPTION FOUND:`, JSON.stringify(sc.inputTranscription));
        }
        if (sc.outputTranscription) {
          console.log(`   🔊 OUTPUT TRANSCRIPTION FOUND:`, JSON.stringify(sc.outputTranscription));
        }
        if (sc.modelTurn) {
          console.log(`   🤖 modelTurn - parts count: ${sc.modelTurn.parts?.length || 0}`);
        }
        if (sc.interrupted) {
          console.log(`   ⚡ INTERRUPTED`);
        }
        if (sc.turnComplete) {
          console.log(`   ✔️ turnComplete`);
        }
      }
      if ((message as any).toolCall) {
        console.log(`   🔧 toolCall event`);
      } */
      
      this.processServerEvent(message);
    } catch (error) {
      logger.error('Failed to parse WebSocket message', {
        sessionId: this.sessionId,
        event: 'message_parse_error',
        error: (error as Error).message,
      });
      // 🔍 Log raw data on parse error
      //console.error(`❌ [${this.sessionId.substring(0, 8)}] Parse error - Raw data preview:`, 
      //  Buffer.isBuffer(data) ? data.toString('utf8').substring(0, 500) : String(data).substring(0, 500));
    }
  }

  /**
   * Process a server event from Gemini Live.
   */
  private processServerEvent(event: GeminiServerEvent): void {
    // 🔍 DETAILED LOGGING: Track which handler processes the event
    let eventType = 'unknown';
    
    if (isSetupCompleteEvent(event)) {
      eventType = 'setupComplete';
      this.handleSetupComplete(event.setupComplete.sessionId);
    } else if (isServerContentEvent(event)) {
      eventType = 'serverContent';
      this.handleServerContent(event);
    } else if (isToolCallEvent(event)) {
      eventType = 'toolCall';
      this.handleToolCall(event);
    } else if (isToolCallCancellationEvent(event)) {
      eventType = 'toolCallCancellation';
      this.handleToolCallCancellation(event.toolCallCancellation.ids);
    } else if (isGoAwayEvent(event)) {
      eventType = 'goAway';
      this.handleGoAway(event.goAway.timeLeft);
    } 
    
    /* else {
      // 🔍 Log unhandled event types
      console.log(`   ⚠️ UNHANDLED EVENT TYPE - Full message:`, JSON.stringify(event).substring(0, 1000));
    } */
    
    console.log(`   → Processed as: ${eventType}`);
  }

  /**
   * Handle setupComplete event from Gemini Live.
   *
   * Requirement 2.3: Emit session ready event with Gemini session ID
   */
  private handleSetupComplete(geminiSessionId: string): void {
    this.geminiSessionId = geminiSessionId;
    this.setupComplete = true;
    this.setState(ConnectionState.READY);

    logger.info('Gemini Live setup complete', {
      sessionId: this.sessionId,
      event: 'setup_complete',
      geminiSessionId,
    });

    // Emit setupComplete event
    this.emit('setupComplete', { sessionId: geminiSessionId });

    // Send any queued audio chunks
    this.flushPendingAudio();
  }

  /**
   * Handle serverContent event from Gemini Live.
   *
   * Requirement 4.2: Forward audio output to frontend
   * Requirement 4.3: Handle audio output at 24kHz sample rate
   * Requirement 4.4: Maintain audio chunk ordering
   * Requirement 6.1: Emit interruption event when serverContent.interrupted is received
   * Requirement 6.2: Clear pending audio output buffers on interruption
   */
  private handleServerContent(event: { serverContent: any }): void {
    const content = event.serverContent;

    // 🔍 DETAILED LOGGING: Log all serverContent fields
    //console.log(`\n   📋 [${this.sessionId.substring(0, 8)}] handleServerContent - Processing:`);
    //console.log(`      All keys: ${Object.keys(content).join(', ')}`);

    // Handle interruption first (Requirement 6.1, 6.2)
    // This must be processed before audio to ensure buffers are cleared
    if (content.interrupted) {
      //console.log(`      ⚡ Interruption detected!`);
      this.handleInterruption();
      return; // Don't process audio output when interrupted
    }

    // Handle audio output (Requirement 4.2, 4.3, 4.4)
    if (content.modelTurn?.parts) {
      //console.log(`      🎵 modelTurn.parts: ${content.modelTurn.parts.length} parts`);
      for (const part of content.modelTurn.parts) {
        if (part.inlineData) {
          // Requirement 4.4: Track sequence number for ordering
          const sequenceNumber = this.audioOutputSequenceNumber++;

          const audioData: AudioOutputEventData = {
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data,
            sequenceNumber,
          };

          // Add to pending buffers for potential clearing on interruption
          this.pendingAudioOutputBuffers.push(audioData);

          logger.debug('Audio output received', {
            sessionId: this.sessionId,
            event: 'audio_output',
            sequenceNumber,
            mimeType: part.inlineData.mimeType,
          });

          this.emit('audioOutput', audioData);
        } 
        /* else {
          // 🔍 Log non-audio parts
          console.log(`      📝 Non-audio part:`, JSON.stringify(part).substring(0, 200));
        } */
      }
    }

    // Handle input transcription (Requirement 8.1)
    if (content.inputTranscription) {
      if (content.inputTranscription.text) {
        const text = content.inputTranscription.text;
        // 🎤 USER SPEECH-TO-TEXT TRANSCRIPTION
        console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
        console.log(`║  🎤 USER TRANSCRIPTION (Speech-to-Text)                       ║`);
        console.log(`╠══════════════════════════════════════════════════════════════╣`);
        console.log(`║  "${text}"`);
        console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
        logger.info('Input transcription received', {
          sessionId: this.sessionId,
          event: 'input_transcription',
          text: text,
          textLength: text.length,
        });

        this.emit('inputTranscription', {
          text,
          role: 'user',
          timestamp: new Date(),
        });
      }
    } 
    /* else {
      // 🔍 Check if inputTranscription exists but is empty or has different structure
      if ('inputTranscription' in content) {
        console.log(`      ⚠️ inputTranscription exists but no text:`, JSON.stringify(content.inputTranscription));
      }
    } */

    // Handle output transcription (Requirement 8.2)
    if (content.outputTranscription) {
      if (content.outputTranscription.text) {
        const text = content.outputTranscription.text;
        logger.info('Output transcription received', {
          sessionId: this.sessionId,
          event: 'output_transcription',
          text: text,
          textLength: text.length,
        });

        this.emit('outputTranscription', {
          text,
          role: 'assistant',
          timestamp: new Date(),
        });
      }
    } 
    /* else {
      // 🔍 Check if outputTranscription exists but is empty or has different structure
      if ('outputTranscription' in content) {
        console.log(`      ⚠️ outputTranscription exists but no text:`, JSON.stringify(content.outputTranscription));
      }
    } */

    // Handle turn complete - clear pending audio buffers as turn is done
    if (content.turnComplete) {
      //console.log(`      ✔️ Turn complete`);
      logger.debug('Turn complete', {
        sessionId: this.sessionId,
        event: 'turn_complete',
      });
      // Clear pending audio buffers as the turn is complete
      this.pendingAudioOutputBuffers = [];
      this.emit('turnComplete');
    }
    
    // 🔍 Log any other fields we might be missing
    //const knownFields = ['interrupted', 'modelTurn', 'inputTranscription', 'outputTranscription', 'turnComplete'];
    //const unknownFields = Object.keys(content).filter(k => !knownFields.includes(k));
    /* if (unknownFields.length > 0) {
      console.log(`      ❓ Unknown fields in serverContent: ${unknownFields.join(', ')}`);
      unknownFields.forEach(field => {
        console.log(`         ${field}:`, JSON.stringify(content[field]).substring(0, 300));
      });
    } */
  }

  /**
   * Handle interruption event from Gemini Live.
   *
   * Requirement 6.1: Emit interruption event to frontend
   * Requirement 6.2: Clear pending audio output buffers
   */
  private handleInterruption(): void {
    const clearedBufferCount = this.pendingAudioOutputBuffers.length;

    // Requirement 6.2: Clear pending audio output buffers
    this.pendingAudioOutputBuffers = [];

    logger.info('Interruption detected - cleared audio buffers', {
      sessionId: this.sessionId,
      event: 'interrupted',
      clearedBufferCount,
    });

    // Requirement 6.1: Emit interruption event to frontend
    this.emit('interrupted');
  }

  /**
   * Handle toolCall event from Gemini Live.
   *
   * Requirement 7.1, 7.2: Extract and emit tool calls
   */
  private handleToolCall(event: { toolCall: { functionCalls: any[] } }): void {
    for (const call of event.toolCall.functionCalls) {
      logger.debug('Tool call received', {
        sessionId: this.sessionId,
        event: 'tool_call',
        callId: call.id,
        functionName: call.name,
      });

      this.emit('toolCall', {
        id: call.id,
        name: call.name,
        args: call.args,
      });
    }
  }

  /**
   * Handle toolCallCancellation event from Gemini Live.
   *
   * Requirement 6.4: Cancel pending tool executions
   */
  private handleToolCallCancellation(ids: string[]): void {
    logger.debug('Tool call cancellation received', {
      sessionId: this.sessionId,
      event: 'tool_call_cancellation',
      ids,
    });

    this.emit('toolCallCancellation', ids);
  }

  /**
   * Handle goAway event from Gemini Live.
   *
   * Requirement 2.6: Handle goAway message, gracefully close and reconnect
   * Requirement 11.6: Emit error event with proper code
   */
  private handleGoAway(timeLeft: string): void {
    logger.info('GoAway message received', {
      sessionId: this.sessionId,
      event: 'go_away',
      timeLeft,
    });

    // Emit goAway event for informational purposes
    this.emit('goAway', { timeLeft });

    // Also emit an error event with the proper code (recoverable)
    const errorData: GeminiErrorEventData = {
      errorCode: ERROR_CODES.GEMINI_GO_AWAY,
      errorMessage: `Server requested disconnect, time left: ${timeLeft}`,
      recoverable: true,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
    };

    this.emit('error', errorData);

    // Gracefully close and trigger reconnection
    if (!this.isClosing) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket close event.
   *
   * Requirements: 11.1, 11.6, 11.7
   */
  private handleClose(code: number, reason: string): void {
    const errorCode = categorizeWebSocketCloseCode(code, reason);

    logger.info('WebSocket connection closed', {
      sessionId: this.sessionId,
      event: 'ws_close',
      code,
      reason,
      errorCode,
    });

    this.ws = null;
    this.setupComplete = false;

    if (this.isClosing || code === 1000) {
      // Normal closure
      this.setState(ConnectionState.CLOSED);
    } else {
      // Unexpected close, emit error and attempt reconnection
      const recoverable =
        isRecoverableError(errorCode) &&
        this.connectionAttempts < this.config.reconnectMaxRetries;

      const errorData: GeminiErrorEventData = {
        errorCode,
        errorMessage: reason || `WebSocket closed with code ${code}`,
        recoverable,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
      };

      // Log the error with full context (Requirement 11.8)
      logger.error('WebSocket closed unexpectedly', {
        sessionId: this.sessionId,
        event: 'ws_close_unexpected',
        errorCode,
        code,
        reason,
        recoverable,
        connectionAttempts: this.connectionAttempts,
      });

      this.emit('error', errorData);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error event.
   *
   * Requirements: 11.1, 11.6, 11.8
   */
  private handleError(error: Error, reject?: (error: Error) => void): void {
    // Categorize the error
    const errorCode = categorizeGeminiError(error);

    logger.error('WebSocket error', {
      sessionId: this.sessionId,
      event: 'ws_error',
      errorCode,
      error: error.message,
      stack: error.stack,
    });

    if (reject) {
      reject(error);
    }

    this.handleConnectionError(error);
  }

  /**
   * Handle connection errors.
   *
   * Requirements: 11.1, 11.6, 11.7, 11.8
   */
  private handleConnectionError(error: Error): void {
    // Categorize the error and determine recoverability
    const canRetry = this.connectionAttempts < this.config.reconnectMaxRetries;
    const errorData = createGeminiErrorEvent(error, this.sessionId, {
      overrideRecoverable: canRetry,
    });

    // Log the error with full context (Requirement 11.8)
    logger.error('Gemini connection error', {
      sessionId: this.sessionId,
      event: 'connection_error',
      errorCode: errorData.errorCode,
      errorMessage: errorData.errorMessage,
      recoverable: errorData.recoverable,
      connectionAttempts: this.connectionAttempts,
      stack: error.stack,
    });

    this.emit('error', errorData);

    if (!this.isClosing && errorData.recoverable) {
      this.scheduleReconnect();
    } else {
      this.setState(ConnectionState.ERROR);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   *
   * Requirement 2.4: Exponential backoff (1s, 2s, 4s delays)
   * Requirement 2.5: Limit to maxRetries (default 3)
   * Requirements: 11.1, 11.6
   */
  private scheduleReconnect(): void {
    if (this.isClosing) {
      return;
    }

    this.connectionAttempts++;

    if (this.connectionAttempts > this.config.reconnectMaxRetries) {
      logger.error('Max reconnection attempts exceeded', {
        sessionId: this.sessionId,
        event: 'reconnect_max_exceeded',
        attempts: this.connectionAttempts,
        maxRetries: this.config.reconnectMaxRetries,
      });

      const errorData: GeminiErrorEventData = {
        errorCode: ERROR_CODES.GEMINI_RECONNECTION_FAILED,
        errorMessage: `Connection failed after ${this.config.reconnectMaxRetries} attempts`,
        recoverable: false,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
      };

      this.emit('error', errorData);
      this.setState(ConnectionState.ERROR);
      return;
    }

    // Calculate delay with exponential backoff
    const delay =
      this.config.reconnectBaseDelayMs *
      Math.pow(2, this.connectionAttempts - 1);

    logger.info('Scheduling reconnection', {
      sessionId: this.sessionId,
      event: 'reconnect_scheduled',
      attempt: this.connectionAttempts,
      delayMs: delay,
    });

    this.setState(ConnectionState.RECONNECTING);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.establishConnection();
      } catch (error) {
        // Error handling is done in handleError
      }
    }, delay);
  }

  /**
   * Clear the reconnection timer.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Flush pending audio chunks after setup completes.
   */
  private flushPendingAudio(): void {
    if (this.pendingAudioChunks.length > 0) {
      logger.debug('Flushing pending audio chunks', {
        sessionId: this.sessionId,
        event: 'audio_flush',
        count: this.pendingAudioChunks.length,
      });

      for (const chunk of this.pendingAudioChunks) {
        this.sendMessage(buildAudioInputMessage(chunk));
      }

      this.pendingAudioChunks = [];
    }
  }

  /**
   * Send a message through the WebSocket.
   */
  private sendMessage(message: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send message - WebSocket not open', {
        sessionId: this.sessionId,
        event: 'send_not_connected',
        readyState: this.ws?.readyState,
      });
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send message', {
        sessionId: this.sessionId,
        event: 'send_error',
        error: (error as Error).message,
      });
    }
  }

  /**
   * Set the connection state and emit state change event.
   *
   * Requirement 2.7: Emit state change events
   */
  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;

      logger.debug('Connection state changed', {
        sessionId: this.sessionId,
        event: 'state_change',
        oldState,
        newState,
      });

      this.emit('stateChange', newState);
    }
  }
}

/**
 * Create a new GeminiLiveClient instance.
 *
 * @param sessionId - Unique session identifier
 * @returns A new GeminiLiveClient instance
 */
export function createGeminiLiveClient(sessionId: string): GeminiLiveClient {
  return new GeminiLiveClient(sessionId);
}
