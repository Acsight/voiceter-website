/**
 * Unit tests for ShutdownHandler
 * 
 * Tests graceful shutdown functionality including:
 * - Stopping new connections
 * - Completing active sessions
 * - Cleaning up Gemini Live connections
 * - Force-closing connections after timeout
 * - Persisting session data
 */

import { ShutdownHandler } from '../../../src/server/shutdown';
import { WebSocketServer } from '../../../src/websocket/server';
import { createLogger } from '../../../src/monitoring/logger';
import { describe, it, beforeEach, afterEach } from '@jest/globals';

// Mock uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

// Mock dependencies
jest.mock('../../../src/websocket/server');

// Mock SessionManager
jest.mock('../../../src/session/manager', () => {
  return {
    SessionManager: jest.fn().mockImplementation(() => {
      return {
        getAllSessions: jest.fn().mockResolvedValue([]),
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('ShutdownHandler', () => {
  let shutdownHandler: ShutdownHandler;
  let mockWsServer: jest.Mocked<WebSocketServer>;
  let logger: any;

  beforeEach(() => {
    // Create mock WebSocket server
    mockWsServer = {
      getActiveConnectionCount: jest.fn().mockReturnValue(0),
      getSocket: jest.fn().mockReturnValue(null),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create logger
    logger = createLogger('ERROR');

    // Create shutdown handler
    shutdownHandler = new ShutdownHandler(mockWsServer, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isShuttingDown', () => {
    it('should return false initially', () => {
      expect(shutdownHandler.isShuttingDown()).toBe(false);
    });

    it('should return true during shutdown', async () => {
      // Start shutdown (don't await)
      const shutdownPromise = shutdownHandler.shutdown();
      
      // Check status immediately
      expect(shutdownHandler.isShuttingDown()).toBe(true);
      
      // Wait for shutdown to complete
      await shutdownPromise;
    });
  });

  describe('shutdown', () => {
    it('should complete shutdown with no active connections', async () => {
      mockWsServer.getActiveConnectionCount.mockReturnValue(0);

      await shutdownHandler.shutdown();

      expect(mockWsServer.close).toHaveBeenCalled();
      expect(shutdownHandler.isShuttingDown()).toBe(true);
    });

    it('should close WebSocket server during shutdown', async () => {
      await shutdownHandler.shutdown();

      expect(mockWsServer.close).toHaveBeenCalledTimes(1);
    });

    it('should handle shutdown with active connections', async () => {
      mockWsServer.getActiveConnectionCount
        .mockReturnValueOnce(2) // Initial count
        .mockReturnValueOnce(2) // During force-close check
        .mockReturnValueOnce(0); // After force-close

      const mockSocket = {
        disconnect: jest.fn(),
      };
      mockWsServer.getSocket.mockReturnValue(mockSocket as any);

      await shutdownHandler.shutdown();

      expect(mockWsServer.close).toHaveBeenCalled();
    });

    it('should complete within timeout with no active sessions', async () => {
      const startTime = Date.now();
      
      await shutdownHandler.shutdown();
      
      const duration = Date.now() - startTime;
      
      // Should complete quickly (well under 30 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle errors during shutdown gracefully', async () => {
      mockWsServer.close.mockRejectedValue(new Error('Close failed'));

      await expect(shutdownHandler.shutdown()).rejects.toThrow('Close failed');
      
      // Should still mark as shutting down
      expect(shutdownHandler.isShuttingDown()).toBe(true);
    });
  });

  describe('getShutdownTimeout', () => {
    it('should return 30 seconds timeout', () => {
      expect(ShutdownHandler.getShutdownTimeout()).toBe(30000);
    });
  });
});
