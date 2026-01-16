/**
 * WebSocket Rate Limiting
 * 
 * Tracks message count per session per second and rejects messages
 * exceeding the rate limit.
 * 
 * Requirement 14.7: Reject messages exceeding 100/second
 */

import type { RateLimitConfig, RateLimitState } from './types';
import { ERROR_CODES } from '../errors/codes';

/**
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxMessagesPerSecond: 100,
  windowMs: 1000, // 1 second
};

/**
 * Rate Limiter
 * 
 * Tracks message counts per session and enforces rate limits.
 * Uses a sliding window approach to track messages per second.
 */
export class RateLimiter {
  private rateLimitStates: Map<string, RateLimitState>;
  private config: RateLimitConfig;

  /**
   * Create a new RateLimiter
   * 
   * @param config - Rate limit configuration (optional)
   */
  constructor(config?: Partial<RateLimitConfig>) {
    this.rateLimitStates = new Map();
    this.config = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...config,
    };
  }

  /**
   * Check if a message should be rate limited
   * 
   * @param sessionId - Session identifier
   * @returns true if message should be allowed, false if rate limited
   * 
   * Requirement 14.7: Reject messages exceeding 100/second
   */
  checkRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const state = this.rateLimitStates.get(sessionId);

    // If no state exists, create new state and allow message
    if (!state) {
      this.rateLimitStates.set(sessionId, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return true;
    }

    // If window has expired, reset count
    if (now >= state.resetTime) {
      this.rateLimitStates.set(sessionId, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return true;
    }

    // If within window, check if limit exceeded
    if (state.count >= this.config.maxMessagesPerSecond) {
      // Rate limit exceeded
      return false;
    }

    // Increment count and allow message
    state.count++;
    return true;
  }

  /**
   * Get rate limit error details
   * 
   * @param sessionId - Session identifier
   * @returns Error details with retry-after time
   */
  getRateLimitError(sessionId: string): {
    errorCode: string;
    errorMessage: string;
    retryAfter: number;
  } {
    const state = this.rateLimitStates.get(sessionId);
    const retryAfter = state
      ? Math.ceil((state.resetTime - Date.now()) / 1000)
      : 1;

    return {
      errorCode: ERROR_CODES.WS_RATE_LIMIT_EXCEEDED,
      errorMessage: `Rate limit exceeded. Maximum ${this.config.maxMessagesPerSecond} messages per second allowed.`,
      retryAfter: Math.max(retryAfter, 1), // At least 1 second
    };
  }

  /**
   * Reset rate limit state for a session
   * 
   * @param sessionId - Session identifier
   * 
   * @remarks
   * Called when a session is closed to clean up state
   */
  resetSession(sessionId: string): void {
    this.rateLimitStates.delete(sessionId);
  }

  /**
   * Clean up expired rate limit states
   * 
   * @remarks
   * Should be called periodically to prevent memory leaks
   */
  cleanup(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    // Find expired sessions
    for (const [sessionId, state] of this.rateLimitStates.entries()) {
      if (now >= state.resetTime + this.config.windowMs) {
        expiredSessions.push(sessionId);
      }
    }

    // Remove expired sessions
    for (const sessionId of expiredSessions) {
      this.rateLimitStates.delete(sessionId);
    }
  }

  /**
   * Get current rate limit state for a session
   * 
   * @param sessionId - Session identifier
   * @returns Current state or null if no state exists
   */
  getState(sessionId: string): RateLimitState | null {
    return this.rateLimitStates.get(sessionId) || null;
  }

  /**
   * Get number of messages remaining in current window
   * 
   * @param sessionId - Session identifier
   * @returns Number of messages remaining, or max if no state exists
   */
  getRemainingMessages(sessionId: string): number {
    const state = this.rateLimitStates.get(sessionId);
    if (!state) {
      return this.config.maxMessagesPerSecond;
    }

    const now = Date.now();
    if (now >= state.resetTime) {
      return this.config.maxMessagesPerSecond;
    }

    return Math.max(0, this.config.maxMessagesPerSecond - state.count);
  }

  /**
   * Get time until rate limit resets (in milliseconds)
   * 
   * @param sessionId - Session identifier
   * @returns Time until reset in milliseconds, or 0 if no state exists
   */
  getTimeUntilReset(sessionId: string): number {
    const state = this.rateLimitStates.get(sessionId);
    if (!state) {
      return 0;
    }

    const now = Date.now();
    return Math.max(0, state.resetTime - now);
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

/**
 * Initialize the global RateLimiter instance
 * 
 * @param config - Rate limit configuration (optional)
 * @returns RateLimiter instance
 */
export function initializeRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (rateLimiterInstance) {
    throw new Error('RateLimiter already initialized');
  }

  rateLimiterInstance = new RateLimiter(config);

  // Set up periodic cleanup (every 5 minutes)
  setInterval(() => {
    rateLimiterInstance?.cleanup();
  }, 5 * 60 * 1000);

  return rateLimiterInstance;
}

/**
 * Get the global RateLimiter instance
 * 
 * @returns RateLimiter instance
 * @throws Error if RateLimiter not initialized
 */
export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    throw new Error('RateLimiter not initialized. Call initializeRateLimiter() first.');
  }

  return rateLimiterInstance;
}
