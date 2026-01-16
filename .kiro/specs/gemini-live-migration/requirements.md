# Requirements Document

## Introduction

This document specifies the requirements for migrating the Voiceter backend from ElevenLabs Conversational AI to Google Gemini Live API for speech-to-speech functionality. The migration replaces the existing voice AI platform while maintaining all current functionality including real-time audio streaming, tool execution, session management, and questionnaire logic.

## Glossary

- **Gemini_Live_API**: Google's native audio understanding and generation API providing low-latency bidirectional streaming via WebSocket
- **Vertex_AI**: Google Cloud's machine learning platform that hosts the Gemini Live API endpoint
- **WebSocket_Client**: The backend component that establishes and maintains WebSocket connections to Gemini Live API
- **Session_Manager**: The component responsible for managing user session state and lifecycle
- **Tool_Executor**: The component that handles function calls from Gemini Live and executes corresponding backend operations
- **VAD**: Voice Activity Detection - automatic detection of speech start and end
- **Barge_In**: User interruption of AI speech, causing immediate audio playback stop
- **Setup_Message**: Initial configuration message sent to Gemini Live to establish session parameters
- **Access_Token**: OAuth2 Bearer token used for authenticating with Vertex AI
- **Audio_Chunk**: Base64-encoded PCM audio data sent between client and server
- **Transcription_Handler**: Component that processes speech-to-text transcriptions from Gemini Live
- **Voice_Config**: Configuration specifying the AI voice to use for audio generation

## Requirements

### Requirement 1: Google Cloud Authentication

**User Story:** As a backend service, I want to authenticate with Google Cloud using service account credentials, so that I can securely access the Gemini Live API.

#### Acceptance Criteria

1. WHEN the WebSocket_Client initializes, THE WebSocket_Client SHALL obtain an OAuth2 Access_Token using google-auth-library
2. WHEN an Access_Token is within 5 minutes of expiration, THE WebSocket_Client SHALL automatically refresh the token before making new connections
3. IF Access_Token retrieval fails, THEN THE WebSocket_Client SHALL log the error with full context and emit an authentication error event
4. THE WebSocket_Client SHALL use IAM role `roles/aiplatform.user` for Vertex AI access
5. WHEN connecting to Vertex AI, THE WebSocket_Client SHALL include the Access_Token in the Authorization header as Bearer token

### Requirement 2: WebSocket Connection Management

**User Story:** As a backend service, I want to establish and maintain WebSocket connections to Gemini Live API, so that I can stream audio bidirectionally with low latency.

#### Acceptance Criteria

1. WHEN a new session starts, THE WebSocket_Client SHALL connect to the Vertex AI endpoint at `wss://{REGION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`
2. WHEN the WebSocket connection opens, THE WebSocket_Client SHALL send a Setup_Message before any audio data
3. WHEN a setupComplete event is received from Gemini Live, THE WebSocket_Client SHALL emit a session ready event with the Gemini session ID
4. IF the WebSocket connection fails, THEN THE WebSocket_Client SHALL attempt reconnection with exponential backoff (1s, 2s, 4s delays)
5. IF reconnection fails after 3 attempts, THEN THE WebSocket_Client SHALL emit a connection failure error and terminate the session
6. WHEN a goAway message is received from Gemini Live, THE WebSocket_Client SHALL gracefully close the connection and attempt reconnection
7. WHILE the WebSocket connection is active, THE WebSocket_Client SHALL maintain connection state and emit state change events

### Requirement 3: Session Configuration

**User Story:** As a backend service, I want to configure Gemini Live sessions with appropriate model settings, voice, and tools, so that the AI can conduct voice surveys correctly.

#### Acceptance Criteria

1. WHEN sending the Setup_Message, THE WebSocket_Client SHALL specify the model as `gemini-live-2.5-flash-preview-native-audio`
2. WHEN sending the Setup_Message, THE WebSocket_Client SHALL set responseModalities to AUDIO
3. WHEN sending the Setup_Message, THE WebSocket_Client SHALL include the system instruction from the questionnaire configuration
4. WHEN sending the Setup_Message, THE WebSocket_Client SHALL include all tool function declarations (record_response, get_next_question, validate_answer, get_demo_context)
5. WHEN sending the Setup_Message, THE WebSocket_Client SHALL enable inputAudioTranscription and outputAudioTranscription
6. WHEN a voice is specified in session config, THE WebSocket_Client SHALL configure the prebuiltVoiceConfig with the mapped Gemini voice name
7. IF no voice is specified, THEN THE WebSocket_Client SHALL use the default voice from configuration (Charon)

### Requirement 4: Audio Streaming

**User Story:** As a backend service, I want to stream audio bidirectionally between the frontend and Gemini Live, so that users can have real-time voice conversations.

#### Acceptance Criteria

1. WHEN receiving an audio chunk from the frontend, THE WebSocket_Client SHALL forward it to Gemini Live as realtimeInput.audio with mimeType `audio/pcm;rate=16000`
2. WHEN receiving audio data from Gemini Live in serverContent.modelTurn.parts[].inlineData, THE WebSocket_Client SHALL forward it to the frontend
3. THE WebSocket_Client SHALL handle audio output at 24kHz sample rate from Gemini Live
4. WHEN streaming audio, THE WebSocket_Client SHALL maintain audio chunk ordering
5. IF audio format is invalid, THEN THE WebSocket_Client SHALL log the error and skip the invalid chunk without terminating the session

### Requirement 5: Voice Activity Detection

**User Story:** As a backend service, I want to use Gemini Live's automatic voice activity detection, so that speech boundaries are detected without manual signaling.

#### Acceptance Criteria

1. WHEN configuring VAD in the Setup_Message, THE WebSocket_Client SHALL enable automaticActivityDetection
2. THE WebSocket_Client SHALL configure startOfSpeechSensitivity to HIGH by default
3. THE WebSocket_Client SHALL configure endOfSpeechSensitivity to LOW by default
4. THE WebSocket_Client SHALL configure silenceDurationMs to 500ms by default
5. WHERE VAD sensitivity is configurable, THE WebSocket_Client SHALL allow override via environment variables

### Requirement 6: Interruption Handling

**User Story:** As a backend service, I want to handle user interruptions (barge-in) correctly, so that users can naturally interrupt the AI during speech.

#### Acceptance Criteria

1. WHEN a serverContent.interrupted event is received from Gemini Live, THE WebSocket_Client SHALL emit an interruption event to the frontend
2. WHEN an interruption occurs, THE WebSocket_Client SHALL clear any pending audio output buffers
3. WHEN configuring the Setup_Message, THE WebSocket_Client SHALL set activityHandling to START_OF_ACTIVITY_INTERRUPTS
4. IF a toolCallCancellation event is received during interruption, THEN THE Tool_Executor SHALL cancel pending tool executions gracefully

### Requirement 7: Tool Execution

**User Story:** As a backend service, I want to execute tools when requested by Gemini Live, so that the AI can record responses, get next questions, and validate answers.

#### Acceptance Criteria

1. WHEN a toolCall event is received with functionCalls array, THE Tool_Executor SHALL extract and execute each function call
2. WHEN executing a tool, THE Tool_Executor SHALL use the function name and args from the toolCall event
3. WHEN a tool execution completes, THE Tool_Executor SHALL send a toolResponse event with functionResponses array containing the call ID and result
4. IF tool execution exceeds 5 seconds, THEN THE Tool_Executor SHALL timeout and return an error response
5. IF tool execution fails, THEN THE Tool_Executor SHALL return an error response with success: false and error message
6. THE Tool_Executor SHALL support these tools: record_response, get_next_question, validate_answer, get_demo_context
7. WHEN formatting tool declarations for Gemini Live, THE Tool_Executor SHALL use the functionDeclarations format with name, description, and parameters schema

### Requirement 8: Transcription Handling

**User Story:** As a backend service, I want to receive and forward transcriptions from Gemini Live, so that the frontend can display what the user and AI said.

#### Acceptance Criteria

1. WHEN a serverContent.inputTranscription event is received, THE Transcription_Handler SHALL emit a user transcription event to the frontend
2. WHEN a serverContent.outputTranscription event is received, THE Transcription_Handler SHALL emit an assistant transcription event to the frontend
3. WHEN emitting transcription events, THE Transcription_Handler SHALL include the session ID and timestamp
4. THE Transcription_Handler SHALL store transcriptions in the session conversation history

### Requirement 9: Voice Configuration

**User Story:** As a backend service, I want to map legacy voice names to Gemini Live voices, so that existing voice preferences continue to work.

#### Acceptance Criteria

1. THE Voice_Config SHALL map legacy voice name "matthew" to Gemini voice "Charon"
2. THE Voice_Config SHALL map legacy voice name "tiffany" to Gemini voice "Aoede"
3. THE Voice_Config SHALL map legacy voice name "amy" to Gemini voice "Kore"
4. WHEN an unknown voice name is provided, THE Voice_Config SHALL fall back to the default voice (Charon)
5. THE Voice_Config SHALL support all Gemini Live voices: Aoede, Charon, Fenrir, Kore, Puck, Orbit

### Requirement 10: Session State Management

**User Story:** As a backend service, I want to track Gemini Live session state, so that I can manage session lifecycle correctly.

#### Acceptance Criteria

1. WHEN a session starts, THE Session_Manager SHALL create a session record with status "connecting"
2. WHEN setupComplete is received, THE Session_Manager SHALL update session status to "active" and store the Gemini session ID
3. WHEN a session ends normally, THE Session_Manager SHALL update session status to "completed"
4. WHEN a session terminates due to error, THE Session_Manager SHALL update session status to "error"
5. WHEN a session is terminated by user, THE Session_Manager SHALL update session status to "terminated"
6. THE Session_Manager SHALL track lastActivityTime and update it on each audio chunk or event
7. WHILE a session is inactive for 30 minutes, THE Session_Manager SHALL terminate the session and clean up resources

### Requirement 11: Error Handling

**User Story:** As a backend service, I want to handle errors gracefully and provide meaningful error information, so that issues can be diagnosed and sessions can recover when possible.

#### Acceptance Criteria

1. WHEN a connection error occurs, THE WebSocket_Client SHALL emit error event with code GEMINI_CONNECTION_FAILED
2. WHEN an authentication error occurs, THE WebSocket_Client SHALL emit error event with code GEMINI_AUTH_FAILED
3. WHEN a rate limit error occurs, THE WebSocket_Client SHALL emit error event with code GEMINI_RATE_LIMITED
4. WHEN a streaming error occurs, THE WebSocket_Client SHALL emit error event with code GEMINI_STREAM_ERROR
5. WHEN a tool timeout occurs, THE Tool_Executor SHALL emit error event with code GEMINI_TOOL_TIMEOUT
6. WHEN emitting error events, THE WebSocket_Client SHALL include sessionId, timestamp, errorCode, errorMessage, and recoverable flag
7. IF an error is recoverable, THEN THE WebSocket_Client SHALL attempt automatic recovery
8. THE WebSocket_Client SHALL log all errors with full context including sessionId, error details, and stack trace

### Requirement 12: Configuration Management

**User Story:** As a system administrator, I want to configure Gemini Live settings via environment variables, so that I can deploy and manage the service easily.

#### Acceptance Criteria

1. THE Configuration SHALL read GOOGLE_CLOUD_PROJECT for the GCP project ID
2. THE Configuration SHALL read GOOGLE_CLOUD_REGION for the Vertex AI region
3. THE Configuration SHALL read GEMINI_MODEL for the model name with default "gemini-live-2.5-flash-preview-native-audio"
4. THE Configuration SHALL read GEMINI_DEFAULT_VOICE for the default voice with default "Charon"
5. THE Configuration SHALL read GEMINI_RECONNECT_MAX_RETRIES with default 3
6. THE Configuration SHALL read GEMINI_RECONNECT_BASE_DELAY_MS with default 1000
7. THE Configuration SHALL read GEMINI_TOOL_TIMEOUT_MS with default 5000
8. THE Configuration SHALL read USE_GEMINI_LIVE feature flag to enable/disable Gemini Live
9. IF required configuration is missing, THEN THE Configuration SHALL fail startup with a clear error message

### Requirement 13: ElevenLabs Code Removal

**User Story:** As a developer, I want all ElevenLabs code removed from the codebase, so that the codebase is clean and maintainable.

#### Acceptance Criteria

1. THE Migration SHALL delete the entire voiceter-backend/src/elevenlabs/ directory
2. THE Migration SHALL remove all imports referencing elevenlabs modules from other files
3. THE Migration SHALL remove all ELEVENLABS_* environment variables from .env.example
4. THE Migration SHALL update voiceter-backend/src/websocket/handler.ts to use gemini-live imports
5. THE Migration SHALL update voiceter-backend/src/tools/executor.ts to use Gemini format converters
6. THE Migration SHALL update voiceter-backend/src/session/types.ts to use GeminiSessionFields
7. THE Migration SHALL delete voiceter-backend/tests/unit/elevenlabs/ test directory

### Requirement 14: Backward Compatibility

**User Story:** As a frontend developer, I want the Socket.IO event interface to remain unchanged, so that the frontend does not require modifications.

#### Acceptance Criteria

1. THE WebSocket_Handler SHALL continue to emit session:ready events in the same format
2. THE WebSocket_Handler SHALL continue to emit transcription:user events in the same format
3. THE WebSocket_Handler SHALL continue to emit transcription:assistant events in the same format
4. THE WebSocket_Handler SHALL continue to emit audio:chunk events in the same format
5. THE WebSocket_Handler SHALL continue to emit question:advance events in the same format
6. THE WebSocket_Handler SHALL continue to emit session:complete events in the same format
7. THE WebSocket_Handler SHALL continue to emit interruption events in the same format
8. THE WebSocket_Handler SHALL continue to emit error events in the same format
9. THE WebSocket_Handler SHALL continue to accept session:start events in the same format
10. THE WebSocket_Handler SHALL continue to accept audio:chunk events in the same format
