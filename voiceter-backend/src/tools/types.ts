/**
 * Tool Execution Types
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * Session state for tool execution context
 * This is a minimal interface that tool handlers need
 */
export interface ToolSessionState {
  questionnaireId: string;
  currentQuestionIndex: number;
  responses: Map<string, any>;
  visitedQuestions?: Set<string>;
  firstQuestionAsked?: boolean;
  language?: string; // Language code (EN, TR, etc.)
  metadata?: {
    clarificationCounts?: Record<string, number>;
    [key: string]: any;
  };
}

export interface ToolExecutionContext {
  sessionId: string;
  questionnaireId: string;
  session: ToolSessionState;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  recordedData?: {
    qid: string;
    question: string;
    answer: string;
  };
}
