# Requirements Document

## Introduction

This document specifies the requirements for building a backend application that integrates with the Voiceter AI frontend application to enable Voice Agent Survey Demo functionality. The system will leverage AWS Nova 2 Sonic speech-to-speech model via Amazon Bedrock's bidirectional streaming API to conduct real-time voice surveys across four demo questionnaires: Customer Experience CSAT/NPS, Concept Testing, Political Polling, and Brand Tracking.

The backend will serve as the bridge between the React-based frontend (hosted on S3/CloudFront) and AWS services (Bedrock, DynamoDB, S3), managing WebSocket connections, audio streaming, questionnaire logic, session state, and data persistence.

## Glossary

- **System**: The Voiceter Backend Integration Application
- **Frontend**: The React-based web application that users interact with
- **Bedrock**: Amazon Bedrock service providing access to Nova 2 Sonic model
- **Nova Sonic**: Amazon's Nova 2 Sonic speech-to-speech AI model (model ID: amazon.nova-2-sonic-v1:0)
- **WebSocket**: Bidirectional communication protocol for real-time data exchange
- **Session**: A single demo survey interaction from start to completion
- **Questionnaire**: A structured set of survey questions with logic and configuration
- **Audio Chunk**: A small segment of audio data (~32ms) for streaming
- **PCM**: Pulse Code Modulation, uncompressed audio format
- **NPS**: Net Promoter Score, a customer loyalty metric (0-10 scale)
- **CSAT**: Customer Satisfaction Score (typically 1-5 scale)
- **ASR**: Automatic Speech Recognition, converting speech to text
- **Barge-in**: User interrupting AI while it's speaking
- **Tool Use**: Function calling capability where AI invokes backend functions
- **Quota**: Target distribution for demographic segments in surveys
- **DynamoDB**: AWS NoSQL database service for session and response storage
- **S3**: AWS Simple Storage Service for audio recording storage
- **ECS Fargate**: AWS serverless container hosting service
- **HTTP/2**: Network protocol supporting bidirectional streaming

## Requirements

### Requirement 1

**User Story:** As a system architect, I want a scalable three-tier backend architecture so that the system can handle multiple concurrent demo sessions reliably and integrate seamlessly with the existing frontend and AWS services.

#### Acceptance Criteria

1. THE System SHALL implement a three-tier architecture consisting of WebSocket server layer, business logic layer, and AWS services integration layer
2. WHEN the backend is deployed THEN the System SHALL accept WebSocket connections from the frontend on a designated endpoint
3. WHEN the backend connects to AWS services THEN the System SHALL use appropriate IAM roles and permissions for Bedrock, DynamoDB, and S3 access
4. WHEN multiple users access demos simultaneously THEN the System SHALL support at least 50 concurrent sessions with isolated state
5. THE System SHALL use model ID amazon.nova-2-sonic-v1:0 for all Bedrock streaming API invocations

### Requirement 2

**User Story:** As a backend developer, I want a WebSocket server implementation so that real-time bidirectional audio streaming can occur between the frontend and Bedrock with low latency.

#### Acceptance Criteria

1. THE System SHALL implement a WebSocket server using Socket.IO or native WebSocket protocol
2. WHEN a frontend client connects THEN the System SHALL establish a WebSocket connection within 2 seconds
3. WHEN a WebSocket connection is established THEN the System SHALL assign a unique session ID to the connection
4. THE System SHALL implement heartbeat/ping-pong mechanisms to maintain connection health
5. WHEN a WebSocket connection drops unexpectedly THEN the System SHALL preserve session state for 60 seconds to allow reconnection
6. THE System SHALL handle connection lifecycle events including open, close, error, and reconnect

### Requirement 3

**User Story:** As a developer, I want structured WebSocket event schemas so that frontend-backend communication is reliable, maintainable, and type-safe.

#### Acceptance Criteria

1. THE System SHALL use structured JSON events for all WebSocket messages with event type, sessionId, timestamp, and data fields
2. THE System SHALL support client-to-server events including session:start, session:end, audio:chunk, config:update, and questionnaire:select
3. THE System SHALL support server-to-client events including session:ready, transcription:user, transcription:assistant, audio:chunk, question:advance, session:complete, and error
4. WHEN an invalid message is received THEN the System SHALL log the error and reject the message with an appropriate error response
5. THE System SHALL validate all incoming WebSocket messages against the defined schema

### Requirement 4

**User Story:** As a backend engineer, I want HTTP/2 client configuration for Bedrock so that bidirectional streaming works correctly with the Nova Sonic model.

#### Acceptance Criteria

1. THE System SHALL use HTTP/2 client when connecting to Bedrock bidirectional streaming API
2. WHEN initializing the Bedrock client THEN the System SHALL configure HTTP/2 with ALPN protocol negotiation
3. THE System SHALL configure the HTTP/2 client with request timeout of 300 seconds and max concurrent streams of 20
4. THE System SHALL reuse HTTP/2 connections for multiple sessions to optimize performance
5. WHEN HTTP/2 connection fails THEN the System SHALL log the error and attempt reconnection with exponential backoff

### Requirement 5

**User Story:** As a developer, I want to initialize Bedrock streaming sessions so that voice conversations can begin when users start demos.

#### Acceptance Criteria

1. WHEN a demo session starts THEN the System SHALL invoke InvokeModelWithBidirectionalStream API with model ID amazon.nova-2-sonic-v1:0
2. THE System SHALL send sessionStart event with inference configuration including maxTokens, topP, and temperature
3. THE System SHALL send promptStart event with audio output configuration specifying 16kHz sample rate, 16-bit PCM, mono channel, and selected voice ID
4. THE System SHALL send system prompt as contentStart, textInput, and contentEnd events to initialize the AI agent with questionnaire context
5. WHEN Bedrock session initialization completes THEN the System SHALL notify the frontend with session:ready event within 3 seconds
6. THE System SHALL generate unique promptName and contentName UUIDs for each streaming session

### Requirement 6

**User Story:** As a developer, I want to stream user audio to Nova Sonic so that the AI can understand and respond to user speech in real-time.

#### Acceptance Criteria

1. WHEN audio chunks arrive from the frontend via WebSocket THEN the System SHALL forward them to Nova Sonic as audioInput events
2. THE System SHALL send contentStart event once at the first audio chunk for each user turn
3. THE System SHALL base64-encode PCM audio data before sending to Nova Sonic
4. THE System SHALL maintain audio format consistency with 16kHz sample rate, 16-bit depth, and mono channel
5. THE System SHALL stream audio chunks continuously without buffering delays to maintain low latency
6. THE System SHALL use the same contentName UUID for all audio chunks within a single user turn

### Requirement 7

**User Story:** As a developer, I want to process Nova Sonic output events so that the UI can display transcriptions, play audio, and reflect conversation state accurately.

#### Acceptance Criteria

1. WHEN Nova Sonic returns textOutput events with USER role and FINAL type THEN the System SHALL forward ASR transcriptions to the frontend as transcription:user events
2. WHEN Nova Sonic returns audioOutput events THEN the System SHALL forward base64-encoded audio chunks to the frontend as audio:chunk events
3. WHEN Nova Sonic returns textOutput events with ASSISTANT role and FINAL type THEN the System SHALL forward AI transcriptions to the frontend as transcription:assistant events
4. WHEN Nova Sonic returns textOutput containing interrupted:true THEN the System SHALL detect barge-in and notify the frontend to clear audio queue
5. WHEN Nova Sonic returns toolUse events THEN the System SHALL execute the corresponding backend function and return toolResult events
6. WHEN Nova Sonic returns completionEnd events THEN the System SHALL mark the turn as complete and prepare for the next interaction

### Requirement 8

**User Story:** As a user, I want to select from different AI voices so that demos feel personalized and appropriate for the survey context.

#### Acceptance Criteria

1. THE System SHALL support voice selection for English voices including matthew, tiffany, and amy
2. THE System SHALL support voice selection for Spanish voices including lupe and carlos
3. THE System SHALL support voice selection for French voices including ambre and florian
4. THE System SHALL support voice selection for German voices including greta and lennart
5. THE System SHALL support voice selection for Italian voices including beatrice and lorenzo
6. WHEN a user selects a voice THEN the System SHALL configure the audioOutputConfiguration with the selected voiceId in the promptStart event
7. THE System SHALL persist voice selection in session state throughout the demo

### Requirement 9

**User Story:** As a developer, I want tool calling functionality so that the AI can execute questionnaire logic such as recording responses, advancing questions, and validating answers.

#### Acceptance Criteria

1. THE System SHALL define tools in promptStart.toolConfiguration including record_response, get_next_question, validate_answer, and get_demo_context
2. WHEN Nova Sonic invokes a tool THEN the System SHALL receive the toolUse event with tool name and parameters
3. WHEN record_response tool is invoked THEN the System SHALL save the response to DynamoDB with sessionId, questionId, response value, and timestamp
4. WHEN get_next_question tool is invoked THEN the System SHALL retrieve the next question based on questionnaire logic and return it as toolResult
5. WHEN validate_answer tool is invoked THEN the System SHALL check answer format and range constraints and return validation result
6. THE System SHALL complete tool execution within 500ms and return results to Nova Sonic
7. WHEN tool execution fails THEN the System SHALL return an error toolResult with descriptive message

### Requirement 10

**User Story:** As a developer, I want proper Bedrock session cleanup so that resources don't leak and costs are controlled when demos end.

#### Acceptance Criteria

1. WHEN a demo session ends THEN the System SHALL send contentEnd event for any open audio stream
2. THE System SHALL send promptEnd event with the original promptName UUID
3. THE System SHALL send sessionEnd event to properly close the Bedrock streaming connection
4. THE System SHALL wait for completionEnd response before closing the connection
5. THE System SHALL clean up session state from memory or cache after session ends
6. WHEN cleanup errors occur THEN the System SHALL log the error and ensure partial cleanup completes
7. THE System SHALL complete cleanup sequence within 3 seconds

### Requirement 11

**User Story:** As a backend engineer, I want session state management so that sessions survive server restarts and support load balancing across multiple instances.

#### Acceptance Criteria

1. THE System SHALL maintain session state including sessionId, user metadata, current questionnaire ID, question progress, conversation history, Nova Sonic stream identifiers, and audio configuration
2. WHEN running as a single instance THEN the System SHALL store session state in memory
3. WHEN running as multiple instances THEN the System SHALL store session state in Redis or ElastiCache
4. THE System SHALL access session state within 50ms for real-time operations
5. THE System SHALL clean up stale sessions after 30 minutes of inactivity
6. WHEN a server restarts THEN the System SHALL allow session resumption using the same sessionId if state is preserved

### Requirement 12

**User Story:** As a developer, I want to load and manage questionnaires so that the AI can conduct structured surveys with proper logic and validation.

#### Acceptance Criteria

1. THE System SHALL load questionnaire JSON files including demo1_csat_nps.json, demo2_concept_test.json, demo3_political_polling.json, and demo4_brand_tracker.json at startup
2. WHEN a user selects a questionnaire THEN the System SHALL retrieve the questionnaire definition and initialize session state with question sequence
3. THE System SHALL support question types including voice_prompt, single_choice, multiple_choice, rating_scale, nps, yes_no, and open_ended
4. THE System SHALL evaluate display logic conditions to determine which questions to show based on prior answers
5. THE System SHALL evaluate skip logic rules to jump to different questions based on conditions
6. THE System SHALL apply dynamic question text based on prior responses such as NPS follow-up questions
7. THE System SHALL filter dynamic options based on prior selections such as brand consideration based on awareness

### Requirement 13

**User Story:** As a developer, I want sentiment detection on open-ended responses so that emotional tone can be captured and analyzed for research insights.

#### Acceptance Criteria

1. WHEN an open-ended question has sentimentDetectionEnabled set to true THEN the System SHALL analyze the user's spoken response for sentiment
2. THE System SHALL classify sentiment as positive, negative, or neutral based on tone and word choice
3. THE System SHALL store sentiment classification with the response in DynamoDB
4. WHEN sentiment detection fails THEN the System SHALL log the error and store the response without sentiment data
5. THE System SHALL complete sentiment analysis within 200ms to avoid delaying the conversation flow

### Requirement 14

**User Story:** As a developer, I want quota management for political polling so that demographic targets are enforced and quotas are tracked in real-time.

#### Acceptance Criteria

1. THE System SHALL track quota fields including age_group and political_affiliation as defined in demo3_political_polling.json
2. WHEN a screening question is answered THEN the System SHALL check if the quota for that demographic segment is filled
3. WHEN a quota is filled THEN the System SHALL politely terminate the session with the configured termination message
4. THE System SHALL maintain quota counts in DynamoDB or Redis for real-time tracking across multiple sessions
5. THE System SHALL allow quota targets to be configured per questionnaire with percentage distributions
6. WHEN quota enforcement is disabled THEN the System SHALL continue sessions regardless of demographic distribution

### Requirement 15

**User Story:** As a backend engineer, I want to store session data in DynamoDB so that responses, transcripts, and metadata are persisted for analysis and reporting.

#### Acceptance Criteria

1. THE System SHALL create a demo-sessions DynamoDB table with sessionId as partition key and attributes for questionnaireId, startTime, endTime, voiceId, and completionStatus
2. THE System SHALL create a demo-responses DynamoDB table with sessionId as partition key and questionId as sort key with attributes for response value, responseType, sentiment, and timestamp
3. THE System SHALL create a demo-transcripts DynamoDB table with sessionId as partition key and timestamp as sort key with attributes for role, content, and turnNumber
4. WHEN a session starts THEN the System SHALL insert a record into demo-sessions table
5. WHEN a response is recorded THEN the System SHALL insert a record into demo-responses table
6. WHEN a transcription is generated THEN the System SHALL insert a record into demo-transcripts table
7. THE System SHALL complete database writes within 100ms to avoid blocking the conversation flow

### Requirement 16

**User Story:** As a developer, I want to store audio recordings in S3 so that survey conversations can be reviewed for quality assurance and training purposes.

#### Acceptance Criteria

1. THE System SHALL create an S3 bucket named voiceter-demo-recordings for storing audio files
2. WHEN a session completes THEN the System SHALL upload the full audio recording to S3 with key format sessionId/timestamp.wav
3. THE System SHALL store both user audio and AI audio as separate files or combined stereo recording
4. THE System SHALL configure S3 lifecycle policy to delete recordings after 90 days
5. THE System SHALL enable S3 versioning for the recordings bucket
6. WHEN S3 upload fails THEN the System SHALL log the error and retry up to 3 times with exponential backoff

### Requirement 17

**User Story:** As a DevOps engineer, I want graceful shutdown handling so that user sessions aren't abruptly terminated during deployments or server restarts.

#### Acceptance Criteria

1. WHEN the server receives SIGTERM signal THEN the System SHALL stop accepting new WebSocket connections
2. THE System SHALL complete in-progress streaming sessions before shutting down
3. THE System SHALL send sessionEnd events to Nova Sonic for all active sessions
4. THE System SHALL close WebSocket connections with proper close frames
5. THE System SHALL wait up to 30 seconds for graceful completion before force-closing remaining connections
6. THE System SHALL persist session data to DynamoDB before shutdown
7. WHEN health check is called during shutdown THEN the System SHALL return unhealthy status immediately

### Requirement 18

**User Story:** As a security engineer, I want WebSocket authentication so that only authorized users can access the demo system.

#### Acceptance Criteria

1. WHEN a WebSocket connection is initiated THEN the System SHALL validate the session ID from cookie or header
2. THE System SHALL validate origin and referrer headers to prevent unauthorized access
3. WHEN authentication is enabled THEN the System SHALL validate JWT tokens from AWS Cognito
4. WHEN authentication fails THEN the System SHALL reject the connection with 401 or 403 status code
5. WHEN authentication succeeds THEN the System SHALL assign a unique session ID and track the session
6. THE System SHALL support optional authentication mode for demo environments without Cognito

### Requirement 19

**User Story:** As a developer, I want comprehensive error handling so that failures are logged, reported to users gracefully, and don't crash the server.

#### Acceptance Criteria

1. WHEN Bedrock API errors occur THEN the System SHALL log the error with context and notify the frontend with an error event
2. WHEN WebSocket errors occur THEN the System SHALL log the error and attempt to maintain or restore the connection
3. WHEN DynamoDB write errors occur THEN the System SHALL log the error and retry up to 3 times
4. WHEN audio processing errors occur THEN the System SHALL log the error and continue the session if possible
5. WHEN unhandled exceptions occur THEN the System SHALL log the error, send error event to frontend, and gracefully close the session
6. THE System SHALL include error codes, messages, and stack traces in logs for debugging
7. THE System SHALL send user-friendly error messages to the frontend without exposing internal details

### Requirement 20

**User Story:** As a DevOps engineer, I want the backend deployed to AWS ECS Fargate so that it runs in a scalable, serverless container environment.

#### Acceptance Criteria

1. THE System SHALL be packaged as a Docker container with all dependencies included
2. THE System SHALL be deployed to AWS ECS Fargate with at least 2 tasks for high availability
3. THE System SHALL be fronted by an Application Load Balancer with WebSocket support and SSL termination
4. THE System SHALL implement health check endpoint at /health that returns 200 when healthy
5. THE System SHALL configure auto-scaling policies to scale based on CPU and memory utilization
6. THE System SHALL be deployable in us-east-1, us-west-2, ap-northeast-1, or eu-north-1 regions where Nova 2 Sonic is available
7. THE System SHALL use AWS CDK or CloudFormation for infrastructure as code deployment

### Requirement 21

**User Story:** As a developer, I want logging and monitoring so that system health, performance, and errors can be tracked and debugged effectively.

#### Acceptance Criteria

1. THE System SHALL log all events to AWS CloudWatch Logs with structured JSON format
2. THE System SHALL log session lifecycle events including start, end, errors, and completion status
3. THE System SHALL log Bedrock API calls including request/response times and token usage
4. THE System SHALL log WebSocket connection events including connects, disconnects, and errors
5. THE System SHALL emit CloudWatch metrics for concurrent sessions, latency, error rates, and throughput
6. THE System SHALL configure CloudWatch alarms for high error rates, high latency, and low health check success
7. THE System SHALL support configurable log levels including DEBUG, INFO, WARN, and ERROR

### Requirement 22

**User Story:** As a developer, I want barge-in support so that users can interrupt the AI naturally during conversations.

#### Acceptance Criteria

1. WHEN the AI is generating speech and user audio is detected THEN the System SHALL send new audio chunks to Nova Sonic
2. WHEN Nova Sonic detects barge-in THEN the System SHALL receive textOutput with interrupted:true flag
3. WHEN barge-in is detected THEN the System SHALL notify the frontend to stop audio playback immediately
4. THE System SHALL clear the audio output queue on the frontend to prevent residual audio
5. THE System SHALL transition smoothly from AI speech to user speech within 200ms
6. THE System SHALL maintain conversation context after barge-in without losing state

### Requirement 23

**User Story:** As a developer, I want connection interruption handling so that temporary network issues don't ruin the demo experience.

#### Acceptance Criteria

1. WHEN a WebSocket connection drops unexpectedly THEN the System SHALL detect disconnection within 2 seconds
2. THE System SHALL preserve session state for 60 seconds to allow reconnection
3. WHEN the frontend reconnects with the same sessionId THEN the System SHALL restore the session state
4. THE System SHALL clean up Bedrock streaming connection when WebSocket disconnects
5. WHEN reconnection succeeds THEN the System SHALL re-establish Bedrock streaming and resume the conversation
6. WHEN reconnection fails after 60 seconds THEN the System SHALL clean up session state and mark session as incomplete

### Requirement 24

**User Story:** As a developer, I want configuration management so that environment-specific settings can be managed without code changes.

#### Acceptance Criteria

1. THE System SHALL load configuration from environment variables including AWS_REGION, BEDROCK_MODEL_ID, DYNAMODB_TABLE_PREFIX, S3_BUCKET_NAME, and PORT
2. THE System SHALL support configuration files for questionnaire paths and tool definitions
3. THE System SHALL validate required configuration at startup and fail fast with clear error messages if missing
4. THE System SHALL support different configurations for development, staging, and production environments
5. THE System SHALL allow configuration overrides via environment variables for deployment flexibility
6. THE System SHALL log configuration values at startup excluding sensitive credentials

### Requirement 25

**User Story:** As a developer, I want API documentation so that frontend developers can integrate with the backend effectively.

#### Acceptance Criteria

1. THE System SHALL provide OpenAPI/Swagger documentation for REST endpoints if any
2. THE System SHALL document WebSocket event schemas with examples for all client-to-server and server-to-client events
3. THE System SHALL document session lifecycle including initialization, audio streaming, question progression, and termination
4. THE System SHALL document error codes and messages for troubleshooting
5. THE System SHALL provide example code snippets for common integration patterns
6. THE System SHALL maintain documentation in sync with implementation changes

### Requirement 26

**User Story:** As a project manager, I want the existing frontend application integrated into the project so that the complete system can be developed and deployed together.

#### Acceptance Criteria

1. THE System SHALL copy or move the existing Next.js frontend application from docs/voiceter_ai_landing_page to the project root or designated frontend directory
2. THE System SHALL preserve all existing frontend functionality including landing page, full demo experience page, and waitlist API
3. THE System SHALL maintain all existing dependencies including Next.js 14, React 18, Tailwind CSS, and Supabase
4. THE System SHALL preserve all existing configuration files including tsconfig.json, tailwind.config.js, next.config.mjs, and ESLint configuration
5. THE System SHALL update any hardcoded URLs or configuration to support both development and production environments
6. THE System SHALL ensure the frontend can be run independently with npm run dev on port 4028

### Requirement 27

**User Story:** As a frontend developer, I want WebSocket client functionality in the frontend application so that users can participate in voice survey demos with real-time audio streaming.

#### Acceptance Criteria

1. THE System SHALL install Socket.IO client library (socket.io-client) as a dependency in the frontend application
2. THE System SHALL create a WebSocket service module that manages connection lifecycle, event handling, and error recovery
3. THE System SHALL implement connection management including connect, disconnect, reconnect with exponential backoff, and connection state tracking
4. THE System SHALL support configurable backend URL for development (ws://localhost:8080) and production (wss://backend-url) environments
5. WHEN a user starts a demo THEN the System SHALL establish WebSocket connection and emit session:start event with questionnaireId and voiceId
6. THE System SHALL listen for session:ready event and initialize the demo UI with first question and questionnaire metadata
7. THE System SHALL capture audio from user's microphone with 16kHz sample rate, 16-bit depth, mono channel, and echo cancellation enabled

### Requirement 28

**User Story:** As a frontend developer, I want audio streaming functionality so that user speech can be sent to the backend and AI responses can be played back in real-time.

#### Acceptance Criteria

1. THE System SHALL implement audio capture using Web Audio API with AudioWorklet for efficient processing
2. THE System SHALL convert captured PCM audio to base64 encoding before sending via WebSocket
3. THE System SHALL emit audio:chunk events continuously with base64-encoded audio data and sequence numbers
4. THE System SHALL listen for audio:chunk events from backend containing AI-generated speech
5. THE System SHALL decode base64 audio data and convert to PCM format for playback
6. THE System SHALL implement audio playback queue to handle streaming audio chunks smoothly without gaps or overlaps
7. THE System SHALL support barge-in by stopping audio playback immediately when user starts speaking

### Requirement 29

**User Story:** As a frontend developer, I want transcription display functionality so that users can see what they said and what the AI responded in real-time.

#### Acceptance Criteria

1. THE System SHALL listen for transcription:user events and display user speech transcriptions in the UI
2. THE System SHALL listen for transcription:assistant events and display AI speech transcriptions in the UI
3. THE System SHALL differentiate between interim and final transcriptions using the isFinal flag
4. THE System SHALL display transcriptions in a conversation format with clear visual distinction between user and AI messages
5. THE System SHALL auto-scroll the transcription view to show the latest messages
6. THE System SHALL maintain transcription history throughout the demo session
7. THE System SHALL clear transcriptions when a new demo session starts

### Requirement 30

**User Story:** As a frontend developer, I want question progression UI so that users can track their progress through the survey and see current questions.

#### Acceptance Criteria

1. THE System SHALL listen for question:advance events and update the UI with the new question
2. THE System SHALL display current question text prominently in the UI
3. THE System SHALL display question options if the question type is single_choice, multiple_choice, or rating_scale
4. THE System SHALL display progress indicator showing current question number, total questions, and percentage complete
5. THE System SHALL update progress indicator in real-time as questions advance
6. THE System SHALL display question-specific instructions or agent notes if available
7. THE System SHALL handle dynamic question text by updating the display when questions change based on prior responses

### Requirement 31

**User Story:** As a frontend developer, I want session completion handling so that users receive appropriate feedback when demos end.

#### Acceptance Criteria

1. THE System SHALL listen for session:complete events and display completion screen
2. THE System SHALL display completion status (completed or terminated) with appropriate messaging
3. THE System SHALL display session summary including total questions, answered questions, and duration
4. THE System SHALL stop audio capture and close WebSocket connection when session completes
5. THE System SHALL provide option to start a new demo or return to demo selection
6. WHEN quota is filled THEN the System SHALL display polite termination message from the backend
7. THE System SHALL clean up all audio resources and WebSocket connections on session completion

### Requirement 32

**User Story:** As a frontend developer, I want error handling and recovery so that users receive clear feedback when issues occur and the system can recover gracefully.

#### Acceptance Criteria

1. THE System SHALL listen for error events from backend and display user-friendly error messages
2. THE System SHALL handle WebSocket connection errors and attempt automatic reconnection up to 3 times
3. THE System SHALL display connection status indicator (connected, connecting, disconnected, error)
4. THE System SHALL handle microphone permission denial and display clear instructions to enable microphone
5. THE System SHALL handle audio playback errors and continue the session if possible
6. WHEN connection is lost THEN the System SHALL preserve session state and attempt to reconnect within 60 seconds
7. THE System SHALL provide manual reconnect option if automatic reconnection fails

### Requirement 33

**User Story:** As a frontend developer, I want voice selection UI so that users can choose their preferred AI voice before starting a demo.

#### Acceptance Criteria

1. THE System SHALL display voice selection UI with available voices grouped by language (English, Spanish, French, German, Italian)
2. THE System SHALL provide voice preview functionality allowing users to hear sample audio for each voice
3. THE System SHALL highlight the default voice (matthew for English) in the UI
4. THE System SHALL persist voice selection in browser localStorage for future sessions
5. THE System SHALL send selected voiceId in the session:start event
6. THE System SHALL allow voice selection before demo starts but not during active demo
7. THE System SHALL display voice characteristics (gender, language, tone) for each voice option

### Requirement 34

**User Story:** As a frontend developer, I want demo selection UI integrated into the full demo experience page so that users can choose which survey demo to participate in.

#### Acceptance Criteria

1. THE System SHALL create or update the full demo experience page to display all 4 demo questionnaires
2. THE System SHALL display demo cards with questionnaire name, description, estimated duration, and key features
3. THE System SHALL use demo metadata from questionnaire JSON files (industry, research objective, target audience)
4. THE System SHALL allow users to select a demo by clicking on the demo card
5. WHEN a demo is selected THEN the System SHALL navigate to the demo interface with the selected questionnaireId
6. THE System SHALL display demo selection screen before starting any demo session
7. THE System SHALL allow users to return to demo selection after completing or ending a demo

### Requirement 35

**User Story:** As a frontend developer, I want a reusable demo interface component so that the voice survey experience is consistent and maintainable.

#### Acceptance Criteria

1. THE System SHALL create a VoiceDemoInterface component that encapsulates all demo functionality
2. THE System SHALL implement the component using React hooks for state management (useState, useEffect, useRef)
3. THE System SHALL accept questionnaireId and voiceId as props
4. THE System SHALL manage WebSocket connection, audio capture, audio playback, and transcription display within the component
5. THE System SHALL emit events for demo lifecycle (started, completed, error) to parent components
6. THE System SHALL be responsive and work on desktop, tablet, and mobile devices
7. THE System SHALL follow the existing design system and Tailwind CSS styling conventions
