/**
 * Gemini Live Authentication Manager
 *
 * This module handles OAuth2 authentication with Google Cloud for accessing
 * the Gemini Live API via Vertex AI. It manages access token lifecycle including
 * automatic refresh before expiration.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { EventEmitter } from 'events';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

/**
 * Token refresh threshold in milliseconds (5 minutes).
 * Tokens will be refreshed when they are within this time of expiration.
 * Requirement 1.2
 */
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Scopes required for Vertex AI access.
 * Requirement 1.4: Use IAM role roles/aiplatform.user for Vertex AI access
 */
const VERTEX_AI_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

/**
 * Authentication error event data structure.
 */
export interface AuthErrorEvent {
  errorCode: string;
  errorMessage: string;
  timestamp: string;
  sessionId?: string;
  recoverable: boolean;
}

/**
 * GeminiAuthManager handles OAuth2 authentication with Google Cloud.
 *
 * This class manages the lifecycle of access tokens for authenticating
 * with the Gemini Live API via Vertex AI. It supports:
 * - Automatic token refresh before expiration (5-minute threshold)
 * - Error handling with proper logging
 * - Event emission for authentication errors
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export class GeminiAuthManager extends EventEmitter {
  private auth: GoogleAuth;
  private client: OAuth2Client | null = null;
  private cachedToken: string | null = null;
  private tokenExpiryTime: number | null = null;
  private sessionId?: string;

  /**
   * Creates a new GeminiAuthManager instance.
   *
   * @param sessionId - Optional session ID for logging context
   */
  constructor(sessionId?: string) {
    super();
    this.sessionId = sessionId;

    // Initialize GoogleAuth with Vertex AI scopes
    // Requirement 1.4: Use IAM role roles/aiplatform.user for Vertex AI access
    this.auth = new GoogleAuth({
      scopes: VERTEX_AI_SCOPES,
    });

    logger.debug('GeminiAuthManager initialized', {
      sessionId: this.sessionId,
      event: 'auth_manager_init',
      scopes: VERTEX_AI_SCOPES,
    });
  }

  /**
   * Get a valid access token for authenticating with Vertex AI.
   *
   * This method returns a cached token if it's still valid, or obtains
   * a new token if the cached one is expired or about to expire.
   *
   * Requirement 1.1: Obtain OAuth2 Access_Token using google-auth-library
   * Requirement 1.2: Auto-refresh when within 5 minutes of expiration
   * Requirement 1.5: Token will be used as Bearer token in Authorization header
   *
   * @returns Promise resolving to a valid access token
   * @throws Error if token retrieval fails
   */
  async getAccessToken(): Promise<string> {
    try {
      // Check if we have a valid cached token
      if (this.cachedToken && !this.isTokenExpiringSoon()) {
        logger.debug('Using cached access token', {
          sessionId: this.sessionId,
          event: 'token_cache_hit',
          expiresIn: this.tokenExpiryTime
            ? Math.round((this.tokenExpiryTime - Date.now()) / 1000)
            : null,
        });
        return this.cachedToken;
      }

      // Need to get a new token
      logger.debug('Obtaining new access token', {
        sessionId: this.sessionId,
        event: 'token_fetch_start',
        reason: this.cachedToken ? 'token_expiring_soon' : 'no_cached_token',
      });

      // Get the auth client if not already initialized
      if (!this.client) {
        this.client = (await this.auth.getClient()) as OAuth2Client;
      }

      // Get access token
      const tokenResponse = await this.client.getAccessToken();

      if (!tokenResponse.token) {
        throw new Error('No access token returned from Google Auth');
      }

      // Cache the token and its expiry time
      this.cachedToken = tokenResponse.token;

      // Calculate expiry time from the response or default to 1 hour
      // Google OAuth2 tokens typically expire in 1 hour (3600 seconds)
      const expiresInMs = tokenResponse.res?.data?.expires_in
        ? tokenResponse.res.data.expires_in * 1000
        : 3600 * 1000;

      this.tokenExpiryTime = Date.now() + expiresInMs;

      logger.info('Access token obtained successfully', {
        sessionId: this.sessionId,
        event: 'token_obtained',
        expiresIn: Math.round(expiresInMs / 1000),
      });

      return this.cachedToken;
    } catch (error) {
      // Requirement 1.3: Log error with full context and emit authentication error event
      this.handleAuthError(error as Error);
      throw error;
    }
  }

  /**
   * Check if the current token is expiring soon (within 5 minutes).
   *
   * Requirement 1.2: Check 5-minute threshold for token refresh
   *
   * @returns true if token is expiring within 5 minutes or already expired
   */
  isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiryTime) {
      return true; // No token, consider it as expiring
    }

    const timeUntilExpiry = this.tokenExpiryTime - Date.now();
    const isExpiringSoon = timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD_MS;

    if (isExpiringSoon) {
      logger.debug('Token is expiring soon', {
        sessionId: this.sessionId,
        event: 'token_expiring_soon',
        timeUntilExpiryMs: timeUntilExpiry,
        thresholdMs: TOKEN_REFRESH_THRESHOLD_MS,
      });
    }

    return isExpiringSoon;
  }

  /**
   * Force refresh the access token.
   *
   * This method clears the cached token and obtains a new one,
   * regardless of the current token's expiration status.
   *
   * @returns Promise resolving to a new access token
   * @throws Error if token refresh fails
   */
  async refreshToken(): Promise<string> {
    logger.info('Forcing token refresh', {
      sessionId: this.sessionId,
      event: 'token_refresh_start',
    });

    // Clear cached token to force a new fetch
    this.cachedToken = null;
    this.tokenExpiryTime = null;

    // Force refresh on the client if available
    if (this.client) {
      try {
        await this.client.refreshAccessToken();
      } catch (error) {
        // If refresh fails, we'll get a new client
        logger.warn('Token refresh failed, will get new client', {
          sessionId: this.sessionId,
          event: 'token_refresh_failed',
          error: (error as Error).message,
        });
        this.client = null;
      }
    }

    return this.getAccessToken();
  }

  /**
   * Get the Authorization header value for Vertex AI requests.
   *
   * Requirement 1.5: Include Access_Token in Authorization header as Bearer token
   *
   * @returns Promise resolving to the Authorization header value
   */
  async getAuthorizationHeader(): Promise<string> {
    const token = await this.getAccessToken();
    return `Bearer ${token}`;
  }

  /**
   * Handle authentication errors with proper logging and event emission.
   *
   * Requirement 1.3: Log error with full context and emit authentication error event
   *
   * @param error - The error that occurred
   */
  private handleAuthError(error: Error): void {
    const errorEvent: AuthErrorEvent = {
      errorCode: 'GEMINI_AUTH_FAILED',
      errorMessage: error.message,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      recoverable: true, // Auth errors are typically recoverable with retry
    };

    // Log error with full context
    logger.error('Authentication error occurred', {
      sessionId: this.sessionId,
      event: 'auth_error',
      errorCode: errorEvent.errorCode,
      errorMessage: error.message,
      stack: error.stack,
    });

    // Emit authentication error event
    this.emit('authError', errorEvent);
  }

  /**
   * Set the session ID for logging context.
   *
   * @param sessionId - The session ID to associate with this auth manager
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    logger.debug('Session ID set for auth manager', {
      sessionId,
      event: 'auth_session_set',
    });
  }

  /**
   * Get the current token expiry time.
   *
   * @returns The token expiry timestamp in milliseconds, or null if no token
   */
  getTokenExpiryTime(): number | null {
    return this.tokenExpiryTime;
  }

  /**
   * Check if there is a valid cached token.
   *
   * @returns true if there is a cached token that hasn't expired
   */
  hasValidToken(): boolean {
    return this.cachedToken !== null && !this.isTokenExpiringSoon();
  }

  /**
   * Clear the cached token and reset state.
   * Useful for testing or when authentication needs to be reset.
   */
  clearCache(): void {
    this.cachedToken = null;
    this.tokenExpiryTime = null;
    this.client = null;

    logger.debug('Auth cache cleared', {
      sessionId: this.sessionId,
      event: 'auth_cache_cleared',
    });
  }
}

/**
 * Create a new GeminiAuthManager instance.
 *
 * @param sessionId - Optional session ID for logging context
 * @returns A new GeminiAuthManager instance
 */
export function createGeminiAuthManager(sessionId?: string): GeminiAuthManager {
  return new GeminiAuthManager(sessionId);
}
