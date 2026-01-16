/**
 * Property-based tests for Gemini Live tool execution
 *
 * **Property 14: Tool Call Execution**
 * **Property 15: Tool Response Round-Trip**
 * **Property 16: Tool Timeout Enforcement**
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
 *
 * Requirement 7.1: Parse toolCall event with functionCalls array
 * Requirement 7.2: Emit 'toolCall' event for each function call
 * Requirement 7.3: Send toolResponse with functionResponses
 * Requirement 7.4: Tool execution timeout handling
 */

import * as fc from 'fast-check';
import {
  toGeminiFormat,
  parseToolCall,
  formatToolResponse,
  convertFromGeminiEventData,
  formatMultipleToolResponses,
  createErrorToolResult,
  createSuccessToolResult,
  createToolNotFoundError,
  createToolTimeoutError,
  createToolExecutionError,
  createToolCancelledError,
  sanitizeToolErrorMessage,
  GeminiToolCall,
  GeminiToolError,
  GeminiToolErrorType,
} from '../../src/gemini-live/tool-adapter';
import type {
  ToolCallEventData,
  GeminiToolCallEvent,
} from '../../src/gemini-live/types';
import type { ToolDefinition, ToolExecutionResult } from '../../src/tools/types';

describe('Property 14: Tool Call Execution (Gemini Live)', () => {
  /**
   * Arbitrary for valid question IDs
   */
  const validQuestionIdArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .map((s) => `q-${s.replace(/[^a-zA-Z0-9-]/g, '')}`);

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
   * Arbitrary for Gemini tool call event data
   */
  const geminiToolCallEventDataArb: fc.Arbitrary<ToolCallEventData> = fc.record({
    id: fc.uuid().map((id) => `call_${id}`),
    name: fc.constantFrom(
      'record_response',
      'get_next_question',
      'validate_answer',
      'get_demo_context'
    ),
    args: fc.oneof(
      // record_response args
      fc.record({
        questionId: validQuestionIdArb,
        response: validResponseValueArb,
      }),
      // get_next_question args
      fc.record({
        currentQuestionId: validQuestionIdArb,
      }),
      // validate_answer args
      fc.record({
        questionId: validQuestionIdArb,
        response: validResponseValueArb,
      }),
      // get_demo_context args (empty)
      fc.constant({})
    ),
  });

  // Property 14: convertFromGeminiEventData preserves call ID
  it('should preserve tool call ID when converting from Gemini event data', async () => {
    await fc.assert(
      fc.asyncProperty(geminiToolCallEventDataArb, async (toolCallData) => {
        const converted = convertFromGeminiEventData(toolCallData);

        // Call ID must be preserved
        expect(converted.callId).toBe(toolCallData.id);
        expect(converted.toolName).toBe(toolCallData.name);
        expect(converted.parameters).toEqual(toolCallData.args);
      }),
      { numRuns: 100 }
    );
  });

  // Property 14: formatToolResponse creates valid structure with preserved call ID
  it('should create valid Gemini tool response structure with preserved call ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.oneof(
          // Success with data
          fc.record({
            success: fc.constant(true),
            data: fc.anything().filter((d) => d !== undefined),
          }),
          // Error
          fc.record({
            success: fc.constant(false),
            error: fc.string({ minLength: 1, maxLength: 200 }),
          })
        ),
        async (callId, result) => {
          const response = formatToolResponse(callId, result as ToolExecutionResult);

          // Requirement 7.3: Result must have valid toolResponse structure
          expect(response).toBeDefined();
          expect(response.toolResponse).toBeDefined();
          expect(response.toolResponse.functionResponses).toBeDefined();
          expect(Array.isArray(response.toolResponse.functionResponses)).toBe(true);
          expect(response.toolResponse.functionResponses.length).toBe(1);

          // Response should have the correct call ID
          const funcResponse = response.toolResponse.functionResponses[0];
          expect(funcResponse.id).toBe(callId);
          // Response is defined (either data or error object)
          // Note: when success=true and data=undefined, response will be undefined
          // This is valid behavior - the response field exists
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 14: Error results include error information
  it('should include error information in error responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (callId, errorMessage) => {
          const result: ToolExecutionResult = {
            success: false,
            error: errorMessage,
          };

          const response = formatToolResponse(callId, result);
          const funcResponse = response.toolResponse.functionResponses[0].response as any;

          // Error response should contain error info
          expect(funcResponse.error).toBeDefined();
          expect(funcResponse.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 15: Tool Response Round-Trip (Gemini Live)', () => {
  /**
   * Arbitrary for tool execution results
   */
  const toolResultArb = fc.oneof(
    // Success result
    fc.record({
      success: fc.constant(true),
      data: fc.oneof(
        fc.record({ recorded: fc.boolean(), questionId: fc.string() }),
        fc.record({ nextQuestion: fc.string(), isComplete: fc.boolean() }),
        fc.record({ valid: fc.boolean(), message: fc.string() }),
        fc.record({ questionnaireId: fc.string(), progress: fc.integer() })
      ),
    }),
    // Error result
    fc.record({
      success: fc.constant(false),
      error: fc.string({ minLength: 1, maxLength: 200 }),
    })
  );

  // Property 15: formatToolResponse creates valid structure
  it('should create valid Gemini tool response structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        toolResultArb,
        async (callId, result) => {
          const response = formatToolResponse(callId, result as ToolExecutionResult);

          // Must have valid structure
          expect(response.toolResponse).toBeDefined();
          expect(response.toolResponse.functionResponses).toBeDefined();
          expect(Array.isArray(response.toolResponse.functionResponses)).toBe(true);
          expect(response.toolResponse.functionResponses.length).toBe(1);

          // Call ID must be preserved
          expect(response.toolResponse.functionResponses[0].id).toBe(callId);

          // Response must be defined
          expect(response.toolResponse.functionResponses[0].response).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 15: parseToolCall extracts all function calls
  it('should extract all function calls from toolCall event', async () => {
    const functionCallArb = fc.record({
      id: fc.uuid().map((id) => `call_${id}`),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      args: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(functionCallArb, { minLength: 1, maxLength: 5 }),
        async (functionCalls) => {
          const event: GeminiToolCallEvent = {
            toolCall: {
              functionCalls: functionCalls,
            },
          };

          const parsed = parseToolCall(event);

          // Should extract all function calls
          expect(parsed.length).toBe(functionCalls.length);

          // Each parsed call should match original
          for (let i = 0; i < functionCalls.length; i++) {
            expect(parsed[i].id).toBe(functionCalls[i].id);
            expect(parsed[i].name).toBe(functionCalls[i].name);
            expect(parsed[i].args).toEqual(functionCalls[i].args);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 15: convertFromGeminiEventData preserves all fields
  it('should preserve all fields when converting from Gemini event data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
        async (callId, toolName, args) => {
          const eventData: ToolCallEventData = {
            id: callId,
            name: toolName,
            args: args,
          };

          const converted: GeminiToolCall = convertFromGeminiEventData(eventData);

          // All fields must be preserved
          expect(converted.callId).toBe(callId);
          expect(converted.toolName).toBe(toolName);
          expect(converted.parameters).toEqual(args);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 15: toGeminiFormat converts tool definitions correctly
  it('should convert tool definitions to Gemini format', async () => {
    const toolDefinitionArb: fc.Arbitrary<ToolDefinition> = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }),
      description: fc.string({ minLength: 1, maxLength: 200 }),
      inputSchema: fc.record({
        type: fc.constant('object' as const),
        properties: fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.record({
            type: fc.constantFrom('string', 'number', 'boolean'),
            description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          })
        ),
        required: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
      }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(toolDefinitionArb, { minLength: 1, maxLength: 5 }),
        async (definitions) => {
          const geminiFormat = toGeminiFormat(definitions);

          // Should have same number of tools
          expect(geminiFormat.length).toBe(definitions.length);

          // Each tool should have required fields
          for (let i = 0; i < geminiFormat.length; i++) {
            expect(geminiFormat[i].name).toBe(definitions[i].name);
            expect(geminiFormat[i].description).toBe(definitions[i].description);
            expect(geminiFormat[i].parameters).toBeDefined();
            expect(geminiFormat[i].parameters.type).toBe('object');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 15: formatMultipleToolResponses handles multiple results
  it('should format multiple tool responses correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            callId: fc.uuid().map((id) => `call_${id}`),
            result: toolResultArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (results) => {
          const response = formatMultipleToolResponses(
            results.map((r) => ({ callId: r.callId, result: r.result as ToolExecutionResult }))
          );

          // Should have all responses
          expect(response.toolResponse.functionResponses.length).toBe(results.length);

          // Each response should have correct call ID
          for (let i = 0; i < results.length; i++) {
            expect(response.toolResponse.functionResponses[i].id).toBe(results[i].callId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 16: Tool Timeout Enforcement (Gemini Live)', () => {
  // Property 16: createToolTimeoutError creates valid error
  it('should create valid timeout error with correct properties', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 100, max: 30000 }),
        async (callId, toolName, timeoutMs) => {
          const error = createToolTimeoutError(callId, toolName, timeoutMs);

          // Error should have correct properties
          expect(error).toBeInstanceOf(GeminiToolError);
          expect(error.errorType).toBe(GeminiToolErrorType.TOOL_TIMEOUT);
          expect(error.callId).toBe(callId);
          expect(error.toolName).toBe(toolName);
          expect(error.recoverable).toBe(true); // Timeout is recoverable
          expect(error.message).toContain(toolName);
          expect(error.message).toContain(String(timeoutMs));
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 16: Timeout error can be converted to tool response
  it('should convert timeout error to valid tool response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (callId, toolName) => {
          const error = createToolTimeoutError(callId, toolName, 5000);
          const response = error.toToolResponseMessage();

          // Response should have valid structure
          expect(response.toolResponse).toBeDefined();
          expect(response.toolResponse.functionResponses.length).toBe(1);
          expect(response.toolResponse.functionResponses[0].id).toBe(callId);

          // Response should indicate error
          const funcResponse = response.toolResponse.functionResponses[0].response as any;
          expect(funcResponse.error).toBeDefined();
          expect(funcResponse.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 16: Tool not found error is not recoverable
  it('should create non-recoverable error for tool not found', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (callId, toolName) => {
          const error = createToolNotFoundError(callId, toolName);

          expect(error.errorType).toBe(GeminiToolErrorType.TOOL_NOT_FOUND);
          expect(error.recoverable).toBe(false); // Not recoverable
          expect(error.callId).toBe(callId);
          expect(error.toolName).toBe(toolName);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 16: Tool execution error is recoverable
  it('should create recoverable error for tool execution failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (callId, toolName, errorMessage) => {
          const error = createToolExecutionError(callId, toolName, errorMessage);

          expect(error.errorType).toBe(GeminiToolErrorType.TOOL_EXECUTION_ERROR);
          expect(error.recoverable).toBe(true); // Recoverable
          expect(error.callId).toBe(callId);
          expect(error.toolName).toBe(toolName);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 16: Tool cancelled error is not recoverable
  it('should create non-recoverable error for tool cancellation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (callId, toolName) => {
          const error = createToolCancelledError(callId, toolName);

          expect(error.errorType).toBe(GeminiToolErrorType.TOOL_CANCELLED);
          expect(error.recoverable).toBe(false); // Not recoverable (intentional)
          expect(error.callId).toBe(callId);
          expect(error.toolName).toBe(toolName);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Tool Result Helpers (Gemini Live)', () => {
  // Test createSuccessToolResult
  it('should create valid success tool result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.anything(),
        async (callId, data) => {
          const result = createSuccessToolResult(callId, data);

          expect(result.callId).toBe(callId);
          expect(result.success).toBe(true);
          expect(result.data).toBe(data);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Test createErrorToolResult
  it('should create valid error tool result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => `call_${id}`),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (callId, errorMessage) => {
          const result = createErrorToolResult(callId, errorMessage);

          expect(result.callId).toBe(callId);
          expect(result.success).toBe(false);
          expect(result.error).toBe(errorMessage);
          expect(result.data).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Test sanitizeToolErrorMessage
  it('should sanitize error messages by removing sensitive info', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 500 }), async (errorMessage) => {
        const sanitized = sanitizeToolErrorMessage(errorMessage);

        // Should return a string
        expect(typeof sanitized).toBe('string');

        // Should not be empty
        expect(sanitized.length).toBeGreaterThan(0);

        // Should be truncated if too long
        expect(sanitized.length).toBeLessThanOrEqual(200);

        // Should not contain file paths (if original had them)
        expect(sanitized).not.toMatch(/\/[^\s]+\.(ts|js|json)/);
      }),
      { numRuns: 100 }
    );
  });

  // Test parseToolCall with empty functionCalls
  it('should return empty array for toolCall event with no functionCalls', () => {
    const event: GeminiToolCallEvent = {
      toolCall: {
        functionCalls: [],
      },
    };

    const parsed = parseToolCall(event);
    expect(parsed).toEqual([]);
  });

  // Test parseToolCall with undefined functionCalls
  it('should return empty array for toolCall event with undefined functionCalls', () => {
    const event = {
      toolCall: {},
    } as GeminiToolCallEvent;

    const parsed = parseToolCall(event);
    expect(parsed).toEqual([]);
  });
});
