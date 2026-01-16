# Design Document: Voiceter Backend BiDirectional API Integration

## Overview

The Voiceter Backend BiDirectional API Integration system provides a real-time voice survey platform using Amazon Nova 2 Sonic's speech-to-speech capabilities. The system bridges a React frontend with AWS Bedrock through WebSocket connections, enabling natural conversational surveys with sub-300ms latency.

### Key Design Goals

1. **Low Latency**: Achieve sub-300ms end-to-end audio latency through efficient streaming
2. **Scalability**: Support 50+ concurrent demo sessions with horizontal scaling
3. **Reliability**: Graceful error handling and automatic session cleanup
4. **Maintainability**: Clean separation of concerns with modular architecture
5. **Observability**: Comprehensive logging and metrics for monitoring

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser Client (React)                       │
│  • Web Audio API (16kHz PCM)                                    │
│  • Socket.IO Client                                             │
│  • Real-time UI Updates                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket (WSS)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  Voiceter Backend (Node.js)                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           WebSocket Layer (Socket.IO)                    │  │
│  │  • Connection Management                                 │  │
│  │  • Event Routing                                         │  │
│  │  • Session Mapping                                       │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                            │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │         Session Management Layer                         │  │
│  │  • Session Lifecycle                                     │  │
│  │  • State Management                                      │  │
│  │  • Cleanup & Timeout                                     │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                            │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │      BiDirectional Streaming Layer                       │  │
│  │  • HTTP/2 Handler                                        │  │
│  │  • AsyncIterable Pattern                                 │  │
│  │  • Event Queue Management                                │  │
│  │  • Audio Buffering                                       │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                            │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │         Business Logic Layer                             │  │
│  │  • Questionnaire Engine                                  │  │
│  │  • Tool Executor                                         │  │
│  │  • Response Validator                                    │  │
│  │  • System Prompt Generator                               │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                            │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │           Data Access Layer                              │  │
│  │  • DynamoDB Repositories                                 │  │
│  │  • S3 Client (Audio Recording)                           │  │
│  │  • Redis Client (Session State)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/2 BiDirectional Stream
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              Amazon Bedrock (Nova 2 Sonic)                       │
│  • Speech-to-Speech Processing                                  │
│  • Tool Use Execution                                           │
│  • Natural Language Understanding                               │
└──────────────────────────────────────────────────────────────────┘
```


## Components and Interfaces

### 1. BiDirectional Streaming Components

#### NovaSonicBidirectionalStreamClient

**Purpose**: Manages BiDirectional streams with Amazon Bedrock Nova Sonic

**Responsibilities**:
- Initialize BedrockRuntimeClient with HTTP/2 handler
- Create and manage multiple concurrent sessions
- Handle AsyncIterable pattern for event streaming
- Process response events from Nova Sonic
- Manage session cleanup and timeout

**Key Methods**:
```typescript
class NovaSonicBidirectionalStreamClient {
  constructor(config: NovaSonicBidirectionalStreamClientConfig)
  createStreamSession(sessionId?: string): StreamSession
  initiateBidirectionalStreaming(sessionId: string): Promise<void>
  isSessionActive(sessionId: string): boolean
  getActiveSessions(): string[]
  closeSession(sessionId: string): Promise<void>
  forceCloseSession(sessionId: string): void
}
```

**Configuration**:
```typescript
interface NovaSonicBidirectionalStreamClientConfig {
  requestHandlerConfig: {
    requestTimeout: 300000,      // 5 minutes
    sessionTimeout: 300000,      // 5 minutes
    disableConcurrentStreams: false,
    maxConcurrentStreams: 20
  },
  clientConfig: {
    region: string,
    credentials: AWSCredentials
  },
  inferenceConfig: {
    maxTokens: 1024,
    topP: 0.9,
    temperature: 0.7
  }
}
```

#### StreamSession

**Purpose**: Represents a single BiDirectional streaming session

**Responsibilities**:
- Manage session-specific event queue
- Buffer and stream audio chunks
- Register event handlers
- Execute session lifecycle methods
- Handle session cleanup

**Key Methods**:
```typescript
class StreamSession {
  constructor(sessionId: string, client: NovaSonicBidirectionalStreamClient)
  onEvent(eventType: string, handler: (data: any) => void): StreamSession
  setupSessionAndPromptStart(): Promise<void>
  setupSystemPrompt(textConfig, systemPromptContent): Promise<void>
  setupStartAudio(audioConfig): Promise<void>
  streamAudio(audioData: Buffer): Promise<void>
  endAudioContent(): Promise<void>
  endPrompt(): Promise<void>
  close(): Promise<void>
  getSessionId(): string
}
```

**Internal State**:
```typescript
interface SessionData {
  queue: Array<any>                              // Event queue
  queueSignal: Subject<void>                     // RxJS signal for queue updates
  closeSignal: Subject<void>                     // RxJS signal for close
  responseHandlers: Map<string, (data: any) => void>  // Event handlers
  promptName: string                             // Unique prompt identifier
  audioContentId: string                         // Unique audio content identifier
  inferenceConfig: InferenceConfig               // Nova Sonic parameters
  isActive: boolean                              // Session active flag
  isPromptStartSent: boolean                     // Prompt initialization flag
  isAudioContentStartSent: boolean               // Audio streaming flag
  toolUseContent: any                            // Current tool use data
  toolUseId: string                              // Current tool use ID
  toolName: string                               // Current tool name
}
```

### 2. WebSocket Components

#### WebSocketServer

**Purpose**: Manages WebSocket connections with browser clients

**Responsibilities**:
- Accept Socket.IO connections
- Map socket connections to sessions
- Route events between client and BiDirectional stream
- Handle connection lifecycle
- Manage session states

**Key Events**:
```typescript
// Client → Server
interface ClientEvents {
  initializeConnection: (callback: (result) => void) => void
  promptStart: () => void
  systemPrompt: (promptContent: string) => void
  audioStart: () => void
  audioInput: (audioData: string) => void  // base64
  stopAudio: () => void
}

// Server → Client
interface ServerEvents {
  audioReady: () => void
  textOutput: (data: TextOutputEvent) => void
  audioOutput: (data: AudioOutputEvent) => void
  toolUse: (data: ToolUseEvent) => void
  toolResult: (data: ToolResultEvent) => void
  contentEnd: (data: ContentEndEvent) => void
  streamComplete: () => void
  sessionClosed: () => void
  error: (data: ErrorEvent) => void
}
```

**Session State Management**:
```typescript
enum SessionState {
  INITIALIZING = 'initializing',  // Creating session
  READY = 'ready',                // Session created, not streaming
  ACTIVE = 'active',              // BiDirectional stream active
  CLOSED = 'closed'               // Session ended
}
```


### 3. Business Logic Components

#### QuestionnaireEngine

**Purpose**: Manages survey logic and question progression

**Responsibilities**:
- Load questionnaires from JSON files
- Evaluate display logic conditions
- Evaluate skip logic conditions
- Apply dynamic question text
- Filter dynamic options
- Track question progression
- Determine survey completion

**Key Methods**:
```typescript
class QuestionnaireEngine {
  loadQuestionnaire(questionnaireId: string): Questionnaire
  getNextQuestion(session: Session): Question | null
  evaluateDisplayLogic(question: Question, responses: Map<string, Response>): boolean
  evaluateSkipLogic(question: Question, responses: Map<string, Response>): string | null
  applyDynamicQuestionText(question: Question, responses: Map<string, Response>): string
  filterDynamicOptions(question: Question, responses: Map<string, Response>): Option[]
  isQuestionnaireComplete(session: Session): boolean
  getProgress(session: Session): { current: number, total: number }
}
```

#### ToolExecutor

**Purpose**: Executes tools requested by Nova Sonic

**Responsibilities**:
- Register tool handlers
- Route tool execution requests
- Validate tool parameters
- Execute tool logic
- Format tool results
- Handle tool errors

**Tool Handlers**:
```typescript
interface ToolHandler {
  name: string
  description: string
  inputSchema: JSONSchema
  execute: (parameters: any, session: Session) => Promise<any>
}

// Tool: record_response
async function recordResponse(params: {
  questionId: string,
  response: string,
  responseType: string
}, session: Session): Promise<{ success: boolean, message: string }>

// Tool: get_next_question
async function getNextQuestion(params: {}, session: Session): Promise<{
  questionId: string,
  questionText: string,
  questionType: string,
  options?: string[],
  isComplete: boolean
}>

// Tool: validate_answer
async function validateAnswer(params: {
  questionId: string,
  response: string
}, session: Session): Promise<{
  valid: boolean,
  message?: string
}>

// Tool: get_demo_context
async function getDemoContext(params: {}, session: Session): Promise<{
  questionnaireId: string,
  questionnaireName: string,
  currentQuestionIndex: number,
  totalQuestions: number
}>
```

#### SystemPromptGenerator

**Purpose**: Generates dynamic system prompts for Nova Sonic

**Responsibilities**:
- Include questionnaire context
- Include current question details
- Include conversation guidelines
- Include tool usage instructions
- Adapt tone for survey type

**Prompt Template**:
```typescript
function generateSystemPrompt(
  questionnaire: Questionnaire,
  currentQuestion: Question,
  session: Session
): string {
  return `You are a professional survey interviewer conducting a ${questionnaire.type} survey.

QUESTIONNAIRE: ${questionnaire.name}
DESCRIPTION: ${questionnaire.description}

CURRENT QUESTION (${session.currentQuestionIndex + 1}/${questionnaire.questions.length}):
ID: ${currentQuestion.id}
TEXT: ${currentQuestion.text}
TYPE: ${currentQuestion.type}
${currentQuestion.options ? `OPTIONS: ${currentQuestion.options.map(o => o.text).join(', ')}` : ''}

INSTRUCTIONS:
1. Ask the current question naturally and conversationally
2. Listen carefully to the user's response
3. When you have a clear answer, use the record_response tool with questionId="${currentQuestion.id}"
4. After recording, use get_next_question tool to advance
5. Be ${questionnaire.tone || 'professional and friendly'}
6. Keep responses concise (2-3 sentences)
7. Don't repeat the question unless user asks

RESPONSE GUIDELINES:
${getResponseGuidelines(currentQuestion)}

Begin by asking the current question.`
}
```

### 4. Data Access Components

#### SessionRepository

**Purpose**: Persist and retrieve session data

**Methods**:
```typescript
class SessionRepository {
  async createSession(session: SessionRecord): Promise<void>
  async getSession(sessionId: string): Promise<SessionRecord | null>
  async updateSession(sessionId: string, updates: Partial<SessionRecord>): Promise<void>
  async deleteSession(sessionId: string): Promise<void>
  async listActiveSessions(): Promise<SessionRecord[]>
}

interface SessionRecord {
  sessionId: string
  questionnaireId: string
  currentQuestionIndex: number
  startTime: string
  lastActivityTime: string
  status: 'active' | 'completed' | 'terminated' | 'error'
  voiceId: string
  metadata: Record<string, any>
}
```

#### ResponseRepository

**Purpose**: Store survey responses

**Methods**:
```typescript
class ResponseRepository {
  async saveResponse(response: ResponseRecord): Promise<void>
  async getResponses(sessionId: string): Promise<ResponseRecord[]>
  async getResponse(sessionId: string, questionId: string): Promise<ResponseRecord | null>
}

interface ResponseRecord {
  sessionId: string
  questionId: string
  response: string
  responseType: string
  timestamp: string
  metadata: Record<string, any>
}
```

#### TranscriptRepository

**Purpose**: Store conversation transcripts

**Methods**:
```typescript
class TranscriptRepository {
  async saveTranscript(transcript: TranscriptRecord): Promise<void>
  async getTranscripts(sessionId: string): Promise<TranscriptRecord[]>
}

interface TranscriptRecord {
  sessionId: string
  speaker: 'USER' | 'ASSISTANT'
  text: string
  timestamp: string
  isFinal: boolean
}
```


## Data Models

### Session State

```typescript
interface Session {
  // Identity
  sessionId: string
  socketId: string
  
  // Questionnaire Context
  questionnaireId: string
  questionnaire: Questionnaire
  currentQuestionIndex: number
  
  // Response History
  responses: Map<string, Response>
  
  // Conversation History
  conversationHistory: ConversationTurn[]
  
  // BiDirectional Stream IDs
  bedrockStreamIds: {
    promptName: string
    audioContentId: string
  }
  
  // Configuration
  audioConfig: AudioConfiguration
  voiceId: string
  inferenceConfig: InferenceConfig
  
  // Timing
  startTime: Date
  lastActivityTime: Date
  
  // Status
  status: 'active' | 'completed' | 'terminated' | 'error'
}

interface Response {
  questionId: string
  response: string
  responseType: string
  timestamp: Date
  metadata?: Record<string, any>
}

interface ConversationTurn {
  speaker: 'USER' | 'ASSISTANT'
  text: string
  timestamp: Date
  isFinal: boolean
}
```

### Questionnaire Models

```typescript
interface Questionnaire {
  id: string
  name: string
  description: string
  type: 'csat_nps' | 'concept_test' | 'political_polling' | 'brand_tracker'
  tone: string
  recommendedVoice: string
  questions: Question[]
  metadata: Record<string, any>
}

interface Question {
  id: string
  text: string
  type: 'rating' | 'open_ended' | 'multiple_choice' | 'yes_no' | 'nps'
  options?: Option[]
  displayLogic?: DisplayLogic
  skipLogic?: SkipLogic
  dynamicQuestionText?: DynamicQuestionText
  dynamicOptions?: DynamicOptions
  validation?: ValidationRule[]
  metadata: Record<string, any>
}

interface Option {
  value: string
  text: string
  metadata?: Record<string, any>
}

interface DisplayLogic {
  operator: 'AND' | 'OR'
  conditions: Condition[]
}

interface SkipLogic {
  conditions: SkipCondition[]
}

interface Condition {
  questionId: string
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'
  value: any
}

interface SkipCondition extends Condition {
  targetQuestionId: string
}

interface DynamicQuestionText {
  basedOn: string
  rules: DynamicTextRule[]
}

interface DynamicTextRule {
  condition: Condition
  questionText: string
}

interface DynamicOptions {
  sourceQuestionId: string
  filterType: 'include' | 'exclude'
}

interface ValidationRule {
  type: 'required' | 'min_length' | 'max_length' | 'pattern' | 'range'
  value: any
  message: string
}
```

### Audio Configuration

```typescript
interface AudioConfiguration {
  input: {
    audioType: 'SPEECH'
    encoding: 'base64'
    mediaType: 'audio/lpcm'
    sampleRateHertz: 16000
    sampleSizeBits: 16
    channelCount: 1
  }
  output: {
    audioType: 'SPEECH'
    encoding: 'base64'
    mediaType: 'audio/lpcm'
    sampleRateHertz: 24000
    sampleSizeBits: 16
    channelCount: 1
    voiceId: string
  }
}
```

### Event Models

```typescript
// Nova Sonic Events (Outgoing)
interface SessionStartEvent {
  event: {
    sessionStart: {
      inferenceConfiguration: InferenceConfig
    }
  }
}

interface PromptStartEvent {
  event: {
    promptStart: {
      promptName: string
      textOutputConfiguration: { mediaType: 'text/plain' }
      audioOutputConfiguration: AudioConfiguration['output']
      toolUseOutputConfiguration: { mediaType: 'application/json' }
      toolConfiguration: { tools: ToolSpec[] }
    }
  }
}

interface ContentStartEvent {
  event: {
    contentStart: {
      promptName: string
      contentName: string
      type: 'TEXT' | 'AUDIO' | 'TOOL'
      interactive: boolean
      role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL'
      textInputConfiguration?: { mediaType: 'text/plain' }
      audioInputConfiguration?: AudioConfiguration['input']
      toolResultInputConfiguration?: {
        toolUseId: string
        type: 'TEXT'
        textInputConfiguration: { mediaType: 'text/plain' }
      }
    }
  }
}

interface AudioInputEvent {
  event: {
    audioInput: {
      promptName: string
      contentName: string
      content: string  // base64
    }
  }
}

interface TextInputEvent {
  event: {
    textInput: {
      promptName: string
      contentName: string
      content: string
    }
  }
}

interface ToolResultEvent {
  event: {
    toolResult: {
      promptName: string
      contentName: string
      content: string
    }
  }
}

interface ContentEndEvent {
  event: {
    contentEnd: {
      promptName: string
      contentName: string
    }
  }
}

interface PromptEndEvent {
  event: {
    promptEnd: {
      promptName: string
    }
  }
}

interface SessionEndEvent {
  event: {
    sessionEnd: {}
  }
}

// Nova Sonic Events (Incoming)
interface TextOutputEvent {
  role: 'USER' | 'ASSISTANT'
  content: string
  final: boolean
  interrupted?: boolean
}

interface AudioOutputEvent {
  content: string  // base64
}

interface ToolUseEvent {
  toolUseId: string
  toolName: string
  content: string  // JSON string with parameters
}

interface CompletionEndEvent {
  timestamp: string
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Session ID Uniqueness
*For any* set of session creation requests, all generated session IDs should be unique across the system
**Validates: Requirements 1.2, 2.1, 15.2**

### Property 2: Event Queue Ordering
*For any* sequence of events added to a session queue, the AsyncIterable should yield them in the exact order they were added
**Validates: Requirements 1.4, 2.4**

### Property 3: Close Signal Termination
*For any* active session, when a close signal is triggered, the AsyncIterable should return done:true and stop yielding events
**Validates: Requirements 1.5, 2.8**

### Property 4: Audio Queue Size Limit
*For any* session receiving audio chunks, the audio buffer queue should never exceed 200 chunks, dropping oldest chunks when full
**Validates: Requirements 3.2, 3.3, 15.3**

### Property 5: Audio Batch Processing
*For any* audio queue processing cycle, the system should process at most 5 chunks per batch
**Validates: Requirements 3.4**

### Property 6: Audio Event Structure
*For any* audio chunk sent to Nova Sonic, the audioInput event should contain promptName, contentName, and base64-encoded content
**Validates: Requirements 3.5**

### Property 7: Tool Use Extraction
*For any* toolUse event from Nova Sonic, the system should successfully extract toolName, toolUseId, and parameters
**Validates: Requirements 4.2**

### Property 8: Tool Result Sequence
*For any* successful tool execution, the system should send contentStart (TOOL), toolResult, and contentEnd events in that exact order
**Validates: Requirements 4.4**

### Property 9: Tool Error Handling
*For any* tool execution that fails, the system should return an error result to Nova Sonic and log the failure without crashing
**Validates: Requirements 4.8, 8.5**

### Property 10: Socket ID Uniqueness
*For any* set of WebSocket connections, all assigned socket IDs should be unique
**Validates: Requirements 5.1**

### Property 11: Event Forwarding Preservation
*For any* textOutput or audioOutput event from Nova Sonic, the system should forward it to the client with content preserved
**Validates: Requirements 5.9, 5.10**

### Property 12: System Prompt Completeness
*For any* questionnaire and current question, the generated system prompt should include questionnaire context, question text, question type, and options (if applicable)
**Validates: Requirements 6.1**

### Property 13: Display Logic Evaluation
*For any* question with display logic and response history, the system should correctly evaluate whether the question should be displayed
**Validates: Requirements 6.2, 6.3**

### Property 14: Skip Logic Navigation
*For any* question with skip logic where conditions are met, the system should jump to the correct target question
**Validates: Requirements 6.4**

### Property 15: Dynamic Question Text Selection
*For any* question with dynamic text rules and matching prior responses, the system should select the correct question text variant
**Validates: Requirements 6.5**

### Property 16: Dynamic Options Filtering
*For any* question with dynamic options and prior selections, the system should filter options correctly based on the filter type
**Validates: Requirements 6.6**

### Property 17: Response State Update
*For any* recorded response, the session state should be updated immediately and the response should be available for subsequent logic evaluation
**Validates: Requirements 6.8**

### Property 18: Transcription Storage
*For any* textOutput event with final:true, the system should store the transcription with correct speaker, text, and timestamp
**Validates: Requirements 7.1, 7.2**

### Property 19: Database Retry with Exponential Backoff
*For any* database operation that fails, the system should retry up to 3 times with exponentially increasing delays
**Validates: Requirements 7.6, 8.6**

### Property 20: Session Continuation After Database Failure
*For any* database operation that fails after all retries, the session should continue without crashing
**Validates: Requirements 7.7**

### Property 21: Error Logging Completeness
*For any* error that occurs, the log entry should contain sessionId (if available), error code, message, and stack trace
**Validates: Requirements 8.1**

### Property 22: Error Event Propagation
*For any* error that occurs, an error event should be emitted to the client with a user-friendly message (no internal details)
**Validates: Requirements 8.2**

### Property 23: Session Isolation
*For any* two concurrent sessions, modifying state in one session should not affect state in the other session
**Validates: Requirements 11.1, 11.7**

### Property 24: Input Validation Rejection
*For any* WebSocket message that doesn't match the expected schema, the system should reject it with a validation error
**Validates: Requirements 14.1**

### Property 25: Audio Size Validation
*For any* audio chunk exceeding 1MB, the system should reject it with a size limit error
**Validates: Requirements 14.2**

### Property 26: Session ID Validation
*For any* event received, if the sessionId doesn't exist or is inactive, the system should reject it with an invalid session error
**Validates: Requirements 14.3**

### Property 27: Rate Limit Enforcement
*For any* session sending more than 100 messages per second, the system should reject subsequent messages with RATE_LIMIT_EXCEEDED error
**Validates: Requirements 14.7**


## Error Handling

### Error Categories

1. **WebSocket Errors**
   - Connection failures
   - Message parsing errors
   - Protocol violations
   - Rate limit exceeded

2. **Bedrock API Errors**
   - Model invocation failures
   - Streaming interruptions
   - Rate limiting (throttling)
   - Model not available

3. **Database Errors**
   - Write failures
   - Connection timeouts
   - Throttling
   - Item not found

4. **Audio Processing Errors**
   - Invalid format
   - Encoding/decoding failures
   - Buffer overflows
   - Size limit exceeded

5. **Questionnaire Logic Errors**
   - Invalid question references
   - Logic evaluation failures
   - Missing required data
   - Circular dependencies

6. **Tool Execution Errors**
   - Tool not found
   - Invalid parameters
   - Execution timeout
   - Handler exceptions

7. **Session Management Errors**
   - Session not found
   - Session already exists
   - Cleanup timeout
   - State corruption

### Error Handling Strategy

```typescript
class ErrorHandler {
  async handleError(error: Error, context: ErrorContext): Promise<void> {
    // 1. Log error with full context
    logger.error('Error occurred', {
      sessionId: context.sessionId,
      errorCode: this.getErrorCode(error),
      message: error.message,
      stack: error.stack,
      context
    })
    
    // 2. Emit CloudWatch metric
    metrics.incrementErrorCount(this.getErrorCode(error))
    
    // 3. Determine if error is recoverable
    const recoverable = this.isRecoverable(error)
    
    // 4. Send user-friendly error to client
    if (context.socket) {
      context.socket.emit('error', {
        errorCode: this.getErrorCode(error),
        errorMessage: this.getUserFriendlyMessage(error),
        recoverable
      })
    }
    
    // 5. Attempt recovery if possible
    if (recoverable) {
      await this.attemptRecovery(error, context)
    } else {
      // 6. Clean up session if not recoverable
      await this.cleanupSession(context.sessionId)
    }
  }
  
  private isRecoverable(error: Error): boolean {
    // Network errors, throttling, temporary failures are recoverable
    // Invalid input, authentication failures are not recoverable
    return error instanceof NetworkError ||
           error instanceof ThrottlingError ||
           error instanceof TemporaryError
  }
  
  private async attemptRecovery(error: Error, context: ErrorContext): Promise<void> {
    if (error instanceof ThrottlingError) {
      // Wait and retry
      await this.exponentialBackoff(context.retryCount)
    } else if (error instanceof NetworkError) {
      // Reconnect
      await this.reconnect(context.sessionId)
    }
  }
}
```

### Error Codes

```typescript
enum ErrorCode {
  // WebSocket Errors (WS_*)
  WS_CONNECTION_FAILED = 'WS_CONNECTION_FAILED',
  WS_MESSAGE_INVALID = 'WS_MESSAGE_INVALID',
  WS_PROTOCOL_VIOLATION = 'WS_PROTOCOL_VIOLATION',
  WS_RATE_LIMIT_EXCEEDED = 'WS_RATE_LIMIT_EXCEEDED',
  
  // Bedrock Errors (BEDROCK_*)
  BEDROCK_INIT_FAILED = 'BEDROCK_INIT_FAILED',
  BEDROCK_STREAM_ERROR = 'BEDROCK_STREAM_ERROR',
  BEDROCK_THROTTLED = 'BEDROCK_THROTTLED',
  BEDROCK_MODEL_UNAVAILABLE = 'BEDROCK_MODEL_UNAVAILABLE',
  
  // Database Errors (DB_*)
  DB_WRITE_FAILED = 'DB_WRITE_FAILED',
  DB_CONNECTION_TIMEOUT = 'DB_CONNECTION_TIMEOUT',
  DB_THROTTLED = 'DB_THROTTLED',
  DB_ITEM_NOT_FOUND = 'DB_ITEM_NOT_FOUND',
  
  // Audio Errors (AUDIO_*)
  AUDIO_INVALID_FORMAT = 'AUDIO_INVALID_FORMAT',
  AUDIO_ENCODING_FAILED = 'AUDIO_ENCODING_FAILED',
  AUDIO_SIZE_EXCEEDED = 'AUDIO_SIZE_EXCEEDED',
  
  // Questionnaire Errors (QUEST_*)
  QUEST_INVALID_REFERENCE = 'QUEST_INVALID_REFERENCE',
  QUEST_LOGIC_ERROR = 'QUEST_LOGIC_ERROR',
  QUEST_NOT_FOUND = 'QUEST_NOT_FOUND',
  
  // Tool Errors (TOOL_*)
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_INVALID_PARAMS = 'TOOL_INVALID_PARAMS',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  
  // Session Errors (SESSION_*)
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_CLEANUP_TIMEOUT = 'SESSION_CLEANUP_TIMEOUT',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Generic Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}
```

### Retry Strategy

```typescript
class RetryStrategy {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      retryableErrors = [NetworkError, ThrottlingError]
    } = options
    
    let lastError: Error
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        
        // Check if error is retryable
        const isRetryable = retryableErrors.some(
          ErrorType => error instanceof ErrorType
        )
        
        if (!isRetryable || attempt === maxRetries) {
          throw error
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt),
          maxDelay
        )
        
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: error.message
        })
        
        await this.sleep(delay)
      }
    }
    
    throw lastError
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

## Testing Strategy

### Unit Testing

**Framework**: Jest with TypeScript support

**Coverage Target**: 80%+ code coverage

**Test Categories**:

1. **Session Management Tests**
   - Session creation with unique IDs
   - Session state initialization
   - Session cleanup sequence
   - Timeout handling

2. **Audio Buffering Tests**
   - Queue size enforcement
   - Oldest chunk dropping
   - Batch processing limits
   - Buffer overflow handling

3. **Event Queue Tests**
   - Event ordering preservation
   - Queue signal behavior
   - Close signal handling
   - AsyncIterable termination

4. **Tool Execution Tests**
   - Tool handler routing
   - Parameter extraction
   - Result formatting
   - Error handling

5. **Questionnaire Logic Tests**
   - Display logic evaluation
   - Skip logic navigation
   - Dynamic text selection
   - Dynamic options filtering

6. **Error Handling Tests**
   - Error logging completeness
   - Error propagation
   - Recovery attempts
   - Cleanup on failure

### Property-Based Testing

**Framework**: fast-check

**Iterations**: 100+ per property

**Test Files**: Located in `tests/property/`

Each property test MUST include a comment referencing the design document:
```typescript
/**
 * Feature: voiceter-backend-bidirectional, Property 1: Session ID Uniqueness
 * Validates: Requirements 1.2, 2.1, 15.2
 */
test('session IDs are unique across all sessions', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ /* session params */ }), { minLength: 2, maxLength: 100 }),
      (sessionRequests) => {
        const sessionIds = sessionRequests.map(req => createSession(req).sessionId)
        const uniqueIds = new Set(sessionIds)
        return sessionIds.length === uniqueIds.size
      }
    ),
    { numRuns: 100 }
  )
})
```

### Integration Testing

**Test Scenarios**:

1. **WebSocket to Bedrock Flow**
   - Client connects → Session created → Stream initiated → Audio flows → Session closes
   - Verify all events are properly routed
   - Verify state is maintained throughout

2. **Tool Use Flow**
   - Nova Sonic sends toolUse → Tool executes → Result sent back → Conversation continues
   - Verify tool execution is correct
   - Verify result format is correct

3. **Error Recovery Flow**
   - Error occurs → Error logged → Client notified → Recovery attempted → Session continues or closes
   - Verify graceful degradation
   - Verify cleanup occurs

4. **Database Integration**
   - Response recorded → Database write → Retry on failure → Success or continue
   - Verify data persistence
   - Verify retry logic

### Load Testing

**Framework**: Artillery or k6

**Scenarios**:

1. **Concurrent Sessions**
   - Ramp up to 50 concurrent sessions over 2 minutes
   - Maintain for 5 minutes
   - Measure latency, error rate, throughput

2. **Audio Streaming**
   - Stream continuous audio for 5 minutes per session
   - Measure end-to-end latency
   - Verify no audio loss

3. **Tool Execution**
   - Execute tools at high frequency
   - Measure tool execution latency
   - Verify database writes succeed

**Pass Criteria**:
- P95 latency < 300ms
- Error rate < 1%
- No memory leaks
- All sessions complete successfully


## Deployment Architecture

### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Application Load Balancer                  │ │
│  │  • SSL Termination (TLS 1.2+)                              │ │
│  │  • WebSocket Support                                       │ │
│  │  • Sticky Sessions                                         │ │
│  │  • Health Checks (/health)                                 │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
│                         │                                         │
│  ┌──────────────────────▼─────────────────────────────────────┐ │
│  │              ECS Fargate (Auto-Scaling)                     │ │
│  │                                                             │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │ │
│  │  │   Task 1    │  │   Task 2    │  │   Task N    │       │ │
│  │  │  Backend    │  │  Backend    │  │  Backend    │       │ │
│  │  │  Container  │  │  Container  │  │  Container  │       │ │
│  │  │  1 vCPU     │  │  1 vCPU     │  │  1 vCPU     │       │ │
│  │  │  2 GB RAM   │  │  2 GB RAM   │  │  2 GB RAM   │       │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │ │
│  │                                                             │ │
│  │  Min: 2 tasks  |  Max: 10 tasks  |  Target: CPU 70%       │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
│                         │                                         │
│  ┌──────────────────────▼─────────────────────────────────────┐ │
│  │                    Amazon Bedrock                           │ │
│  │  • Nova 2 Sonic Model (amazon.nova-2-sonic-v1:0)          │ │
│  │  • BiDirectional Streaming                                 │ │
│  │  • HTTP/2 Connection Pooling                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      DynamoDB                                │ │
│  │  • demo-sessions (On-Demand)                                │ │
│  │  • demo-responses (On-Demand)                               │ │
│  │  • demo-transcripts (On-Demand)                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    ElastiCache Redis                         │ │
│  │  • Session State (Optional for multi-instance)              │ │
│  │  • 30-minute TTL                                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                         S3                                   │ │
│  │  • Audio Recordings (Optional)                              │ │
│  │  • 90-day Lifecycle Policy                                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                     CloudWatch                               │ │
│  │  • Logs (Structured JSON)                                   │ │
│  │  • Metrics (Custom + Standard)                              │ │
│  │  • Alarms (Error Rate, Latency, CPU, Memory)               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=amazon.nova-2-sonic-v1:0

# DynamoDB Tables
DYNAMODB_TABLE_PREFIX=demo-
DYNAMODB_SESSIONS_TABLE=demo-sessions
DYNAMODB_RESPONSES_TABLE=demo-responses
DYNAMODB_TRANSCRIPTS_TABLE=demo-transcripts

# S3 Configuration (Optional)
S3_BUCKET_NAME=voiceter-demo-recordings
S3_AUDIO_PREFIX=recordings/

# Redis Configuration (Optional for multi-instance)
REDIS_URL=redis://elasticache-endpoint:6379
REDIS_SESSION_TTL=1800  # 30 minutes

# Server Configuration
PORT=8080
LOG_LEVEL=INFO
NODE_ENV=production

# Feature Flags
ENABLE_AUDIO_RECORDING=false
ENABLE_SENTIMENT_ANALYSIS=false
ENABLE_QUOTA_MANAGEMENT=false

# Rate Limiting
MAX_MESSAGES_PER_SECOND=100
MAX_AUDIO_CHUNK_SIZE_MB=1

# Timeouts
SESSION_TIMEOUT_MINUTES=30
CLEANUP_TIMEOUT_SECONDS=5
DISCONNECT_CLEANUP_TIMEOUT_SECONDS=3

# Monitoring
CLOUDWATCH_NAMESPACE=Voiceter/Backend
ENABLE_XRAY_TRACING=true
```

### Docker Configuration

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY dist ./dist
COPY questionnaires ./questionnaires

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run application
CMD ["node", "dist/server.js"]
```

### ECS Task Definition

```json
{
  "family": "voiceter-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "voiceter-backend",
      "image": "voiceter-backend:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "AWS_REGION", "value": "us-east-1" },
        { "name": "PORT", "value": "8080" },
        { "name": "LOG_LEVEL", "value": "INFO" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/voiceter-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ],
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/voiceterBackendTaskRole"
}
```

### IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*:*:model/amazon.nova-2-sonic-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/demo-sessions",
        "arn:aws:dynamodb:*:*:table/demo-responses",
        "arn:aws:dynamodb:*:*:table/demo-transcripts"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::voiceter-demo-recordings/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

### Monitoring and Alarms

**CloudWatch Metrics**:
- `ConcurrentSessions` - Number of active sessions
- `WebSocketConnections` - Number of open WebSocket connections
- `BedrockLatency` - Bedrock API call latency (ms)
- `DatabaseLatency` - DynamoDB operation latency (ms)
- `AudioChunksProcessed` - Number of audio chunks processed
- `ErrorRate` - Percentage of requests with errors
- `ToolExecutionLatency` - Tool execution time (ms)

**CloudWatch Alarms**:
```typescript
// High Error Rate
{
  AlarmName: 'Voiceter-Backend-High-Error-Rate',
  MetricName: 'ErrorRate',
  Threshold: 5,  // 5%
  ComparisonOperator: 'GreaterThanThreshold',
  EvaluationPeriods: 2,
  Period: 300,  // 5 minutes
  Statistic: 'Average'
}

// High Latency
{
  AlarmName: 'Voiceter-Backend-High-Latency',
  MetricName: 'BedrockLatency',
  Threshold: 500,  // 500ms
  ComparisonOperator: 'GreaterThanThreshold',
  EvaluationPeriods: 3,
  Period: 60,
  Statistic: 'p95'
}

// High CPU
{
  AlarmName: 'Voiceter-Backend-High-CPU',
  MetricName: 'CPUUtilization',
  Threshold: 80,  // 80%
  ComparisonOperator: 'GreaterThanThreshold',
  EvaluationPeriods: 2,
  Period: 300
}

// High Memory
{
  AlarmName: 'Voiceter-Backend-High-Memory',
  MetricName: 'MemoryUtilization',
  Threshold: 85,  // 85%
  ComparisonOperator: 'GreaterThanThreshold',
  EvaluationPeriods: 2,
  Period: 300
}
```

### Scaling Configuration

```typescript
// Auto-Scaling Policy
{
  ServiceName: 'voiceter-backend',
  MinCapacity: 2,
  MaxCapacity: 10,
  TargetTrackingScalingPolicies: [
    {
      TargetValue: 70,  // 70% CPU
      PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
      ScaleInCooldown: 300,
      ScaleOutCooldown: 60
    },
    {
      TargetValue: 80,  // 80% Memory
      PredefinedMetricType: 'ECSServiceAverageMemoryUtilization',
      ScaleInCooldown: 300,
      ScaleOutCooldown: 60
    }
  ]
}
```

## Security Considerations

### Network Security
- All WebSocket connections use WSS (WebSocket Secure)
- ALB terminates TLS 1.2+ connections
- Backend to AWS services use TLS 1.2+
- VPC endpoints for Bedrock (optional for enhanced security)

### Authentication & Authorization
- Optional JWT validation for authenticated demos
- Session ID validation on all events
- Origin validation for WebSocket connections
- Rate limiting per session (100 messages/second)

### Data Protection
- In Transit: TLS 1.2+ for all connections
- At Rest: DynamoDB encryption enabled, S3 encryption (AES-256)
- Retention: Audio recordings 90 days, transcripts 90 days
- No PII in logs

### Input Validation
- Schema validation for all WebSocket messages
- Size limits: 1MB per message, 10MB per audio chunk
- Format validation: Audio must be 16kHz, 16-bit, mono PCM
- Type validation: Response types must match question types

### Secrets Management
- No hardcoded credentials
- IAM roles for AWS service access
- Environment variables for configuration
- AWS Secrets Manager for sensitive config (optional)

---

*Design Document Version: 1.0*  
*Last Updated: December 15, 2025*  
*Status: Ready for Implementation*
