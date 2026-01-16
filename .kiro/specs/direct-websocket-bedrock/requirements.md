# Requirements Document

## Introduction

This specification defines the requirements for refactoring the Voiceter backend to use a direct WebSocket connection to Amazon Bedrock Nova Sonic, matching the architecture used by the Amazon Bedrock Playground. The goal is to achieve lower latency and better real-time performance while preserving all existing demo questionnaire capabilities, tool execution, and session management features.

## Glossary

- **Direct_WebSocket**: A native WebSocket connection from the browser directly to AWS Bedrock's WebSocket endpoint
- **Pre_Signed_URL**: A URL containing AWS SigV4 authentication parameters that grants temporary access to AWS resources
- **Nova_Sonic**: Amazon Bedrock's speech-to-speech AI model (amazon.nova-2-sonic-v1:0)
- **BiDirectional_Stream**: A two-way communication channel for simultaneous audio input and output
- **Tool_Execution**: Server-side execution of AI-requested functions (record_response, get_next_question, etc.)
- **Session_Manager**: Backend component managing questionnaire state, responses, and conversation history
- **Audio_Chunk**: A segment of PCM audio data (~32ms at 24kHz, 1536 bytes)
- **Event_Stream**: AWS binary protocol for encoding/decoding Bedrock messages
- **Proxy_Mode**: Architecture where backend relays WebSocket messages between browser and Bedrock

## Requirements

### Requirement 1: Pre-Signed URL Generation

**User Story:** As a frontend application, I want to obtain a pre-signed WebSocket URL for Bedrock, so that I can establish a direct connection without exposing AWS credentials.

#### Acceptance Criteria

1. WHEN the frontend requests a session start, THE Backend SHALL generate a pre-signed WebSocket URL for Bedrock Nova Sonic
2. THE Pre_Signed_URL SHALL include AWS SigV4 authentication parameters (X-Amz-Algorithm, X-Amz-Credential, X-Amz-Date, X-Amz-SignedHeaders, X-Amz-Signature)
3. THE Pre_Signed_URL SHALL have a configurable expiration time (default: 5 minutes)
4. THE Pre_Signed_URL SHALL target the model endpoint: `wss://bedrock-runtime.{region}.amazonaws.com/model/amazon.nova-2-sonic-v1%3A0/invoke-with-bidirectional-stream-websocket`
5. WHEN generating the URL, THE Backend SHALL use IAM credentials from the server environment
6. THE Backend SHALL NOT expose raw AWS credentials to the frontend

### Requirement 2: Direct WebSocket Connection from Browser

**User Story:** As a frontend application, I want to connect directly to Bedrock via WebSocket, so that I can achieve the lowest possible audio latency.

#### Acceptance Criteria

1. WHEN the frontend receives a pre-signed URL, THE Frontend SHALL establish a native WebSocket connection to Bedrock
2. THE Frontend SHALL send binary WebSocket messages (opcode 2) to Bedrock
3. THE Frontend SHALL receive and process binary WebSocket messages from Bedrock
4. WHEN the WebSocket connection fails, THE Frontend SHALL notify the backend and attempt reconnection
5. THE Frontend SHALL maintain the WebSocket connection for the duration of the session
6. WHEN the session ends, THE Frontend SHALL close the WebSocket connection gracefully

### Requirement 3: AWS Event Stream Binary Protocol

**User Story:** As a frontend application, I want to encode and decode messages using AWS Event Stream format, so that I can communicate correctly with Bedrock.

#### Acceptance Criteria

1. THE Frontend SHALL encode outgoing messages using AWS Event Stream binary format
2. THE Frontend SHALL decode incoming messages from AWS Event Stream binary format
3. WHEN encoding messages, THE Frontend SHALL include required headers (event-type, message-type, content-type)
4. THE Frontend SHALL handle the `{"bytes": "base64-encoded-json"}` payload wrapper format
5. IF a message fails to decode, THEN THE Frontend SHALL log the error and continue processing

### Requirement 4: Session Initialization Sequence

**User Story:** As a frontend application, I want to initialize a Bedrock session with proper configuration, so that the AI responds correctly for voice surveys.

#### Acceptance Criteria

1. WHEN starting a session, THE Frontend SHALL send a sessionStart event with inference configuration
2. THE Frontend SHALL send a promptStart event with audio output configuration (24kHz, 16-bit, mono, voiceId)
3. THE Frontend SHALL send a contentStart event for the system prompt (type: TEXT, role: SYSTEM)
4. THE Frontend SHALL send a textInput event containing the system prompt content
5. THE Frontend SHALL send a contentEnd event to close the system prompt
6. THE Frontend SHALL send a contentStart event for audio input (type: AUDIO, role: USER, interactive: true)
7. THE Session_Manager SHALL provide the system prompt content to the frontend before connection

### Requirement 5: Audio Streaming

**User Story:** As a user, I want my voice to be streamed directly to Bedrock with minimal latency, so that the conversation feels natural.

#### Acceptance Criteria

1. WHEN capturing audio, THE Frontend SHALL stream audio chunks directly to Bedrock via WebSocket
2. THE Frontend SHALL send audioInput events with base64-encoded PCM audio (24kHz, 16-bit, mono)
3. THE Frontend SHALL send audio chunks of approximately 32ms duration (768 samples, 1536 bytes)
4. THE Frontend SHALL NOT buffer audio chunks before sending
5. WHEN receiving audioOutput events, THE Frontend SHALL decode and play audio immediately
6. THE Frontend SHALL support barge-in (user speaking while AI is speaking)

### Requirement 6: Tool Use Coordination

**User Story:** As a system, I want to execute tools on the backend when the AI requests them, so that questionnaire logic and data persistence work correctly.

#### Acceptance Criteria

1. WHEN the Frontend receives a toolUse event from Bedrock, THE Frontend SHALL forward it to the Backend via the existing WebSocket
2. THE Backend SHALL execute the requested tool (record_response, get_next_question, validate_answer, get_demo_context)
3. WHEN tool execution completes, THE Backend SHALL return the result to the Frontend
4. THE Frontend SHALL send a toolResult event to Bedrock with the tool execution result
5. THE Frontend SHALL send contentStart (type: TOOL, role: TOOL), toolResult, and contentEnd events in sequence
6. IF tool execution fails, THEN THE Frontend SHALL send an error result to Bedrock

### Requirement 7: Backend Session Management

**User Story:** As a backend system, I want to maintain session state and questionnaire progress, so that demo functionality is preserved.

#### Acceptance Criteria

1. THE Backend SHALL maintain session state (questionnaireId, currentQuestionIndex, responses, visitedQuestions)
2. THE Backend SHALL persist user responses to DynamoDB when record_response tool is executed
3. THE Backend SHALL persist transcripts to DynamoDB for both user and assistant speech
4. THE Backend SHALL track conversation history for context
5. THE Backend SHALL support quota management for political polling demos
6. THE Backend SHALL support dynamic question text and options
7. WHEN a session ends, THE Backend SHALL clean up session state

### Requirement 8: Transcription Handling

**User Story:** As a system, I want to capture and display transcriptions, so that users can see what was said.

#### Acceptance Criteria

1. WHEN the Frontend receives a textOutput event with role USER, THE Frontend SHALL forward it to the Backend
2. WHEN the Frontend receives a textOutput event with role ASSISTANT, THE Frontend SHALL forward it to the Backend
3. THE Backend SHALL aggregate user transcriptions for multi-sentence responses
4. THE Backend SHALL persist transcriptions to DynamoDB with turn numbers
5. THE Backend SHALL emit transcription events to the frontend for UI display
6. THE Backend SHALL apply guardrails checking to user input and AI output

### Requirement 9: Error Handling and Recovery

**User Story:** As a user, I want the system to handle errors gracefully, so that my session can continue or recover.

#### Acceptance Criteria

1. IF the Bedrock WebSocket connection drops, THEN THE Frontend SHALL attempt to reconnect with a new pre-signed URL
2. IF reconnection fails after 3 attempts, THEN THE Frontend SHALL notify the user and end the session
3. WHEN Bedrock sends a modelStreamErrorException, THE Frontend SHALL forward it to the Backend for logging
4. WHEN Bedrock sends an internalServerException, THE Frontend SHALL forward it to the Backend for logging
5. THE Backend SHALL log all errors with session context for debugging
6. THE Frontend SHALL display user-friendly error messages without exposing technical details

### Requirement 10: Audio Recording

**User Story:** As a system, I want to record the conversation audio, so that it can be stored for later review.

#### Acceptance Criteria

1. THE Frontend SHALL capture user audio chunks and forward them to the Backend for recording
2. THE Frontend SHALL capture assistant audio chunks and forward them to the Backend for recording
3. THE Backend SHALL buffer audio chunks during the session
4. WHEN the session ends, THE Backend SHALL upload the combined audio to S3
5. THE Backend SHALL store the S3 URL in the session record

### Requirement 11: Configuration and Voice Selection

**User Story:** As a user, I want to select different AI voices and questionnaires, so that I can customize my demo experience.

#### Acceptance Criteria

1. THE Backend SHALL provide questionnaire configuration to the Frontend before session start
2. THE Backend SHALL generate system prompts based on the selected questionnaire
3. THE Frontend SHALL include the selected voiceId in the promptStart event
4. THE Frontend SHALL support voice options: matthew, tiffany, amy
5. THE Backend SHALL provide tool definitions for inclusion in the promptStart event

### Requirement 12: Backward Compatibility

**User Story:** As a system administrator, I want the option to use the original architecture, so that I can fall back if issues arise.

#### Acceptance Criteria

1. THE System SHALL support a configuration flag to switch between direct WebSocket and proxy modes
2. WHEN proxy mode is enabled, THE System SHALL use the existing HTTP/2 SDK architecture
3. WHEN direct WebSocket mode is enabled, THE System SHALL use the new architecture
4. THE Backend API contracts SHALL remain unchanged regardless of mode
5. THE Frontend SHALL detect the mode and use the appropriate connection method

