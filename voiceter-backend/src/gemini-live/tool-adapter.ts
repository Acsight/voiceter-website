/**
 * Tool Adapter for Gemini Live API
 *
 * This module provides conversion functions between Gemini Live tool call format
 * and the internal tool execution format used by the Voiceter backend.
 *
 * @module gemini-live/tool-adapter
 *
 * Requirements: 7.7
 */

import { ToolDefinition, ToolExecutionResult } from '../tools/types';
import {
  GeminiFunctionDeclaration,
  GeminiToolCallEvent,
  GeminiToolResponseMessage,
  ParameterSchema,
  ParsedToolCall,
  ToolCallEventData,
} from './types';

// ============================================================================
// Gemini Tool Call Interface
// ============================================================================

/**
 * Represents a tool call from Gemini Live in a normalized format
 *
 * @remarks
 * This interface provides a clean abstraction over the raw Gemini Live
 * toolCall event, making it easier to work with in the tool executor.
 *
 * Requirements: 7.7
 */
export interface GeminiToolCall {
  /** Unique identifier for this tool call (from Gemini) */
  callId: string;
  /** Name of the tool to execute */
  toolName: string;
  /** Parameters for the tool execution */
  parameters: Record<string, unknown>;
}

// ============================================================================
// Gemini Tool Result Interface
// ============================================================================

/**
 * Represents the result of a tool execution to be sent back to Gemini Live
 *
 * @remarks
 * This interface provides a clean abstraction for tool results that will
 * be converted to the Gemini Live toolResponse format.
 *
 * Requirements: 7.3
 */
export interface GeminiToolResult {
  /** The call ID from the original tool call */
  callId: string;
  /** Whether the tool execution was successful */
  success: boolean;
  /** The result data (if successful) */
  data?: unknown;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert internal tool definitions to Gemini Live functionDeclarations format
 *
 * @param tools - Array of internal tool definitions
 * @returns Array of Gemini function declarations
 *
 * @example
 * ```typescript
 * const internalTools: ToolDefinition[] = [{
 *   name: 'record_response',
 *   description: 'Record user response',
 *   inputSchema: {
 *     type: 'object',
 *     properties: { questionId: { type: 'string' } },
 *     required: ['questionId']
 *   }
 * }];
 *
 * const geminiTools = toGeminiFormat(internalTools);
 * ```
 *
 * Requirements: 7.7
 */
export function toGeminiFormat(
  tools: ToolDefinition[]
): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: convertInputSchemaToParameters(tool.inputSchema),
  }));
}

/**
 * Convert internal input schema to Gemini parameters format
 *
 * @param inputSchema - Internal tool input schema
 * @returns Gemini parameters schema
 */
function convertInputSchemaToParameters(inputSchema: any): {
  type: 'object';
  properties: Record<string, ParameterSchema>;
  required: string[];
} {
  const properties: Record<string, ParameterSchema> = {};

  if (inputSchema?.properties) {
    for (const [key, value] of Object.entries(inputSchema.properties)) {
      properties[key] = convertPropertySchema(value as any);
    }
  }

  return {
    type: 'object',
    properties,
    required: inputSchema?.required || [],
  };
}

/**
 * Convert a single property schema to Gemini format
 *
 * @param schema - Property schema from internal format
 * @returns Gemini parameter schema
 */
function convertPropertySchema(schema: any): ParameterSchema {
  const result: ParameterSchema = {
    type: schema.type || 'string',
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.items) {
    result.items = convertPropertySchema(schema.items);
  }

  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = convertPropertySchema(value as any);
    }
  }

  if (schema.required) {
    result.required = schema.required;
  }

  return result;
}

/**
 * Parse a Gemini Live toolCall event and extract function calls
 *
 * @param event - The raw toolCall event from Gemini Live
 * @returns Array of parsed tool calls
 *
 * @example
 * ```typescript
 * const toolCallEvent: GeminiToolCallEvent = {
 *   toolCall: {
 *     functionCalls: [{
 *       id: 'call_123',
 *       name: 'record_response',
 *       args: { questionId: 'q1', response: 'Yes' }
 *     }]
 *   }
 * };
 *
 * const parsedCalls = parseToolCall(toolCallEvent);
 * // [{ id: 'call_123', name: 'record_response', args: { questionId: 'q1', response: 'Yes' } }]
 * ```
 *
 * Requirements: 7.1, 7.2
 */
export function parseToolCall(event: GeminiToolCallEvent): ParsedToolCall[] {
  if (!event.toolCall?.functionCalls) {
    return [];
  }

  return event.toolCall.functionCalls.map((call) => ({
    id: call.id,
    name: call.name,
    args: call.args || {},
  }));
}

/**
 * Parse a single function call from Gemini Live to normalized format
 *
 * @param functionCall - A single function call from Gemini
 * @returns Normalized GeminiToolCall
 */
export function parseGeminiFunctionCall(functionCall: {
  id: string;
  name: string;
  args: Record<string, unknown>;
}): GeminiToolCall {
  return {
    callId: functionCall.id,
    toolName: functionCall.name,
    parameters: functionCall.args || {},
  };
}

/**
 * Convert a ToolCallEventData to GeminiToolCall format
 *
 * @param eventData - Tool call event data from GeminiLiveClient
 * @returns Normalized GeminiToolCall
 */
export function convertFromGeminiEventData(
  eventData: ToolCallEventData
): GeminiToolCall {
  return {
    callId: eventData.id,
    toolName: eventData.name,
    parameters: eventData.args || {},
  };
}

/**
 * Format a tool response for sending back to Gemini Live
 *
 * @param callId - The call ID from the original tool call
 * @param result - The tool execution result
 * @returns Formatted tool response message
 *
 * @example
 * ```typescript
 * const result: ToolExecutionResult = {
 *   success: true,
 *   data: { recorded: true, questionId: 'q1' }
 * };
 *
 * const response = formatToolResponse('call_123', result);
 * // { toolResponse: { functionResponses: [{ id: 'call_123', response: { recorded: true, questionId: 'q1' } }] } }
 * ```
 *
 * Requirements: 7.3
 */
export function formatToolResponse(
  callId: string,
  result: ToolExecutionResult
): GeminiToolResponseMessage {
  const responseData = result.success
    ? result.data
    : { error: result.error || 'Unknown error occurred', success: false };

  return {
    toolResponse: {
      functionResponses: [
        {
          id: callId,
          response: responseData,
        },
      ],
    },
  };
}

/**
 * Format multiple tool responses for sending back to Gemini Live
 *
 * @param results - Array of call ID and result pairs
 * @returns Formatted tool response message with multiple responses
 */
export function formatMultipleToolResponses(
  results: Array<{ callId: string; result: ToolExecutionResult }>
): GeminiToolResponseMessage {
  return {
    toolResponse: {
      functionResponses: results.map(({ callId, result }) => ({
        id: callId,
        response: result.success
          ? result.data
          : { error: result.error || 'Unknown error occurred', success: false },
      })),
    },
  };
}

/**
 * Convert a GeminiToolResult to the response format for Gemini Live
 *
 * @param toolResult - The Gemini tool result object
 * @returns Response data to send to Gemini
 */
export function convertToolResultToResponse(toolResult: GeminiToolResult): unknown {
  if (toolResult.success) {
    return toolResult.data;
  }

  return {
    error: toolResult.error || 'Unknown error occurred',
    success: false,
  };
}

/**
 * Create an error tool result for cases where tool execution fails
 *
 * @param callId - The original call ID from Gemini
 * @param errorMessage - The error message to include
 * @returns GeminiToolResult with error information
 *
 * @example
 * ```typescript
 * const errorResult = createErrorToolResult('call_123', 'Tool not found');
 * // { callId: 'call_123', success: false, error: 'Tool not found' }
 * ```
 */
export function createErrorToolResult(
  callId: string,
  errorMessage: string
): GeminiToolResult {
  return {
    callId,
    success: false,
    error: errorMessage,
  };
}

/**
 * Create a success tool result
 *
 * @param callId - The original call ID from Gemini
 * @param data - The result data
 * @returns GeminiToolResult with success data
 *
 * @example
 * ```typescript
 * const successResult = createSuccessToolResult('call_123', { recorded: true });
 * // { callId: 'call_123', success: true, data: { recorded: true } }
 * ```
 */
export function createSuccessToolResult(
  callId: string,
  data: unknown
): GeminiToolResult {
  return {
    callId,
    success: true,
    data,
  };
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Error types for Gemini Live tool execution
 *
 * Requirements: 7.4, 7.5
 */
export enum GeminiToolErrorType {
  /** Tool was not found in the registry */
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  /** Tool execution timed out */
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  /** Tool execution failed with an error */
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  /** Invalid parameters provided to the tool */
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  /** Tool call was cancelled */
  TOOL_CANCELLED = 'TOOL_CANCELLED',
}

/**
 * Custom error class for Gemini Live tool execution errors
 *
 * @remarks
 * This error class provides structured error information for tool execution
 * failures, making it easier to handle and log errors appropriately.
 *
 * Requirements: 7.4, 7.5
 */
export class GeminiToolError extends Error {
  /** Error type for categorization */
  public readonly errorType: GeminiToolErrorType;
  /** Tool call ID from Gemini */
  public readonly callId: string;
  /** Tool name that was being executed */
  public readonly toolName: string;
  /** Whether this error is recoverable */
  public readonly recoverable: boolean;

  constructor(
    errorType: GeminiToolErrorType,
    callId: string,
    toolName: string,
    message: string,
    recoverable: boolean = true
  ) {
    super(message);
    this.name = 'GeminiToolError';
    this.errorType = errorType;
    this.callId = callId;
    this.toolName = toolName;
    this.recoverable = recoverable;
  }

  /**
   * Convert the error to a GeminiToolResult
   */
  toToolResult(): GeminiToolResult {
    return createErrorToolResult(this.callId, this.message);
  }

  /**
   * Convert the error to a Gemini tool response message
   */
  toToolResponseMessage(): GeminiToolResponseMessage {
    return formatToolResponse(this.callId, {
      success: false,
      error: this.message,
    });
  }
}

/**
 * Create a tool not found error
 *
 * @param callId - The tool call ID from Gemini
 * @param toolName - The name of the tool that was not found
 * @returns GeminiToolError for tool not found
 */
export function createToolNotFoundError(
  callId: string,
  toolName: string
): GeminiToolError {
  return new GeminiToolError(
    GeminiToolErrorType.TOOL_NOT_FOUND,
    callId,
    toolName,
    `Tool '${toolName}' not found`,
    false // Not recoverable - tool doesn't exist
  );
}

/**
 * Create a tool timeout error
 *
 * @param callId - The tool call ID from Gemini
 * @param toolName - The name of the tool that timed out
 * @param timeoutMs - The timeout duration in milliseconds
 * @returns GeminiToolError for tool timeout
 *
 * Requirements: 7.4
 */
export function createToolTimeoutError(
  callId: string,
  toolName: string,
  timeoutMs: number = 5000
): GeminiToolError {
  return new GeminiToolError(
    GeminiToolErrorType.TOOL_TIMEOUT,
    callId,
    toolName,
    `Tool '${toolName}' execution timed out after ${timeoutMs}ms`,
    true // Recoverable - can retry
  );
}

/**
 * Create a tool execution error
 *
 * @param callId - The tool call ID from Gemini
 * @param toolName - The name of the tool that failed
 * @param originalError - The original error that occurred
 * @returns GeminiToolError for tool execution failure
 */
export function createToolExecutionError(
  callId: string,
  toolName: string,
  originalError: Error | string
): GeminiToolError {
  const message =
    originalError instanceof Error
      ? originalError.message
      : String(originalError);

  return new GeminiToolError(
    GeminiToolErrorType.TOOL_EXECUTION_ERROR,
    callId,
    toolName,
    `Tool '${toolName}' execution failed: ${message}`,
    true // Recoverable - can retry
  );
}

/**
 * Create an invalid parameters error
 *
 * @param callId - The tool call ID from Gemini
 * @param toolName - The name of the tool
 * @param validationErrors - List of validation error messages
 * @returns GeminiToolError for invalid parameters
 */
export function createInvalidParametersError(
  callId: string,
  toolName: string,
  validationErrors: string[]
): GeminiToolError {
  return new GeminiToolError(
    GeminiToolErrorType.INVALID_PARAMETERS,
    callId,
    toolName,
    `Invalid parameters for tool '${toolName}': ${validationErrors.join(', ')}`,
    false // Not recoverable - parameters need to be fixed
  );
}

/**
 * Create a tool cancelled error
 *
 * @param callId - The tool call ID from Gemini
 * @param toolName - The name of the tool that was cancelled
 * @returns GeminiToolError for tool cancellation
 *
 * Requirements: 6.4
 */
export function createToolCancelledError(
  callId: string,
  toolName: string
): GeminiToolError {
  return new GeminiToolError(
    GeminiToolErrorType.TOOL_CANCELLED,
    callId,
    toolName,
    `Tool '${toolName}' execution was cancelled`,
    false // Not recoverable - intentionally cancelled
  );
}

/**
 * Check if an error is a GeminiToolError
 *
 * @param error - The error to check
 * @returns True if the error is a GeminiToolError
 */
export function isGeminiToolError(error: unknown): error is GeminiToolError {
  return error instanceof GeminiToolError;
}

/**
 * Sanitize error message for sending to Gemini Live
 *
 * @remarks
 * Removes sensitive information from error messages before sending
 * them back to Gemini Live. This prevents leaking internal details.
 *
 * @param errorMessage - The original error message
 * @returns Sanitized error message safe for external use
 */
export function sanitizeToolErrorMessage(errorMessage: string): string {
  // Remove file paths
  let sanitized = errorMessage.replace(/\/[^\s]+\.(ts|js|json)/g, '[file]');

  // Remove stack traces
  sanitized = sanitized.replace(/at\s+.+\(.+\)/g, '');

  // Remove line numbers
  sanitized = sanitized.replace(/:\d+:\d+/g, '');

  // Remove internal module references
  sanitized = sanitized.replace(/node_modules\/[^\s]+/g, '[module]');

  // Trim and clean up whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // If the message is too long, truncate it
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  return sanitized || 'An error occurred during tool execution';
}
