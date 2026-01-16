/**
 * Session Manager Component
 * 
 * Manages session lifecycle, state persistence, and cleanup.
 * Supports both in-memory storage (single instance) and Redis storage (multi-instance).
 * 
 * Architecture:
 * - Direct mode only: Browser connects directly to Bedrock via pre-signed WebSocket URL
 * - Gemini Live mode: Backend proxies to Google Gemini Live API
 * - Backend handles tool execution, session management, and data persistence
 * 
 * _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
 */

import { Session, SessionMetadata, GeminiSessionFields } from './types';
import { InMemorySessionStorage } from './storage';
import type { SessionStorage } from './storage';
import { Logger } from '../monitoring/logger';
import { getMetricsEmitter } from '../monitoring/metrics';

/**
 * Session Manager
 * 
 * Provides methods to create, retrieve, update, and delete sessions.
 * Handles automatic cleanup of stale sessions (30+ minutes inactive).
 * Uses direct mode architecture where browser connects directly to Bedrock.
 * Supports Gemini Live sessions with state transitions: connecting → active → completed/terminated/error.
 * 
 * _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
 */
export class SessionManager {
  private storage: SessionStorage;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly STALE_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
  private readonly INACTIVE_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private logger?: Logger;

  /**
   * Create a new SessionManager
   * 
   * @param storage - Session storage implementation (defaults to in-memory)
   * @param logger - Optional logger instance
   */
  constructor(storage?: SessionStorage, logger?: Logger) {
    this.storage = storage || new InMemorySessionStorage();
    this.logger = logger;
  }

  /**
   * Initialize the session manager
   * Starts the cleanup interval for stale sessions
   */
  async initialize(): Promise<void> {
    // Start cleanup interval (every 1 minute as per requirements)
    this.cleanupInterval = setInterval(
      () => this.cleanupInactiveSessions(),
      this.CLEANUP_INTERVAL_MS
    );
    
    if (this.logger) {
      this.logger.info('SessionManager initialized', {
        event: 'session_manager_initialized',
        data: {
          cleanupIntervalMs: this.CLEANUP_INTERVAL_MS,
          inactiveTimeoutMs: this.INACTIVE_SESSION_TIMEOUT_MS,
        },
      });
    }
  }

  /**
   * Shutdown the session manager
   * Stops the cleanup interval
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Create a new session
   * 
   * @param sessionId - Unique session identifier
   * @param metadata - Session metadata (questionnaireId, voiceId, userId)
   * @param useGemini - Whether to initialize Gemini Live-specific fields
   * @returns The created session
   * 
   * @remarks
   * Initializes session with default values:
   * - currentQuestionIndex: 0
   * - responses: empty Map
   * - conversationHistory: empty array
   * - status: 'connecting' for Gemini sessions, 'active' for others
   * - startTime: current time
   * - lastActivityTime: current time
   * 
   * Direct mode architecture:
   * - Browser connects directly to Bedrock via pre-signed WebSocket URL
   * - Backend handles tool execution, transcripts, and audio recording
   * 
   * Gemini Live mode:
   * - Backend proxies to Google Gemini Live API
   * - Initializes Gemini-specific session fields
   * - Status starts as 'connecting' until setupComplete is received
   * 
   * _Requirements: 6.1, 6.2, 10.1, 10.2_
   */
  async createSession(
    sessionId: string,
    metadata: SessionMetadata,
    useGemini: boolean = false
  ): Promise<Session> {
    const now = new Date();

    // Initialize Gemini Live-specific fields if using Gemini
    // _Requirements: 10.1, 10.2_
    const geminiFields: GeminiSessionFields | undefined = useGemini
      ? {
          geminiSessionId: undefined,
          voiceName: metadata.voiceId || 'Charon',
          isConnected: false,
          connectionAttempts: 0,
          lastReconnectTime: undefined,
          turnCount: 0,
          audioChunksReceived: 0,
          audioChunksSent: 0,
          toolCallsExecuted: 0,
          totalToolExecutionTimeMs: 0,
        }
      : undefined;

    // Gemini sessions start with 'connecting' status (Requirement 10.1)
    const initialStatus = useGemini ? 'connecting' : 'active';

    const session: Session = {
      sessionId,
      questionnaireId: metadata.questionnaireId,
      currentQuestionIndex: 0,
      language: metadata.language, // Store language for NLP analysis
      responses: new Map(),
      conversationHistory: [],
      bedrockStreamIds: {
        promptName: '',
        contentName: '',
      },
      audioConfig: {
        sampleRate: 16000,
        sampleSizeBits: 16,
        channelCount: 1,
        voiceId: metadata.voiceId,
      },
      startTime: now,
      lastActivityTime: now,
      status: initialStatus,
      userId: metadata.userId,
      gemini: geminiFields,
    };

    await this.storage.set(sessionId, session);
    
    // Emit concurrent sessions metric
    try {
      const metricsEmitter = getMetricsEmitter();
      const sessionCount = await this.getSessionCount();
      await metricsEmitter.emitConcurrentSessions(sessionCount);
      await metricsEmitter.emitSessionStarted(metadata.questionnaireId);
    } catch (error) {
      // Metrics emitter not initialized, skip
      if (this.logger) {
        this.logger.debug('Metrics emitter not available', {
          event: 'metrics_emitter_not_available',
        });
      }
    }

    if (this.logger) {
      this.logger.info('Session created', {
        event: 'session_created',
        sessionId,
        data: {
          questionnaireId: metadata.questionnaireId,
          voiceId: metadata.voiceId,
          useGemini,
          initialStatus,
        },
      });
    }
    
    return session;
  }

  /**
   * Retrieve a session by ID
   * 
   * @param sessionId - Session identifier
   * @returns The session if found, null otherwise
   * 
   * @remarks
   * Access time should be < 50ms as per requirements
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return await this.storage.get(sessionId);
  }

  /**
   * Update a session
   * 
   * @param sessionId - Session identifier
   * @param updates - Partial session updates
   * 
   * @remarks
   * Automatically updates lastActivityTime to current time unless explicitly provided in updates
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Session>
  ): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Merge updates with existing session
    // Only auto-update lastActivityTime if not explicitly provided
    const updatedSession: Session = {
      ...session,
      ...updates,
      lastActivityTime: updates.lastActivityTime || new Date(),
    };

    await this.storage.set(sessionId, updatedSession);
  }

  /**
   * Delete a session
   * 
   * @param sessionId - Session identifier
   * 
   * _Requirements: 6.5, 6.6_
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Get session before deleting to emit metrics
    const session = await this.storage.get(sessionId);
    
    await this.storage.delete(sessionId);
    
    // Emit concurrent sessions metric
    try {
      const metricsEmitter = getMetricsEmitter();
      const sessionCount = await this.getSessionCount();
      await metricsEmitter.emitConcurrentSessions(sessionCount);
      
      // Emit session completed metric if session was found
      if (session) {
        const durationMs = Date.now() - session.startTime.getTime();
        await metricsEmitter.emitSessionCompleted(
          session.questionnaireId,
          session.status
        );
        await metricsEmitter.emitSessionDuration(durationMs, session.questionnaireId);
        await metricsEmitter.emitQuestionsAnswered(
          session.responses.size,
          session.questionnaireId
        );
        
        // Emit Gemini-specific metrics if this was a Gemini session
        if (session.gemini) {
          const avgToolLatency = session.gemini.toolCallsExecuted > 0
            ? session.gemini.totalToolExecutionTimeMs / session.gemini.toolCallsExecuted
            : 0;
          
          await metricsEmitter.emitGeminiSessionCompleted(
            session.questionnaireId,
            session.status,
            {
              durationMs,
              turnCount: session.gemini.turnCount,
              audioChunksSent: session.gemini.audioChunksSent,
              audioChunksReceived: session.gemini.audioChunksReceived,
              toolCallsExecuted: session.gemini.toolCallsExecuted,
              averageToolLatencyMs: avgToolLatency,
            }
          );
        }
      }
    } catch (error) {
      // Metrics emitter not initialized, skip
      if (this.logger) {
        this.logger.debug('Metrics emitter not available', {
          event: 'metrics_emitter_not_available',
        });
      }
    }
  }

  /**
   * Clean up inactive sessions
   * 
   * Closes sessions that have been inactive for 5+ minutes (as per requirement 1.7, 11.3)
   * Force-closes sessions that fail graceful cleanup
   * Includes Gemini Live connection cleanup
   * 
   * @returns Number of sessions cleaned up
   * 
   * _Requirements: 6.4, 10.7_
   */
  async cleanupInactiveSessions(): Promise<number> {
    const now = Date.now();
    const allSessions = await this.storage.getAll();
    let cleanedCount = 0;

    for (const session of allSessions) {
      const inactiveTime = now - session.lastActivityTime.getTime();
      
      // Close sessions inactive for 5+ minutes (requirement 1.7, 11.3)
      if (inactiveTime >= this.INACTIVE_SESSION_TIMEOUT_MS) {
        try {
          // Attempt graceful cleanup with timeout
          await this.closeSessionGracefully(session.sessionId);
          cleanedCount++;
          
          if (this.logger) {
            this.logger.info('Inactive session cleaned up', {
              event: 'inactive_session_cleaned',
              sessionId: session.sessionId,
              data: {
                inactiveTimeMs: inactiveTime,
                isGeminiSession: !!session.gemini,
              },
            });
          }
        } catch (error) {
          // Force-close on failure
          await this.forceCloseSession(session.sessionId);
          cleanedCount++;
          
          if (this.logger) {
            this.logger.warn('Session force-closed after cleanup failure', {
              event: 'session_force_closed',
              sessionId: session.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Clean up stale sessions (legacy method for backward compatibility)
   * 
   * Removes sessions that have been inactive for 30+ minutes
   * Includes Gemini Live connection cleanup
   * 
   * @returns Number of sessions cleaned up
   * 
   * _Requirements: 6.4, 10.7_
   */
  async cleanupStaleSessions(): Promise<number> {
    const now = Date.now();
    const allSessions = await this.storage.getAll();
    let cleanedCount = 0;

    for (const session of allSessions) {
      const inactiveTime = now - session.lastActivityTime.getTime();
      
      if (inactiveTime >= this.STALE_SESSION_TIMEOUT_MS) {
        // Clean up Gemini Live connection if this is a Gemini session
        if (session.gemini) {
          try {
            const { cleanupGeminiConnection } = await import('./cleanup');
            await cleanupGeminiConnection(session.sessionId);
          } catch (error) {
            if (this.logger) {
              this.logger.warn('Failed to cleanup Gemini connection for stale session', {
                event: 'gemini_cleanup_failed',
                sessionId: session.sessionId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
        
        await this.storage.delete(session.sessionId);
        cleanedCount++;
        
        if (this.logger) {
          this.logger.info('Stale session cleaned up', {
            event: 'stale_session_cleaned',
            sessionId: session.sessionId,
            data: {
              inactiveTimeMs: inactiveTime,
              isGeminiSession: !!session.gemini,
            },
          });
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Close a session gracefully
   * 
   * @param sessionId - Session identifier
   * @param timeoutMs - Timeout for graceful cleanup (default: 5 seconds)
   */
  private async closeSessionGracefully(sessionId: string, timeoutMs: number = 5000): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Graceful cleanup timeout')), timeoutMs);
    });

    const cleanupPromise = (async () => {
      // Import cleanup utilities
      const { cleanupSessionResources } = await import('./cleanup');
      await cleanupSessionResources(sessionId, this);
    })();

    // Race between cleanup and timeout
    await Promise.race([cleanupPromise, timeoutPromise]);
  }

  /**
   * Force-close a session
   * 
   * @param sessionId - Session identifier
   * 
   * _Requirements: 6.4, 10.7_
   */
  private async forceCloseSession(sessionId: string): Promise<void> {
    // Get session to check if it's a Gemini session
    const session = await this.storage.get(sessionId);

    // Try to cleanup Gemini connection if applicable
    if (session?.gemini) {
      try {
        const { cleanupGeminiConnection } = await import('./cleanup');
        await cleanupGeminiConnection(sessionId);
      } catch (error) {
        // Ignore errors during force close
        if (this.logger) {
          this.logger.debug('Gemini cleanup failed during force close', {
            event: 'gemini_force_cleanup_failed',
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    
    // Delete from storage
    await this.storage.delete(sessionId);
  }

  /**
   * List all active sessions (requirement 2.1, 11.1, 11.7)
   * 
   * @returns Array of all sessions
   */
  async listActiveSessions(): Promise<Session[]> {
    return await this.storage.getAll();
  }

  /**
   * Get all active sessions (alias for listActiveSessions)
   * 
   * @returns Array of all sessions
   */
  async getAllSessions(): Promise<Session[]> {
    return await this.listActiveSessions();
  }

  /**
   * Get session count
   * 
   * @returns Number of active sessions
   */
  async getSessionCount(): Promise<number> {
    const sessions = await this.storage.getAll();
    return sessions.length;
  }

  /**
   * Update last activity time for a session
   * 
   * @param sessionId - Session identifier
   */
  async updateLastActivityTime(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, {
      lastActivityTime: new Date(),
    });
  }

  // ==========================================================================
  // Gemini Live-specific methods
  // _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  // ==========================================================================

  /**
   * Set the Gemini session ID for a session
   * 
   * Called after Gemini Live connection is established and setupComplete
   * is received with the session ID. Updates status from 'connecting' to 'active'.
   * 
   * @param sessionId - Session identifier
   * @param geminiSessionId - Gemini Live session ID
   * 
   * _Requirements: 10.2_
   */
  async setGeminiSessionId(sessionId: string, geminiSessionId: string): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.geminiSessionId = geminiSessionId;
    session.gemini.isConnected = true;
    session.status = 'active'; // Transition from 'connecting' to 'active'
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);

    if (this.logger) {
      this.logger.info('Gemini session ID set', {
        event: 'gemini_session_id_set',
        sessionId,
        data: { geminiSessionId, status: 'active' },
      });
    }
  }

  /**
   * Get the Gemini session ID for a session
   * 
   * @param sessionId - Session identifier
   * @returns Gemini session ID or null if not set
   */
  async getGeminiSessionId(sessionId: string): Promise<string | null> {
    const session = await this.storage.get(sessionId);
    if (!session || !session.gemini) {
      return null;
    }
    return session.gemini.geminiSessionId || null;
  }

  /**
   * Check if a session is using Gemini Live
   * 
   * @param sessionId - Session identifier
   * @returns true if session is using Gemini Live
   */
  async isGeminiSession(sessionId: string): Promise<boolean> {
    const session = await this.storage.get(sessionId);
    return session?.gemini !== undefined;
  }

  /**
   * Update Gemini Live connection status for a session
   * 
   * @param sessionId - Session identifier
   * @param isConnected - Whether the Gemini Live WebSocket is connected
   */
  async updateGeminiConnectionStatus(sessionId: string, isConnected: boolean): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.isConnected = isConnected;
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);

    if (this.logger) {
      this.logger.debug('Gemini connection status updated', {
        event: 'gemini_connection_status_updated',
        sessionId,
        data: { isConnected },
      });
    }
  }

  /**
   * Update Gemini session status
   * 
   * Handles state transitions: connecting → active → completed/terminated/error
   * 
   * @param sessionId - Session identifier
   * @param status - New session status
   * 
   * _Requirements: 10.3, 10.4, 10.5_
   */
  async updateGeminiSessionStatus(
    sessionId: string,
    status: 'active' | 'completed' | 'terminated' | 'error'
  ): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    const oldStatus = session.status;
    session.status = status;
    session.lastActivityTime = new Date();

    // Update connection status based on final status
    if (status === 'completed' || status === 'terminated' || status === 'error') {
      session.gemini.isConnected = false;
    }

    await this.storage.set(sessionId, session);

    if (this.logger) {
      this.logger.info('Gemini session status updated', {
        event: 'gemini_session_status_updated',
        sessionId,
        data: { oldStatus, newStatus: status },
      });
    }
  }

  /**
   * Record a reconnection attempt for Gemini session
   * 
   * @param sessionId - Session identifier
   */
  async recordGeminiReconnectionAttempt(sessionId: string): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.connectionAttempts++;
    session.gemini.lastReconnectTime = new Date();
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);

    if (this.logger) {
      this.logger.debug('Gemini reconnection attempt recorded', {
        event: 'gemini_reconnection_attempt',
        sessionId,
        data: { connectionAttempts: session.gemini.connectionAttempts },
      });
    }
  }

  /**
   * Reset Gemini connection attempts (after successful connection)
   * 
   * @param sessionId - Session identifier
   */
  async resetGeminiConnectionAttempts(sessionId: string): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.connectionAttempts = 0;
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);
  }

  /**
   * Increment Gemini turn count for a session
   * 
   * @param sessionId - Session identifier
   * 
   * _Requirements: 10.6_
   */
  async incrementGeminiTurnCount(sessionId: string): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.turnCount++;
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);
  }

  /**
   * Increment Gemini audio chunks received count
   * 
   * @param sessionId - Session identifier
   * @param count - Number of chunks to add (default: 1)
   * 
   * _Requirements: 10.6_
   */
  async incrementGeminiAudioChunksReceived(sessionId: string, count: number = 1): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.audioChunksReceived += count;
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);
  }

  /**
   * Increment Gemini audio chunks sent count
   * 
   * @param sessionId - Session identifier
   * @param count - Number of chunks to add (default: 1)
   * 
   * _Requirements: 10.6_
   */
  async incrementGeminiAudioChunksSent(sessionId: string, count: number = 1): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.audioChunksSent += count;
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);
  }

  /**
   * Record a tool call execution for Gemini session
   * 
   * @param sessionId - Session identifier
   * @param executionTimeMs - Tool execution time in milliseconds
   * 
   * _Requirements: 10.6_
   */
  async recordGeminiToolExecution(sessionId: string, executionTimeMs: number): Promise<void> {
    const session = await this.storage.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!session.gemini) {
      throw new Error(`Session ${sessionId} is not a Gemini Live session`);
    }

    session.gemini.toolCallsExecuted++;
    session.gemini.totalToolExecutionTimeMs += executionTimeMs;
    session.lastActivityTime = new Date();

    await this.storage.set(sessionId, session);
  }

  /**
   * Get Gemini session metrics
   * 
   * @param sessionId - Session identifier
   * @returns Gemini session metrics or null if not a Gemini session
   */
  async getGeminiSessionMetrics(sessionId: string): Promise<{
    geminiSessionId?: string;
    voiceName: string;
    isConnected: boolean;
    connectionAttempts: number;
    lastReconnectTime?: Date;
    turnCount: number;
    audioChunksReceived: number;
    audioChunksSent: number;
    toolCallsExecuted: number;
    totalToolExecutionTimeMs: number;
    averageToolExecutionTimeMs: number;
    durationMs: number;
    status: string;
  } | null> {
    const session = await this.storage.get(sessionId);
    if (!session || !session.gemini) {
      return null;
    }

    const durationMs = Date.now() - session.startTime.getTime();
    const averageToolExecutionTimeMs = session.gemini.toolCallsExecuted > 0
      ? session.gemini.totalToolExecutionTimeMs / session.gemini.toolCallsExecuted
      : 0;

    return {
      geminiSessionId: session.gemini.geminiSessionId,
      voiceName: session.gemini.voiceName,
      isConnected: session.gemini.isConnected,
      connectionAttempts: session.gemini.connectionAttempts,
      lastReconnectTime: session.gemini.lastReconnectTime,
      turnCount: session.gemini.turnCount,
      audioChunksReceived: session.gemini.audioChunksReceived,
      audioChunksSent: session.gemini.audioChunksSent,
      toolCallsExecuted: session.gemini.toolCallsExecuted,
      totalToolExecutionTimeMs: session.gemini.totalToolExecutionTimeMs,
      averageToolExecutionTimeMs,
      durationMs,
      status: session.status,
    };
  }
}

// Singleton instance
// Note: exported for testing purposes only
export let sessionManagerInstance: SessionManager | null = null;

/**
 * Initialize the global SessionManager instance
 * 
 * @param storage - Optional session storage implementation
 * @param logger - Optional logger instance
 */
export function initializeSessionManager(
  storage?: SessionStorage, 
  logger?: Logger
): SessionManager {
  if (sessionManagerInstance) {
    throw new Error('SessionManager already initialized');
  }
  
  sessionManagerInstance = new SessionManager(storage, logger);
  return sessionManagerInstance;
}

/**
 * Get the global SessionManager instance
 * 
 * @returns SessionManager instance
 * @throws Error if SessionManager not initialized
 */
export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    throw new Error('SessionManager not initialized. Call initializeSessionManager() first.');
  }
  
  return sessionManagerInstance;
}
