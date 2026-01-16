/**
 * Unit tests for GeminiAuthManager
 *
 * Tests the Google Cloud authentication functionality including:
 * - Token retrieval (Requirement 1.1)
 * - Token refresh timing (Requirement 1.2)
 * - Error handling and event emission (Requirement 1.3)
 * - Authorization header format (Requirement 1.5)
 */

import {
  GeminiAuthManager,
  createGeminiAuthManager,
  AuthErrorEvent,
} from '../../../src/gemini-live/auth';

// Mock google-auth-library
const mockGetAccessToken = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockGetClient = jest.fn();

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient: mockGetClient,
  })),
  OAuth2Client: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/monitoring/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('GeminiAuthManager', () => {
  let authManager: GeminiAuthManager;
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock behavior
    mockGetClient.mockResolvedValue({
      getAccessToken: mockGetAccessToken,
      refreshAccessToken: mockRefreshAccessToken,
    });

    mockGetAccessToken.mockResolvedValue({
      token: 'test-access-token',
      res: {
        data: {
          expires_in: 3600, // 1 hour
        },
      },
    });

    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: 'refreshed-access-token',
      },
    });

    authManager = new GeminiAuthManager(testSessionId);
  });

  afterEach(() => {
    authManager.removeAllListeners();
  });

  describe('constructor', () => {
    it('should create instance with session ID', () => {
      const manager = new GeminiAuthManager('session-123');
      expect(manager).toBeInstanceOf(GeminiAuthManager);
    });

    it('should create instance without session ID', () => {
      const manager = new GeminiAuthManager();
      expect(manager).toBeInstanceOf(GeminiAuthManager);
    });
  });

  describe('getAccessToken', () => {
    it('should obtain access token using google-auth-library (Requirement 1.1)', async () => {
      const token = await authManager.getAccessToken();

      expect(token).toBe('test-access-token');
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it('should cache token and return cached value on subsequent calls', async () => {
      // First call
      const token1 = await authManager.getAccessToken();
      expect(token1).toBe('test-access-token');
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const token2 = await authManager.getAccessToken();
      expect(token2).toBe('test-access-token');
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should throw error when token retrieval fails', async () => {
      mockGetAccessToken.mockRejectedValue(new Error('Auth failed'));

      await expect(authManager.getAccessToken()).rejects.toThrow('Auth failed');
    });

    it('should throw error when no token is returned', async () => {
      mockGetAccessToken.mockResolvedValue({ token: null });

      await expect(authManager.getAccessToken()).rejects.toThrow(
        'No access token returned from Google Auth'
      );
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return true when no token exists', () => {
      expect(authManager.isTokenExpiringSoon()).toBe(true);
    });

    it('should return false when token has more than 5 minutes until expiry', async () => {
      await authManager.getAccessToken();
      expect(authManager.isTokenExpiringSoon()).toBe(false);
    });

    it('should return true when token is within 5 minutes of expiry (Requirement 1.2)', async () => {
      // Mock token that expires in 4 minutes
      mockGetAccessToken.mockResolvedValue({
        token: 'expiring-token',
        res: {
          data: {
            expires_in: 240, // 4 minutes
          },
        },
      });

      await authManager.getAccessToken();
      expect(authManager.isTokenExpiringSoon()).toBe(true);
    });
  });

  describe('refreshToken', () => {
    it('should clear cache and obtain new token', async () => {
      // Get initial token
      await authManager.getAccessToken();
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

      // Refresh token
      mockGetAccessToken.mockResolvedValue({
        token: 'new-access-token',
        res: { data: { expires_in: 3600 } },
      });

      const newToken = await authManager.refreshToken();

      expect(newToken).toBe('new-access-token');
      expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should handle refresh failure gracefully', async () => {
      // Get initial token
      await authManager.getAccessToken();

      // Mock refresh failure
      mockRefreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

      // Should still get a new token via getAccessToken
      mockGetAccessToken.mockResolvedValue({
        token: 'fallback-token',
        res: { data: { expires_in: 3600 } },
      });

      const token = await authManager.refreshToken();
      expect(token).toBe('fallback-token');
    });
  });

  describe('getAuthorizationHeader', () => {
    it('should return Bearer token format (Requirement 1.5)', async () => {
      const header = await authManager.getAuthorizationHeader();

      expect(header).toBe('Bearer test-access-token');
    });
  });

  describe('error handling and events (Requirement 1.3)', () => {
    it('should emit authError event on authentication failure', async () => {
      const errorHandler = jest.fn();
      authManager.on('authError', errorHandler);

      mockGetAccessToken.mockRejectedValue(new Error('Authentication failed'));

      await expect(authManager.getAccessToken()).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      const errorEvent: AuthErrorEvent = errorHandler.mock.calls[0][0];
      expect(errorEvent.errorCode).toBe('GEMINI_AUTH_FAILED');
      expect(errorEvent.errorMessage).toBe('Authentication failed');
      expect(errorEvent.sessionId).toBe(testSessionId);
      expect(errorEvent.timestamp).toBeDefined();
      expect(errorEvent.recoverable).toBe(true);
    });

    it('should include session ID in error event', async () => {
      const errorHandler = jest.fn();
      authManager.on('authError', errorHandler);

      mockGetAccessToken.mockRejectedValue(new Error('Auth error'));

      await expect(authManager.getAccessToken()).rejects.toThrow();

      const errorEvent: AuthErrorEvent = errorHandler.mock.calls[0][0];
      expect(errorEvent.sessionId).toBe(testSessionId);
    });
  });

  describe('setSessionId', () => {
    it('should update session ID', () => {
      const manager = new GeminiAuthManager();
      manager.setSessionId('new-session-id');

      // Verify by triggering an error and checking the event
      const errorHandler = jest.fn();
      manager.on('authError', errorHandler);

      mockGetAccessToken.mockRejectedValue(new Error('Test error'));

      manager.getAccessToken().catch(() => {
        const errorEvent: AuthErrorEvent = errorHandler.mock.calls[0][0];
        expect(errorEvent.sessionId).toBe('new-session-id');
      });
    });
  });

  describe('getTokenExpiryTime', () => {
    it('should return null when no token exists', () => {
      expect(authManager.getTokenExpiryTime()).toBeNull();
    });

    it('should return expiry time after token is obtained', async () => {
      await authManager.getAccessToken();
      const expiryTime = authManager.getTokenExpiryTime();

      expect(expiryTime).not.toBeNull();
      expect(expiryTime).toBeGreaterThan(Date.now());
    });
  });

  describe('hasValidToken', () => {
    it('should return false when no token exists', () => {
      expect(authManager.hasValidToken()).toBe(false);
    });

    it('should return true when valid token exists', async () => {
      await authManager.getAccessToken();
      expect(authManager.hasValidToken()).toBe(true);
    });

    it('should return false when token is expiring soon', async () => {
      mockGetAccessToken.mockResolvedValue({
        token: 'expiring-token',
        res: { data: { expires_in: 60 } }, // 1 minute
      });

      await authManager.getAccessToken();
      expect(authManager.hasValidToken()).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cached token', async () => {
      await authManager.getAccessToken();
      expect(authManager.hasValidToken()).toBe(true);

      authManager.clearCache();

      expect(authManager.hasValidToken()).toBe(false);
      expect(authManager.getTokenExpiryTime()).toBeNull();
    });
  });

  describe('createGeminiAuthManager factory', () => {
    it('should create new instance with session ID', () => {
      const manager = createGeminiAuthManager('factory-session');
      expect(manager).toBeInstanceOf(GeminiAuthManager);
    });

    it('should create new instance without session ID', () => {
      const manager = createGeminiAuthManager();
      expect(manager).toBeInstanceOf(GeminiAuthManager);
    });
  });
});
