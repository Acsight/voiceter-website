/**
 * WebSocket Reconnection Handler
 * 
 * This module handles connection interruptions and session resumption.
 * It preserves session state for 60 seconds after disconnection to allow
 * clients to reconnect.
 */

import { Logger } from '../monitoring/logger';

export interface DisconnectedSession {
  sessionId: string;
  disconnectedAt: Date;
  state: any; // Session state to preserve
  bedrockStreamActive: boolean;
}

export class ReconnectionManager {
  private logger: Logger;
  private disconnectedSessions: Map<string, DisconnectedSession>;
  private cleanupInterval: NodeJS.Timeout;
  private readonly PRESERVATION_TIMEOUT = 60000; // 60 seconds

  constructor(logger: Logger) {
    this.logger = logger;
    this.disconnectedSessions = new Map();

    // Start cleanup interval to remove expired sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Preserve session state after disconnection
   */
  public preserveSession(
    sessionId: string,
    state: any,
    bedrockStreamActive: boolean
  ): void {
    const disconnectedSession: DisconnectedSession = {
      sessionId,
      disconnectedAt: new Date(),
      state,
      bedrockStreamActive,
    };

    this.disconnectedSessions.set(sessionId, disconnectedSession);

    this.logger.info('Session state preserved for reconnection', {
      event: 'session_state_preserved',
      sessionId,
      data: {
        bedrockStreamActive,
        preservationTimeout: this.PRESERVATION_TIMEOUT,
      },
    });
  }

  /**
   * Attempt to restore session on reconnection
   */
  public restoreSession(sessionId: string): DisconnectedSession | null {
    const disconnectedSession = this.disconnectedSessions.get(sessionId);

    if (!disconnectedSession) {
      this.logger.warn('No preserved session found for reconnection', {
        event: 'session_restore_failed',
        sessionId,
        data: {
          reason: 'session_not_found',
        },
      });
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const timeSinceDisconnect = now.getTime() - disconnectedSession.disconnectedAt.getTime();

    if (timeSinceDisconnect > this.PRESERVATION_TIMEOUT) {
      this.logger.warn('Preserved session expired', {
        event: 'session_restore_failed',
        sessionId,
        data: {
          reason: 'session_expired',
          timeSinceDisconnect,
        },
      });

      // Remove expired session
      this.disconnectedSessions.delete(sessionId);
      return null;
    }

    // Remove from disconnected sessions (successful restoration)
    this.disconnectedSessions.delete(sessionId);

    this.logger.info('Session restored successfully', {
      event: 'session_restored',
      sessionId,
      data: {
        timeSinceDisconnect,
        bedrockStreamActive: disconnectedSession.bedrockStreamActive,
      },
    });

    return disconnectedSession;
  }

  /**
   * Check if a session can be restored
   */
  public canRestore(sessionId: string): boolean {
    const disconnectedSession = this.disconnectedSessions.get(sessionId);

    if (!disconnectedSession) {
      return false;
    }

    const now = new Date();
    const timeSinceDisconnect = now.getTime() - disconnectedSession.disconnectedAt.getTime();

    return timeSinceDisconnect <= this.PRESERVATION_TIMEOUT;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, disconnectedSession] of this.disconnectedSessions.entries()) {
      const timeSinceDisconnect = now.getTime() - disconnectedSession.disconnectedAt.getTime();

      if (timeSinceDisconnect > this.PRESERVATION_TIMEOUT) {
        expiredSessions.push(sessionId);
      }
    }

    if (expiredSessions.length > 0) {
      this.logger.info('Cleaning up expired sessions', {
        event: 'session_cleanup',
        data: {
          expiredCount: expiredSessions.length,
          sessionIds: expiredSessions,
        },
      });

      for (const sessionId of expiredSessions) {
        this.disconnectedSessions.delete(sessionId);

        // TODO: Clean up Bedrock connections for expired sessions
        this.logger.info('Expired session cleaned up', {
          event: 'session_expired',
          sessionId,
        });
      }
    }
  }

  /**
   * Get count of preserved sessions
   */
  public getPreservedSessionCount(): number {
    return this.disconnectedSessions.size;
  }

  /**
   * Manually remove a preserved session
   */
  public removeSession(sessionId: string): void {
    if (this.disconnectedSessions.has(sessionId)) {
      this.disconnectedSessions.delete(sessionId);

      this.logger.info('Preserved session manually removed', {
        event: 'session_removed',
        sessionId,
      });
    }
  }

  /**
   * Stop cleanup interval and clear all preserved sessions
   */
  public shutdown(): void {
    clearInterval(this.cleanupInterval);
    this.disconnectedSessions.clear();

    this.logger.info('Reconnection manager shutdown', {
      event: 'reconnection_manager_shutdown',
    });
  }
}
