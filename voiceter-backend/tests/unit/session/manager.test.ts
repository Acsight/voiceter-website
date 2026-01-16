/**
 * Unit tests for SessionManager
 */

import { SessionManager, initializeSessionManager, getSessionManager } from '../../../src/session/manager';
import { InMemorySessionStorage } from '../../../src/session/storage';
import { createLogger } from '../../../src/monitoring/logger';
import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger('DEBUG');
    sessionManager = new SessionManager(new InMemorySessionStorage(), logger);
  });

  afterEach(async () => {
    await sessionManager.shutdown();
  });

  describe('createSession', () => {
    it('should create a new session with unique ID', async () => {
      const sessionId = 'test-session-1';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
        userId: 'user-123',
      };

      const session = await sessionManager.createSession(sessionId, metadata);

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId);
      expect(session.questionnaireId).toBe(metadata.questionnaireId);
      expect(session.audioConfig.voiceId).toBe(metadata.voiceId);
      expect(session.userId).toBe(metadata.userId);
      expect(session.status).toBe('active');
      expect(session.currentQuestionIndex).toBe(0);
      expect(session.responses.size).toBe(0);
    });

    it('should initialize session with default values', async () => {
      const sessionId = 'test-session-2';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      const session = await sessionManager.createSession(sessionId, metadata);

      expect(session.responses).toBeInstanceOf(Map);
      expect(session.conversationHistory).toEqual([]);
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.lastActivityTime).toBeInstanceOf(Date);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', async () => {
      const sessionId = 'test-session-3';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      await sessionManager.createSession(sessionId, metadata);
      const retrieved = await sessionManager.getSession(sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(sessionId);
    });

    it('should return null for non-existent session', async () => {
      const retrieved = await sessionManager.getSession('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session properties', async () => {
      const sessionId = 'test-session-4';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      await sessionManager.createSession(sessionId, metadata);
      await sessionManager.updateSession(sessionId, {
        currentQuestionIndex: 5,
        status: 'completed',
      });

      const updated = await sessionManager.getSession(sessionId);
      expect(updated?.currentQuestionIndex).toBe(5);
      expect(updated?.status).toBe('completed');
    });

    it('should automatically update lastActivityTime', async () => {
      const sessionId = 'test-session-5';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      const session = await sessionManager.createSession(sessionId, metadata);
      const originalTime = session.lastActivityTime;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await sessionManager.updateSession(sessionId, {
        currentQuestionIndex: 1,
      });

      const updated = await sessionManager.getSession(sessionId);
      expect(updated?.lastActivityTime.getTime()).toBeGreaterThan(originalTime.getTime());
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        sessionManager.updateSession('non-existent', { status: 'completed' })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session', async () => {
      const sessionId = 'test-session-6';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      await sessionManager.createSession(sessionId, metadata);
      await sessionManager.deleteSession(sessionId);

      const retrieved = await sessionManager.getSession(sessionId);
      expect(retrieved).toBeNull();
    });
  });

  describe('listActiveSessions', () => {
    it('should return all active sessions', async () => {
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      await sessionManager.createSession('session-1', metadata);
      await sessionManager.createSession('session-2', metadata);
      await sessionManager.createSession('session-3', metadata);

      const sessions = await sessionManager.listActiveSessions();
      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionId)).toContain('session-1');
      expect(sessions.map((s) => s.sessionId)).toContain('session-2');
      expect(sessions.map((s) => s.sessionId)).toContain('session-3');
    });

    it('should return empty array when no sessions exist', async () => {
      const sessions = await sessionManager.listActiveSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('updateLastActivityTime', () => {
    it('should update only lastActivityTime', async () => {
      const sessionId = 'test-session-7';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      const session = await sessionManager.createSession(sessionId, metadata);
      const originalTime = session.lastActivityTime;
      const originalIndex = session.currentQuestionIndex;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await sessionManager.updateLastActivityTime(sessionId);

      const updated = await sessionManager.getSession(sessionId);
      expect(updated?.lastActivityTime.getTime()).toBeGreaterThan(originalTime.getTime());
      expect(updated?.currentQuestionIndex).toBe(originalIndex);
    });
  });

  describe('getSessionCount', () => {
    it('should return correct session count', async () => {
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      expect(await sessionManager.getSessionCount()).toBe(0);

      await sessionManager.createSession('session-1', metadata);
      expect(await sessionManager.getSessionCount()).toBe(1);

      await sessionManager.createSession('session-2', metadata);
      expect(await sessionManager.getSessionCount()).toBe(2);

      await sessionManager.deleteSession('session-1');
      expect(await sessionManager.getSessionCount()).toBe(1);
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('should clean up sessions inactive for 5+ minutes', async () => {
      const sessionId = 'test-session-8';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      await sessionManager.createSession(sessionId, metadata);

      // Manually set lastActivityTime to 6 minutes ago
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      await sessionManager.updateSession(sessionId, {
        lastActivityTime: sixMinutesAgo,
      });

      const cleanedCount = await sessionManager.cleanupInactiveSessions();
      expect(cleanedCount).toBe(1);

      const retrieved = await sessionManager.getSession(sessionId);
      expect(retrieved).toBeNull();
    });

    it('should not clean up active sessions', async () => {
      const sessionId = 'test-session-9';
      const metadata = {
        questionnaireId: 'demo1_csat_nps',
        voiceId: 'matthew',
      };

      await sessionManager.createSession(sessionId, metadata);

      const cleanedCount = await sessionManager.cleanupInactiveSessions();
      expect(cleanedCount).toBe(0);

      const retrieved = await sessionManager.getSession(sessionId);
      expect(retrieved).not.toBeNull();
    });
  });

  describe('initialize and shutdown', () => {
    it('should start and stop cleanup interval', async () => {
      const manager = new SessionManager(new InMemorySessionStorage(), logger);
      await manager.initialize();

      // Cleanup interval should be running
      // We can't directly test the interval, but we can verify no errors occur

      await manager.shutdown();
      // Cleanup interval should be stopped
    });
  });
});

describe('SessionManager singleton', () => {
  // Helper to reset singleton (for testing only)
  function resetSingleton() {
    // Access the module's internal state
    const managerModule = require('../../../src/session/manager');
    managerModule.sessionManagerInstance = null;
  }

  beforeEach(() => {
    resetSingleton();
  });

  afterEach(() => {
    resetSingleton();
  });

  it('should initialize singleton instance', () => {
    const logger = createLogger('DEBUG');
    const manager = initializeSessionManager(undefined, logger);
    expect(manager).toBeInstanceOf(SessionManager);
  });

  it('should throw error if initialized twice', () => {
    const logger = createLogger('DEBUG');
    initializeSessionManager(undefined, logger);
    expect(() => initializeSessionManager(undefined, logger)).toThrow(
      'SessionManager already initialized'
    );
  });

  it('should get singleton instance', () => {
    const logger = createLogger('DEBUG');
    const manager1 = initializeSessionManager(undefined, logger);
    const manager2 = getSessionManager();
    expect(manager2).toBe(manager1);
  });

  it('should throw error if getting instance before initialization', () => {
    expect(() => getSessionManager()).toThrow(
      'SessionManager not initialized'
    );
  });
});
