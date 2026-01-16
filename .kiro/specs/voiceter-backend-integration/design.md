# Design Document

## Overview

The Voiceter Backend Integration system is a Node.js-based WebSocket server that bridges the React frontend with AWS services to enable real-time voice survey demos. The system leverages Amazon Bedrock's Nova 2 Sonic speech-to-speech model for natural voice conversations, manages questionnaire logic, handles audio streaming, and persists survey data.

The architecture follows a three-tier design with clear separation between the WebSocket communication layer, business logic layer, and AWS services integration layer. This design enables horizontal scaling, fault tolerance, and maintainability while supporting 50+ concurrent voice survey sessions with sub-300ms latency.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│                  S3 + CloudFront                            │
└────────────────────┬────────────────────────────────────────┘
                     │ WSS (Secure WebSocket)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Backend Server (Node.js)                       │
│                  ECS Fargate                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WebSocket Layer (Socket.IO)                         │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  Business Logic Layer                                │  │
│  │  - Session Manager                                   │  │
│  │  - Questionnaire Engine                              │  │
│  │  - Audio Processor                                   │  │
│  │  - Tool Executor                                     │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  AWS Integration Layer                               │  │
│  │  - Bedrock Client                                    │  │
│  │  - DynamoDB Client                                   │  │
│  │  - S3 Client                                         │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────┬─────────────────────────┬─────────────────────┘
             │                         │
     HTTP/2 Bidirectional         Store Data
             ↓                         ↓
┌────────────────────────────┐  ┌──────────────────────────┐
│  Amazon Bedrock            │  │  AWS Services            │
│  Nova 2 Sonic Model        │  │  - DynamoDB              │
│  amazon.nova-2-sonic-v1:0  │  │  - S3                    │
│                            │  │  - CloudWatch            │
└────────────────────────────┘  └──────────────────────────┘
```

### Technology Stack

**Runtime & Framework:**
- Node.js 18+ with TypeScript
- Express.js for HTTP server
- Socket.IO for WebSocket communication

**AWS SDK:**
- @aws-sdk/client-bedrock-runtime (with HTTP/2 support)
- @aws-sdk/client-dynamodb
- @aws-sdk/client-s3
- @aws-sdk/client-cloudwatch-logs

**State Management:**
- In-memory for single instance
- Redis/ElastiCache for multi-instance deployment

**Audio Processing:**
- Native Buffer for PCM conversion
- Base64 encoding/decoding

**Deployment:**
- Docker containerization
- AWS ECS Fargate
- Application Load Balancer
- AWS CDK for infrastructure

## Components and Interfaces

### 1. WebSocket Server Component

**Responsibility:** Manage WebSocket connections, handle client events, and route messages.

**Interfaces:**

```typescript
interface WebSocketServer {
  initialize(port: number): Promise<void>;
  onConnection(handler: ConnectionHandler): void;
  onDisconnection(handler: DisconnectionHandler): void;
  emit(sessionId: string, event: string, data: any): void;
  broadcast(event: string, data: any): void;
  close(): Promise<void>;
}

interface ConnectionHandler {
  (socket: Socket, sessionId: string): Promise<void>;
}

interface DisconnectionHandler {
  (sessionId: string, reason: string): Promise<void>;
}

interface Socket {
  id: string;
  on(event: string, handler: EventHandler): void;
  emit(event: string, data: any): void;
  disconnect(close?: boolean): void;
}
```

**Key Methods:**
- `initialize()`: Start WebSocket server on specified port
- `onConnection()`: Register handler for new connections
- `onDisconnection()`: Register handler for disconnections
- `emit()`: Send event to specific session
- `broadcast()`: Send event to all connected clients
- `close()`: Gracefully shutdown server

### 2. Session Manager Component

**Responsibility:** Manage session lifecycle, state persistence, and cleanup.

**Interfaces:**

```typescript
interface SessionManager {
  createSession(sessionId: string, metadata: SessionMetadata): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  updateSession(sessionId: string, updates: Partial<Session>): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  cleanupStaleSessions(): Promise<number>;
}

interface Session {
  sessionId: string;
  questionnaireId: string;
  currentQuestionIndex: number;
  responses: Map<string, Response>;
  conversationHistory: ConversationTurn[];
  bedrockStreamIds: {
    promptName: string;
    contentName: string;
  };
  audioConfig: AudioConfiguration;
  startTime: Date;
  lastActivityTime: Date;
  status: 'active' | 'completed' | 'terminated' | 'error';
}

interface SessionMetadata {
  questionnaireId: string;
  voiceId: string;
  userId?: string;
}

interface Response {
  questionId: string;
  responseValue: any;
  responseType: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  timestamp: Date;
}

interface ConversationTurn {
  turnNumber: number;
  userTranscript: string;
  assistantTranscript: string;
  timestamp: Date;
}
```

**Key Methods:**
- `createSession()`: Initialize new session with metadata
- `getSession()`: Retrieve session by ID
- `updateSession()`: Update session state
- `deleteSession()`: Remove session and cleanup
- `cleanupStaleSessions()`: Remove inactive sessions (30min+)

### 3. Bedrock Client Component

**Responsibility:** Manage bidirectional streaming with Amazon Bedrock Nova Sonic model.

**Interfaces:**

```typescript
interface BedrockClient {
  initializeStream(config: StreamConfig): Promise<BedrockStream>;
  sendAudioChunk(stream: BedrockStream, audioData: Buffer): Promise<void>;
  sendTextInput(stream: BedrockStream, text: string): Promise<void>;
  closeStream(stream: BedrockStream): Promise<void>;
}

interface StreamConfig {
  modelId: string;
  sessionId: string;
  voiceId: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  inferenceConfig: InferenceConfiguration;
}

interface BedrockStream {
  promptName: string;
  contentName: string;
  inputStream: AsyncIterable<any>;
  outputStream: AsyncIterable<any>;
  status: 'initializing' | 'ready' | 'streaming' | 'closed';
}

interface InferenceConfiguration {
  maxTokens: number;
  topP: number;
  temperature: number;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}
```

**Key Methods:**
- `initializeStream()`: Create bidirectional stream with Nova Sonic
- `sendAudioChunk()`: Stream audio to model
- `sendTextInput()`: Send text to model
- `closeStream()`: Properly terminate stream

### 4. Questionnaire Engine Component

**Responsibility:** Load questionnaires, evaluate logic, and manage question flow.

**Interfaces:**

```typescript
interface QuestionnaireEngine {
  loadQuestionnaire(questionnaireId: string): Promise<Questionnaire>;
  getNextQuestion(session: Session): Promise<Question | null>;
  evaluateDisplayLogic(question: Question, session: Session): boolean;
  evaluateSkipLogic(question: Question, session: Session): string | null;
  getDynamicQuestionText(question: Question, session: Session): string;
  filterDynamicOptions(question: Question, session: Session): Option[];
  validateResponse(question: Question, response: any): ValidationResult;
}

interface Questionnaire {
  questionnaireId: string;
  questionnaireName: string;
  questions: Question[];
  surveyLogic: SurveyLogic;
  metadata: QuestionnaireMetadata;
}

interface Question {
  questionId: string;
  questionNumber: number;
  questionType: QuestionType;
  questionText: string;
  isRequired: boolean;
  options?: Option[];
  configuration: QuestionConfiguration;
  agentNotes: string;
  displayLogic?: DisplayLogic;
  dynamicQuestionText?: Record<string, string>;
}

type QuestionType = 
  | 'voice_prompt' 
  | 'single_choice' 
  | 'multiple_choice' 
  | 'rating_scale' 
  | 'nps' 
  | 'yes_no' 
  | 'open_ended';

interface Option {
  optionId: string;
  optionText: string;
  optionValue: string;
}

interface DisplayLogic {
  conditions: Condition[];
  action: 'display' | 'hide' | 'display_with_dynamic_text';
}

interface Condition {
  questionId: string;
  operator: string;
  value?: any;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
```

**Key Methods:**
- `loadQuestionnaire()`: Load and parse questionnaire JSON
- `getNextQuestion()`: Determine next question based on logic
- `evaluateDisplayLogic()`: Check if question should be shown
- `evaluateSkipLogic()`: Determine if question should be skipped
- `getDynamicQuestionText()`: Get question text based on prior answers
- `filterDynamicOptions()`: Filter options based on prior selections
- `validateResponse()`: Validate response against constraints

### 5. Audio Processor Component

**Responsibility:** Handle audio format conversion and streaming.

**Interfaces:**

```typescript
interface AudioProcessor {
  encodeToBase64(pcmBuffer: Buffer): string;
  decodeFromBase64(base64String: string): Buffer;
  validateAudioFormat(buffer: Buffer): boolean;
  createAudioChunk(buffer: Buffer, chunkSize: number): Buffer[];
}

interface AudioConfiguration {
  sampleRate: number;
  sampleSizeBits: number;
  channelCount: number;
  encoding: 'base64';
  mediaType: 'audio/lpcm';
}
```

**Key Methods:**
- `encodeToBase64()`: Convert PCM buffer to base64
- `decodeFromBase64()`: Convert base64 to PCM buffer
- `validateAudioFormat()`: Verify audio meets requirements
- `createAudioChunk()`: Split audio into streaming chunks

### 6. Tool Executor Component

**Responsibility:** Execute tool calls from Nova Sonic and return results.

**Interfaces:**

```typescript
interface ToolExecutor {
  executeTool(toolName: string, parameters: any, session: Session): Promise<ToolResult>;
  registerTool(toolName: string, handler: ToolHandler): void;
}

interface ToolHandler {
  (parameters: any, session: Session): Promise<any>;
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
```

**Registered Tools:**
- `record_response`: Save response to DynamoDB
- `get_next_question`: Retrieve next question
- `validate_answer`: Validate response format
- `get_demo_context`: Get questionnaire metadata

**Key Methods:**
- `executeTool()`: Execute tool and return result
- `registerTool()`: Register tool handler

### 7. Data Access Layer Component

**Responsibility:** Persist and retrieve data from DynamoDB and S3.

**Interfaces:**

```typescript
interface DataAccessLayer {
  sessions: SessionRepository;
  responses: ResponseRepository;
  transcripts: TranscriptRepository;
  recordings: RecordingRepository;
}

interface SessionRepository {
  create(session: SessionRecord): Promise<void>;
  get(sessionId: string): Promise<SessionRecord | null>;
  update(sessionId: string, updates: Partial<SessionRecord>): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

interface ResponseRepository {
  create(response: ResponseRecord): Promise<void>;
  getBySession(sessionId: string): Promise<ResponseRecord[]>;
}

interface TranscriptRepository {
  create(transcript: TranscriptRecord): Promise<void>;
  getBySession(sessionId: string): Promise<TranscriptRecord[]>;
}

interface RecordingRepository {
  upload(sessionId: string, audioBuffer: Buffer): Promise<string>;
  download(sessionId: string): Promise<Buffer>;
}

interface SessionRecord {
  sessionId: string;
  questionnaireId: string;
  startTime: string;
  endTime?: string;
  voiceId: string;
  completionStatus: string;
  userId?: string;
}

interface ResponseRecord {
  sessionId: string;
  questionId: string;
  responseValue: any;
  responseType: string;
  sentiment?: string;
  timestamp: string;
}

interface TranscriptRecord {
  sessionId: string;
  timestamp: number;
  role: 'user' | 'assistant';
  content: string;
  turnNumber: number;
}
```

**Key Methods:**
- `create()`: Insert new record
- `get()`: Retrieve record by ID
- `update()`: Update existing record
- `delete()`: Remove record
- `upload()`: Upload audio to S3
- `download()`: Download audio from S3

### 8. Quota Manager Component

**Responsibility:** Track and enforce demographic quotas for political polling.

**Interfaces:**

```typescript
interface QuotaManager {
  checkQuota(questionnaireId: string, field: string, value: string): Promise<QuotaStatus>;
  incrementQuota(questionnaireId: string, field: string, value: string): Promise<void>;
  getQuotaStatus(questionnaireId: string): Promise<QuotaReport>;
  resetQuotas(questionnaireId: string): Promise<void>;
}

interface QuotaStatus {
  isFilled: boolean;
  current: number;
  target: number;
  percentage: number;
}

interface QuotaReport {
  quotaFields: QuotaFieldReport[];
  overallCompletion: number;
}

interface QuotaFieldReport {
  fieldName: string;
  segments: SegmentStatus[];
}

interface SegmentStatus {
  value: string;
  current: number;
  target: number;
  percentage: number;
  isFilled: boolean;
}
```

**Key Methods:**
- `checkQuota()`: Check if quota is filled
- `incrementQuota()`: Increment quota count
- `getQuotaStatus()`: Get current quota status
- `resetQuotas()`: Reset quota counts

## Data Models

### Session Data Model

```typescript
interface SessionData {
  // Primary identifiers
  sessionId: string;
  questionnaireId: string;
  
  // Timestamps
  startTime: Date;
  endTime?: Date;
  lastActivityTime: Date;
  
  // User information
  userId?: string;
  userMetadata?: Record<string, any>;
  
  // Configuration
  voiceId: string;
  audioConfig: AudioConfiguration;
  
  // State
  currentQuestionIndex: number;
  completionStatus: 'active' | 'completed' | 'terminated' | 'error';
  
  // Bedrock stream identifiers
  bedrockStreamIds: {
    promptName: string;
    contentName: string;
  };
  
  // Conversation data
  responses: Map<string, Response>;
  conversationHistory: ConversationTurn[];
  
  // Quota tracking (for political polling)
  quotaFields?: Record<string, string>;
}
```

### Questionnaire Data Model

```typescript
interface QuestionnaireData {
  questionnaireId: string;
  questionnaireName: string;
  version: string;
  industry: string;
  researchObjective: string;
  estimatedDuration: number;
  totalQuestions: number;
  
  targetAudience: {
    description: string;
    demographicCriteria: string[];
  };
  
  metadata: {
    mockBrand?: string;
    mockProduct?: string;
    demoScenario: string;
    keyFeatures: string[];
  };
  
  questions: QuestionData[];
  surveyLogic: SurveyLogicData;
}

interface QuestionData {
  questionId: string;
  questionNumber: number;
  questionType: QuestionType;
  questionText: string;
  isRequired: boolean;
  
  options?: OptionData[];
  configuration: QuestionConfigurationData;
  agentNotes: string;
  
  displayLogic?: DisplayLogicData;
  dynamicQuestionText?: Record<string, string>;
  dynamicOptions?: DynamicOptionsData;
}

interface OptionData {
  optionId: string;
  optionText: string;
  optionValue: string;
}

interface QuestionConfigurationData {
  randomizeChoices?: boolean;
  addOtherOption?: boolean;
  addNoneOption?: boolean;
  otherOptionPrompt?: string;
  
  // For rating scales
  scaleType?: '5_point' | 'nps';
  scaleRange?: { min: number; max: number };
  minValueDescription?: string;
  maxValueDescription?: string;
  
  // For open-ended
  sentimentDetectionEnabled?: boolean;
  enthusiasmDetectionEnabled?: boolean;
  objectionDetectionEnabled?: boolean;
  maxResponseLength?: number;
  
  // For multiple choice
  allowMultipleSelections?: boolean;
  minSelections?: number;
  maxSelections?: number;
  
  // For quota tracking
  quotaTracking?: QuotaTrackingData;
}

interface QuotaTrackingData {
  enabled: boolean;
  quotaField: string;
  targetDistribution: Record<string, number>;
}

interface DisplayLogicData {
  conditions: ConditionData[];
  action: string;
  questionTextDynamic?: {
    basedOn: string;
    rules: DynamicTextRule[];
  };
}

interface ConditionData {
  questionId: string;
  operator: string;
  value?: any;
  logicalOperator?: 'AND' | 'OR';
}

interface DynamicTextRule {
  condition: string;
  questionText: string;
}

interface DynamicOptionsData {
  sourceQuestionId: string;
  filterRule: string;
  addNoneOption?: boolean;
}

interface SurveyLogicData {
  displayLogicRules: DisplayLogicRule[];
  skipLogicRules: SkipLogicRule[];
  pipingRules: PipingRule[];
  quotaManagement?: QuotaManagementData;
}

interface DisplayLogicRule {
  ruleId: string;
  targetQuestionId: string;
  conditions: ConditionData[];
  action: string;
}

interface SkipLogicRule {
  ruleId: string;
  description: string;
  condition: string;
  skipToQuestionId: string;
}

interface PipingRule {
  ruleId: string;
  targetQuestionId: string;
  sourceQuestionId: string;
  pipingType: string;
}

interface QuotaManagementData {
  enabled: boolean;
  quotaFields: QuotaFieldData[];
  quotaEnforcementRules: QuotaEnforcementRule[];
}

interface QuotaFieldData {
  fieldName: string;
  questionId: string;
  targets: Record<string, number>;
}

interface QuotaEnforcementRule {
  ruleId: string;
  description: string;
  condition: string;
  action: string;
  terminationMessage: string;
}
```

### WebSocket Event Data Models

```typescript
// Client to Server Events
interface SessionStartEvent {
  event: 'session:start';
  sessionId: string;
  timestamp: string;
  data: {
    questionnaireId: string;
    voiceId: string;
    userId?: string;
  };
}

interface AudioChunkEvent {
  event: 'audio:chunk';
  sessionId: string;
  timestamp: string;
  data: {
    audioData: string; // base64 encoded PCM
    sequenceNumber: number;
  };
}

interface SessionEndEvent {
  event: 'session:end';
  sessionId: string;
  timestamp: string;
  data: {
    reason: 'user_ended' | 'completed' | 'timeout' | 'error';
  };
}

interface ConfigUpdateEvent {
  event: 'config:update';
  sessionId: string;
  timestamp: string;
  data: {
    voiceId?: string;
    audioConfig?: Partial<AudioConfiguration>;
  };
}

// Server to Client Events
interface SessionReadyEvent {
  event: 'session:ready';
  sessionId: string;
  timestamp: string;
  data: {
    questionnaireName: string;
    estimatedDuration: number;
    firstQuestion: QuestionData;
  };
}

interface TranscriptionUserEvent {
  event: 'transcription:user';
  sessionId: string;
  timestamp: string;
  data: {
    transcript: string;
    isFinal: boolean;
  };
}

interface TranscriptionAssistantEvent {
  event: 'transcription:assistant';
  sessionId: string;
  timestamp: string;
  data: {
    transcript: string;
    isFinal: boolean;
  };
}

interface AudioChunkResponseEvent {
  event: 'audio:chunk';
  sessionId: string;
  timestamp: string;
  data: {
    audioData: string; // base64 encoded PCM
    sequenceNumber: number;
  };
}

interface QuestionAdvanceEvent {
  event: 'question:advance';
  sessionId: string;
  timestamp: string;
  data: {
    question: QuestionData;
    progress: {
      current: number;
      total: number;
      percentage: number;
    };
  };
}

interface SessionCompleteEvent {
  event: 'session:complete';
  sessionId: string;
  timestamp: string;
  data: {
    completionStatus: 'completed' | 'terminated';
    totalQuestions: number;
    answeredQuestions: number;
    duration: number;
  };
}

interface ErrorEvent {
  event: 'error';
  sessionId: string;
  timestamp: string;
  data: {
    errorCode: string;
    errorMessage: string;
    recoverable: boolean;
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Session ID Uniqueness
*For any* set of WebSocket connections, all assigned session IDs should be unique across all connections.
**Validates: Requirements 2.3**

### Property 2: WebSocket Message Schema Conformance
*For any* WebSocket message sent by the system, the message should contain event type, sessionId, timestamp, and data fields in valid JSON format.
**Validates: Requirements 3.1**

### Property 3: Invalid Message Rejection
*For any* WebSocket message that does not conform to the defined schema, the system should reject the message and return an error response.
**Validates: Requirements 3.4, 3.5**

### Property 4: UUID Uniqueness for Bedrock Streams
*For any* set of Bedrock streaming sessions, all generated promptName and contentName UUIDs should be unique across all sessions.
**Validates: Requirements 5.6**

### Property 5: Audio Base64 Encoding
*For any* PCM audio buffer sent to Nova Sonic, the audio data should be base64-encoded before transmission.
**Validates: Requirements 6.3**

### Property 6: Audio Format Consistency
*For any* audio chunk processed by the system, the audio format should maintain 16kHz sample rate, 16-bit depth, and mono channel configuration.
**Validates: Requirements 6.4**

### Property 7: ContentName Consistency Within Turn
*For any* user turn consisting of multiple audio chunks, all audio chunks should use the same contentName UUID.
**Validates: Requirements 6.6**

### Property 8: Next Question Logic Correctness
*For any* session state and questionnaire, the get_next_question tool should return the correct next question based on display logic, skip logic, and prior responses.
**Validates: Requirements 9.4**

### Property 9: Answer Validation Correctness
*For any* question and response, the validate_answer tool should correctly validate the response against format and range constraints defined in the question configuration.
**Validates: Requirements 9.5**

### Property 10: Display Logic Evaluation
*For any* question with display logic and session state, the system should correctly determine whether to show or hide the question based on prior answers.
**Validates: Requirements 12.4**

### Property 11: Skip Logic Evaluation
*For any* question with skip logic and session state, the system should correctly determine the next question to jump to based on conditions.
**Validates: Requirements 12.5**

### Property 12: Dynamic Question Text Application
*For any* question with dynamic text rules and session state, the system should apply the correct question text based on prior responses.
**Validates: Requirements 12.6**

### Property 13: Dynamic Options Filtering
*For any* question with dynamic options and session state, the system should filter options correctly based on prior selections.
**Validates: Requirements 12.7**

### Property 14: Sentiment Classification
*For any* open-ended response with sentiment detection enabled, the system should classify sentiment as positive, negative, or neutral.
**Validates: Requirements 13.1, 13.2**

### Property 15: Quota Count Persistence
*For any* quota field across multiple sessions, the quota counts should be maintained consistently in the data store.
**Validates: Requirements 14.4**

### Property 16: Error Log Completeness
*For any* error that occurs in the system, the error log should include error code, message, and stack trace.
**Validates: Requirements 19.6**

### Property 17: Error Message Sanitization
*For any* error sent to the frontend, the error message should not contain internal implementation details or sensitive information.
**Validates: Requirements 19.7**

### Property 18: Barge-in State Preservation
*For any* barge-in event during a conversation, the system should maintain conversation context and session state without data loss.
**Validates: Requirements 22.6**

### Property 19: Session State Restoration After Reconnection
*For any* session that reconnects with the same sessionId within 60 seconds, the system should restore the complete session state including responses, conversation history, and current question.
**Validates: Requirements 23.3**

### Property 20: Session Isolation
*For any* two concurrent sessions, the session state should be completely isolated with no data leakage between sessions.
**Validates: Requirements 1.4**

## Error Handling

### Error Categories

**1. WebSocket Errors**
- Connection failures
- Message parsing errors
- Protocol violations
- Disconnections

**Strategy:**
- Log error with context (sessionId, error type, stack trace)
- Attempt reconnection with exponential backoff (3 retries)
- Preserve session state for 60 seconds
- Notify frontend with error event
- Clean up resources if reconnection fails

**2. Bedrock API Errors**
- Model invocation failures
- Streaming interruptions
- Rate limiting
- Invalid requests

**Strategy:**
- Log error with Bedrock request/response details
- Retry transient errors (rate limiting, timeouts)
- Notify frontend with user-friendly error message
- Clean up Bedrock stream
- Mark session as error state
- Persist partial data collected

**3. Database Errors**
- DynamoDB write failures
- Connection timeouts
- Throttling
- Data validation errors

**Strategy:**
- Log error with operation details
- Retry up to 3 times with exponential backoff
- Continue session if non-critical write fails
- Notify frontend if critical data cannot be saved
- Queue writes for later retry if possible

**4. Audio Processing Errors**
- Invalid audio format
- Encoding/decoding failures
- Buffer overflows

**Strategy:**
- Log error with audio metadata
- Skip invalid audio chunk
- Continue session if possible
- Notify frontend if audio quality degraded
- Fall back to text-only mode if audio fails completely

**5. Questionnaire Logic Errors**
- Invalid question references
- Logic evaluation failures
- Missing required data

**Strategy:**
- Log error with questionnaire context
- Fall back to next sequential question
- Notify frontend of logic error
- Continue session with degraded logic
- Mark session for manual review

**6. Tool Execution Errors**
- Tool not found
- Invalid parameters
- Execution timeout
- Function failures

**Strategy:**
- Log error with tool name and parameters
- Return error toolResult to Nova Sonic
- Allow Nova Sonic to handle error gracefully
- Continue conversation
- Retry if transient error

**7. Unhandled Exceptions**
- Unexpected runtime errors
- Out of memory
- Null pointer exceptions

**Strategy:**
- Log full stack trace
- Send generic error to frontend
- Gracefully close session
- Clean up all resources
- Persist collected data
- Alert monitoring system

### Error Response Format

```typescript
interface ErrorResponse {
  event: 'error';
  sessionId: string;
  timestamp: string;
  data: {
    errorCode: string;
    errorMessage: string;
    recoverable: boolean;
    retryAfter?: number;
  };
}
```

### Error Codes

- `WS_CONNECTION_FAILED`: WebSocket connection failure
- `WS_MESSAGE_INVALID`: Invalid message format
- `BEDROCK_INIT_FAILED`: Bedrock initialization failure
- `BEDROCK_STREAM_ERROR`: Bedrock streaming error
- `DB_WRITE_FAILED`: Database write failure
- `AUDIO_PROCESSING_ERROR`: Audio processing error
- `QUESTIONNAIRE_LOGIC_ERROR`: Questionnaire logic error
- `TOOL_EXECUTION_ERROR`: Tool execution error
- `SESSION_EXPIRED`: Session expired
- `QUOTA_FILLED`: Quota filled
- `INTERNAL_ERROR`: Unhandled internal error

## Testing Strategy

### Unit Testing

**Framework:** Jest with TypeScript support

**Coverage Targets:**
- Code coverage: 80%+
- Branch coverage: 75%+
- Function coverage: 90%+

**Unit Test Focus Areas:**

1. **Questionnaire Engine**
   - Question type handling
   - Display logic evaluation
   - Skip logic evaluation
   - Dynamic text application
   - Dynamic options filtering
   - Response validation

2. **Audio Processor**
   - Base64 encoding/decoding
   - Format validation
   - Chunk creation

3. **Tool Executor**
   - Tool registration
   - Tool execution
   - Error handling
   - Result formatting

4. **Session Manager**
   - Session creation
   - State updates
   - Session cleanup
   - Stale session detection

5. **Data Access Layer**
   - CRUD operations
   - Query building
   - Error handling

6. **Quota Manager**
   - Quota checking
   - Quota incrementing
   - Quota status reporting

### Property-Based Testing

**Framework:** fast-check (JavaScript property-based testing library)

**Configuration:** Each property test should run a minimum of 100 iterations to ensure comprehensive coverage of the input space.

**Property Test Focus Areas:**

1. **Session ID Uniqueness (Property 1)**
   - Generate N concurrent connections
   - Verify all session IDs are unique
   - Test with N = 10, 50, 100

2. **Message Schema Conformance (Property 2)**
   - Generate random valid messages
   - Verify all contain required fields
   - Verify JSON is valid

3. **Invalid Message Rejection (Property 3)**
   - Generate random invalid messages
   - Verify all are rejected
   - Verify error responses are sent

4. **UUID Uniqueness (Property 4)**
   - Generate N Bedrock sessions
   - Verify all UUIDs are unique
   - Test with N = 10, 50, 100

5. **Audio Encoding (Property 5)**
   - Generate random PCM buffers
   - Encode to base64
   - Decode and verify equality

6. **Audio Format Consistency (Property 6)**
   - Generate random audio chunks
   - Verify format parameters preserved
   - Test with various sample rates

7. **ContentName Consistency (Property 7)**
   - Generate random user turns with multiple chunks
   - Verify same contentName used
   - Test with 1-10 chunks per turn

8. **Next Question Logic (Property 8)**
   - Generate random session states
   - Verify correct next question returned
   - Test all questionnaires

9. **Answer Validation (Property 9)**
   - Generate random questions and responses
   - Verify validation correctness
   - Test all question types

10. **Display Logic (Property 10)**
    - Generate random session states
    - Verify correct display decisions
    - Test all display logic rules

11. **Skip Logic (Property 11)**
    - Generate random session states
    - Verify correct skip targets
    - Test all skip logic rules

12. **Dynamic Text (Property 12)**
    - Generate random prior responses
    - Verify correct text applied
    - Test NPS follow-up scenarios

13. **Dynamic Options (Property 13)**
    - Generate random prior selections
    - Verify correct options filtered
    - Test brand tracker scenarios

14. **Sentiment Classification (Property 14)**
    - Generate random text responses
    - Verify sentiment classified
    - Test positive/negative/neutral cases

15. **Quota Persistence (Property 15)**
    - Generate random quota updates
    - Verify counts maintained
    - Test across multiple sessions

16. **Error Log Completeness (Property 16)**
    - Generate random errors
    - Verify logs contain required fields
    - Test all error types

17. **Error Message Sanitization (Property 17)**
    - Generate random errors
    - Verify frontend messages sanitized
    - Test for sensitive data leakage

18. **Barge-in State Preservation (Property 18)**
    - Generate random barge-in scenarios
    - Verify state preserved
    - Test conversation continuity

19. **Session Restoration (Property 19)**
    - Generate random session states
    - Disconnect and reconnect
    - Verify state restored completely

20. **Session Isolation (Property 20)**
    - Generate N concurrent sessions
    - Verify no state leakage
    - Test with N = 10, 50

### Integration Testing

**Focus Areas:**

1. **WebSocket Communication**
   - Connect/disconnect cycles
   - Message exchange
   - Reconnection handling
   - Error scenarios

2. **Bedrock Integration**
   - Stream initialization
   - Audio streaming
   - Event processing
   - Stream cleanup

3. **Database Integration**
   - Session persistence
   - Response storage
   - Transcript storage
   - Query operations

4. **End-to-End Flows**
   - Complete demo session
   - Question progression
   - Response recording
   - Session completion

5. **Error Recovery**
   - Network failures
   - API errors
   - Database errors
   - Graceful degradation

### Load Testing

**Tools:** Artillery or k6

**Scenarios:**

1. **Concurrent Sessions**
   - Ramp up to 50 concurrent sessions
   - Maintain for 5 minutes
   - Verify latency < 300ms
   - Verify no errors

2. **Session Churn**
   - High rate of connects/disconnects
   - Verify session cleanup
   - Verify no memory leaks

3. **Audio Streaming**
   - Continuous audio streaming
   - Verify throughput
   - Verify no dropouts

4. **Database Load**
   - High rate of writes
   - Verify write latency
   - Verify no throttling

### Test Data

**Questionnaire Test Data:**
- All 4 demo questionnaires loaded
- Test questionnaires with various logic patterns
- Edge case questionnaires (empty, single question, etc.)

**Audio Test Data:**
- Sample PCM audio files (16kHz, 16-bit, mono)
- Various durations (1s, 5s, 30s)
- Silence, speech, noise

**Session Test Data:**
- Various session states
- Different questionnaire progress levels
- Different response patterns

## Deployment Architecture

### Container Configuration

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY questionnaires ./questionnaires

EXPOSE 8080

CMD ["node", "dist/server.js"]
```

**Environment Variables:**
- `AWS_REGION`: AWS region (us-east-1, us-west-2, etc.)
- `BEDROCK_MODEL_ID`: amazon.nova-2-sonic-v1:0
- `DYNAMODB_TABLE_PREFIX`: demo-
- `S3_BUCKET_NAME`: voiceter-demo-recordings
- `REDIS_URL`: Redis connection string (optional)
- `PORT`: Server port (default: 8080)
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARN, ERROR)
- `ENABLE_AUTH`: Enable Cognito authentication (true/false)
- `COGNITO_USER_POOL_ID`: Cognito user pool ID (if auth enabled)

### AWS ECS Fargate Configuration

**Task Definition:**
- CPU: 1 vCPU
- Memory: 2 GB
- Task role: IAM role with Bedrock, DynamoDB, S3, CloudWatch permissions
- Execution role: IAM role for ECS task execution

**Service Configuration:**
- Desired count: 2 (for high availability)
- Min healthy percent: 50
- Max healthy percent: 200
- Health check: /health endpoint
- Health check interval: 30 seconds
- Health check timeout: 5 seconds
- Unhealthy threshold: 3

**Auto-scaling:**
- Target CPU utilization: 70%
- Target memory utilization: 80%
- Min tasks: 2
- Max tasks: 10
- Scale-out cooldown: 60 seconds
- Scale-in cooldown: 300 seconds

### Application Load Balancer Configuration

**Listener:**
- Protocol: HTTPS
- Port: 443
- SSL certificate: AWS Certificate Manager

**Target Group:**
- Protocol: HTTP
- Port: 8080
- Health check path: /health
- Health check interval: 30 seconds
- Healthy threshold: 2
- Unhealthy threshold: 3
- Stickiness: Enabled (1 hour duration)

**WebSocket Support:**
- Connection idle timeout: 300 seconds
- HTTP/2: Enabled

### DynamoDB Tables

**demo-sessions:**
- Partition key: sessionId (String)
- GSI: questionnaireId-startTime-index
- Billing mode: On-demand
- Point-in-time recovery: Enabled

**demo-responses:**
- Partition key: sessionId (String)
- Sort key: questionId (String)
- Billing mode: On-demand
- Point-in-time recovery: Enabled

**demo-transcripts:**
- Partition key: sessionId (String)
- Sort key: timestamp (Number)
- Billing mode: On-demand
- Point-in-time recovery: Enabled
- TTL: 90 days

### S3 Bucket Configuration

**voiceter-demo-recordings:**
- Versioning: Enabled
- Encryption: AES-256
- Lifecycle policy: Delete after 90 days
- Access: Private (IAM role only)

### CloudWatch Configuration

**Log Groups:**
- /ecs/voiceter-backend
- Retention: 30 days

**Metrics:**
- ConcurrentSessions
- WebSocketConnections
- BedrockLatency
- DatabaseLatency
- ErrorRate
- AudioChunksProcessed

**Alarms:**
- High error rate (> 5%)
- High latency (> 500ms)
- Low health check success (< 80%)
- High CPU utilization (> 80%)
- High memory utilization (> 85%)

### Infrastructure as Code

**AWS CDK Stack:**
```typescript
export class VoiceterBackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'VoiceterVPC', {
      maxAzs: 2
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'VoiceterCluster', {
      vpc,
      containerInsights: true
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024
    });

    // Container
    taskDefinition.addContainer('backend', {
      image: ecs.ContainerImage.fromRegistry('voiceter-backend:latest'),
      environment: {
        AWS_REGION: 'us-east-1',
        BEDROCK_MODEL_ID: 'amazon.nova-2-sonic-v1:0'
      },
      logging: ecs.LogDriver.awsLogs({ streamPrefix: 'voiceter' }),
      portMappings: [{ containerPort: 8080 }]
    });

    // Service
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2
    });

    // Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true
    });

    const listener = alb.addListener('Listener', {
      port: 443,
      certificates: [certificate]
    });

    listener.addTargets('BackendTarget', {
      port: 8080,
      targets: [service],
      healthCheck: {
        path: '/health',
        interval: Duration.seconds(30)
      }
    });

    // DynamoDB Tables
    new dynamodb.Table(this, 'SessionsTable', {
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // S3 Bucket
    new s3.Bucket(this, 'RecordingsBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{
        expiration: Duration.days(90)
      }]
    });
  }
}
```

## Security Considerations

### Authentication & Authorization

**WebSocket Authentication:**
- Optional JWT validation from AWS Cognito
- Session ID validation
- Origin/referrer validation
- Rate limiting per IP

**AWS IAM:**
- Least privilege principle
- Separate roles for task execution and task
- No hardcoded credentials
- Secrets in AWS Secrets Manager

### Data Protection

**In Transit:**
- WSS (WebSocket Secure) for frontend communication
- TLS 1.2+ for all AWS API calls
- HTTPS for load balancer

**At Rest:**
- DynamoDB encryption at rest
- S3 encryption (AES-256)
- CloudWatch Logs encryption

**Data Retention:**
- Audio recordings: 90 days
- Transcripts: 90 days
- Sessions: Indefinite (for analytics)
- Responses: Indefinite (for analytics)

### Input Validation

**WebSocket Messages:**
- Schema validation
- Size limits (max 1MB per message)
- Rate limiting (max 100 messages/second per session)

**Audio Data:**
- Format validation
- Size limits (max 10MB per chunk)
- Sample rate validation

**Questionnaire Responses:**
- Type validation
- Range validation
- Length validation

### Monitoring & Auditing

**Logging:**
- All API calls logged
- All errors logged with context
- Session lifecycle events logged
- Sensitive data redacted

**Monitoring:**
- Real-time metrics in CloudWatch
- Alarms for anomalies
- Dashboard for operations team

**Auditing:**
- Session audit trail
- Response audit trail
- Access logs

## Performance Optimization

### Caching Strategy

**Questionnaire Caching:**
- Load questionnaires at startup
- Cache in memory
- Invalidate on update

**Session State Caching:**
- Redis for multi-instance
- In-memory for single instance
- TTL: 30 minutes

### Connection Pooling

**HTTP/2 Connection Reuse:**
- Reuse Bedrock connections
- Max concurrent streams: 20
- Connection timeout: 300 seconds

**Database Connection Pooling:**
- DynamoDB client connection pooling
- Max connections: 50
- Idle timeout: 60 seconds

### Audio Streaming Optimization

**Chunk Size:**
- 32ms chunks (~512 bytes @ 16kHz)
- Balance between latency and overhead

**Buffering:**
- Minimal buffering on backend
- Stream immediately to Bedrock
- Stream immediately to frontend

### Horizontal Scaling

**Stateless Design:**
- Session state in Redis
- No local state dependencies
- Scale out based on load

**Load Balancing:**
- Sticky sessions for WebSocket
- Round-robin for new connections
- Health check based routing

## Monitoring & Observability

### Metrics

**System Metrics:**
- CPU utilization
- Memory utilization
- Network throughput
- Disk I/O

**Application Metrics:**
- Concurrent sessions
- WebSocket connections
- Bedrock API calls
- Database operations
- Error rates
- Latency (p50, p95, p99)

**Business Metrics:**
- Sessions started
- Sessions completed
- Completion rate
- Average session duration
- Questions answered
- Quota fill rates

### Logging

**Structured Logging:**
```typescript
{
  timestamp: '2025-12-10T10:30:00Z',
  level: 'INFO',
  sessionId: 'abc123',
  event: 'session_started',
  data: {
    questionnaireId: 'demo-01-csat-nps',
    voiceId: 'matthew'
  }
}
```

**Log Levels:**
- DEBUG: Detailed debugging information
- INFO: General informational messages
- WARN: Warning messages
- ERROR: Error messages with stack traces

### Tracing

**Distributed Tracing:**
- AWS X-Ray integration
- Trace WebSocket → Backend → Bedrock flow
- Identify bottlenecks
- Debug latency issues

### Alerting

**Critical Alerts:**
- Service down
- High error rate (> 5%)
- High latency (> 1s)
- Database unavailable

**Warning Alerts:**
- Elevated error rate (> 2%)
- Elevated latency (> 500ms)
- High CPU/memory (> 80%)
- Low health check success (< 90%)

## Maintenance & Operations

### Deployment Process

**CI/CD Pipeline:**
1. Code commit to main branch
2. Run unit tests
3. Run integration tests
4. Build Docker image
5. Push to ECR
6. Deploy to staging
7. Run smoke tests
8. Deploy to production (blue/green)
9. Monitor for errors
10. Rollback if needed

**Rollback Strategy:**
- Blue/green deployment
- Keep previous task definition
- Instant rollback capability
- Automated rollback on high error rate

### Backup & Recovery

**Database Backups:**
- DynamoDB point-in-time recovery
- Continuous backups
- 35-day retention

**Configuration Backups:**
- Infrastructure as code in Git
- Environment variables in Secrets Manager
- Questionnaire files in S3

**Disaster Recovery:**
- Multi-AZ deployment
- Cross-region replication (optional)
- RTO: 15 minutes
- RPO: 5 minutes

### Maintenance Windows

**Planned Maintenance:**
- Schedule during low traffic
- Notify users in advance
- Use blue/green deployment
- Zero downtime deployments

**Emergency Maintenance:**
- Immediate deployment if critical
- Notify users
- Monitor closely
- Rollback if issues

## Future Enhancements

### Phase 2 Features

1. **Multi-language Support**
   - Support for 20+ languages
   - Language detection
   - Automatic translation

2. **Advanced Analytics**
   - Real-time dashboards
   - Response analytics
   - Sentiment trends
   - Completion funnels

3. **Custom Questionnaires**
   - UI for questionnaire creation
   - Logic builder
   - Preview mode
   - Version control

4. **Integration APIs**
   - REST API for external systems
   - Webhook notifications
   - Data export APIs
   - CRM integrations

5. **Enhanced Audio**
   - Noise cancellation
   - Echo cancellation
   - Voice activity detection
   - Audio quality monitoring

6. **Advanced Quota Management**
   - Real-time quota dashboards
   - Quota optimization algorithms
   - Predictive quota filling
   - Dynamic quota adjustments

7. **A/B Testing**
   - Question variations
   - Voice variations
   - Logic variations
   - Performance comparison

8. **Compliance Features**
   - GDPR compliance
   - CCPA compliance
   - Data anonymization
   - Consent management
