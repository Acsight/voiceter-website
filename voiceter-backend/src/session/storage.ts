/**
 * Session Storage Abstraction
 * 
 * Provides interface for session storage with implementations for:
 * - In-memory storage (single instance)
 * - Redis storage (multi-instance, optional)
 */

import { Session } from './types';

/**
 * Session storage interface
 */
export interface SessionStorage {
  /**
   * Store a session
   * 
   * @param sessionId - Session identifier
   * @param session - Session data
   */
  set(sessionId: string, session: Session): Promise<void>;

  /**
   * Retrieve a session
   * 
   * @param sessionId - Session identifier
   * @returns Session if found, null otherwise
   */
  get(sessionId: string): Promise<Session | null>;

  /**
   * Delete a session
   * 
   * @param sessionId - Session identifier
   */
  delete(sessionId: string): Promise<void>;

  /**
   * Get all sessions
   * 
   * @returns Array of all sessions
   */
  getAll(): Promise<Session[]>;
}

/**
 * In-memory session storage
 * 
 * Suitable for single-instance deployments.
 * Fast access (< 1ms) but not shared across instances.
 */
export class InMemorySessionStorage implements SessionStorage {
  private sessions: Map<string, Session> = new Map();

  async set(sessionId: string, session: Session): Promise<void> {
    // Deep clone to prevent external mutations
    const clonedSession = this.cloneSession(session);
    this.sessions.set(sessionId, clonedSession);
  }

  async get(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    // Return a deep clone to prevent external mutations
    return this.cloneSession(session);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getAll(): Promise<Session[]> {
    return Array.from(this.sessions.values()).map((session) =>
      this.cloneSession(session)
    );
  }

  /**
   * Deep clone a session
   * 
   * @param session - Session to clone
   * @returns Cloned session
   */
  private cloneSession(session: Session): Session {
    return {
      ...session,
      responses: new Map(session.responses),
      conversationHistory: [...session.conversationHistory],
      bedrockStreamIds: { ...session.bedrockStreamIds },
      audioConfig: { ...session.audioConfig },
      startTime: new Date(session.startTime),
      lastActivityTime: new Date(session.lastActivityTime),
      // Clone Gemini fields if present
      gemini: session.gemini
        ? { ...session.gemini }
        : undefined,
    };
  }
}

/**
 * Redis session storage
 * 
 * Suitable for multi-instance deployments.
 * Shared state across instances with ~10-50ms access time.
 * 
 * @remarks
 * This is a placeholder implementation. To use Redis:
 * 1. Install redis package: npm install redis
 * 2. Import and initialize Redis client
 * 3. Implement serialization/deserialization for Session objects
 * 4. Handle Map and Date serialization properly
 */
export class RedisSessionStorage implements SessionStorage {
  constructor(redisUrl: string) {
    // TODO: Initialize Redis client when Redis support is needed
    throw new Error(
      `Redis storage not yet implemented. Use InMemorySessionStorage for now. (URL: ${redisUrl})`
    );
  }

  async set(_sessionId: string, _session: Session): Promise<void> {
    // TODO: Implement Redis set
    // - Serialize session (handle Map and Date objects)
    // - Set with TTL (30 minutes)
    throw new Error('Not implemented');
  }

  async get(_sessionId: string): Promise<Session | null> {
    // TODO: Implement Redis get
    // - Deserialize session (reconstruct Map and Date objects)
    throw new Error('Not implemented');
  }

  async delete(_sessionId: string): Promise<void> {
    // TODO: Implement Redis delete
    throw new Error('Not implemented');
  }

  async getAll(): Promise<Session[]> {
    // TODO: Implement Redis scan/keys to get all sessions
    throw new Error('Not implemented');
  }
}
