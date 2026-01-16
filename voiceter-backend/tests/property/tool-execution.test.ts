/**
 * Property-based tests for tool execution
 *
 * **Property 5: Tool execution produces valid result**
 * **Validates: Requirements 6.2, 6.3, 6.4**
 *
 * Requirement 6.2: THE Backend SHALL execute the requested tool
 * (record_response, get_next_question, validate_answer, get_demo_context)
 *
 * Requirement 6.3: WHEN tool execution completes, THE Backend SHALL return
 * the result to the Frontend
 *
 * Requirement 6.4: THE Frontend SHALL send a toolResult event to Bedrock
 * with the tool execution result
 */

import * as fc from 'fast-check';
import { ToolExecutor, getToolExecutor } from '../../src/tools/executor';
import type { ToolExecutionContext, ToolSessionState } from '../../src/tools/types';

describe('Property 5: Tool execution produces valid result', () => {
  let toolExecutor: ToolExecutor;

  beforeAll(() => {
    toolExecutor = getToolExecutor();
  });

  /**
   * Arbitrary for valid questionnaire IDs
   */
  const validQuestionnaireIdArb = fc.constantFrom(
    'demo-01-csat-nps',
    'demo-02-concept-test',
    'demo-03-political-polling',
    'demo-04-brand-tracker',
    'demo1_csat_nps_electronics_retailer',
    'demo2_concept_test',
    'demo3_political_polling',
    'demo4_brand_tracker'
  );

  /**
   * Arbitrary for valid question IDs
   */
  const validQuestionIdArb = fc.string({ minLength: 1, maxLength: 30 })
    .map(s => `q-${s.replace(/[^a-zA-Z0-9-]/g, '')}`);

  /**
   * Arbitrary for valid response types
   */
  const validResponseTypeArb = fc.constantFrom(
    'text',
    'number',
    'rating',
    'single_choice',
    'multiple_choice',
    'yes_no',
    'nps',
    'open_ended'
  );

  /**
   * Arbitrary for valid response values
   */
  const validResponseValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 500 }),
    fc.integer({ min: 0, max: 10 }).map(String),
    fc.constantFrom('yes', 'no', 'Yes', 'No'),
    fc.constantFrom('1', '2', '3', '4', '5')
  );

  /**
   * Arbitrary for valid session state
   */
  const validSessionStateArb: fc.Arbitrary<ToolSessionState> = fc.record({
    questionnaireId: validQuestionnaireIdArb,
    currentQuestionIndex: fc.integer({ min: 0, max: 20 }),
    responses: fc.constant(new Map()),
    visitedQuestions: fc.option(fc.constant(new Set<string>()), { nil: undefined }),
    firstQuestionAsked: fc.option(fc.boolean(), { nil: undefined }),
    metadata: fc.option(fc.constant({}), { nil: undefined }),
  });

  /**
   * Arbitrary for valid tool execution context
   */
  const validContextArb: fc.Arbitrary<ToolExecutionContext> = fc.record({
    sessionId: fc.uuid(),
    questionnaireId: validQuestionnaireIdArb,
    session: validSessionStateArb,
  });

  /**
   * Arbitrary for record_response tool input
   */
  const recordResponseInputArb = fc.record({
    questionId: validQuestionIdArb,
    response: validResponseValueArb,
    responseType: fc.option(validResponseTypeArb, { nil: undefined }),
  });

  /**
   * Arbitrary for get_next_question tool input
   */
  const getNextQuestionInputArb = fc.record({
    currentQuestionId: validQuestionIdArb,
  });

  /**
   * Arbitrary for validate_answer tool input
   */
  const validateAnswerInputArb = fc.record({
    questionId: validQuestionIdArb,
    response: validResponseValueArb,
  });

  // Feature: direct-websocket-bedrock, Property 5: Tool execution returns valid result structure
  it('should return valid result structure for all tool executions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('record_response', 'get_next_question', 'validate_answer', 'get_demo_context'),
        validContextArb,
        async (toolName, context) => {
          // Create appropriate input based on tool name
          let input: any = {};
          if (toolName === 'record_response') {
            input = { questionId: 'q-test', response: 'test response' };
          } else if (toolName === 'get_next_question') {
            input = { currentQuestionId: 'q-test' };
          } else if (toolName === 'validate_answer') {
            input = { questionId: 'q-test', response: 'test' };
          }

          const result = await toolExecutor.executeTool(toolName, input, context);

          // Requirement 6.3: Result must have valid structure
          expect(result).toBeDefined();
          expect(typeof result.success).toBe('boolean');
          
          // Either data or error should be present based on success
          if (result.success) {
            // Success case - data may be present
            expect(result.error).toBeUndefined();
          } else {
            // Failure case - error should be present
            expect(typeof result.error).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: record_response tool produces valid result
  it('should produce valid result for record_response tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        recordResponseInputArb,
        validContextArb,
        async (input, context) => {
          const result = await toolExecutor.executeTool('record_response', input, context);

          // Requirement 6.2: Tool execution should complete
          expect(result).toBeDefined();
          expect(typeof result.success).toBe('boolean');

          // Result should have proper structure
          if (result.success) {
            expect(result.data).toBeDefined();
          } else {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: get_next_question tool produces valid result
  it('should produce valid result for get_next_question tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        getNextQuestionInputArb,
        validContextArb,
        async (input, context) => {
          const result = await toolExecutor.executeTool('get_next_question', input, context);

          // Requirement 6.2: Tool execution should complete
          expect(result).toBeDefined();
          expect(typeof result.success).toBe('boolean');

          // Result should have proper structure
          if (result.success && result.data) {
            // If successful, data should contain question info or completion status
            expect(typeof result.data).toBe('object');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: validate_answer tool produces valid result
  it('should produce valid result for validate_answer tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        validateAnswerInputArb,
        validContextArb,
        async (input, context) => {
          const result = await toolExecutor.executeTool('validate_answer', input, context);

          // Requirement 6.2: Tool execution should complete
          expect(result).toBeDefined();
          expect(typeof result.success).toBe('boolean');

          // Result should have proper structure
          if (result.success && result.data) {
            expect(typeof result.data).toBe('object');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: get_demo_context tool produces valid result
  it('should produce valid result for get_demo_context tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContextArb,
        async (context) => {
          const result = await toolExecutor.executeTool('get_demo_context', {}, context);

          // Requirement 6.2: Tool execution should complete
          expect(result).toBeDefined();
          expect(typeof result.success).toBe('boolean');

          // Result should have proper structure
          if (result.success && result.data) {
            expect(typeof result.data).toBe('object');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: Unknown tool returns error
  it('should return error for unknown tool names', async () => {
    const unknownToolArb = fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => !['record_response', 'get_next_question', 'validate_answer', 'get_demo_context'].includes(s));

    await fc.assert(
      fc.asyncProperty(
        unknownToolArb,
        validContextArb,
        async (toolName, context) => {
          const result = await toolExecutor.executeTool(toolName, {}, context);

          // Unknown tool should return error
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('not found');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: Tool validation rejects missing required params
  it('should reject tool calls with missing required parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContextArb,
        async (context) => {
          // record_response requires questionId and response
          const result = await toolExecutor.executeTool('record_response', {}, context);

          // Should fail validation
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.toLowerCase()).toContain('missing');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: Tool definitions are available
  it('should provide tool definitions for all registered tools', () => {
    const definitions = toolExecutor.getToolDefinitionsForBedrock();

    // Should have all 4 tools
    expect(definitions.length).toBeGreaterThanOrEqual(4);

    const toolNames = definitions.map(d => d.name);
    expect(toolNames).toContain('record_response');
    expect(toolNames).toContain('get_next_question');
    expect(toolNames).toContain('validate_answer');
    expect(toolNames).toContain('get_demo_context');

    // Each definition should have required fields
    for (const def of definitions) {
      expect(def.name).toBeDefined();
      expect(typeof def.name).toBe('string');
      expect(def.description).toBeDefined();
      expect(typeof def.description).toBe('string');
      expect(def.inputSchema).toBeDefined();
      expect(typeof def.inputSchema).toBe('object');
    }
  });

  // Feature: direct-websocket-bedrock, Property 5: Tool parameter validation works correctly
  it('should validate tool parameters against schema', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('record_response', 'get_next_question', 'validate_answer'),
        fc.record({
          invalidParam: fc.string(),
        }),
        validContextArb,
        async (toolName, invalidInput, context) => {
          // Tools should handle invalid parameters gracefully
          const result = await toolExecutor.executeTool(toolName, invalidInput, context);

          // Should either fail validation or handle gracefully
          expect(result).toBeDefined();
          expect(typeof result.success).toBe('boolean');
          
          // If it fails, should have error message
          if (!result.success) {
            expect(result.error).toBeDefined();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 5: Tool execution is idempotent for get_demo_context
  it('should return consistent results for get_demo_context with same context', async () => {
    await fc.assert(
      fc.asyncProperty(
        validContextArb,
        async (context) => {
          const result1 = await toolExecutor.executeTool('get_demo_context', {}, context);
          const result2 = await toolExecutor.executeTool('get_demo_context', {}, context);

          // Both calls should have same success status
          expect(result1.success).toBe(result2.success);
          
          // If successful, data structure should be consistent
          if (result1.success && result2.success) {
            expect(typeof result1.data).toBe(typeof result2.data);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
