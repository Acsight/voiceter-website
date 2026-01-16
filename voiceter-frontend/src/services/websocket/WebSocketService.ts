/**
 * WebSocket Service
 * 
 * Manages WebSocket connection lifecycle, event handling, and reconnection logic
 * for real-time communication with the Voiceter backend.
 */

import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '@/config/environment';

/**
 * Connection states for the WebSocket
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * WebSocket event types
 */
export interface WebSocketEvents {
  // Connection events
  'connection:state': (state: ConnectionState) => void;
  'connection:error': (error: Error) => void;
  'connection:reconnecting': (attempt: number, maxAttempts: number) => void;
  'connection:reconnect-failed': () => void;
  
  // Session events
  'session:ready': (data: SessionReadyData) => void;
  'session:complete': (data: SessionCompleteData) => void;
  
  // Transcription events
  'transcription:user': (data: TranscriptionData) => void;
  'transcription:assistant': (data: TranscriptionData) => void;
  
  // Audio events
  'audio:chunk': (data: AudioChunkData) => void;
  
  // Turn events (for echo cancellation)
  'turn:start': (data: TurnEventData) => void;
  'turn:complete': (data: TurnEventData) => void;
  
  // Interruption events (barge-in)
  'interruption': (data: any) => void;
  
  // Question events
  'question:advance': (data: QuestionAdvanceData) => void;
  
  // Response events
  'response:recorded': (data: RecordedResponseData) => void;
  
  // NLP analysis events
  'nlp:analysis': (data: NLPAnalysisData) => void;
  
  // Survey answers events (from Prompt Management)
  'survey:answers': (data: SurveyAnswersData) => void;
  
  // Guardrail events
  'guardrail:blocked': (data: GuardrailBlockedData) => void;
  
  // Error events
  'error': (data: ErrorData) => void;
}

/**
 * Event data interfaces
 */
export interface SessionReadyData {
  questionnaireName: string;
  estimatedDuration: number;
  firstQuestion: any;
}

export interface SessionCompleteData {
  completionStatus: 'completed' | 'terminated';
  totalQuestions: number;
  answeredQuestions: number;
  duration: number;
}

export interface TranscriptionData {
  transcript: string;
  isFinal: boolean;
}

export interface AudioChunkData {
  audioData: string; // base64 encoded PCM
  sequenceNumber: number;
}

export interface TurnEventData {
  role: 'user' | 'assistant';
}

export interface QuestionAdvanceData {
  question: any;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface ErrorData {
  errorCode: string;
  errorMessage: string;
  recoverable: boolean;
}

export interface GuardrailBlockedData {
  source: 'user' | 'assistant';
  reason?: string;
  message?: string;
}

export interface RecordedResponseData {
  qid: string;
  question: string;
  answer: string;
  nlpAnalysis?: {
    overall_sentiment_score: number;
    analyzed_topics: Array<{
      topic: string;
      sentiment: string;
      topic_sentiment_score: number;
      intent: string;
      emotion: string;
      keywords: string[];
      key_phrases: Array<{
        phrase: string;
        start_char: number;
        end_char: number;
      }>;
    }>;
    original_text?: string;
    questionId?: string;
    questionnaireId?: string;
  };
}

/**
 * NLP Analysis data from Bedrock Prompt Management
 */
export interface NLPAnalysisData {
  questionId: string;
  analysis: {
    overall_sentiment_score: number;
    analyzed_topics: Array<{
      topic: string;
      sentiment: string;
      topic_sentiment_score: number;
      intent: string;
      emotion: string;
      keywords: string[];
      key_phrases: Array<{
        phrase: string;
        start_char: number;
        end_char: number;
      }>;
    }>;
    original_text?: string;
    questionId?: string;
    questionnaireId?: string;
  };
}

/**
 * Survey answers extracted from Prompt Management
 */
export interface SurveyAnswersData {
  answers: Array<{
    questionId: string;
    question: string;
    answer: string;
    confidence?: number;
  }>;
  source: 'prompt_management';
}

/**
 * WebSocket Service Configuration
 */
export interface WebSocketServiceConfig {
  backendUrl?: string;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

/**
 * WebSocket Service Class
 * 
 * Provides connection management, event handling, and automatic reconnection
 * for WebSocket communication with the backend.
 */
export class WebSocketService {
  private socket: Socket | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private backendUrl: string;
  private eventListeners: Map<string, Set<Function>> = new Map();
  private sessionId: string | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private preservedSessionState: any = null;

  constructor(config: WebSocketServiceConfig = {}) {
    this.backendUrl = config.backendUrl || BACKEND_URL;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 3;
    this.reconnectDelay = config.reconnectDelay || 1000; // Base delay in ms
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get current session ID
   */
  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get current reconnection attempt number
   */
  public getReconnectAttempt(): number {
    return this.reconnectAttempts;
  }

  /**
   * Get max reconnection attempts
   */
  public getMaxReconnectAttempts(): number {
    return this.maxReconnectAttempts;
  }

  /**
   * Preserve session state for reconnection
   */
  public preserveSessionState(state: any): void {
    this.preservedSessionState = state;
  }

  /**
   * Get preserved session state
   */
  public getPreservedSessionState(): any {
    return this.preservedSessionState;
  }

  /**
   * Clear preserved session state
   */
  public clearPreservedSessionState(): void {
    this.preservedSessionState = null;
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    if (this.socket && this.socket.connected) {
      console.warn('WebSocket already connected');
      return;
    }

    this.updateConnectionState(ConnectionState.CONNECTING);

    try {
      this.socket = io(this.backendUrl, {
        transports: ['websocket'],
        reconnection: false, // We handle reconnection manually
        timeout: 30000, // 30 second connection timeout (increased for slow Bedrock init)
        forceNew: true, // Force new connection
      });

      this.setupSocketListeners();
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.updateConnectionState(ConnectionState.DISCONNECTED);
  }

  /**
   * Reconnect to the WebSocket server with exponential backoff
   */
  public reconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.updateConnectionState(ConnectionState.ERROR);
      this.emitToListeners('connection:error', new Error('Max reconnection attempts reached'));
      this.emitToListeners('connection:reconnect-failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    // Emit reconnecting event
    this.emitToListeners('connection:reconnecting', this.reconnectAttempts, this.maxReconnectAttempts);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Manually trigger reconnection (resets attempt counter)
   */
  public manualReconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Reset reconnect attempts for manual retry
    this.reconnectAttempts = 0;
    
    // Disconnect if currently connected
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Connect
    this.connect();
  }

  /**
   * Start a demo session
   */
  public startSession(questionnaireId: string, voiceId: string, userId?: string, language?: string): void {
    console.log('🚀 startSession called', { 
      questionnaireId, 
      voiceId, 
      userId,
      language,
      socketConnected: this.socket?.connected,
      socketExists: !!this.socket
    });

    if (!this.socket || !this.socket.connected) {
      console.error('❌ Cannot start session - WebSocket not connected!');
      throw new Error('WebSocket not connected');
    }

    // Send only the data part - backend will wrap it in the event structure
    const data = {
      questionnaireId,
      voiceId,
      userId,
      language,
    };

    console.log('📤 Emitting session:start event', data);
    this.socket.emit('session:start', data);
    console.log('✅ session:start event emitted');
  }

  /**
   * End a demo session
   */
  public endSession(reason: 'user_ended' | 'completed' | 'timeout' | 'error' = 'user_ended'): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('WebSocket not connected, cannot end session');
      return;
    }

    // Send only the data part - backend will wrap it in the event structure
    const data = {
      reason,
    };

    this.socket.emit('session:end', data);
  }

  /**
   * Send audio chunk to backend
   */
  public sendAudioChunk(audioData: string, sequenceNumber: number): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('WebSocket not connected, cannot send audio');
      return;
    }

    // Validate audioData before sending
    if (typeof audioData !== 'string' || audioData.length === 0) {
      console.warn('Invalid audioData - not a string or empty', { 
        type: typeof audioData, 
        length: audioData?.length 
      });
      return;
    }

    // Check base64 validity
    if (audioData.length % 4 !== 0) {
      console.warn('Invalid audioData - length not multiple of 4', { 
        length: audioData.length,
        mod4: audioData.length % 4
      });
      return;
    }

    // Send only the data part - backend will wrap it in the event structure
    const data = {
      audioData,
      sequenceNumber,
    };

    this.socket.emit('audio:chunk', data);
  }

  /**
   * Send transcript update to backend for survey answer extraction
   * 
   * This triggers the Bedrock Prompt Management to extract survey answers
   * from the conversation transcript.
   */
  public sendTranscriptUpdate(transcript: string, questionnaireId: string): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('WebSocket not connected, cannot send transcript update');
      return;
    }

    // Skip if transcript is too short
    if (!transcript || transcript.length < 50) {
      console.debug('Transcript too short for extraction', { length: transcript?.length });
      return;
    }

    const data = {
      transcript,
      questionnaireId,
    };

    console.log('📤 Sending transcript:update for survey answer extraction', { 
      transcriptLength: transcript.length,
      questionnaireId 
    });
    this.socket.emit('transcript:update', data);
  }

  /**
   * Send a custom event to backend
   */
  public emit(event: string, data: any): void {
    console.log('📤 WebSocketService.emit called', { event, data, connected: this.socket?.connected });
    
    if (!this.socket || !this.socket.connected) {
      console.warn('❌ WebSocket not connected, cannot emit event', { event });
      return;
    }

    console.log('✅ Emitting event to backend', { event, data });
    this.socket.emit(event, data);
  }

  /**
   * Register an event listener
   */
  public on<K extends keyof WebSocketEvents>(
    event: K,
    listener: WebSocketEvents[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Unregister an event listener
   */
  public off<K extends keyof WebSocketEvents>(
    event: K,
    listener: WebSocketEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit an event to all registered listeners (internal)
   */
  private emitToListeners<K extends keyof WebSocketEvents>(
    event: K,
    ...args: Parameters<WebSocketEvents[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Setup Socket.IO event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Clear reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      this.updateConnectionState(ConnectionState.CONNECTED);
      
      // Store session ID from socket
      this.sessionId = this.socket!.id ?? null;

      // If we have preserved session state, we successfully reconnected
      if (this.preservedSessionState) {
        console.log('Session state preserved during reconnection');
        // The application can use getPreservedSessionState() to restore state
      }
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('WebSocket disconnected:', reason);
      this.updateConnectionState(ConnectionState.DISCONNECTED);

      // Do NOT automatically reconnect - user must click connect button
      // This prevents unwanted reconnection loops
      console.log('WebSocket disconnected. User must click Connect to reconnect.');
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('WebSocket connection error:', error);
      this.handleConnectionError(error);
    });

    // Session events
    this.socket.on('session:ready', (data: any) => {
      console.log('Session ready:', data);
      this.emitToListeners('session:ready', data.data);
    });

    this.socket.on('session:complete', (data: any) => {
      console.log('Session complete:', data);
      this.emitToListeners('session:complete', data.data);
    });

    // Transcription events
    this.socket.on('transcription:user', (data: any) => {
      console.log('[WebSocketService] transcription:user received:', data);
      this.emitToListeners('transcription:user', data.data || data);
    });

    this.socket.on('transcription:assistant', (data: any) => {
      console.log('[WebSocketService] transcription:assistant received:', data);
      this.emitToListeners('transcription:assistant', data.data || data);
    });

    // Handle textOutput events from Nova Sonic (convert to transcription events)
    this.socket.on('textOutput', (data: any) => {
      const content = data?.content || '';
      const role = data?.role?.toLowerCase() || '';
      
      // Filter out tool calls - they contain function-like patterns
      const isToolCall = content.includes('record_response') || 
                         content.includes('get_next_question') ||
                         content.includes('validate_answer') ||
                         content.includes('get_demo_context') ||
                         /^\s*\w+\s*\(/.test(content); // matches "functionName(" pattern
      
      if (isToolCall) {
        console.log('[WebSocketService] Filtering out tool call from transcription:', content.substring(0, 50));
        return;
      }
      
      // Only emit non-empty, non-tool content
      if (content.trim()) {
        if (role === 'user') {
          console.log('[WebSocketService] textOutput (user) received:', content.substring(0, 50));
          this.emitToListeners('transcription:user', { transcript: content, isFinal: true });
        } else if (role === 'assistant') {
          console.log('[WebSocketService] textOutput (assistant) received:', content.substring(0, 50));
          this.emitToListeners('transcription:assistant', { transcript: content, isFinal: true });
        }
      }
    });

    // Audio events
    this.socket.on('audio:chunk', (data: any) => {
      this.emitToListeners('audio:chunk', data.data);
    });

    // Question events
    this.socket.on('question:advance', (data: any) => {
      this.emitToListeners('question:advance', data.data);
    });

    // Error events
    this.socket.on('error', (data: any) => {
      console.error('WebSocket error:', data);
      this.emitToListeners('error', data.data);
    });

    // Response recorded events
    this.socket.on('response:recorded', (data: any) => {
      console.log('[WebSocketService] response:recorded received:', data);
      this.emitToListeners('response:recorded', data.data || data);
    });

    // NLP analysis events
    this.socket.on('nlp:analysis', (data: any) => {
      console.log('[WebSocketService] nlp:analysis received:', data);
      this.emitToListeners('nlp:analysis', data.data || data);
    });

    // Survey answers events (from Prompt Management)
    this.socket.on('survey:answers', (data: any) => {
      console.log('[WebSocketService] survey:answers received:', data);
      this.emitToListeners('survey:answers', data.data || data);
    });

    // Guardrail blocked events
    this.socket.on('guardrail:blocked', (data: any) => {
      console.log('[WebSocketService] guardrail:blocked received:', data);
      this.emitToListeners('guardrail:blocked', data.data || data);
    });

    // Turn events (for echo cancellation)
    this.socket.on('turn:start', (data: any) => {
      console.log('[WebSocketService] turn:start received:', data);
      this.emitToListeners('turn:start', data.data || data);
    });

    this.socket.on('turn:complete', (data: any) => {
      console.log('[WebSocketService] turn:complete received:', data);
      this.emitToListeners('turn:complete', data.data || data);
    });

    // Interruption events (barge-in)
    this.socket.on('interruption', (data: any) => {
      console.log('[WebSocketService] interruption received:', data);
      this.emitToListeners('interruption', data.data || data);
    });

    // Heartbeat - respond to ping with pong
    this.socket.on('ping', () => {
      if (this.socket) {
        this.socket.emit('pong');
      }
    });
  }

  /**
   * Update connection state and notify listeners
   */
  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.emitToListeners('connection:state', state);
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    console.error('Connection error:', error);
    this.updateConnectionState(ConnectionState.ERROR);
    this.emitToListeners('connection:error', error);

    // Do NOT automatically reconnect - user must click connect button
    console.log('Connection error. User must click Connect to retry.');
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.disconnect();
    this.eventListeners.clear();
  }
}

/**
 * Create a singleton instance of the WebSocket service
 */
let webSocketServiceInstance: WebSocketService | null = null;

export function getWebSocketService(config?: WebSocketServiceConfig): WebSocketService {
  if (!webSocketServiceInstance) {
    webSocketServiceInstance = new WebSocketService(config);
  }
  return webSocketServiceInstance;
}

export function resetWebSocketService(): void {
  if (webSocketServiceInstance) {
    webSocketServiceInstance.destroy();
    webSocketServiceInstance = null;
  }
}
