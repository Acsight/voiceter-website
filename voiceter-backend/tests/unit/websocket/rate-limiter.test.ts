/**
 * Unit tests for WebSocket rate limiting
 */

import { RateLimiter } from '../../../src/websocket/rate-limiter';
import { ERROR_CODES } from '../../../src/errors/codes';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxMessagesPerSecond: 10, // Lower limit for testing
      windowMs: 1000,
    });
  });

  describe('checkRateLimit', () => {
    it('should allow messages within rate limit', () => {
      const sessionId = 'test-session-1';

      // Send 10 messages (at limit)
      for (let i = 0; i < 10; i++) {
        const allowed = rateLimiter.checkRateLimit(sessionId);
        expect(allowed).toBe(true);
      }
    });

    it('should reject messages exceeding rate limit', () => {
      const sessionId = 'test-session-2';

      // Send 10 messages (at limit)
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkRateLimit(sessionId);
      }

      // 11th message should be rejected
      const allowed = rateLimiter.checkRateLimit(sessionId);
      expect(allowed).toBe(false);
    });

    it('should reset count after window expires', async () => {
      const sessionId = 'test-session-3';

      // Create rate limiter with short window for testing
      const shortWindowLimiter = new RateLimiter({
        maxMessagesPerSecond: 5,
        windowMs: 100, // 100ms window
      });

      // Send 5 messages (at limit)
      for (let i = 0; i < 5; i++) {
        shortWindowLimiter.checkRateLimit(sessionId);
      }

      // 6th message should be rejected
      expect(shortWindowLimiter.checkRateLimit(sessionId)).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should allow messages again
      expect(shortWindowLimiter.checkRateLimit(sessionId)).toBe(true);
    });

    it('should track rate limits per session independently', () => {
      const session1 = 'test-session-4';
      const session2 = 'test-session-5';

      // Send 10 messages for session1 (at limit)
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkRateLimit(session1);
      }

      // Session1 should be rate limited
      expect(rateLimiter.checkRateLimit(session1)).toBe(false);

      // Session2 should still be allowed
      expect(rateLimiter.checkRateLimit(session2)).toBe(true);
    });
  });

  describe('getRateLimitError', () => {
    it('should return error with retry-after time', () => {
      const sessionId = 'test-session-6';

      // Exceed rate limit
      for (let i = 0; i < 11; i++) {
        rateLimiter.checkRateLimit(sessionId);
      }

      const error = rateLimiter.getRateLimitError(sessionId);

      expect(error.errorCode).toBe(ERROR_CODES.WS_RATE_LIMIT_EXCEEDED);
      expect(error.errorMessage).toContain('Rate limit exceeded');
      expect(error.retryAfter).toBeGreaterThan(0);
      expect(error.retryAfter).toBeLessThanOrEqual(1);
    });

    it('should return at least 1 second retry-after', () => {
      const sessionId = 'test-session-7';

      const error = rateLimiter.getRateLimitError(sessionId);

      expect(error.retryAfter).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resetSession', () => {
    it('should reset rate limit state for session', () => {
      const sessionId = 'test-session-8';

      // Exceed rate limit
      for (let i = 0; i < 11; i++) {
        rateLimiter.checkRateLimit(sessionId);
      }

      // Should be rate limited
      expect(rateLimiter.checkRateLimit(sessionId)).toBe(false);

      // Reset session
      rateLimiter.resetSession(sessionId);

      // Should allow messages again
      expect(rateLimiter.checkRateLimit(sessionId)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove expired rate limit states', async () => {
      const sessionId = 'test-session-9';

      // Create rate limiter with short window
      const shortWindowLimiter = new RateLimiter({
        maxMessagesPerSecond: 5,
        windowMs: 50, // 50ms window
      });

      // Send a message
      shortWindowLimiter.checkRateLimit(sessionId);

      // Verify state exists
      expect(shortWindowLimiter.getState(sessionId)).not.toBeNull();

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Run cleanup
      shortWindowLimiter.cleanup();

      // State should be removed
      expect(shortWindowLimiter.getState(sessionId)).toBeNull();
    });
  });

  describe('getRemainingMessages', () => {
    it('should return correct remaining message count', () => {
      const sessionId = 'test-session-10';

      // Initially should have full limit
      expect(rateLimiter.getRemainingMessages(sessionId)).toBe(10);

      // Send 3 messages
      for (let i = 0; i < 3; i++) {
        rateLimiter.checkRateLimit(sessionId);
      }

      // Should have 7 remaining
      expect(rateLimiter.getRemainingMessages(sessionId)).toBe(7);
    });

    it('should return 0 when rate limit exceeded', () => {
      const sessionId = 'test-session-11';

      // Exceed rate limit
      for (let i = 0; i < 11; i++) {
        rateLimiter.checkRateLimit(sessionId);
      }

      expect(rateLimiter.getRemainingMessages(sessionId)).toBe(0);
    });
  });

  describe('getTimeUntilReset', () => {
    it('should return time until rate limit resets', () => {
      const sessionId = 'test-session-12';

      // Send a message
      rateLimiter.checkRateLimit(sessionId);

      const timeUntilReset = rateLimiter.getTimeUntilReset(sessionId);

      expect(timeUntilReset).toBeGreaterThan(0);
      expect(timeUntilReset).toBeLessThanOrEqual(1000);
    });

    it('should return 0 for session with no state', () => {
      const sessionId = 'test-session-13';

      expect(rateLimiter.getTimeUntilReset(sessionId)).toBe(0);
    });
  });
});
