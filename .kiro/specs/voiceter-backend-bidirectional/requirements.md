# Requirements Document: Voiceter Backend BiDirectional API Integration

## Introduction

This document specifies the requirements for implementing the Voiceter backend system that integrates Amazon Nova 2 Sonic's BiDirectional Streaming API to enable real-time voice survey demos. The system will bridge a React frontend with AWS Bedrock services to deliver natural, conversational voice surveys with sub-300ms latency.

## Glossary

- **BiDirectional Stream**: A persistent HTTP/2 connection that allows simultaneous sending and receiving of data between the backend and AWS Bedrock
- **Nova Sonic**: Amazon Bedrock's speech-to-speech AI model (amazon.nova-2-sonic-v1:0)
- **Session**: A single survey interaction from start to completion, maintaining state and conversation history
- **Tool Use**: A mechanism where Nova Sonic requests the backend to execute specific functions (e.g., record_response, get_next_question)
- **WebSocket**: A persistent connection protocol between the browser client and backend server
- **Event Queue**: An ordered collection of events waiting to be sent to Nova Sonic
- **AsyncIterable**: A JavaScript pattern that yields values asynchronously, required by the BiDirectional API
- **Questionnaire Engine**: The component that manages survey logic, question progression, and response validation
- **Audio Chunk**: A small segment of audio data (typically 32ms at 16kHz = ~512 bytes)
- **System Prompt**: Instructions sent to Nova Sonic that define its behavior and provide context
- **Content Block**: A logical unit of conversation (e.g., system prompt, user audio, AI response)
- **Inference Configuration**: Parameters that control Nova Sonic's response generation (temperature, topP, maxTokens)

## Requirements

### Requirement 1: BiDirectional Stream Management

**User Story:** As a backend developer, I want to establish and manage BiDirectional streams with Nova Sonic, so that real-time audio conversations can occur with minimal latency.

#### Acceptance Criteria

1. WHEN the backend initializes THEN the system SHALL create a BedrockRuntimeClient with HTTP/2 handler configured for 300-second timeout and 20 concurrent streams
2. WHEN a new session is requested THEN the system SHALL create a unique session with event queue, queue signal, close signal, and response handlers
3. WHEN initiating a BiDirectional stream THEN the system SHALL send InvokeModelWithBidirectionalStreamCommand with an AsyncIterable that yields events from the session queue
4. WHEN the event queue is empty THEN the AsyncIterable SHALL wait for queue signal or close signal using Promise.race
5. WHEN a close signal is received THEN the AsyncIterable SHALL return done:true to terminate the stream
6. WHEN the BiDirectional stream is established THEN the system SHALL process response events asynchronously without blocking
7. WHEN a session becomes inactive THEN the system SHALL remove it from active sessions within 5 minutes

### Requirement 2: Session Lifecycle Management

**User Story:** As a backend developer, I want to manage the complete lifecycle of survey sessions, so that resources are properly allocated and cleaned up.

#### Acceptance Criteria

1. WHEN a session is created THEN the system SHALL assign a unique session ID and initialize session state with promptName, audioContentId, and inferenceConfig
2. WHEN initializing a session THEN the system SHALL send sessionStart event with inference configuration to Nova Sonic
3. WHEN starting a prompt THEN the system SHALL send promptStart event with audio output configuration, text output configuration, and tool configuration
4. WHEN setting up system prompt THEN the system SHALL send contentStart (TEXT, SYSTEM), textInput, and contentEnd events in sequence
5. WHEN starting audio streaming THEN the system SHALL send contentStart (AUDIO, USER) event with audio input configuration
6. WHEN ending audio streaming THEN the system SHALL send contentEnd event for the audio content block
7. WHEN ending a prompt THEN the system SHALL send promptEnd event and wait 300ms for processing
8. WHEN closing a session THEN the system SHALL send sessionEnd event, mark session inactive, trigger close signal, and remove from active sessions
9. WHEN cleanup exceeds 5 seconds THEN the system SHALL force-close the session to prevent hanging

### Requirement 3: Audio Streaming

**User Story:** As a backend developer, I want to stream audio bidirectionally between the browser and Nova Sonic, so that users can have natural voice conversations.

#### Acceptance Criteria

1. WHEN receiving audio from the browser THEN the system SHALL accept base64-encoded PCM audio at 16kHz, 16-bit, mono format
2. WHEN audio chunks arrive THEN the system SHALL queue them with a maximum queue size of 200 chunks
3. WHEN the audio queue exceeds maximum size THEN the system SHALL drop the oldest chunk to prevent memory overflow
4. WHEN processing the audio queue THEN the system SHALL send up to 5 chunks per batch to avoid overload
5. WHEN sending audio to Nova Sonic THEN the system SHALL wrap each chunk in an audioInput event with promptName, contentName, and base64 content
6. WHEN receiving audioOutput from Nova Sonic THEN the system SHALL forward the base64-encoded audio to the browser client
7. WHEN audio streaming is active THEN the system SHALL maintain sub-300ms end-to-end latency for 95% of audio chunks

### Requirement 4: Tool Use Integration

**User Story:** As a backend developer, I want to integrate survey tools with Nova Sonic, so that the AI can record responses and advance through questions.

#### Acceptance Criteria

1. WHEN configuring promptStart THEN the system SHALL register tools: record_response, get_next_question, validate_answer, and get_demo_context
2. WHEN Nova Sonic sends toolUse event THEN the system SHALL extract tool name, toolUseId, and parameters
3. WHEN contentEnd event arrives with type TOOL THEN the system SHALL execute the corresponding tool handler
4. WHEN a tool executes successfully THEN the system SHALL send contentStart (TOOL, role=TOOL), toolResult, and contentEnd events in sequence
5. WHEN record_response tool executes THEN the system SHALL save the response to DynamoDB demo-responses table
6. WHEN get_next_question tool executes THEN the system SHALL invoke the questionnaire engine and return the next question with context
7. WHEN validate_answer tool executes THEN the system SHALL validate the response against question constraints and return validation result
8. WHEN tool execution fails THEN the system SHALL return an error result to Nova Sonic and log the failure

### Requirement 5: WebSocket Communication

**User Story:** As a backend developer, I want to establish WebSocket connections with browser clients, so that real-time bidirectional communication can occur.

#### Acceptance Criteria

1. WHEN a browser client connects THEN the system SHALL create a Socket.IO connection and assign a unique socket ID
2. WHEN the client sends initializeConnection event THEN the system SHALL create a session, start the BiDirectional stream, and return success confirmation
3. WHEN the client sends promptStart event THEN the system SHALL invoke setupSessionAndPromptStart on the session
4. WHEN the client sends systemPrompt event THEN the system SHALL invoke setupSystemPrompt with the provided prompt content
5. WHEN the client sends audioStart event THEN the system SHALL invoke setupStartAudio and emit audioReady confirmation
6. WHEN the client sends audioInput event THEN the system SHALL convert base64 to Buffer and stream to the session
7. WHEN the client sends stopAudio event THEN the system SHALL execute cleanup sequence with 5-second timeout protection
8. WHEN the client disconnects abruptly THEN the system SHALL clean up the session with 3-second timeout protection
9. WHEN Nova Sonic sends textOutput event THEN the system SHALL forward it to the client via Socket.IO
10. WHEN Nova Sonic sends audioOutput event THEN the system SHALL forward it to the client via Socket.IO

### Requirement 6: Questionnaire Engine Integration

**User Story:** As a backend developer, I want to integrate the questionnaire engine with the BiDirectional stream, so that survey logic controls question progression.

#### Acceptance Criteria

1. WHEN generating a system prompt THEN the system SHALL include questionnaire context, current question, question type, and options
2. WHEN get_next_question tool is called THEN the system SHALL evaluate display logic conditions against prior responses
3. WHEN display logic evaluates to false THEN the system SHALL skip the question and advance to the next eligible question
4. WHEN skip logic conditions are met THEN the system SHALL jump to the target question specified in skipLogic
5. WHEN dynamic question text is configured THEN the system SHALL select question text based on prior response values
6. WHEN dynamic options are configured THEN the system SHALL filter options based on prior selections
7. WHEN all questions are completed THEN the system SHALL return completion status with survey summary
8. WHEN a response is recorded THEN the system SHALL update session state with the response for use in subsequent logic evaluation

### Requirement 7: Response Processing and Storage

**User Story:** As a backend developer, I want to process and store survey responses, so that demo data is persisted for analysis.

#### Acceptance Criteria

1. WHEN Nova Sonic sends textOutput with role USER and final true THEN the system SHALL extract and store the user transcription
2. WHEN Nova Sonic sends textOutput with role ASSISTANT and final true THEN the system SHALL extract and store the AI transcription
3. WHEN record_response tool executes THEN the system SHALL write to DynamoDB demo-responses table with sessionId, questionId, response, and timestamp
4. WHEN a session completes THEN the system SHALL write to DynamoDB demo-sessions table with sessionId, questionnaireId, completionStatus, and duration
5. WHEN storing transcripts THEN the system SHALL write to DynamoDB demo-transcripts table with sessionId, speaker, text, and timestamp
6. WHEN database write fails THEN the system SHALL retry up to 3 times with exponential backoff
7. WHEN all retries fail THEN the system SHALL log the error and continue the session without crashing

### Requirement 8: Error Handling and Recovery

**User Story:** As a backend developer, I want comprehensive error handling, so that the system degrades gracefully and provides useful diagnostics.

#### Acceptance Criteria

1. WHEN any error occurs THEN the system SHALL log the error with sessionId, error code, message, and stack trace
2. WHEN a WebSocket error occurs THEN the system SHALL emit an error event to the client with user-friendly message
3. WHEN a Bedrock API error occurs THEN the system SHALL dispatch error event to session handlers and attempt graceful cleanup
4. WHEN session cleanup fails THEN the system SHALL force-close the session after timeout
5. WHEN a tool execution error occurs THEN the system SHALL return error result to Nova Sonic and log the failure
6. WHEN database operations fail THEN the system SHALL retry with exponential backoff and continue session if retries exhausted
7. WHEN an unhandled exception occurs THEN the system SHALL log the error, emit error event to client, and clean up session resources
8. WHEN error rate exceeds 5 percent THEN the system SHALL emit CloudWatch alarm

### Requirement 9: Configuration and Initialization

**User Story:** As a backend developer, I want to configure the system via environment variables, so that deployment is flexible across environments.

#### Acceptance Criteria

1. WHEN the backend starts THEN the system SHALL load AWS_REGION from environment with default us-east-1
2. WHEN the backend starts THEN the system SHALL load AWS credentials from IAM role, environment variables, or AWS CLI configuration
3. WHEN the backend starts THEN the system SHALL validate that BEDROCK_MODEL_ID is set to amazon.nova-2-sonic-v1:0
4. WHEN the backend starts THEN the system SHALL load PORT from environment with default 8080
5. WHEN the backend starts THEN the system SHALL load LOG_LEVEL from environment with default INFO
6. WHEN the backend starts THEN the system SHALL load questionnaires from the questionnaires directory
7. WHEN required configuration is missing THEN the system SHALL fail fast with clear error message
8. WHEN the backend starts THEN the system SHALL log initialization success with configuration summary

### Requirement 10: Monitoring and Health Checks

**User Story:** As a DevOps engineer, I want monitoring and health check endpoints, so that I can track system health and performance.

#### Acceptance Criteria

1. WHEN GET /health is requested THEN the system SHALL return 200 OK with status, timestamp, activeSessions, and socketConnections
2. WHEN a session is created THEN the system SHALL increment ConcurrentSessions metric in CloudWatch
3. WHEN a session is closed THEN the system SHALL decrement ConcurrentSessions metric in CloudWatch
4. WHEN audio is processed THEN the system SHALL record AudioChunksProcessed metric in CloudWatch
5. WHEN a Bedrock API call completes THEN the system SHALL record BedrockLatency metric in CloudWatch
6. WHEN a database operation completes THEN the system SHALL record DatabaseLatency metric in CloudWatch
7. WHEN an error occurs THEN the system SHALL increment ErrorRate metric in CloudWatch
8. WHEN the system logs THEN the system SHALL use structured JSON format with timestamp, level, sessionId, event, and data

### Requirement 11: Concurrent Session Support

**User Story:** As a product manager, I want to support 50+ concurrent demo sessions, so that multiple users can experience the demo simultaneously.

#### Acceptance Criteria

1. WHEN multiple clients connect THEN the system SHALL maintain isolated session state for each client
2. WHEN 50 concurrent sessions are active THEN the system SHALL maintain sub-300ms latency for all sessions
3. WHEN a session is inactive for 5 minutes THEN the system SHALL automatically close it to free resources
4. WHEN sessions are created THEN the system SHALL use HTTP/2 connection pooling with maxConcurrentStreams of 20
5. WHEN memory usage exceeds 80 percent THEN the system SHALL log warning and trigger cleanup of stale sessions
6. WHEN CPU usage exceeds 70 percent THEN the system SHALL trigger auto-scaling to add capacity
7. WHEN a session is created THEN the system SHALL ensure complete isolation from other sessions with no shared state

### Requirement 12: Voice Configuration

**User Story:** As a product manager, I want to support multiple AI voices, so that demos can be customized for different audiences.

#### Acceptance Criteria

1. WHEN configuring audio output THEN the system SHALL accept voiceId parameter with values: matthew, tiffany, amy, ruth, stephen, gregory, or burleigh
2. WHEN no voiceId is specified THEN the system SHALL default to matthew
3. WHEN a questionnaire specifies a recommended voice THEN the system SHALL use that voice unless overridden by client
4. WHEN the client sends a voice change request THEN the system SHALL update the audio output configuration for subsequent responses
5. WHEN an invalid voiceId is provided THEN the system SHALL reject the request with error message listing valid voices

### Requirement 13: Graceful Shutdown

**User Story:** As a DevOps engineer, I want graceful shutdown on deployment, so that active sessions complete without interruption.

#### Acceptance Criteria

1. WHEN SIGINT signal is received THEN the system SHALL stop accepting new connections
2. WHEN shutting down THEN the system SHALL close the Socket.IO server to prevent new WebSocket connections
3. WHEN shutting down THEN the system SHALL close all active Bedrock sessions with proper cleanup sequence
4. WHEN shutting down THEN the system SHALL wait up to 5 seconds for graceful cleanup
5. WHEN graceful shutdown exceeds 5 seconds THEN the system SHALL force exit with code 1
6. WHEN shutdown completes successfully THEN the system SHALL exit with code 0
7. WHEN shutdown is in progress THEN the system SHALL log shutdown status and active session count

### Requirement 14: Security and Validation

**User Story:** As a security engineer, I want input validation and secure communication, so that the system is protected from malicious input.

#### Acceptance Criteria

1. WHEN receiving WebSocket messages THEN the system SHALL validate message format against expected schema
2. WHEN receiving audio chunks THEN the system SHALL validate size does not exceed 1MB
3. WHEN receiving events THEN the system SHALL validate sessionId exists and is active
4. WHEN establishing WebSocket connections THEN the system SHALL use WSS protocol in production
5. WHEN communicating with AWS THEN the system SHALL use TLS 1.2 or higher
6. WHEN logging THEN the system SHALL not log sensitive data including audio content or PII
7. WHEN rate limit is exceeded THEN the system SHALL reject messages with error code RATE_LIMIT_EXCEEDED

### Requirement 15: Testing Infrastructure

**User Story:** As a backend developer, I want comprehensive testing infrastructure, so that code quality and correctness are maintained.

#### Acceptance Criteria

1. WHEN running unit tests THEN the system SHALL achieve 80 percent or greater code coverage
2. WHEN testing session creation THEN the system SHALL verify unique session IDs are generated
3. WHEN testing audio buffering THEN the system SHALL verify queue size limits are enforced
4. WHEN testing tool execution THEN the system SHALL verify correct tool handlers are invoked
5. WHEN testing error handling THEN the system SHALL verify errors are logged and propagated correctly
6. WHEN running integration tests THEN the system SHALL verify WebSocket to Bedrock flow works end-to-end
7. WHEN running load tests THEN the system SHALL verify 50 concurrent sessions maintain sub-300ms latency
