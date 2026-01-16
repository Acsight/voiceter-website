/**
 * Property-based tests for guardrails checking
 *
 * **Property 8: Guardrails checking**
 * **Validates: Requirements 8.6**
 *
 * Requirement 8.6: THE Backend SHALL apply guardrails checking to user inputs
 * and AI outputs, returning allowed/blocked status with appropriate reason
 * when blocked
 */

import * as fc from 'fast-check';
import { GuardrailsService } from '../../src/bedrock/guardrails';

// Mock AWS Bedrock client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  ApplyGuardrailCommand: jest.fn().mockImplementation((input) => ({
    input,
  })),
  GuardrailContentSource: {
    INPUT: 'INPUT',
    OUTPUT: 'OUTPUT',
  },
}));

// Mock logger
jest.mock('../../src/monitoring/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Property 8: Guardrails checking', () => {
  let guardrailsService: GuardrailsService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create service with guardrail ID to enable it
    guardrailsService = new GuardrailsService({
      guardrailId: 'test-guardrail-id',
      guardrailVersion: '1',
      region: 'us-east-1',
    });
  });

  /**
   * Arbitrary for valid session IDs
   */
  const validSessionIdArb = fc.uuid();

  /**
   * Arbitrary for valid text content (must have at least 2 non-whitespace chars)
   */
  const validTextArb = fc.string({ minLength: 3, maxLength: 1000 })
    .filter(s => s.trim().length >= 2);

  /**
   * Arbitrary for allowed guardrail responses
   */
  const allowedResponseArb = fc.constant({
    action: 'NONE',
    outputs: [],
    assessments: [],
  });

  /**
   * Arbitrary for blocked guardrail responses with topic policy
   */
  const blockedTopicResponseArb = fc.record({
    action: fc.constant('GUARDRAIL_INTERVENED'),
    outputs: fc.constant([{ text: 'Content blocked' }]),
    assessments: fc.constant([{
      topicPolicy: {
        topics: [{ name: 'harmful_content', action: 'BLOCKED' }],
      },
    }]),
  });

  /**
   * Arbitrary for blocked guardrail responses with content policy
   */
  const blockedContentResponseArb = fc.record({
    action: fc.constant('GUARDRAIL_INTERVENED'),
    outputs: fc.constant([{ text: 'Content blocked' }]),
    assessments: fc.constant([{
      contentPolicy: {
        filters: [{ type: 'HATE', action: 'BLOCKED' }],
      },
    }]),
  });

  /**
   * Arbitrary for blocked guardrail responses with PII
   */
  const blockedPiiResponseArb = fc.record({
    action: fc.constant('GUARDRAIL_INTERVENED'),
    outputs: fc.constant([{ text: 'Content blocked' }]),
    assessments: fc.constant([{
      sensitiveInformationPolicy: {
        piiEntities: [{ type: 'EMAIL', action: 'BLOCKED' }],
      },
    }]),
  });

  /**
   * Arbitrary for blocked guardrail responses with word policy
   */
  const blockedWordResponseArb = fc.record({
    action: fc.constant('GUARDRAIL_INTERVENED'),
    outputs: fc.constant([{ text: 'Content blocked' }]),
    assessments: fc.constant([{
      wordPolicy: {
        customWords: [{ match: 'badword', action: 'BLOCKED' }],
      },
    }]),
  });

  // Feature: direct-websocket-bedrock, Property 8: Guardrails returns valid result structure
  it('should return valid result structure for all guardrail checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        fc.constantFrom('INPUT', 'OUTPUT') as fc.Arbitrary<'INPUT' | 'OUTPUT'>,
        fc.oneof(allowedResponseArb, blockedTopicResponseArb),
        async (text, sessionId, source, mockResponse) => {
          mockSend.mockResolvedValueOnce(mockResponse);

          const result = source === 'INPUT'
            ? await guardrailsService.checkUserInput(text, sessionId)
            : await guardrailsService.checkAIOutput(text, sessionId);

          // Requirement 8.6: Result must have allowed/blocked status
          expect(result).toBeDefined();
          expect(typeof result.allowed).toBe('boolean');
          expect(result.action).toBeDefined();
          expect(['NONE', 'GUARDRAIL_INTERVENED']).toContain(result.action);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Allowed content returns allowed=true
  it('should return allowed=true for allowed content', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        async (text, sessionId) => {
          mockSend.mockResolvedValueOnce({
            action: 'NONE',
            outputs: [],
            assessments: [],
          });

          const result = await guardrailsService.checkUserInput(text, sessionId);

          // Allowed content should have allowed=true and action=NONE
          expect(result.allowed).toBe(true);
          expect(result.action).toBe('NONE');
          expect(result.blockedReason).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Blocked content returns allowed=false with reason
  it('should return allowed=false with reason for blocked content', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        fc.oneof(
          blockedTopicResponseArb,
          blockedContentResponseArb,
          blockedPiiResponseArb,
          blockedWordResponseArb
        ),
        async (text, sessionId, mockResponse) => {
          mockSend.mockResolvedValueOnce(mockResponse);

          const result = await guardrailsService.checkUserInput(text, sessionId);

          // Requirement 8.6: Blocked content should have allowed=false and reason
          expect(result.allowed).toBe(false);
          expect(result.action).toBe('GUARDRAIL_INTERVENED');
          expect(result.blockedReason).toBeDefined();
          expect(typeof result.blockedReason).toBe('string');
          expect(result.blockedReason!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Topic policy violations include topic name
  it('should include topic name in blocked reason for topic policy violations', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        fc.string({ minLength: 3, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z_]/g, '_')),
        async (text, sessionId, topicName) => {
          mockSend.mockResolvedValueOnce({
            action: 'GUARDRAIL_INTERVENED',
            outputs: [{ text: 'Content blocked' }],
            assessments: [{
              topicPolicy: {
                topics: [{ name: topicName, action: 'BLOCKED' }],
              },
            }],
          });

          const result = await guardrailsService.checkUserInput(text, sessionId);

          expect(result.allowed).toBe(false);
          expect(result.blockedReason).toContain('Blocked topics');
          expect(result.blockedReason).toContain(topicName);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Content policy violations include filter type
  it('should include filter type in blocked reason for content policy violations', async () => {
    const filterTypes = ['HATE', 'INSULTS', 'SEXUAL', 'VIOLENCE', 'MISCONDUCT'];

    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        fc.constantFrom(...filterTypes),
        async (text, sessionId, filterType) => {
          mockSend.mockResolvedValueOnce({
            action: 'GUARDRAIL_INTERVENED',
            outputs: [{ text: 'Content blocked' }],
            assessments: [{
              contentPolicy: {
                filters: [{ type: filterType, action: 'BLOCKED' }],
              },
            }],
          });

          const result = await guardrailsService.checkUserInput(text, sessionId);

          expect(result.allowed).toBe(false);
          expect(result.blockedReason).toContain('Content filters');
          expect(result.blockedReason).toContain(filterType);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: PII detection includes PII type
  it('should include PII type in blocked reason for PII detection', async () => {
    const piiTypes = ['EMAIL', 'PHONE', 'SSN', 'CREDIT_CARD', 'ADDRESS'];

    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        fc.constantFrom(...piiTypes),
        async (text, sessionId, piiType) => {
          mockSend.mockResolvedValueOnce({
            action: 'GUARDRAIL_INTERVENED',
            outputs: [{ text: 'Content blocked' }],
            assessments: [{
              sensitiveInformationPolicy: {
                piiEntities: [{ type: piiType, action: 'BLOCKED' }],
              },
            }],
          });

          const result = await guardrailsService.checkUserInput(text, sessionId);

          expect(result.allowed).toBe(false);
          expect(result.blockedReason).toContain('PII detected');
          expect(result.blockedReason).toContain(piiType);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Word policy violations are reported
  it('should report blocked words in blocked reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        async (text, sessionId) => {
          mockSend.mockResolvedValueOnce({
            action: 'GUARDRAIL_INTERVENED',
            outputs: [{ text: 'Content blocked' }],
            assessments: [{
              wordPolicy: {
                customWords: [{ match: 'blocked_word', action: 'BLOCKED' }],
              },
            }],
          });

          const result = await guardrailsService.checkUserInput(text, sessionId);

          expect(result.allowed).toBe(false);
          expect(result.blockedReason).toContain('Blocked words');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Empty/short text is allowed without API call
  it('should allow empty or very short text without API call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 1 }),
        validSessionIdArb,
        async (text, sessionId) => {
          const result = await guardrailsService.checkUserInput(text, sessionId);

          // Short text should be allowed without calling API
          expect(result.allowed).toBe(true);
          expect(result.action).toBe('NONE');
          expect(mockSend).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: API errors allow content through
  it('should allow content through on API errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        async (text, sessionId) => {
          mockSend.mockRejectedValueOnce(new Error('API Error'));

          const result = await guardrailsService.checkUserInput(text, sessionId);

          // On error, content should be allowed to avoid blocking legitimate conversations
          expect(result.allowed).toBe(true);
          expect(result.action).toBe('NONE');
          // Error should be noted in blockedReason
          expect(result.blockedReason).toContain('Guardrail check failed');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: User-friendly blocked messages
  it('should provide user-friendly blocked messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('INPUT', 'OUTPUT') as fc.Arbitrary<'INPUT' | 'OUTPUT'>,
        fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
        async (source, blockedReason) => {
          const message = guardrailsService.getBlockedMessage(source, blockedReason);

          // Message should be user-friendly
          expect(message).toBeDefined();
          expect(typeof message).toBe('string');
          expect(message.length).toBeGreaterThan(0);
          
          // Message should not contain technical details
          expect(message).not.toContain('error');
          expect(message).not.toContain('exception');
          expect(message).not.toContain('stack');
          
          // Message should be appropriate for the source
          if (source === 'INPUT') {
            expect(message).toContain('rephrase');
          } else {
            expect(message).toContain('rephrase');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Filtered text is returned when available
  it('should return filtered text when available', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        fc.string({ minLength: 5, maxLength: 100 }),
        async (text, sessionId, filteredText) => {
          mockSend.mockResolvedValueOnce({
            action: 'GUARDRAIL_INTERVENED',
            outputs: [{ text: filteredText }],
            assessments: [{
              topicPolicy: {
                topics: [{ name: 'test', action: 'BLOCKED' }],
              },
            }],
          });

          const result = await guardrailsService.checkUserInput(text, sessionId);

          expect(result.filteredText).toBe(filteredText);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Assessments are returned
  it('should return assessments in result', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        async (text, sessionId) => {
          const assessments = [{
            topicPolicy: {
              topics: [{ name: 'test', action: 'BLOCKED' }],
            },
          }];

          mockSend.mockResolvedValueOnce({
            action: 'GUARDRAIL_INTERVENED',
            outputs: [{ text: 'blocked' }],
            assessments,
          });

          const result = await guardrailsService.checkUserInput(text, sessionId);

          expect(result.assessments).toBeDefined();
          expect(Array.isArray(result.assessments)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: Disabled guardrails allow all content
  it('should allow all content when guardrails are disabled', async () => {
    // Create service without guardrail ID (disabled)
    const disabledService = new GuardrailsService({
      guardrailId: '',
      guardrailVersion: '1',
    });

    await fc.assert(
      fc.asyncProperty(
        validTextArb,
        validSessionIdArb,
        async (text, sessionId) => {
          const result = await disabledService.checkUserInput(text, sessionId);

          // Disabled guardrails should allow everything
          expect(result.allowed).toBe(true);
          expect(result.action).toBe('NONE');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 8: isEnabled returns correct status
  it('should correctly report enabled status', () => {
    // Enabled service
    expect(guardrailsService.isEnabled()).toBe(true);

    // Disabled service
    const disabledService = new GuardrailsService({
      guardrailId: '',
      guardrailVersion: '1',
    });
    expect(disabledService.isEnabled()).toBe(false);
  });
});
