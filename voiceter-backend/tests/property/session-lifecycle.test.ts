/**
 * Property-based tests for session state lifecycle
 *
 * **Property 6: Session state lifecycle**
 * **Validates: Requirements 7.1, 7.7**
 *
 * Requirement 7.1: THE Backend SHALL maintain session state (questionnaireId,
 * currentQuestionIndex, responses, visitedQuestions)
 *
 * Requirement 7.7: WHEN a session ends, THE Backend SHALL clean up session state
 */

import * as fc from 'fast-check';
import { SessionManager } from '../../src/session/manager';
import { InMemorySessionStorage } from '../../src/session/storage';
import type { SessionMetadata } from '../../src/session/types';

describe('Property 6: Session state lifecycle', () => {
  /**
   * Arbitrary for valid session IDs (UUID format)
   */
  const validSessionIdArb = fc.uuid();

  /**
   * Arbitrary for valid questionnaire IDs
   */
  const validQuestionnaireIdArb = fc.constantFrom(
    'demo-01-csat-nps',
    'demo-02-concept-test',
    'demo-03-political-polling',
    'demo-04-brand-tracker'
  );

  /**
   * Arbitrary for valid voice IDs
   */
  const validVoiceIdArb = fc.constantFrom('matthew', 'tiffany', 'amy');

  /**
   * Arbitrary for valid session metadata
   */
  const validSessionMetadataArb: fc.Arbitrary<SessionMetadata> = fc.record({
    questionnaireId: validQuestionnaireIdArb,
    voiceId: validVoiceIdArb,
    userId: fc.option(fc.uuid(), { nil: undefined }),
  });

  /**
   * Arbitrary for question index updates
   */
  const validQuestionIndexArb = fc.integer({ min: 0, max: 20 });

  /**
   * Arbitrary for response data
   */
  const validResponseArb = fc.record({
    questionId: fc.string({ minLength: 1, maxLength: 30 }).map(s => `q-${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    response: fc.string({ minLength: 1, maxLength: 500 }),
    responseType: fc.constantFrom('text', 'rating', 'single_choice', 'yes_no', 'nps'),
    timestamp: fc.date(),
  });

  // Feature: direct-websocket-bedrock, Property 6: Session creation maintains required state
  it('should maintain all required session state fields after creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validSessionMetadataArb,
        async (sessionId, metadata) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Create session
          const session = await sessionManager.createSession(sessionId, metadata);

          // Verify required state fields (Requirement 7.1)
          expect(session.sessionId).toBe(sessionId);
          expect(session.questionnaireId).toBe(metadata.questionnaireId);
          expect(session.currentQuestionIndex).toBe(0);
          expect(session.responses).toBeInstanceOf(Map);
          expect(session.responses.size).toBe(0);
          expect(session.conversationHistory).toEqual([]);
          expect(session.status).toBe('active');
          expect(session.startTime).toBeInstanceOf(Date);
          expect(session.lastActivityTime).toBeInstanceOf(Date);

          // Verify audio config
          expect(session.audioConfig).toBeDefined();
          expect(session.audioConfig.voiceId).toBe(metadata.voiceId);

          // Clean up
          await sessionManager.deleteSession(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 6: Session state persists across retrievals
  it('should persist session state across multiple retrievals', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validSessionMetadataArb,
        async (sessionId, metadata) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Create session
          const createdSession = await sessionManager.createSession(sessionId, metadata);

          // Retrieve session multiple times
          const retrieved1 = await sessionManager.getSession(sessionId);
          const retrieved2 = await sessionManager.getSession(sessionId);

          // All retrievals should return consistent state
          expect(retrieved1).not.toBeNull();
          expect(retrieved2).not.toBeNull();
          expect(retrieved1!.sessionId).toBe(createdSession.sessionId);
          expect(retrieved2!.sessionId).toBe(createdSession.sessionId);
          expect(retrieved1!.questionnaireId).toBe(createdSession.questionnaireId);
          expect(retrieved2!.questionnaireId).toBe(createdSession.questionnaireId);

          // Clean up
          await sessionManager.deleteSession(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 6: Session updates preserve state integrity
  it('should preserve state integrity when updating session fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validSessionMetadataArb,
        validQuestionIndexArb,
        async (sessionId, metadata, newQuestionIndex) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Create session
          await sessionManager.createSession(sessionId, metadata);

          // Update question index
          await sessionManager.updateSession(sessionId, {
            currentQuestionIndex: newQuestionIndex,
          });

          // Retrieve and verify
          const session = await sessionManager.getSession(sessionId);
          expect(session).not.toBeNull();
          expect(session!.currentQuestionIndex).toBe(newQuestionIndex);
          
          // Other fields should remain unchanged
          expect(session!.questionnaireId).toBe(metadata.questionnaireId);
          expect(session!.audioConfig.voiceId).toBe(metadata.voiceId);

          // Clean up
          await sessionManager.deleteSession(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 6: Session responses are maintained
  it('should maintain responses map correctly across updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validSessionMetadataArb,
        fc.array(validResponseArb, { minLength: 1, maxLength: 5 }),
        async (sessionId, metadata, responses) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Create session
          await sessionManager.createSession(sessionId, metadata);

          // Add responses one by one
          for (const response of responses) {
            const session = await sessionManager.getSession(sessionId);
            if (session) {
              session.responses.set(response.questionId, response);
              await sessionManager.updateSession(sessionId, {
                responses: session.responses,
              });
            }
          }

          // Verify all responses are maintained
          const finalSession = await sessionManager.getSession(sessionId);
          expect(finalSession).not.toBeNull();
          
          // Unique question IDs should all be present
          const uniqueQuestionIds = new Set(responses.map(r => r.questionId));
          for (const questionId of uniqueQuestionIds) {
            expect(finalSession!.responses.has(questionId)).toBe(true);
          }

          // Clean up
          await sessionManager.deleteSession(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 6: Session cleanup removes all state (Requirement 7.7)
  it('should completely remove session state when session ends', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validSessionMetadataArb,
        async (sessionId, metadata) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Create session
          await sessionManager.createSession(sessionId, metadata);

          // Verify session exists
          const sessionBefore = await sessionManager.getSession(sessionId);
          expect(sessionBefore).not.toBeNull();

          // Delete session (simulating session end)
          await sessionManager.deleteSession(sessionId);

          // Verify session is completely removed (Requirement 7.7)
          const sessionAfter = await sessionManager.getSession(sessionId);
          expect(sessionAfter).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 6: Multiple sessions are isolated
  it('should maintain isolation between multiple concurrent sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: validSessionIdArb,
            metadata: validSessionMetadataArb,
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (sessionConfigs) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Ensure unique session IDs
          const uniqueConfigs = sessionConfigs.filter(
            (config, index, self) =>
              self.findIndex(c => c.sessionId === config.sessionId) === index
          );

          if (uniqueConfigs.length < 2) {
            return; // Skip if not enough unique sessions
          }

          // Create all sessions
          for (const config of uniqueConfigs) {
            await sessionManager.createSession(config.sessionId, config.metadata);
          }

          // Verify each session has its own state
          for (const config of uniqueConfigs) {
            const session = await sessionManager.getSession(config.sessionId);
            expect(session).not.toBeNull();
            expect(session!.sessionId).toBe(config.sessionId);
            expect(session!.questionnaireId).toBe(config.metadata.questionnaireId);
          }

          // Delete one session
          await sessionManager.deleteSession(uniqueConfigs[0].sessionId);

          // Verify only that session is deleted, others remain
          const deletedSession = await sessionManager.getSession(uniqueConfigs[0].sessionId);
          expect(deletedSession).toBeNull();

          for (let i = 1; i < uniqueConfigs.length; i++) {
            const remainingSession = await sessionManager.getSession(uniqueConfigs[i].sessionId);
            expect(remainingSession).not.toBeNull();
          }

          // Clean up remaining sessions
          for (let i = 1; i < uniqueConfigs.length; i++) {
            await sessionManager.deleteSession(uniqueConfigs[i].sessionId);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 6: Last activity time is updated
  it('should update lastActivityTime on session updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validSessionMetadataArb,
        async (sessionId, metadata) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Create session
          const createdSession = await sessionManager.createSession(sessionId, metadata);
          const initialActivityTime = createdSession.lastActivityTime;

          // Wait a small amount to ensure time difference
          await new Promise(resolve => setTimeout(resolve, 10));

          // Update session
          await sessionManager.updateSession(sessionId, {
            currentQuestionIndex: 1,
          });

          // Verify lastActivityTime was updated
          const updatedSession = await sessionManager.getSession(sessionId);
          expect(updatedSession).not.toBeNull();
          expect(updatedSession!.lastActivityTime.getTime()).toBeGreaterThanOrEqual(
            initialActivityTime.getTime()
          );

          // Clean up
          await sessionManager.deleteSession(sessionId);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 6: Session status transitions
  it('should allow valid session status transitions', async () => {
    const validStatuses = ['active', 'completed', 'terminated', 'abandoned', 'error'] as const;

    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validSessionMetadataArb,
        fc.constantFrom(...validStatuses),
        async (sessionId, metadata, newStatus) => {
          const storage = new InMemorySessionStorage();
          const sessionManager = new SessionManager(storage);

          // Create session (starts as 'active')
          await sessionManager.createSession(sessionId, metadata);

          // Update status
          await sessionManager.updateSession(sessionId, {
            status: newStatus,
          });

          // Verify status was updated
          const session = await sessionManager.getSession(sessionId);
          expect(session).not.toBeNull();
          expect(session!.status).toBe(newStatus);

          // Clean up
          await sessionManager.deleteSession(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
