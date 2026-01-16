/**
 * Tool Execution Framework
 * Handles execution of tools called by the AI
 * 
 * This module provides tool execution for Gemini Live API integration.
 * 
 * _Requirements: 7.1, 7.2, 7.3, 7.4, 13.5_
 */

import { getLogger } from '../monitoring/logger';
import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types';
import { recordResponseHandler } from './record-response';
// Note: get_next_question removed - Gemini handles question flow via system prompt
import { validateAnswerHandler } from './validate-answer';
import { getDemoContextHandler } from './get-demo-context';
import {
  convertFromGeminiEventData,
  formatToolResponse,
  GeminiToolErrorType,
  createToolNotFoundError,
  createToolTimeoutError,
  createToolExecutionError,
  createToolCancelledError,
  isGeminiToolError,
  sanitizeToolErrorMessage,
} from '../gemini-live/tool-adapter';
import { ToolCallEventData, GeminiToolResponseMessage } from '../gemini-live/types';

const logger = getLogger();

/** Default timeout for tool execution in milliseconds */
const TOOL_EXECUTION_TIMEOUT_MS = 5000;

type ToolHandler = (input: any, context: ToolExecutionContext) => Promise<any>;

/**
 * Pending tool execution tracking for cancellation support
 */
interface PendingToolExecution {
  callId: string;
  toolName: string;
  sessionId: string;
  startTime: number;
  abortController: AbortController;
}

/**
 * Tool Executor Class
 */
export class ToolExecutor {
  private toolHandlers = new Map<string, ToolHandler>();
  
  /** Track pending tool executions for cancellation support (Requirement 6.4) */
  private pendingExecutions = new Map<string, PendingToolExecution>();

  constructor() {
    // Register built-in tools
    this.registerTool('record_response', recordResponseHandler);
    // Note: get_next_question removed - Gemini handles question flow via system prompt
    this.registerTool('validate_answer', validateAnswerHandler);
    this.registerTool('get_demo_context', getDemoContextHandler);
    
    logger.info('Tool executor initialized', {
      registeredTools: Array.from(this.toolHandlers.keys()),
    });
  }

  /**
   * Register a tool handler
   */
  registerTool(name: string, handler: ToolHandler): void {
    this.toolHandlers.set(name, handler);
    logger.debug('Tool registered', { toolName: name });
  }

  /**
   * Validate tool parameters against the tool's input schema
   */
  validateToolParameters(toolName: string, parameters: any): { valid: boolean; errors?: string[] } {
    const toolDefinitions = this.getToolDefinitionsForBedrock();
    const toolDef = toolDefinitions.find(t => t.name === toolName);

    if (!toolDef) {
      return {
        valid: false,
        errors: [`Tool '${toolName}' not found`],
      };
    }

    const errors: string[] = [];
    const schema = toolDef.inputSchema;

    // Check required fields
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in parameters)) {
          errors.push(`Missing required parameter: ${requiredField}`);
        }
      }
    }

    // Basic type checking for properties
    if (schema.properties) {
      for (const [key, value] of Object.entries(parameters)) {
        const propSchema = schema.properties[key];
        if (!propSchema) {
          // Unknown parameter - log warning but don't fail
          logger.warn('Unknown parameter provided', { toolName, parameter: key });
          continue;
        }

        // Type checking
        const expectedType = (propSchema as any).type;
        const actualType = typeof value;
        
        if (expectedType === 'string' && actualType !== 'string') {
          errors.push(`Parameter '${key}' should be a string, got ${actualType}`);
        } else if (expectedType === 'number' && actualType !== 'number') {
          errors.push(`Parameter '${key}' should be a number, got ${actualType}`);
        } else if (expectedType === 'boolean' && actualType !== 'boolean') {
          errors.push(`Parameter '${key}' should be a boolean, got ${actualType}`);
        } else if (expectedType === 'object' && (actualType !== 'object' || value === null)) {
          errors.push(`Parameter '${key}' should be an object, got ${actualType}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute a tool
   */
  async executeTool(
    toolName: string,
    input: any,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const handler = this.toolHandlers.get(toolName);
    
    if (!handler) {
      logger.error('Tool not found', { 
        toolName, 
        availableTools: Array.from(this.toolHandlers.keys()) 
      });
      return {
        success: false,
        error: `Tool '${toolName}' not found`,
      };
    }

    // Validate parameters
    const validation = this.validateToolParameters(toolName, input);
    if (!validation.valid) {
      logger.error('Tool parameter validation failed', {
        sessionId: context.sessionId,
        toolName,
        errors: validation.errors,
      });
      return {
        success: false,
        error: `Invalid parameters: ${validation.errors?.join(', ')}`,
      };
    }

    try {
      logger.info('Executing tool', {
        sessionId: context.sessionId,
        toolName,
        input,
      });

      const result = await handler(input, context);

      logger.info('Tool executed successfully', {
        sessionId: context.sessionId,
        toolName,
        result,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('Tool execution failed', {
        sessionId: context.sessionId,
        toolName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all registered tool definitions for Bedrock
   */
  getToolDefinitionsForBedrock(): ToolDefinition[] {
    return [
      {
        name: 'record_response',
        description: 'Record the user\'s response to the current survey question. Call this immediately after the user answers a question, before asking the next question.',
        inputSchema: {
          type: 'object',
          properties: {
            questionId: {
              type: 'string',
              description: 'The ID of the question being answered (e.g., "q4-csat-issue-resolution")',
            },
            response: {
              type: 'string',
              description: 'The user\'s response text or value',
            },
            responseType: {
              type: 'string',
              description: 'Type of response: text, number, rating, single_choice, etc.',
            },
          },
          required: ['questionId', 'response'],
        },
      },
      {
        name: 'validate_answer',
        description: 'Validate a user\'s response against question constraints before recording it.',
        inputSchema: {
          type: 'object',
          properties: {
            questionId: {
              type: 'string',
              description: 'The ID of the question being answered',
            },
            response: {
              type: 'string',
              description: 'The user\'s response to validate',
            },
          },
          required: ['questionId', 'response'],
        },
      },
      {
        name: 'get_demo_context',
        description: 'Get questionnaire metadata and current progress information.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
  }

  /**
   * Get tool definitions (legacy method for compatibility)
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.getToolDefinitionsForBedrock();
  }

  // ============================================================================
  // Gemini Live Tool Execution Methods
  // ============================================================================

  /**
   * Execute a tool from Gemini Live toolCall event format
   *
   * @remarks
   * This method handles the conversion between Gemini format and internal format,
   * executes the tool, and returns the result in Gemini format.
   *
   * _Requirements: 7.1, 7.2, 7.3_
   *
   * @param toolCallEventData - The tool call event data from GeminiLiveClient
   * @param context - The tool execution context
   * @returns Promise resolving to Gemini tool response message
   *
   * @example
   * ```typescript
   * const toolCallEventData: ToolCallEventData = {
   *   id: 'call_123',
   *   name: 'record_response',
   *   args: { questionId: 'q1', response: 'Yes' }
   * };
   *
   * const result = await executor.executeFromGemini(toolCallEventData, context);
   * // { toolResponse: { functionResponses: [{ id: 'call_123', response: { recorded: true } }] } }
   * ```
   */
  async executeFromGemini(
    toolCallEventData: ToolCallEventData,
    context: ToolExecutionContext
  ): Promise<GeminiToolResponseMessage> {
    const startTime = Date.now();
    const toolCall = convertFromGeminiEventData(toolCallEventData);

    logger.info('Executing tool from Gemini', {
      sessionId: context.sessionId,
      callId: toolCall.callId,
      toolName: toolCall.toolName,
      parameters: toolCall.parameters,
    });

    try {
      // Execute the tool with the internal method
      const result = await this.executeTool(
        toolCall.toolName,
        toolCall.parameters,
        context
      );

      const executionTime = Date.now() - startTime;

      logger.info('Tool execution completed for Gemini', {
        sessionId: context.sessionId,
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        success: result.success,
        executionTime,
      });

      // Convert to Gemini format
      return formatToolResponse(toolCall.callId, result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Tool execution failed for Gemini', {
        sessionId: context.sessionId,
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        error: errorMessage,
        executionTime,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return error result in Gemini format
      return formatToolResponse(toolCall.callId, {
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Execute a tool from Gemini format with timeout
   *
   * @remarks
   * This method wraps executeFromGemini with a timeout to prevent
   * long-running tool executions from blocking the conversation.
   *
   * _Requirements: 7.4_
   *
   * @param toolCallEventData - The tool call event data from GeminiLiveClient
   * @param context - The tool execution context
   * @param timeoutMs - Timeout in milliseconds (default: 5000)
   * @returns Promise resolving to Gemini tool response message
   */
  async executeFromGeminiWithTimeout(
    toolCallEventData: ToolCallEventData,
    context: ToolExecutionContext,
    timeoutMs: number = TOOL_EXECUTION_TIMEOUT_MS
  ): Promise<GeminiToolResponseMessage> {
    const toolCall = convertFromGeminiEventData(toolCallEventData);

    // Check if tool exists before attempting execution
    const handler = this.toolHandlers.get(toolCall.toolName);
    if (!handler) {
      const toolError = createToolNotFoundError(toolCall.callId, toolCall.toolName);
      logger.error('Tool not found for Gemini execution', {
        sessionId: context.sessionId,
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        errorType: toolError.errorType,
        availableTools: Array.from(this.toolHandlers.keys()),
      });
      return toolError.toToolResponseMessage();
    }

    const timeoutPromise = new Promise<GeminiToolResponseMessage>((_, reject) => {
      setTimeout(() => {
        const timeoutError = createToolTimeoutError(
          toolCall.callId,
          toolCall.toolName,
          timeoutMs
        );
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.executeFromGemini(toolCallEventData, context),
        timeoutPromise,
      ]);
      return result;
    } catch (error) {
      // Handle GeminiToolError (timeout or other structured errors)
      if (isGeminiToolError(error)) {
        logger.error('Gemini tool execution error', {
          sessionId: context.sessionId,
          callId: error.callId,
          toolName: error.toolName,
          errorType: error.errorType,
          error: error.message,
          recoverable: error.recoverable,
        });
        return error.toToolResponseMessage();
      }

      // Handle generic errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('timed out');

      if (isTimeout) {
        const timeoutError = createToolTimeoutError(
          toolCall.callId,
          toolCall.toolName,
          timeoutMs
        );
        logger.error('Tool execution timed out', {
          sessionId: context.sessionId,
          callId: toolCall.callId,
          toolName: toolCall.toolName,
          errorType: GeminiToolErrorType.TOOL_TIMEOUT,
          timeoutMs,
        });
        return timeoutError.toToolResponseMessage();
      }

      // Create a generic execution error
      const execError = createToolExecutionError(
        toolCall.callId,
        toolCall.toolName,
        error instanceof Error ? error : new Error(String(error))
      );

      logger.error('Tool execution failed', {
        sessionId: context.sessionId,
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        errorType: GeminiToolErrorType.TOOL_EXECUTION_ERROR,
        error: sanitizeToolErrorMessage(errorMessage),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return execError.toToolResponseMessage();
    }
  }

  // ============================================================================
  // Tool Cancellation Methods (Requirement 6.4)
  // ============================================================================

  /**
   * Cancel pending tool executions by their call IDs
   *
   * @remarks
   * This method is called when a toolCallCancellation event is received from
   * Gemini Live, typically during user interruption (barge-in).
   *
   * _Requirements: 6.4_
   *
   * @param callIds - Array of call IDs to cancel
   * @returns Array of cancelled call IDs
   */
  cancelPendingExecutions(callIds: string[]): string[] {
    const cancelledIds: string[] = [];

    for (const callId of callIds) {
      const pending = this.pendingExecutions.get(callId);
      if (pending) {
        logger.info('Cancelling pending tool execution', {
          sessionId: pending.sessionId,
          callId: pending.callId,
          toolName: pending.toolName,
          executionTime: Date.now() - pending.startTime,
        });

        // Abort the execution
        pending.abortController.abort();
        
        // Remove from pending
        this.pendingExecutions.delete(callId);
        cancelledIds.push(callId);
      }
    }

    if (cancelledIds.length > 0) {
      logger.info('Cancelled pending tool executions', {
        cancelledCount: cancelledIds.length,
        cancelledIds,
      });
    }

    return cancelledIds;
  }

  /**
   * Cancel all pending tool executions for a session
   *
   * @remarks
   * This method is useful when a session is being terminated or
   * when all pending operations need to be cancelled.
   *
   * @param sessionId - The session ID to cancel executions for
   * @returns Array of cancelled call IDs
   */
  cancelAllPendingForSession(sessionId: string): string[] {
    const cancelledIds: string[] = [];

    for (const [callId, pending] of this.pendingExecutions.entries()) {
      if (pending.sessionId === sessionId) {
        logger.info('Cancelling pending tool execution for session cleanup', {
          sessionId: pending.sessionId,
          callId: pending.callId,
          toolName: pending.toolName,
          executionTime: Date.now() - pending.startTime,
        });

        pending.abortController.abort();
        this.pendingExecutions.delete(callId);
        cancelledIds.push(callId);
      }
    }

    if (cancelledIds.length > 0) {
      logger.info('Cancelled all pending tool executions for session', {
        sessionId,
        cancelledCount: cancelledIds.length,
        cancelledIds,
      });
    }

    return cancelledIds;
  }

  /**
   * Get the count of pending tool executions
   *
   * @returns Number of pending executions
   */
  getPendingExecutionCount(): number {
    return this.pendingExecutions.size;
  }

  /**
   * Get pending execution IDs for a session
   *
   * @param sessionId - The session ID to get pending executions for
   * @returns Array of pending call IDs
   */
  getPendingExecutionIds(sessionId?: string): string[] {
    if (!sessionId) {
      return Array.from(this.pendingExecutions.keys());
    }

    const ids: string[] = [];
    for (const [callId, pending] of this.pendingExecutions.entries()) {
      if (pending.sessionId === sessionId) {
        ids.push(callId);
      }
    }
    return ids;
  }

  /**
   * Check if a tool execution is pending
   *
   * @param callId - The call ID to check
   * @returns True if the execution is pending
   */
  isExecutionPending(callId: string): boolean {
    return this.pendingExecutions.has(callId);
  }

  /**
   * Track a pending tool execution
   *
   * @param callId - The call ID
   * @param toolName - The tool name
   * @param sessionId - The session ID
   * @returns AbortController for the execution
   */
  private trackPendingExecution(
    callId: string,
    toolName: string,
    sessionId: string
  ): AbortController {
    const abortController = new AbortController();
    
    this.pendingExecutions.set(callId, {
      callId,
      toolName,
      sessionId,
      startTime: Date.now(),
      abortController,
    });

    return abortController;
  }

  /**
   * Remove a pending tool execution from tracking
   *
   * @param callId - The call ID to remove
   */
  private removePendingExecution(callId: string): void {
    this.pendingExecutions.delete(callId);
  }

  /**
   * Execute a tool from Gemini format with timeout and cancellation support
   *
   * @remarks
   * This method wraps executeFromGemini with timeout and cancellation support.
   * It tracks pending executions and can be cancelled via cancelPendingExecutions.
   *
   * _Requirements: 6.4, 7.4_
   *
   * @param toolCallEventData - The tool call event data from GeminiLiveClient
   * @param context - The tool execution context
   * @param timeoutMs - Timeout in milliseconds (default: 5000)
   * @returns Promise resolving to Gemini tool response message
   */
  async executeFromGeminiWithCancellation(
    toolCallEventData: ToolCallEventData,
    context: ToolExecutionContext,
    timeoutMs: number = TOOL_EXECUTION_TIMEOUT_MS
  ): Promise<GeminiToolResponseMessage> {
    const toolCall = convertFromGeminiEventData(toolCallEventData);

    // Check if tool exists before attempting execution
    const handler = this.toolHandlers.get(toolCall.toolName);
    if (!handler) {
      const toolError = createToolNotFoundError(toolCall.callId, toolCall.toolName);
      logger.error('Tool not found for Gemini execution', {
        sessionId: context.sessionId,
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        errorType: toolError.errorType,
        availableTools: Array.from(this.toolHandlers.keys()),
      });
      return toolError.toToolResponseMessage();
    }

    // Track this execution for potential cancellation
    const abortController = this.trackPendingExecution(
      toolCall.callId,
      toolCall.toolName,
      context.sessionId
    );

    const timeoutPromise = new Promise<GeminiToolResponseMessage>((_, reject) => {
      setTimeout(() => {
        const timeoutError = createToolTimeoutError(
          toolCall.callId,
          toolCall.toolName,
          timeoutMs
        );
        reject(timeoutError);
      }, timeoutMs);
    });

    const cancellationPromise = new Promise<GeminiToolResponseMessage>((_, reject) => {
      abortController.signal.addEventListener('abort', () => {
        const cancelError = createToolCancelledError(toolCall.callId, toolCall.toolName);
        reject(cancelError);
      });
    });

    try {
      const result = await Promise.race([
        this.executeFromGemini(toolCallEventData, context),
        timeoutPromise,
        cancellationPromise,
      ]);
      
      // Remove from pending on success
      this.removePendingExecution(toolCall.callId);
      
      return result;
    } catch (error) {
      // Remove from pending on error
      this.removePendingExecution(toolCall.callId);

      // Handle GeminiToolError (timeout, cancellation, or other structured errors)
      if (isGeminiToolError(error)) {
        logger.error('Gemini tool execution error', {
          sessionId: context.sessionId,
          callId: error.callId,
          toolName: error.toolName,
          errorType: error.errorType,
          error: error.message,
          recoverable: error.recoverable,
        });
        return error.toToolResponseMessage();
      }

      // Handle generic errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('timed out');

      if (isTimeout) {
        const timeoutError = createToolTimeoutError(
          toolCall.callId,
          toolCall.toolName,
          timeoutMs
        );
        logger.error('Tool execution timed out', {
          sessionId: context.sessionId,
          callId: toolCall.callId,
          toolName: toolCall.toolName,
          errorType: GeminiToolErrorType.TOOL_TIMEOUT,
          timeoutMs,
        });
        return timeoutError.toToolResponseMessage();
      }

      // Create a generic execution error
      const execError = createToolExecutionError(
        toolCall.callId,
        toolCall.toolName,
        error instanceof Error ? error : new Error(String(error))
      );

      logger.error('Tool execution failed', {
        sessionId: context.sessionId,
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        errorType: GeminiToolErrorType.TOOL_EXECUTION_ERROR,
        error: sanitizeToolErrorMessage(errorMessage),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return execError.toToolResponseMessage();
    }
  }
}

// Singleton instance
let executorInstance: ToolExecutor | null = null;

/**
 * Get singleton executor instance
 */
export function getToolExecutor(): ToolExecutor {
  if (!executorInstance) {
    executorInstance = new ToolExecutor();
  }
  return executorInstance;
}
