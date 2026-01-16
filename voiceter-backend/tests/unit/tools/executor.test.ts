/**
 * Unit tests for ToolExecutor
 */

import { ToolExecutor, getToolExecutor } from '../../../src/tools/executor';
import { ToolExecutionContext } from '../../../src/tools/types';
import { Session } from '../../../src/session/types';

// Mock dependencies
jest.mock('../../../src/monitoring/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../../../src/tools/record-response', () => ({
  recordResponseHandler: jest.fn(),
}));

jest.mock('../../../src/tools/get-next-question', () => ({
  getNextQuestionHandler: jest.fn(),
}));

jest.mock('../../../src/tools/validate-answer', () => ({
  validateAnswerHandler: jest.fn(),
}));

jest.mock('../../../src/tools/get-demo-context', () => ({
  getDemoContextHandler: jest.fn(),
}));

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Create fresh executor instance
    executor = new ToolExecutor();

    // Create mock context
    mockContext = {
      sessionId: 'test-session-123',
      questionnaireId: 'demo1_csat_nps',
      session: {
        sessionId: 'test-session-123',
        questionnaireId: 'demo1_csat_nps',
        currentQuestionIndex: 0,
        responses: new Map(),
        conversationHistory: [],
        bedrockStreamIds: {
          promptName: 'test-prompt',
          audioContentId: 'test-audio',
        },
        audioConfig: {
          sampleRate: 16000,
          encoding: 'pcm',
          channels: 1,
        },
        startTime: new Date(),
        lastActivityTime: new Date(),
        status: 'active',
      } as Session,
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should register all built-in tools', () => {
      const definitions = executor.getToolDefinitions();
      const toolNames = definitions.map(d => d.name);

      expect(toolNames).toContain('record_response');
      expect(toolNames).toContain('get_next_question');
      expect(toolNames).toContain('validate_answer');
      expect(toolNames).toContain('get_demo_context');
    });
  });

  describe('registerTool', () => {
    it('should register a custom tool handler', () => {
      const customHandler = jest.fn();
      executor.registerTool('custom_tool', customHandler);

      // Verify tool is registered (we can't directly check the map, but we can try to execute it)
      expect(() => executor.executeTool('custom_tool', {}, mockContext)).not.toThrow();
    });
  });

  describe('validateToolParameters', () => {
    it('should validate required parameters are present', () => {
      const result = executor.validateToolParameters('record_response', {
        questionId: 'q1',
        response: 'test',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should fail validation when required parameters are missing', () => {
      const result = executor.validateToolParameters('record_response', {
        response: 'test',
        // missing questionId
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('Missing required parameter: questionId');
    });

    it('should fail validation for non-existent tool', () => {
      const result = executor.validateToolParameters('non_existent_tool', {});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Tool 'non_existent_tool' not found");
    });

    it('should validate parameter types', () => {
      const result = executor.validateToolParameters('record_response', {
        questionId: 123, // should be string
        response: 'test',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.includes('questionId'))).toBe(true);
    });

    it('should allow optional parameters to be missing', () => {
      const result = executor.validateToolParameters('record_response', {
        questionId: 'q1',
        response: 'test',
        // responseType is optional
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('executeTool', () => {
    it('should execute a registered tool successfully', async () => {
      const { recordResponseHandler } = require('../../../src/tools/record-response');
      recordResponseHandler.mockResolvedValue({
        success: true,
        message: 'Response recorded',
      });

      const result = await executor.executeTool(
        'record_response',
        { questionId: 'q1', response: 'test' },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        success: true,
        message: 'Response recorded',
      });
      expect(recordResponseHandler).toHaveBeenCalledWith(
        { questionId: 'q1', response: 'test' },
        mockContext
      );
    });

    it('should return error for non-existent tool', async () => {
      const result = await executor.executeTool(
        'non_existent_tool',
        {},
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for invalid parameters', async () => {
      const result = await executor.executeTool(
        'record_response',
        { response: 'test' }, // missing questionId
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid parameters');
    });

    it('should handle tool execution errors gracefully', async () => {
      const { recordResponseHandler } = require('../../../src/tools/record-response');
      recordResponseHandler.mockRejectedValue(new Error('Database error'));

      const result = await executor.executeTool(
        'record_response',
        { questionId: 'q1', response: 'test' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should handle non-Error exceptions', async () => {
      const { recordResponseHandler } = require('../../../src/tools/record-response');
      recordResponseHandler.mockRejectedValue('String error');

      const result = await executor.executeTool(
        'record_response',
        { questionId: 'q1', response: 'test' },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });

  describe('getToolDefinitionsForBedrock', () => {
    it('should return all tool definitions', () => {
      const definitions = executor.getToolDefinitionsForBedrock();

      expect(definitions).toHaveLength(4);
      expect(definitions.every(d => d.name && d.description && d.inputSchema)).toBe(true);
    });

    it('should include correct schema for record_response', () => {
      const definitions = executor.getToolDefinitionsForBedrock();
      const recordResponse = definitions.find(d => d.name === 'record_response');

      expect(recordResponse).toBeDefined();
      expect(recordResponse?.inputSchema.required).toContain('questionId');
      expect(recordResponse?.inputSchema.required).toContain('response');
      expect(recordResponse?.inputSchema.properties.questionId).toBeDefined();
      expect(recordResponse?.inputSchema.properties.response).toBeDefined();
    });

    it('should include correct schema for get_next_question', () => {
      const definitions = executor.getToolDefinitionsForBedrock();
      const getNextQuestion = definitions.find(d => d.name === 'get_next_question');

      expect(getNextQuestion).toBeDefined();
      expect(getNextQuestion?.inputSchema.required).toContain('currentQuestionId');
    });

    it('should include correct schema for validate_answer', () => {
      const definitions = executor.getToolDefinitionsForBedrock();
      const validateAnswer = definitions.find(d => d.name === 'validate_answer');

      expect(validateAnswer).toBeDefined();
      expect(validateAnswer?.inputSchema.required).toContain('questionId');
      expect(validateAnswer?.inputSchema.required).toContain('response');
    });

    it('should include correct schema for get_demo_context', () => {
      const definitions = executor.getToolDefinitionsForBedrock();
      const getDemoContext = definitions.find(d => d.name === 'get_demo_context');

      expect(getDemoContext).toBeDefined();
      expect(getDemoContext?.inputSchema.required).toEqual([]);
    });
  });

  describe('getToolDefinitions (legacy)', () => {
    it('should return same result as getToolDefinitionsForBedrock', () => {
      const bedrockDefs = executor.getToolDefinitionsForBedrock();
      const legacyDefs = executor.getToolDefinitions();

      expect(legacyDefs).toEqual(bedrockDefs);
    });
  });

  describe('getToolExecutor singleton', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getToolExecutor();
      const instance2 = getToolExecutor();

      expect(instance1).toBe(instance2);
    });

    it('should return a ToolExecutor instance', () => {
      const instance = getToolExecutor();

      expect(instance).toBeInstanceOf(ToolExecutor);
    });
  });
});
