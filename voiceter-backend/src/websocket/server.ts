import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../monitoring/logger';
import { getMetricsEmitter } from '../monitoring/metrics';
import { WebSocketEventHandler } from './handler';
import { ReconnectionManager } from './reconnection';
import { AuthenticationMiddleware } from '../auth/middleware';
import { Config } from '../server/config';

export interface WebSocketServerConfig {
  cors: {
    origin: string | string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
    credentials: boolean;
    methods?: string[];
  };
  pingTimeout: number;
  pingInterval: number;
  config?: Config; // Server config for authentication
}

export interface SessionSocket extends Socket {
  sessionId?: string;
  reconnecting?: boolean;
}

export class WebSocketServer {
  private io: SocketIOServer;
  private logger: Logger;
  private activeSessions: Map<string, SessionSocket>;
  private eventHandler: WebSocketEventHandler;
  private reconnectionManager: ReconnectionManager;
  private disconnectionTimers: Map<string, NodeJS.Timeout>;
  private authMiddleware: AuthenticationMiddleware | null = null;

  constructor(httpServer: HTTPServer, config: WebSocketServerConfig, logger: Logger) {
    this.logger = logger;
    this.activeSessions = new Map();
    this.eventHandler = new WebSocketEventHandler(logger);
    this.reconnectionManager = new ReconnectionManager(logger);
    this.disconnectionTimers = new Map();

    // Initialize authentication middleware if config provided
    if (config.config) {
      this.authMiddleware = new AuthenticationMiddleware(config.config, logger);
    }

    // Initialize Socket.IO with configuration
    this.io = new SocketIOServer(httpServer, {
      cors: config.cors,
      pingTimeout: config.pingTimeout,
      pingInterval: config.pingInterval,
      transports: ['websocket', 'polling'],
    });

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    // Use Socket.IO middleware for authentication
    this.io.use(async (socket, next) => {
      await this.authenticateConnection(socket as SessionSocket, next);
    });

    this.io.on('connection', (socket: SessionSocket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Authenticate WebSocket connection before allowing it to proceed.
   * Validates origin, session ID, and JWT token (if auth enabled).
   * 
   * REQ-BE-002: Handle Session Authentication
   */
  private async authenticateConnection(
    socket: SessionSocket,
    next: (err?: Error) => void
  ): Promise<void> {
    // If no auth middleware configured, allow all connections
    if (!this.authMiddleware) {
      this.logger.debug('Authentication middleware not configured, allowing connection', {
        event: 'auth_middleware_not_configured',
        data: { socketId: socket.id },
      });
      return next();
    }

    try {
      const result = await this.authMiddleware.authenticate(socket);

      if (!result.authenticated) {
        this.logger.warn('WebSocket connection rejected', {
          event: 'ws_connection_rejected',
          data: {
            socketId: socket.id,
            errorCode: result.error?.code,
            errorMessage: result.error?.message,
            statusCode: result.error?.statusCode,
          },
        });

        // Create error with status code for Socket.IO
        const error = new Error(result.error?.message || 'Authentication failed') as any;
        error.data = {
          errorCode: result.error?.code,
          statusCode: result.error?.statusCode,
        };

        return next(error);
      }

      // Store authenticated session ID and user ID on socket
      if (result.sessionId) {
        socket.sessionId = result.sessionId;
      }

      this.logger.debug('WebSocket connection authenticated', {
        event: 'ws_connection_authenticated',
        data: {
          socketId: socket.id,
          hasSessionId: !!result.sessionId,
          hasUserId: !!result.userId,
        },
      });

      return next();
    } catch (error) {
      this.logger.error('Authentication error during connection', {
        event: 'ws_auth_error',
        data: { socketId: socket.id },
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      const authError = new Error('Authentication error') as any;
      authError.data = {
        errorCode: 'AUTH_ERROR',
        statusCode: 500,
      };

      return next(authError);
    }
  }

  private handleConnection(socket: SessionSocket): void {
    // Check for reconnection attempt
    const reconnectSessionId = socket.handshake.query.sessionId as string;
    let sessionId: string;
    let isReconnection = false;

    if (reconnectSessionId && this.reconnectionManager.canRestore(reconnectSessionId)) {
      // Attempt to restore session
      const restoredSession = this.reconnectionManager.restoreSession(reconnectSessionId);

      if (restoredSession) {
        sessionId = reconnectSessionId;
        isReconnection = true;
        socket.reconnecting = true;

        // Cancel disconnection timer if it exists
        const timer = this.disconnectionTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          this.disconnectionTimers.delete(sessionId);
        }

        this.logger.info('Session reconnected successfully', {
          event: 'ws_session_reconnected',
          sessionId,
          data: {
            socketId: socket.id,
            transport: socket.conn.transport.name,
          },
        });
      } else {
        // Restoration failed, assign new session ID
        sessionId = uuidv4();
      }
    } else {
      // New connection, assign unique session ID
      sessionId = uuidv4();
    }

    socket.sessionId = sessionId;
    this.activeSessions.set(sessionId, socket);

    if (!isReconnection) {
      this.logger.info('WebSocket connection established', {
        event: 'ws_connection_established',
        sessionId,
        data: {
          socketId: socket.id,
          transport: socket.conn.transport.name,
        },
      });
      
      // Emit WebSocket connections metric
      try {
        const metricsEmitter = getMetricsEmitter();
        metricsEmitter.emitWebSocketConnections(this.activeSessions.size);
      } catch (error) {
        // Metrics emitter not initialized, skip
        this.logger.debug('Metrics emitter not available', {
          event: 'metrics_emitter_not_available',
        });
      }
    }

    // Register event handlers
    this.eventHandler.registerHandlers(socket);

    // Set up heartbeat/ping-pong mechanism
    this.setupHeartbeat(socket);

    // Handle disconnection
    socket.on('disconnect', (reason: string) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle connection errors
    socket.on('error', (error: Error) => {
      this.logger.error('WebSocket error', {
        event: 'ws_error',
        sessionId,
        error: {
          message: error.message,
          stack: error.stack,
        },
      });
    });

    // Emit session ID to client
    socket.emit('session:assigned', {
      event: 'session:assigned',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
        reconnected: isReconnection,
      },
    });
  }

  private setupHeartbeat(socket: SessionSocket): void {
    // Socket.IO already has built-in ping/pong at the transport level
    // (configured via pingTimeout and pingInterval in server options).
    // This custom heartbeat was causing premature disconnections because
    // the frontend wasn't responding to custom 'ping' events.
    // 
    // The built-in Socket.IO heartbeat is sufficient for connection health.
    // If needed in the future, the frontend would need to listen for 'ping'
    // and emit 'pong' events.
    
    const sessionId = socket.sessionId!;
    this.logger.debug('Heartbeat setup skipped - using Socket.IO built-in ping/pong', {
      event: 'ws_heartbeat_setup',
      sessionId,
    });
  }

  private handleDisconnection(socket: SessionSocket, reason: string): void {
    const sessionId = socket.sessionId!;

    this.logger.info('WebSocket connection closed', {
      event: 'ws_connection_closed',
      sessionId,
      data: {
        reason,
        socketId: socket.id,
      },
    });

    // Run post-session processing IMMEDIATELY while socket might still be connected
    // This allows us to emit results to the frontend before full cleanup
    (async () => {
      try {
        //console.log('🔄 Running post-session processing immediately for session:', sessionId);
        //console.log('📋 Socket still connected:', socket.connected);
        await this.eventHandler.handleDisconnect(sessionId, socket);
      } catch (postSessionError) {
        this.logger.error('Post-session processing failed', {
          sessionId,
          error: postSessionError instanceof Error ? postSessionError.message : String(postSessionError),
        });
      }
    })();

    // Remove from active sessions
    this.activeSessions.delete(sessionId);
    
    // Emit WebSocket connections metric
    try {
      const metricsEmitter = getMetricsEmitter();
      metricsEmitter.emitWebSocketConnections(this.activeSessions.size);
    } catch (error) {
      // Metrics emitter not initialized, skip
      this.logger.debug('Metrics emitter not available', {
        event: 'metrics_emitter_not_available',
      });
    }

    // Preserve session state for potential reconnection
    // TODO: Get actual session state from session manager
    const sessionState = {
      // Placeholder for session state
      lastActivity: new Date(),
    };

    this.reconnectionManager.preserveSession(sessionId, sessionState, false);

    // Set timer for cleanup after post-session processing has time to complete
    const disconnectionTimer = setTimeout(async () => {
      this.logger.info('Disconnection cleanup (2 second threshold)', {
        event: 'disconnection_cleanup',
        sessionId,
      });

      // Clean up timer
      this.disconnectionTimers.delete(sessionId);

      // Clean up session with 3-second timeout protection (requirement 5.8)
      try {
        const { getSessionManager } = await import('../session/manager');
        const { cleanupSessionResources } = await import('../session/cleanup');
        const sessionManager = getSessionManager();
        
        // Attempt graceful cleanup with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Cleanup timeout')), 3000);
        });
        
        const cleanupPromise = cleanupSessionResources(sessionId, sessionManager);
        
        await Promise.race([cleanupPromise, timeoutPromise]);
        
        this.logger.info('Session cleaned up on disconnect', {
          event: 'session_cleanup_success',
          sessionId,
        });
      } catch (error) {
        this.logger.warn('Session cleanup failed or timed out', {
          event: 'session_cleanup_failed',
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        
        // Force cleanup
        try {
          const { getSessionManager } = await import('../session/manager');
          const sessionManager = getSessionManager();
          await sessionManager.deleteSession(sessionId);
        } catch (forceError) {
          this.logger.error('Force cleanup failed', {
            event: 'force_cleanup_failed',
            sessionId,
            error: forceError instanceof Error ? forceError.message : String(forceError),
          });
        }
      }

      // Emit disconnection event for session cleanup
      this.io.emit('internal:disconnection', {
        sessionId,
        reason,
        timestamp: new Date().toISOString(),
      });
    }, 2000); // 2 seconds

    this.disconnectionTimers.set(sessionId, disconnectionTimer);
  }

  /**
   * Emit event to specific session
   */
  public emitToSession(sessionId: string, event: string, data: any): void {
    const socket = this.activeSessions.get(sessionId);
    if (socket) {
      socket.emit(event, data);
      this.logger.debug('Emitted event to session', {
        event: 'ws_emit_to_session',
        sessionId,
        data: {
          eventName: event,
        },
      });
    } else {
      this.logger.warn('Attempted to emit to non-existent session', {
        event: 'ws_emit_failed',
        sessionId,
        data: {
          eventName: event,
        },
      });
    }
  }

  /**
   * Emit barge-in event to specific session
   * Notifies frontend to stop audio playback immediately
   */
  public emitBargeIn(sessionId: string): void {
    const timestamp = new Date().toISOString();
    
    this.emitToSession(sessionId, 'barge-in', {
      event: 'barge-in',
      sessionId,
      timestamp,
      data: {
        timestamp,
        message: 'User interrupted AI speech',
      },
    });

    this.logger.info('Emitted barge-in event', {
      event: 'barge_in_emitted',
      sessionId,
      timestamp,
    });
  }

  /**
   * Broadcast event to all connected clients
   */
  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
    this.logger.debug('Broadcasted event to all clients', {
      event: 'ws_broadcast',
      data: {
        eventName: event,
        activeConnections: this.activeSessions.size,
      },
    });
  }

  /**
   * Get Socket.IO server instance for registering event handlers
   */
  public getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Get socket by session ID
   */
  public getSocket(sessionId: string): SessionSocket | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get socket by session ID (alias for getSocket)
   */
  public getSocketBySessionId(sessionId: string): SessionSocket | undefined {
    return this.getSocket(sessionId);
  }

  /**
   * Get number of active connections
   */
  public getActiveConnectionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Close WebSocket server gracefully
   */
  public async close(): Promise<void> {
    this.logger.info('Closing WebSocket server', {
      event: 'ws_server_closing',
      data: {
        activeConnections: this.activeSessions.size,
        preservedSessions: this.reconnectionManager.getPreservedSessionCount(),
      },
    });

    // Clear all disconnection timers
    for (const [sessionId, timer] of this.disconnectionTimers.entries()) {
      clearTimeout(timer);
      this.logger.debug('Cleared disconnection timer', {
        event: 'disconnection_timer_cleared',
        sessionId,
      });
    }
    this.disconnectionTimers.clear();

    // Shutdown reconnection manager
    this.reconnectionManager.shutdown();

    // Close all active connections
    for (const [sessionId, socket] of this.activeSessions.entries()) {
      socket.disconnect(true);
      this.logger.debug('Closed connection', {
        event: 'ws_connection_force_closed',
        sessionId,
      });
    }

    // Close Socket.IO server
    return new Promise((resolve) => {
      this.io.close(() => {
        this.logger.info('WebSocket server closed', {
          event: 'ws_server_closed',
        });
        resolve();
      });
    });
  }
}
