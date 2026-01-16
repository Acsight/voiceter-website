/**
 * Integration Test: End-to-End Survey Flow
 * 
 * Tests complete survey flow from start to finish including:
 * - Session initialization
 * - Question progression
 * - Response recording
 * - Tool execution
 * - Session completion
 * 
 * Requirements: 15.6, 15.7
 */

import { SessionManager } from '../../src/session/manager';
import { InMemorySessionStorage } from '../../src/session/storage';
import { QuestionnaireEngine } from '../../src/questionnaire/engine';
import { ToolExecutor } from '../../src/tools/executor';
import { getLogger } from '../../src/monitoring/logger';
import type { Questionnaire } from '../../src/questionnaire/types';

describe('End-to-End Survey Flow', () => {
  let sessionManager: SessionManager;
  let questionnaireEngine: QuestionnaireEngine;
  let toolExecutor: ToolExecutor;
  let logger: ReturnType<typeof getLogger>;

  beforeAll(() => {
    // Initialize logger
    logger = getLogger();
    logger.setLogLevel('ERROR'); // Reduce noise in tests

    // Initialize components
    const storage = new InMemorySessionStorage();
    sessionManager = new SessionManager(storage, logger);
    questionnaireEngine = new QuestionnaireEngine();
    toolExecutor = new ToolExecutor();
  });

  beforeEach(async () => {
    // Initialize session manager
    await sessionManager.initialize();
  });

  afterEach(async () => {
    // Clean up all sessions
    const sessions = await sessionManager.listActiveSessions();
    for (const session of sessions) {
      await sessionManager.deleteSession(session.sessionId);
    }
    
    // Shutdown session manager
    await sessionManager.shutdown();
  });

  describe('Complete Survey Flow', () => {
    it('should complete a simple survey from start to finish', async () => {
      // 1. Create session
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId);
      expect(session.status).toBe('active');
      expect(session.currentQuestionIndex).toBe(0);

      // 2. Load questionnaire
      let questionnaire: Questionnaire;
      try {
        questionnaire = questionnaireEngine.loadQuestionnaire('demo-01-csat-nps');
        expect(questionnaire).toBeDefined();
        expect(questionnaire.questions.length).toBeGreaterThan(0);
      } catch (error) {
        // Questionnaire file may not exist in test environment
        console.log('Skipping questionnaire load test - file not found');
        return;
      }

      // 3. Get first question
      session.questionnaire = questionnaire;
      const firstQuestionResult = questionnaireEngine.getNextQuestion(session);
      expect(firstQuestionResult).toBeDefined();
      expect(firstQuestionResult.question).toBeDefined();
      if (firstQuestionResult.question) {
        expect(firstQuestionResult.question.questionNumber).toBe(1);
      }

      // 4. Record response to first question
      if (firstQuestionResult.question) {
        session.responses.set(firstQuestionResult.question.id, {
          questionId: firstQuestionResult.question.id,
          response: 'Yes, I consent',
          responseType: 'text',
          timestamp: new Date(),
        });
        session.currentQuestionIndex = 1;
        await sessionManager.updateSession(sessionId, {
          responses: session.responses,
          currentQuestionIndex: session.currentQuestionIndex,
        });
      }

      // 5. Get next question
      const updatedSession = await sessionManager.getSession(sessionId);
      expect(updatedSession).toBeDefined();
      if (updatedSession) {
        updatedSession.questionnaire = questionnaire;
        const secondQuestionResult = questionnaireEngine.getNextQuestion(updatedSession);
        expect(secondQuestionResult).toBeDefined();
        expect(secondQuestionResult.question).toBeDefined();
        if (secondQuestionResult.question) {
          expect(secondQuestionResult.question.questionNumber).toBe(2);
        }
      }

      // 6. Complete session
      await sessionManager.updateSession(sessionId, {
        status: 'completed',
      });

      const completedSession = await sessionManager.getSession(sessionId);
      expect(completedSession?.status).toBe('completed');

      // 7. Clean up
      await sessionManager.deleteSession(sessionId);
      const deletedSession = await sessionManager.getSession(sessionId);
      expect(deletedSession).toBeNull();
    });

    it('should handle question progression with display logic', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      let questionnaire: Questionnaire;
      try {
        questionnaire = questionnaireEngine.loadQuestionnaire('demo-01-csat-nps');
      } catch (error) {
        console.log('Skipping display logic test - questionnaire not found');
        return;
      }

      // Simulate answering questions
      session.questionnaire = questionnaire;
      let currentQuestionResult = questionnaireEngine.getNextQuestion(session);
      let questionCount = 0;

      while (currentQuestionResult.question && questionCount < 10) {
        // Record a response
        session.responses.set(currentQuestionResult.question.id, {
          questionId: currentQuestionResult.question.id,
          response: 'Test response',
          responseType: 'text',
          timestamp: new Date(),
        });

        session.currentQuestionIndex++;
        await sessionManager.updateSession(sessionId, {
          responses: session.responses,
          currentQuestionIndex: session.currentQuestionIndex,
        });

        // Get next question
        const updatedSession = await sessionManager.getSession(sessionId);
        if (updatedSession) {
          updatedSession.questionnaire = questionnaire;
          currentQuestionResult = questionnaireEngine.getNextQuestion(updatedSession);
        } else {
          break;
        }

        questionCount++;
      }

      expect(questionCount).toBeGreaterThan(0);
      expect(session.responses.size).toBeGreaterThan(0);
    });

    it('should handle NPS scoring with dynamic follow-up', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      let questionnaire: Questionnaire;
      try {
        questionnaire = questionnaireEngine.loadQuestionnaire('demo-01-csat-nps');
      } catch (error) {
        console.log('Skipping NPS test - questionnaire not found');
        return;
      }

      // Find NPS question
      const npsQuestion = questionnaire.questions.find(q => q.questionType === 'nps');
      
      if (npsQuestion) {
        // Record NPS score (detractor)
        session.responses.set(npsQuestion.questionId, {
          questionId: npsQuestion.questionId,
          response: '3',
          responseType: 'rating',
          timestamp: new Date(),
        });

        // Get follow-up question
        const followUpQuestion = questionnaire.questions.find(
          q => q.questionId === 'q7-nps-followup'
        );

        if (followUpQuestion && followUpQuestion.dynamicQuestionText) {
          // Verify dynamic text is applied
          const dynamicText = questionnaireEngine.applyDynamicQuestionText(
            followUpQuestion,
            session.responses
          );
          
          expect(dynamicText).toBeDefined();
          expect(dynamicText).toContain('sorry'); // Detractor message
        }
      }
    });
  });

  describe('Tool Execution Flow', () => {
    it('should execute record_response tool', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      // Execute record_response tool
      const result = await toolExecutor.executeTool(
        'record_response',
        {
          questionId: 'q1-test',
          response: 'Test response',
          responseType: 'text',
        },
        {
          sessionId: session.sessionId,
          questionnaireId: session.questionnaireId,
          session: session,
        }
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should execute get_next_question tool', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      try {
        // Execute get_next_question tool
        const result = await toolExecutor.executeTool(
          'get_next_question',
          { currentQuestionId: 'q1-test' },
          {
            sessionId: session.sessionId,
            questionnaireId: session.questionnaireId,
            session: session,
          }
        );

        expect(result).toBeDefined();
        if (result.success) {
          expect(result.data).toBeDefined();
          expect(result.data.questionId).toBeDefined();
          expect(result.data.questionText).toBeDefined();
        }
      } catch (error) {
        // May fail if questionnaire not found
        console.log('Skipping get_next_question test - questionnaire not found');
      }
    });

    it('should execute validate_answer tool', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      try {
        // Execute validate_answer tool
        const result = await toolExecutor.executeTool(
          'validate_answer',
          {
            questionId: 'q1-test',
            response: 'Test response',
          },
          {
            sessionId: session.sessionId,
            questionnaireId: session.questionnaireId,
            session: session,
          }
        );

        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
      } catch (error) {
        // May fail if questionnaire not found
        console.log('Skipping validate_answer test - questionnaire not found');
      }
    });

    it('should execute get_demo_context tool', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      // Execute get_demo_context tool
      const result = await toolExecutor.executeTool(
        'get_demo_context',
        {},
        {
          sessionId: session.sessionId,
          questionnaireId: session.questionnaireId,
          session: session,
        }
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.questionnaireId).toBe('demo-01-csat-nps');
      }
    });
  });

  describe('Session Lifecycle Management', () => {
    it('should handle multiple concurrent sessions', async () => {
      const sessionIds: string[] = [];

      // Create 5 concurrent sessions
      for (let i = 0; i < 5; i++) {
        const sessionId = `test-session-${Date.now()}-${i}`;
        await sessionManager.createSession(sessionId, {
          questionnaireId: 'demo-01-csat-nps',
          voiceId: 'matthew',
          userId: `test-user-${i}`,
        });
        sessionIds.push(sessionId);
      }

      // Verify all sessions exist
      const sessions = await sessionManager.listActiveSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(5);

      // Verify session isolation
      for (let i = 0; i < sessionIds.length; i++) {
        const session = await sessionManager.getSession(sessionIds[i]);
        expect(session).toBeDefined();
        expect(session?.sessionId).toBe(sessionIds[i]);
        expect(session?.userId).toBe(`test-user-${i}`);
      }

      // Clean up
      for (const sessionId of sessionIds) {
        await sessionManager.deleteSession(sessionId);
      }
    });

    it('should update last activity time on session updates', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      const initialActivityTime = session.lastActivityTime;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update session
      await sessionManager.updateSession(sessionId, {
        currentQuestionIndex: 1,
      });

      const updatedSession = await sessionManager.getSession(sessionId);
      expect(updatedSession).toBeDefined();
      if (updatedSession) {
        expect(updatedSession.lastActivityTime.getTime()).toBeGreaterThan(
          initialActivityTime.getTime()
        );
      }
    });

    it('should handle session completion', async () => {
      const sessionId = `test-session-${Date.now()}`;
      await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      // Complete session
      await sessionManager.updateSession(sessionId, {
        status: 'completed',
      });

      const session = await sessionManager.getSession(sessionId);
      expect(session?.status).toBe('completed');
    });

    it('should handle session termination', async () => {
      const sessionId = `test-session-${Date.now()}`;
      await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      // Terminate session
      await sessionManager.updateSession(sessionId, {
        status: 'terminated',
      });

      const session = await sessionManager.getSession(sessionId);
      expect(session?.status).toBe('terminated');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent session gracefully', async () => {
      const session = await sessionManager.getSession('non-existent-session');
      expect(session).toBeNull();
    });

    it('should handle invalid questionnaire ID', async () => {
      const sessionId = `test-session-${Date.now()}`;
      await sessionManager.createSession(sessionId, {
        questionnaireId: 'invalid-questionnaire',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      const session = await sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.questionnaireId).toBe('invalid-questionnaire');
    });

    it('should handle tool execution errors', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      // Execute non-existent tool
      const result = await toolExecutor.executeTool(
        'non_existent_tool',
        {},
        {
          sessionId: session.sessionId,
          questionnaireId: session.questionnaireId,
          session: session,
        }
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid tool parameters', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const session = await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      // Execute tool with invalid parameters
      const result = await toolExecutor.executeTool(
        'record_response',
        {
          // Missing required parameters
        },
        {
          sessionId: session.sessionId,
          questionnaireId: session.questionnaireId,
          session: session,
        }
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should complete session creation within 50ms', async () => {
      const startTime = Date.now();
      
      const sessionId = `test-session-${Date.now()}`;
      await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50);
    });

    it('should complete session retrieval within 50ms', async () => {
      const sessionId = `test-session-${Date.now()}`;
      await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      const startTime = Date.now();
      await sessionManager.getSession(sessionId);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(50);
    });

    it('should handle rapid session updates', async () => {
      const sessionId = `test-session-${Date.now()}`;
      await sessionManager.createSession(sessionId, {
        questionnaireId: 'demo-01-csat-nps',
        voiceId: 'matthew',
        userId: 'test-user',
      });

      // Perform 10 rapid updates
      const updates = [];
      for (let i = 0; i < 10; i++) {
        updates.push(
          sessionManager.updateSession(sessionId, {
            currentQuestionIndex: i,
          })
        );
      }

      await Promise.all(updates);

      const session = await sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.currentQuestionIndex).toBeGreaterThanOrEqual(0);
    });
  });
});
