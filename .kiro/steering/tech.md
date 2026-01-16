---
inclusion: always
---

# Voiceter Backend Integration - Technical Guidelines

## Technology Stack

### Runtime & Framework
- **Node.js 18+**: LTS version with modern JavaScript features
- **TypeScript**: Strict mode for type safety
- **Express.js**: HTTP server foundation
- **Socket.IO**: WebSocket communication with fallback support

### Voice AI Platform
- **Google Gemini Live API**: Primary voice AI platform for speech-to-speech conversations
- **Vertex AI WebSocket API**: Real-time bidirectional audio streaming via `wss://{REGION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`
- **Model**: `gemini-live-2.5-flash-preview-native-audio` (native audio understanding and generation)

### AWS Services
- **DynamoDB**: NoSQL database for sessions, responses, transcripts
- **S3**: Object storage for audio recordings
- **CloudWatch**: Logging, metrics, and alarms
- **ECS Fargate**: Serverless container hosting
- **Application Load Balancer**: WebSocket support with SSL termination
- **AWS CDK**: Infrastructure as code
- **Bedrock Guardrails**: Content moderation and safety checks (optional)

### Development Tools
- **Jest**: Unit testing framework
- **fast-check**: Property-based testing
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Docker**: Containerization

## Architecture Patterns

### Three-Tier Architecture
1. **WebSocket Layer**: Handle client connections and message routing
2. **Business Logic Layer**: Session management, questionnaire engine, audio processing, tool execution
3. **Integration Layer**: Gemini Live client, DynamoDB client, S3 client

### Component Responsibilities
- **WebSocket Server**: Connection lifecycle, message validation, event routing
- **Session Manager**: Session state, persistence, cleanup
- **Gemini Live Client**: WebSocket connection, audio forwarding, event processing
- **Questionnaire Engine**: Logic evaluation, question progression, validation
- **Tool Executor**: Tool registration, execution, result formatting
- **Data Access Layer**: Database operations, S3 operations
- **Audio Processor**: Format conversion, encoding/decoding

## WebSocket Protocol

### Event Schema
All WebSocket messages must follow this structure:
```typescript
{
  event: string;
  sessionId: string;
  timestamp: string; // ISO 8601
  data: object;
}
```

### Client to Server Events
- `session:start`: Initiate demo session with questionnaireId and voiceId
- `session:end`: End demo session with reason
- `audio:chunk`: Send audio data (base64 encoded PCM)
- `config:update`: Update voice or audio settings
- `questionnaire:select`: Select demo questionnaire

### Server to Client Events
- `session:ready`: Session initialized with first question
- `transcription:user`: User speech transcription (ASR)
- `transcription:assistant`: AI speech transcription
- `audio:chunk`: AI-generated audio (base64 encoded)
- `question:advance`: Move to next question with progress
- `session:complete`: Demo complete with summary
- `interruption`: Barge-in detected, stop audio playback
- `error`: Error occurred with code and message

### Connection Lifecycle
1. Client connects via WebSocket
2. Server assigns unique session ID
3. Client sends `session:start` event
4. Server initializes Gemini Live WebSocket connection
5. Server sends `session:ready` event
6. Audio streaming begins (bidirectional)
7. Questions progress based on logic
8. Client sends `session:end` or timeout occurs
9. Server cleans up Gemini Live connection
10. Server closes WebSocket connection

## Gemini Live API Integration

### WebSocket Configuration
```typescript
const geminiLiveConfig = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  region: process.env.GOOGLE_CLOUD_REGION,
  model: 'gemini-live-2.5-flash-preview-native-audio',
  defaultVoice: process.env.GEMINI_DEFAULT_VOICE || 'Charon',
  reconnectMaxRetries: 3,
  reconnectBaseDelayMs: 1000,
  toolTimeoutMs: 5000,
};
```

### Connection Initialization Sequence
1. **Get Access Token**: Obtain OAuth2 token via google-auth-library
2. **WebSocket Connect**: Connect to Vertex AI with Bearer token
3. **Send Setup Message**: Configure model, voice, system instructions, and tools
4. **Receive setupComplete**: Connection ready with session_id
5. Ready for audio streaming

### Audio Streaming
- **Input Format**: 16kHz, 16-bit PCM, mono (base64 encoded)
- **Output Format**: 24kHz, 16-bit PCM, mono (base64 encoded)
- **Flow**: Frontend → Socket.IO → Backend → Gemini Live (realtimeInput.audio)

### Event Types

#### Client to Gemini Live
- `setup`: Session configuration with model, voice, system instructions, tools
- `realtimeInput.audio`: User audio data (base64, PCM 16kHz)
- `clientContent`: Text input or conversation context
- `toolResponse`: Tool execution results

#### Gemini Live to Client
- `setupComplete`: Session confirmation with session_id
- `serverContent.inputTranscription`: User speech transcription
- `serverContent.outputTranscription`: AI speech transcription
- `serverContent.modelTurn.parts[].inlineData`: AI-generated audio (base64)
- `serverContent.interrupted`: Barge-in detected
- `serverContent.turnComplete`: Model finished speaking
- `toolCall.functionCalls[]`: Tool execution requests
- `toolCallCancellation`: Cancel pending tool calls (on interruption)
- `goAway`: Server will disconnect soon

### Tool Execution Flow
1. Gemini sends **toolCall** event with functionCalls array
2. Backend extracts function name and args from each call
3. Backend executes corresponding function via Tool Executor
4. Backend sends **toolResponse** event with functionResponses
5. Gemini continues conversation

### Tool Handlers
- `record_response`: Save to DynamoDB demo-responses table
- `get_next_question`: Call questionnaire engine, return next question
- `validate_answer`: Validate response, return validation result
- `get_demo_context`: Return questionnaire metadata

### Voice Activity Detection (VAD)
- **Automatic VAD**: Enabled by default, Gemini detects speech start/end
- **Configurable Sensitivity**: START_SENSITIVITY_HIGH/LOW, END_SENSITIVITY_HIGH/LOW
- **Manual VAD**: Optional, send activityStart/activityEnd signals

### Reconnection Strategy
- Exponential backoff: 1s, 2s, 4s delays
- Maximum 3 retries
- Emit error event after max retries exceeded

## Session Management

### Session State
```typescript
interface Session {
  sessionId: string;
  questionnaireId: string;
  currentQuestionIndex: number;
  responses: Map<string, Response>;
  conversationHistory: ConversationTurn[];
  geminiLive?: {
    sessionId: string;
    isConnected: boolean;
  };
  audioConfig: AudioConfiguration;
  startTime: Date;
  lastActivityTime: Date;
  status: 'active' | 'completed' | 'terminated' | 'error';
}
```

### State Storage
- **Single Instance**: In-memory Map
- **Multi-Instance**: Redis with 30-minute TTL
- **Access Time**: < 50ms
- **Cleanup**: Remove stale sessions after 30 minutes inactivity

### Session Isolation
- Each session has completely isolated state
- No shared state between sessions
- Session ID is unique across all connections
- Concurrent sessions do not interfere

## Questionnaire Logic

### Display Logic
Evaluate conditions to determine if question should be shown:
```typescript
if (question.displayLogic) {
  const shouldDisplay = evaluateConditions(
    question.displayLogic.conditions,
    session.responses
  );
  if (!shouldDisplay) {
    skip to next question;
  }
}
```

### Skip Logic
Evaluate conditions to determine next question:
```typescript
if (question.skipLogic) {
  const skipTarget = evaluateSkipConditions(
    question.skipLogic,
    session.responses
  );
  if (skipTarget) {
    jump to skipTarget question;
  }
}
```

### Dynamic Question Text
Apply question text based on prior responses:
```typescript
if (question.dynamicQuestionText) {
  const priorResponse = session.responses.get(question.basedOn);
  const rule = findMatchingRule(question.dynamicQuestionText.rules, priorResponse);
  questionText = rule.questionText;
}
```

### Dynamic Options
Filter options based on prior selections:
```typescript
if (question.dynamicOptions) {
  const priorSelections = session.responses.get(question.dynamicOptions.sourceQuestionId);
  options = filterOptions(question.options, priorSelections);
}
```

## Tool Execution

### Tool Definition (Gemini Live Format)
```typescript
{
  functionDeclarations: [{
    name: 'record_response',
    description: 'Record the user\'s response to the current survey question',
    parameters: {
      type: 'object',
      properties: {
        questionId: { type: 'string', description: 'Question ID' },
        response: { type: 'string', description: 'User response' },
        responseType: { type: 'string', description: 'Type of response' }
      },
      required: ['questionId', 'response']
    }
  }]
}
```

### Tool Execution Flow
1. Gemini sends **toolCall** event with functionCalls array
2. Backend extracts function name and args
3. Backend executes corresponding function
4. Backend returns **toolResponse** event with functionResponses
5. Gemini continues conversation

## Error Handling Strategies

### Error Categories
1. **WebSocket Errors**: Connection failures, message parsing, protocol violations
2. **Gemini Live API Errors**: Connection failures, authentication errors, rate limiting
3. **Database Errors**: Write failures, connection timeouts, throttling
4. **Audio Processing Errors**: Invalid format, encoding failures, buffer overflows
5. **Questionnaire Logic Errors**: Invalid references, logic evaluation failures
6. **Tool Execution Errors**: Tool not found, invalid parameters, execution timeout
7. **Unhandled Exceptions**: Unexpected runtime errors

### Error Handling Principles
1. **Log Everything**: Error code, message, stack trace, context (sessionId, etc.)
2. **Retry Transient Errors**: Exponential backoff for network/API errors (max 3 retries)
3. **Fail Gracefully**: Continue session if possible, degrade functionality if needed
4. **Notify User**: Send user-friendly error message to frontend (no internal details)
5. **Clean Up Resources**: Always clean up on error (close connections, delete temp data)
6. **Monitor Errors**: Emit error metrics to CloudWatch, trigger alarms

### Error Response Format
```typescript
{
  event: 'error',
  sessionId: string,
  timestamp: string,
  data: {
    errorCode: string,
    errorMessage: string,
    recoverable: boolean,
    retryAfter?: number
  }
}
```

### Error Codes
- `WS_CONNECTION_FAILED`: WebSocket connection failure
- `WS_MESSAGE_INVALID`: Invalid message format
- `GEMINI_CONNECTION_FAILED`: Gemini Live connection failure
- `GEMINI_AUTH_FAILED`: Gemini Live authentication failure
- `GEMINI_RATE_LIMITED`: Gemini Live rate limit exceeded
- `GEMINI_STREAM_ERROR`: Gemini Live streaming error
- `GEMINI_TOOL_TIMEOUT`: Tool execution exceeded timeout
- `DB_WRITE_FAILED`: Database write failure
- `AUDIO_PROCESSING_ERROR`: Audio processing error
- `QUESTIONNAIRE_LOGIC_ERROR`: Questionnaire logic error
- `TOOL_EXECUTION_ERROR`: Tool execution error
- `SESSION_EXPIRED`: Session expired
- `INTERNAL_ERROR`: Unhandled internal error

## Performance Optimization

### Latency Targets
- **End-to-End Audio Latency**: < 300ms (P95)
- **Database Writes**: < 100ms
- **Tool Execution**: < 500ms (5s timeout)
- **Session State Access**: < 50ms
- **Sentiment Analysis**: < 200ms

### Optimization Techniques
1. **Connection Reuse**: Maintain persistent WebSocket connections to Gemini Live
2. **Connection Pooling**: Pool DynamoDB connections (max 50)
3. **Caching**: Cache questionnaires in memory at startup
4. **Minimal Buffering**: Stream audio immediately, no buffering
5. **Async Operations**: Use async/await for all I/O operations
6. **Batch Writes**: Batch DynamoDB writes when possible
7. **Efficient Encoding**: Use native Buffer for base64 encoding

### Horizontal Scaling
- **Stateless Design**: Store session state in Redis, not local memory
- **Load Balancing**: Use ALB with sticky sessions for WebSocket
- **Auto-Scaling**: Scale based on CPU (70%) and memory (80%)
- **Min Tasks**: 2 (for high availability)
- **Max Tasks**: 10 (for cost control)

## Security Best Practices

### Authentication & Authorization
- **Optional JWT Validation**: Validate Cognito tokens if authentication enabled
- **Session ID Validation**: Validate session ID from cookie/header
- **Origin Validation**: Validate origin and referrer headers
- **Rate Limiting**: Limit messages per session (100/second)
- **Google Cloud Credentials**: Secure storage via service account and environment variables

### Data Protection
- **In Transit**: WSS for WebSocket, TLS 1.2+ for AWS APIs
- **At Rest**: DynamoDB encryption, S3 encryption (AES-256)
- **Retention**: Audio recordings 90 days, transcripts 90 days

### Input Validation
- **Schema Validation**: Validate all WebSocket messages against schema
- **Size Limits**: Max 1MB per message, max 10MB per audio chunk
- **Format Validation**: Validate audio format (16kHz, 16-bit, mono)
- **Type Validation**: Validate response types match question types

### Secrets Management
- **No Hardcoded Credentials**: Use IAM roles and environment variables
- **AWS Secrets Manager**: Store sensitive configuration
- **Least Privilege**: IAM roles with minimal required permissions

## Monitoring & Observability

### Structured Logging
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

### Log Levels
- **DEBUG**: Detailed debugging (disabled in production)
- **INFO**: General informational messages
- **WARN**: Warning messages (potential issues)
- **ERROR**: Error messages with stack traces

### CloudWatch Metrics
- **ConcurrentSessions**: Number of active sessions
- **WebSocketConnections**: Number of open connections
- **GeminiLiveConnections**: Number of active Gemini Live connections
- **GeminiLiveLatency**: Gemini Live API call latency
- **DatabaseLatency**: DynamoDB operation latency
- **ToolExecutionLatency**: Tool execution latency
- **ErrorRate**: Percentage of requests with errors
- **AudioChunksProcessed**: Number of audio chunks processed

### CloudWatch Alarms
- **High Error Rate**: > 5% (critical)
- **High Latency**: > 500ms (warning), > 1s (critical)
- **Low Health Check Success**: < 80% (critical)
- **High CPU**: > 80% (warning)
- **High Memory**: > 85% (warning)

### Distributed Tracing
- **AWS X-Ray**: Trace requests through WebSocket → Backend → Gemini Live
- **Trace Context**: Include sessionId in all traces
- **Performance Analysis**: Identify bottlenecks and optimize

## Testing Strategy

### Unit Tests (Jest)
- **Coverage Target**: 80%+ code coverage
- **Focus**: Individual functions and classes
- **Mocking**: Mock AWS services, WebSocket connections, Gemini Live client
- **Fast**: Run in < 10 seconds

### Property-Based Tests (fast-check)
- **Iterations**: 100+ per property
- **Focus**: Universal properties that should hold for all inputs
- **Examples**: Session ID uniqueness, message schema conformance, audio encoding

### Integration Tests
- **Focus**: Component interactions
- **Examples**: WebSocket ↔ Backend, Backend ↔ Gemini Live, Backend ↔ DynamoDB
- **Environment**: Use LocalStack or AWS test account

### Load Tests (Artillery/k6)
- **Concurrent Sessions**: Ramp up to 50 concurrent sessions
- **Duration**: 5 minutes sustained load
- **Metrics**: Latency, error rate, throughput
- **Pass Criteria**: < 300ms latency, < 1% error rate

## Deployment

### Docker Container
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

### Environment Variables
- `AWS_REGION`: us-east-1, us-west-2, ap-northeast-1, eu-north-1
- `GOOGLE_CLOUD_PROJECT`: GCP project ID for Vertex AI
- `GOOGLE_CLOUD_REGION`: GCP region (us-central1, etc.)
- `GEMINI_MODEL`: Gemini Live model name
- `GEMINI_DEFAULT_VOICE`: Default voice (Charon, Aoede, Kore, etc.)
- `USE_GEMINI_LIVE`: Feature flag (true/false)
- `DYNAMODB_TABLE_PREFIX`: demo-
- `S3_BUCKET_NAME`: voiceter-demo-recordings
- `REDIS_URL`: redis://... (optional, for multi-instance)
- `PORT`: 8080
- `LOG_LEVEL`: INFO
- `ENABLE_AUTH`: false (true for Cognito)
- `COGNITO_USER_POOL_ID`: (if auth enabled)

### ECS Fargate Configuration
- **CPU**: 1 vCPU
- **Memory**: 2 GB
- **Desired Count**: 2
- **Health Check**: GET /health every 30s
- **Auto-Scaling**: CPU 70%, Memory 80%, Min 2, Max 10

### Blue/Green Deployment
1. Deploy new task definition (green)
2. Run smoke tests on green
3. Shift traffic to green (ALB target group)
4. Monitor for errors
5. Rollback to blue if errors > 5%
6. Keep blue for 1 hour, then decommission

## Common Patterns

### Async Error Handling
```typescript
try {
  await operation();
} catch (error) {
  logger.error('Operation failed', { error, sessionId });
  socket.emit('error', {
    errorCode: 'OPERATION_FAILED',
    errorMessage: 'An error occurred',
    recoverable: true
  });
}
```

### Retry with Exponential Backoff
```typescript
async function retryOperation(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

### Session State Update
```typescript
async function updateSession(sessionId: string, updates: Partial<Session>) {
  const session = await sessionManager.getSession(sessionId);
  if (!session) throw new Error('Session not found');
  
  Object.assign(session, updates);
  session.lastActivityTime = new Date();
  
  await sessionManager.updateSession(sessionId, session);
}
```

### Tool Execution
```typescript
async function executeTool(toolName: string, parameters: any, session: Session) {
  const handler = toolHandlers.get(toolName);
  if (!handler) {
    return { success: false, error: 'Tool not found' };
  }
  
  try {
    const result = await handler(parameters, session);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Tool execution failed', { toolName, error, sessionId: session.sessionId });
    return { success: false, error: error.message };
  }
}
```

## Troubleshooting

### High Latency
1. Check CloudWatch metrics for bottlenecks
2. Check Gemini Live API latency
3. Check DynamoDB latency
4. Check network latency (ALB → ECS)
5. Enable X-Ray tracing for detailed analysis

### High Error Rate
1. Check CloudWatch Logs for error patterns
2. Check Gemini Live API errors (rate limiting, authentication)
3. Check DynamoDB errors (throttling, capacity)
4. Check WebSocket connection errors
5. Check application logs for exceptions

### Memory Leaks
1. Monitor ECS task memory over time
2. Check for unclosed connections (WebSocket, Gemini Live, DynamoDB)
3. Check for large objects in memory (session state, audio buffers)
4. Use Node.js heap snapshots for analysis
5. Implement session cleanup (30min timeout)

### Audio Quality Issues
1. Check audio format (16kHz input, 24kHz output, 16-bit, mono)
2. Check base64 encoding/decoding
3. Check for audio chunk loss (network issues)
4. Check Gemini Live audio output quality
5. Check frontend audio playback implementation (may need resampling for 24kHz)
