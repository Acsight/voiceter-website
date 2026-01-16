# Requirements Document

## Introduction

This document specifies the requirements for migrating the Voiceter voice survey system from Amazon Bedrock Nova 2 Sonic speech-to-speech model to ElevenLabs Conversational AI platform. The migration aims to leverage ElevenLabs' advanced voice synthesis capabilities (5,000+ voices, 31 languages) while maintaining the existing survey functionality, questionnaire logic, and user experience.

## Glossary

- **ElevenLabs_Client**: The WebSocket client that connects to ElevenLabs Conversational AI API at `wss://api.elevenlabs.io/v1/convai/conversation`
- **Agent**: An ElevenLabs conversational agent configured with system prompt, voice settings, and tools
- **Conversation_Session**: A bidirectional WebSocket connection between the backend and ElevenLabs for a single user survey session
- **Audio_Chunk**: Base64-encoded PCM audio data sent between client and ElevenLabs
- **Turn_Taking_Model**: ElevenLabs' built-in model that determines when the user has finished speaking
- **Tool_Call**: A request from the ElevenLabs agent to execute a backend function (e.g., record_response, get_next_question)
- **Barge_In**: User interruption of the AI's speech, handled by ElevenLabs' interruption events
- **Session_Manager**: Backend component that manages survey session state, responses, and questionnaire progression
- **Questionnaire_Engine**: Backend component that evaluates display logic, skip logic, and dynamic question text

## Requirements

### Requirement 1: ElevenLabs WebSocket Client

**User Story:** As a backend developer, I want to replace the Bedrock client with an ElevenLabs WebSocket client, so that the system can communicate with ElevenLabs Conversational AI API.

#### Acceptance Criteria

1. THE ElevenLabs_Client SHALL establish a WebSocket connection to `wss://api.elevenlabs.io/v1/convai/conversation?agent_id={agent_id}`
2. WHEN a connection is established, THE ElevenLabs_Client SHALL send a `conversation_initiation_client_data` event with session configuration
3. THE ElevenLabs_Client SHALL authenticate using the ElevenLabs API key via the `xi-api-key` header or signed URL
4. WHEN the connection is lost, THE ElevenLabs_Client SHALL attempt reconnection with exponential backoff (max 3 retries)
5. THE ElevenLabs_Client SHALL maintain a ping/pong heartbeat to keep the connection alive
6. IF the ElevenLabs API returns an error, THEN THE ElevenLabs_Client SHALL log the error and emit an error event to the frontend

### Requirement 2: Audio Streaming Protocol

**User Story:** As a user, I want to speak naturally and hear AI responses in real-time, so that I can have a conversational survey experience.

#### Acceptance Criteria

1. WHEN user audio is received from the frontend, THE ElevenLabs_Client SHALL forward it as `user_audio_chunk` events with base64-encoded PCM data
2. THE ElevenLabs_Client SHALL support 16kHz, 16-bit, mono PCM audio input format
3. WHEN ElevenLabs sends `audio` events, THE ElevenLabs_Client SHALL forward the audio chunks to the frontend for playback
4. THE ElevenLabs_Client SHALL support configurable output audio format (mp3_44100, pcm_16000, pcm_22050, pcm_24000, pcm_44100)
5. WHEN an `interruption` event is received, THE ElevenLabs_Client SHALL notify the frontend to stop audio playback (barge-in)
6. THE Audio_Streaming SHALL maintain end-to-end latency below 300ms (P95)

### Requirement 3: Transcription Events

**User Story:** As a user, I want to see real-time transcriptions of my speech and the AI's responses, so that I can follow the conversation.

#### Acceptance Criteria

1. WHEN ElevenLabs sends a `user_transcript` event, THE ElevenLabs_Client SHALL forward it to the frontend as `transcription:user`
2. WHEN ElevenLabs sends an `agent_response` event, THE ElevenLabs_Client SHALL forward it to the frontend as `transcription:assistant`
3. WHEN ElevenLabs sends an `agent_response_correction` event, THE ElevenLabs_Client SHALL update the previous assistant transcription
4. THE Transcription_Events SHALL include the transcript text, role (user/assistant), and timestamp
5. WHEN a transcript is marked as final, THE ElevenLabs_Client SHALL persist it to the transcript repository

### Requirement 4: Agent Configuration

**User Story:** As a system administrator, I want to configure ElevenLabs agents for each survey type, so that the AI behavior matches the survey context.

#### Acceptance Criteria

1. THE Agent_Configuration SHALL include a system prompt generated from the questionnaire context
2. THE Agent_Configuration SHALL specify the voice ID from ElevenLabs' voice library
3. THE Agent_Configuration SHALL define the available tools (record_response, get_next_question, validate_answer, get_demo_context)
4. THE Agent_Configuration SHALL set language and conversation parameters (temperature, max_tokens)
5. WHEN a session starts, THE Session_Manager SHALL select the appropriate agent configuration based on questionnaireId
6. THE Agent_Configuration SHALL support dynamic first message to initiate the survey

### Requirement 5: Tool Execution

**User Story:** As a survey system, I want the AI to call backend tools to record responses and progress through questions, so that survey data is captured accurately.

#### Acceptance Criteria

1. WHEN ElevenLabs sends a tool call request, THE ElevenLabs_Client SHALL extract the tool name and parameters
2. THE Tool_Executor SHALL execute the `record_response` tool to save user answers to DynamoDB
3. THE Tool_Executor SHALL execute the `get_next_question` tool to retrieve the next survey question based on logic
4. THE Tool_Executor SHALL execute the `validate_answer` tool to validate user responses against question constraints
5. THE Tool_Executor SHALL execute the `get_demo_context` tool to provide questionnaire metadata to the agent
6. WHEN a tool execution completes, THE ElevenLabs_Client SHALL send the result back to ElevenLabs as a tool response
7. IF a tool execution fails, THEN THE Tool_Executor SHALL return an error response and log the failure

### Requirement 6: Session Management

**User Story:** As a backend system, I want to manage survey sessions with ElevenLabs, so that each user has an isolated conversation state.

#### Acceptance Criteria

1. WHEN a `session:start` event is received, THE Session_Manager SHALL create a new ElevenLabs conversation session
2. THE Session_Manager SHALL store session state including sessionId, questionnaireId, voiceId, and conversation history
3. WHEN a `session:end` event is received, THE Session_Manager SHALL close the ElevenLabs WebSocket connection
4. THE Session_Manager SHALL clean up stale sessions after 30 minutes of inactivity
5. THE Session_Manager SHALL track session metrics (duration, questions answered, completion rate)
6. WHEN a session is completed, THE Session_Manager SHALL persist the final session state to DynamoDB

### Requirement 7: Voice Selection

**User Story:** As a user, I want to select from multiple AI voices, so that I can choose a voice that suits my preference.

#### Acceptance Criteria

1. THE Voice_Selection SHALL support ElevenLabs voice IDs from their voice library
2. WHEN a user selects a voice, THE Session_Manager SHALL configure the agent with the selected voice ID
3. THE Voice_Selection SHALL provide a default voice if none is specified
4. THE Voice_Selection SHALL map existing Bedrock voice names (matthew, tiffany, amy) to equivalent ElevenLabs voices
5. THE Voice_Selection SHALL support custom voice IDs for enterprise customers

### Requirement 8: Error Handling

**User Story:** As a user, I want the system to handle errors gracefully, so that my survey experience is not disrupted.

#### Acceptance Criteria

1. IF the ElevenLabs connection fails, THEN THE ElevenLabs_Client SHALL emit an error event with code `ELEVENLABS_CONNECTION_FAILED`
2. IF the ElevenLabs API returns a rate limit error, THEN THE ElevenLabs_Client SHALL retry with exponential backoff
3. IF a tool execution times out (>5 seconds), THEN THE Tool_Executor SHALL return a timeout error
4. WHEN an error occurs, THE Error_Handler SHALL log the error with full context (sessionId, error code, stack trace)
5. THE Error_Handler SHALL send user-friendly error messages to the frontend without exposing internal details
6. IF an unrecoverable error occurs, THEN THE Session_Manager SHALL terminate the session gracefully

### Requirement 9: Frontend Integration

**User Story:** As a frontend developer, I want to update the voice chat hooks to work with ElevenLabs events, so that the UI displays transcriptions and plays audio correctly.

#### Acceptance Criteria

1. THE Frontend_Hook SHALL handle `transcription:user` events to display user speech
2. THE Frontend_Hook SHALL handle `transcription:assistant` events to display AI responses
3. THE Frontend_Hook SHALL handle `audio:chunk` events to play AI-generated audio
4. THE Frontend_Hook SHALL handle `interruption` events to stop audio playback on barge-in
5. THE Frontend_Hook SHALL send `audio:chunk` events with user microphone audio
6. THE Frontend_Hook SHALL maintain the existing connection state machine (DISCONNECTED, CONNECTING, INITIALIZING, READY)

### Requirement 10: Configuration Management

**User Story:** As a system administrator, I want to configure ElevenLabs API credentials and settings, so that the system can authenticate with ElevenLabs.

#### Acceptance Criteria

1. THE Configuration SHALL include `ELEVENLABS_API_KEY` environment variable for API authentication
2. THE Configuration SHALL include `ELEVENLABS_AGENT_ID` environment variable for default agent
3. THE Configuration SHALL support multiple agent IDs for different questionnaire types
4. THE Configuration SHALL include `ELEVENLABS_VOICE_ID` environment variable for default voice
5. THE Configuration SHALL support signed URL authentication as an alternative to API key
6. THE Configuration SHALL validate required settings at startup and fail fast with clear error messages

### Requirement 11: Monitoring and Logging

**User Story:** As a DevOps engineer, I want to monitor ElevenLabs integration health, so that I can detect and resolve issues quickly.

#### Acceptance Criteria

1. THE Monitoring SHALL emit CloudWatch metrics for ElevenLabs connection count
2. THE Monitoring SHALL emit CloudWatch metrics for ElevenLabs API latency
3. THE Monitoring SHALL emit CloudWatch metrics for tool execution latency
4. THE Monitoring SHALL emit CloudWatch metrics for error rate by error code
5. THE Logging SHALL include structured logs for all ElevenLabs events (connection, audio, transcription, tool calls)
6. THE Logging SHALL include sessionId in all log entries for traceability

### Requirement 12: Backward Compatibility

**User Story:** As a product owner, I want the migration to maintain existing functionality, so that users have the same survey experience.

#### Acceptance Criteria

1. THE Migration SHALL preserve all existing WebSocket event types (session:start, session:end, audio:chunk, etc.)
2. THE Migration SHALL preserve the existing questionnaire logic (display logic, skip logic, dynamic text)
3. THE Migration SHALL preserve the existing tool definitions and execution flow
4. THE Migration SHALL preserve the existing session state structure
5. THE Migration SHALL preserve the existing error codes and error handling behavior
6. THE Migration SHALL support gradual rollout with feature flag to switch between Bedrock and ElevenLabs

### Requirement 13: Code Cleanup

**User Story:** As a developer, I want to remove unused Bedrock-related code after migration, so that the codebase is clean and maintainable.

#### Acceptance Criteria

1. WHEN the migration is complete, THE Cleanup SHALL remove the `voiceter-backend/src/bedrock/client.ts` file
2. WHEN the migration is complete, THE Cleanup SHALL remove the `voiceter-backend/src/bedrock/nova-sonic-streaming.ts` file
3. WHEN the migration is complete, THE Cleanup SHALL remove the `voiceter-backend/src/bedrock/nova-sonic-client.ts` file
4. WHEN the migration is complete, THE Cleanup SHALL remove the `voiceter-backend/src/bedrock/audio-streaming.ts` file
5. WHEN the migration is complete, THE Cleanup SHALL remove the `voiceter-backend/src/bedrock/converse-streaming.ts` file
6. WHEN the migration is complete, THE Cleanup SHALL remove the `voiceter-backend/src/bedrock/presigned-url.ts` file
7. WHEN the migration is complete, THE Cleanup SHALL remove AWS Bedrock SDK dependencies from `package.json`
8. WHEN the migration is complete, THE Cleanup SHALL remove Bedrock-related environment variables from configuration
9. WHEN the migration is complete, THE Cleanup SHALL update the `voiceter-backend/src/bedrock/index.ts` to export only ElevenLabs-related modules
10. WHEN the migration is complete, THE Cleanup SHALL remove Bedrock-related unit tests from `voiceter-backend/tests/unit/bedrock/`
11. WHEN the migration is complete, THE Cleanup SHALL update frontend services to remove `SocketIOBedrockService.ts` references
12. WHEN the migration is complete, THE Cleanup SHALL remove the `voiceter-frontend/src/services/bedrock/` directory
13. THE Cleanup SHALL preserve the `voiceter-backend/src/bedrock/guardrails.ts` file if guardrails functionality is still needed
14. THE Cleanup SHALL preserve the `voiceter-backend/src/bedrock/prompt-management.ts` file if prompt management functionality is still needed
15. THE Cleanup SHALL update steering files (`.kiro/steering/tech.md`, `.kiro/steering/product.md`) to reflect ElevenLabs architecture
