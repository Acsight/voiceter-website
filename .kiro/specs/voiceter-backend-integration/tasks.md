# Implementation Plan

- [x] 1. Set up project structure and core infrastructure






- [x] 1.1 Initialize Node.js TypeScript project with package.json, tsconfig.json, and folder structure

  - Create src/ directory with subdirectories: server/, websocket/, bedrock/, questionnaire/, session/, data/, audio/, tools/, utils/
  - Configure TypeScript with strict mode and ES2020 target
  - Set up ESLint and Prettier for code quality
  - _Requirements: 1.1, 2.1_

- [x] 1.2 Install and configure core dependencies


  - Install Express, Socket.IO, AWS SDK packages (@aws-sdk/client-bedrock-runtime, @aws-sdk/client-dynamodb, @aws-sdk/client-s3)
  - Install development dependencies (Jest, ts-jest, @types packages)
  - Install fast-check for property-based testing
  - Configure Jest for TypeScript
  - _Requirements: 2.1, 4.1_

- [x] 1.3 Create configuration management system


  - Implement config loader that reads from environment variables
  - Define configuration schema with validation
  - Support for AWS_REGION, BEDROCK_MODEL_ID, DYNAMODB_TABLE_PREFIX, S3_BUCKET_NAME, PORT, LOG_LEVEL
  - Fail fast with clear error messages if required config missing
  - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6_

- [x] 1.4 Set up structured logging system


  - Implement logger utility with Winston or Pino
  - Support log levels: DEBUG, INFO, WARN, ERROR
  - Structured JSON logging format with timestamp, level, sessionId, event, data
  - CloudWatch Logs integration
  - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 2. Implement WebSocket server and communication layer





- [x] 2.1 Create WebSocket server with Socket.IO


  - Initialize Express HTTP server
  - Configure Socket.IO with CORS settings
  - Implement connection handler that assigns unique session IDs
  - Implement disconnection handler
  - Implement heartbeat/ping-pong mechanism
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2.2 Define WebSocket event schemas and validation


  - Create TypeScript interfaces for all client-to-server events (session:start, session:end, audio:chunk, config:update, questionnaire:select)
  - Create TypeScript interfaces for all server-to-client events (session:ready, transcription:user, transcription:assistant, audio:chunk, question:advance, session:complete, error)
  - Implement JSON schema validation for incoming messages
  - Implement error response for invalid messages
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 2.3 Write property test for WebSocket message schema conformance
  - **Property 2: WebSocket Message Schema Conformance**
  - **Validates: Requirements 3.1**

- [ ]* 2.4 Write property test for session ID uniqueness
  - **Property 1: Session ID Uniqueness**
  - **Validates: Requirements 2.3**

- [ ]* 2.5 Write property test for invalid message rejection
  - **Property 3: Invalid Message Rejection**
  - **Validates: Requirements 3.4, 3.5**

- [x] 2.6 Implement connection interruption handling


  - Detect disconnections within 2 seconds
  - Preserve session state for 60 seconds after disconnection
  - Allow session resumption with same sessionId
  - Clean up Bedrock connection on disconnect
  - _Requirements: 2.5, 23.1, 23.2, 23.3, 23.4_

- [ ]* 2.7 Write unit tests for WebSocket connection lifecycle
  - Test connection establishment
  - Test disconnection handling
  - Test reconnection with state restoration
  - Test session cleanup after timeout
  - _Requirements: 2.6, 23.5, 23.6_

- [x] 3. Implement Bedrock client and streaming integration





- [x] 3.1 Create Bedrock client with HTTP/2 support


  - Initialize BedrockRuntimeClient with NodeHttp2Handler
  - Configure HTTP/2 with ALPN, max concurrent streams: 20, request timeout: 300s
  - Implement connection reuse for multiple sessions
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3.2 Implement Bedrock stream initialization


  - Invoke InvokeModelWithBidirectionalStream with model ID amazon.nova-2-sonic-v1:0
  - Send sessionStart event with inference configuration (maxTokens: 1024, topP: 0.9, temperature: 0.7)
  - Send promptStart event with audio output configuration (16kHz, 16-bit PCM, mono, voiceId)
  - Send system prompt as contentStart, textInput, contentEnd events
  - Generate unique promptName and contentName UUIDs
  - Notify frontend with session:ready event within 3 seconds
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ]* 3.3 Write property test for UUID uniqueness
  - **Property 4: UUID Uniqueness for Bedrock Streams**
  - **Validates: Requirements 5.6**

- [x] 3.4 Implement audio streaming to Nova Sonic


  - Send contentStart event once at first audio chunk
  - Stream audioInput events continuously with base64-encoded PCM data
  - Use same contentName for all chunks within a turn
  - Maintain audio format: 16kHz, 16-bit, mono
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

- [ ]* 3.5 Write property test for audio base64 encoding
  - **Property 5: Audio Base64 Encoding**
  - **Validates: Requirements 6.3**

- [ ]* 3.6 Write property test for audio format consistency
  - **Property 6: Audio Format Consistency**
  - **Validates: Requirements 6.4**

- [ ]* 3.7 Write property test for contentName consistency within turn
  - **Property 7: ContentName Consistency Within Turn**
  - **Validates: Requirements 6.6**

- [x] 3.8 Implement Nova Sonic output event processing


  - Handle textOutput events (USER role FINAL) and forward as transcription:user
  - Handle audioOutput events and forward as audio:chunk
  - Handle textOutput events (ASSISTANT role FINAL) and forward as transcription:assistant
  - Detect barge-in from interrupted:true flag and notify frontend
  - Handle toolUse events and execute tools
  - Handle completionEnd events and mark turn complete
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ]* 3.9 Write unit tests for Nova Sonic event processing
  - Test ASR transcription forwarding
  - Test audio forwarding
  - Test AI transcription forwarding
  - Test barge-in detection
  - Test tool use handling
  - Test completion handling
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 3.10 Implement Bedrock stream cleanup


  - Send contentEnd for any open audio stream
  - Send promptEnd with original promptName
  - Send sessionEnd event
  - Wait for completionEnd response
  - Close Bedrock streaming connection
  - Complete cleanup within 3 seconds
  - Handle cleanup errors gracefully
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

- [ ]* 3.11 Write unit tests for Bedrock stream cleanup
  - Test cleanup sequence
  - Test cleanup with errors
  - Test cleanup timeout
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

- [x] 4. Implement voice configuration




- [x] 4.1 Create voice configuration module

  - Define supported voices for English (matthew, tiffany, amy)
  - Define supported voices for Spanish (lupe, carlos)
  - Define supported voices for French (ambre, florian)
  - Define supported voices for German (greta, lennart)
  - Define supported voices for Italian (beatrice, lorenzo)
  - Implement voice selection in promptStart audioOutputConfiguration
  - Persist voice selection in session state
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ]* 4.2 Write unit tests for voice configuration
  - Test all supported voices
  - Test voice persistence
  - Test invalid voice handling
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 5. Implement session management






- [x] 5.1 Create session manager component


  - Implement createSession with sessionId and metadata
  - Implement getSession to retrieve session by ID
  - Implement updateSession to update session state
  - Implement deleteSession to remove session
  - Implement cleanupStaleSessions to remove inactive sessions (30min+)
  - Support in-memory storage for single instance
  - Support Redis storage for multi-instance (optional)
  - Access session state within 50ms
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ]* 5.2 Write property test for session isolation
  - **Property 20: Session Isolation**
  - **Validates: Requirements 1.4**

- [ ]* 5.3 Write unit tests for session manager
  - Test session creation
  - Test session retrieval
  - Test session updates
  - Test session deletion
  - Test stale session cleanup
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 6. Implement questionnaire engine





- [x] 6.1 Create questionnaire loader


  - Load demo1_csat_nps.json at startup
  - Load demo2_concept_test.json at startup
  - Load demo3_political_polling.json at startup
  - Load demo4_brand_tracker.json at startup
  - Parse and validate questionnaire JSON schema
  - Cache questionnaires in memory
  - _Requirements: 12.1, 12.2_

- [x] 6.2 Implement question type support


  - Support voice_prompt questions
  - Support single_choice questions
  - Support multiple_choice questions
  - Support rating_scale questions
  - Support nps questions
  - Support yes_no questions
  - Support open_ended questions
  - _Requirements: 12.3_

- [ ]* 6.3 Write unit tests for question type handling
  - Test each question type
  - Test question rendering
  - Test option handling
  - _Requirements: 12.3_

- [x] 6.3 Implement display logic evaluation


  - Parse display logic conditions from questionnaire
  - Evaluate conditions based on prior answers
  - Determine whether to show or hide questions
  - Support AND/OR logical operators
  - _Requirements: 12.4_

- [ ]* 6.4 Write property test for display logic evaluation
  - **Property 10: Display Logic Evaluation**
  - **Validates: Requirements 12.4**

- [x] 6.5 Implement skip logic evaluation

  - Parse skip logic rules from questionnaire
  - Evaluate skip conditions based on prior answers
  - Determine next question to jump to
  - Handle skip chains (multiple skips in sequence)
  - _Requirements: 12.5_

- [ ]* 6.6 Write property test for skip logic evaluation
  - **Property 11: Skip Logic Evaluation**
  - **Validates: Requirements 12.5**

- [x] 6.7 Implement dynamic question text

  - Parse dynamic text rules from questionnaire
  - Apply correct question text based on prior responses
  - Support NPS follow-up scenarios (detractors, passives, promoters)
  - _Requirements: 12.6_

- [ ]* 6.8 Write property test for dynamic question text
  - **Property 12: Dynamic Question Text Application**
  - **Validates: Requirements 12.6**

- [x] 6.9 Implement dynamic options filtering

  - Parse dynamic options rules from questionnaire
  - Filter options based on prior selections
  - Support brand consideration based on awareness scenario
  - Support brand preference based on consideration scenario
  - _Requirements: 12.7_

- [ ]* 6.10 Write property test for dynamic options filtering
  - **Property 13: Dynamic Options Filtering**
  - **Validates: Requirements 12.7**

- [x] 6.11 Implement response validation

  - Validate response type matches question type
  - Validate single choice responses (one option selected)
  - Validate multiple choice responses (within min/max selections)
  - Validate rating scale responses (within range)
  - Validate NPS responses (0-10)
  - Validate yes/no responses
  - Validate open-ended responses (max length)
  - _Requirements: 9.5_

- [ ]* 6.12 Write property test for answer validation
  - **Property 9: Answer Validation Correctness**
  - **Validates: Requirements 9.5**

- [x] 6.13 Implement get_next_question logic


  - Determine next question based on current progress
  - Apply display logic to filter questions
  - Apply skip logic to jump questions
  - Handle end of questionnaire
  - _Requirements: 9.4_

- [ ]* 6.14 Write property test for next question logic
  - **Property 8: Next Question Logic Correctness**
  - **Validates: Requirements 9.4**


- [x] 7. Implement tool executor






- [x] 7.1 Create tool executor component


  - Implement tool registration system
  - Implement tool execution with parameter validation
  - Return tool results in correct format
  - Handle tool execution errors
  - Complete tool execution within 500ms
  - _Requirements: 9.1, 9.2, 9.6, 9.7_

- [x] 7.2 Implement record_response tool

  - Extract sessionId, questionId, response value from parameters
  - Save response to DynamoDB demo-responses table
  - Include timestamp and responseType
  - Return success result
  - _Requirements: 9.3_

- [x] 7.3 Implement get_next_question tool

  - Retrieve session state
  - Call questionnaire engine to get next question
  - Return question data as tool result
  - _Requirements: 9.4_

- [x] 7.4 Implement validate_answer tool

  - Extract question and response from parameters
  - Call questionnaire engine to validate
  - Return validation result with errors if invalid
  - _Requirements: 9.5_

- [x] 7.5 Implement get_demo_context tool

  - Retrieve questionnaire metadata
  - Return context information for AI agent
  - _Requirements: 9.1_

- [ ]* 7.6 Write unit tests for tool executor
  - Test tool registration
  - Test tool execution
  - Test error handling
  - Test each tool implementation
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7_


- [x] 8. Implement sentiment detection






- [x] 8.1 Create sentiment analyzer module




  - Integrate sentiment analysis library (e.g., sentiment, natural, or AWS Comprehend)
  - Analyze text for positive, negative, neutral sentiment
  - Return sentiment classification
  - Complete analysis within 200ms
  - _Requirements: 13.1, 13.2, 13.5_

- [ ]* 8.2 Write property test for sentiment classification
  - **Property 14: Sentiment Classification**


  - **Validates: Requirements 13.1, 13.2**

- [x] 8.3 Integrate sentiment detection with response recording




  - Check if question has sentimentDetectionEnabled
  - Analyze response text if enabled
  - Store sentiment with response in DynamoDB
  - Handle sentiment detection failures gracefully
  - _Requirements: 13.3, 13.4_

- [-]* 8.4 Write unit tests for sentiment detection integration

  - Test sentiment detection enabled


  - Test sentiment detection disabled
  - Test sentiment storage
  - Test error handling
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 9. Implement quota management






- [x] 9.1 Create quota manager component


  - Implement checkQuota to verify if quota is filled
  - Implement incrementQuota to update quota counts



  - Implement getQuotaStatus to retrieve current status
  - Implement resetQuotas to clear counts
  - Store quota counts in DynamoDB or Redis
  - _Requirements: 14.1, 14.2, 14.4_

- [ ]* 9.2 Write property test for quota count persistence
  - **Property 15: Quota Count Persistence**
  - **Validates: Requirements 14.4**

- [x] 9.3 Integrate quota enforcement with questionnaire flow


  - Check quotas after screening questions
  - Terminate session with polite message if quota filled






  - Support quota configuration per questionnaire
  - Support quota enforcement toggle
  - _Requirements: 14.3, 14.5, 14.6_



- [ ]* 9.4 Write unit tests for quota management
  - Test quota checking
  - Test quota incrementing
  - Test quota enforcement
  - Test quota configuration
  - Test quota toggle
  - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6_



- [x] 10. Implement data access layer






- [x] 10.1 Create DynamoDB client wrapper


  - Initialize DynamoDB client with AWS SDK


  - Implement connection pooling
  - Implement retry logic with exponential backoff
  - _Requirements: 19.3_

- [x] 10.2 Implement session repository


  - Create demo-sessions table schema
  - Implement create session record
  - Implement get session record
  - Implement update session record
  - Implement delete session record
  - Complete writes within 100ms
  - _Requirements: 15.1, 15.4, 15.7_



- [x] 10.3 Implement response repository


  - Create demo-responses table schema


  - Implement create response record
  - Implement get responses by session
  - Complete writes within 100ms
  - _Requirements: 15.2, 15.5, 15.7_

- [x] 10.4 Implement transcript repository


  - Create demo-transcripts table schema
  - Implement create transcript record
  - Implement get transcripts by session
  - Complete writes within 100ms
  - _Requirements: 15.3, 15.6, 15.7_

- [ ]* 10.5 Write unit tests for data access layer
  - Test session repository operations
  - Test response repository operations
  - Test transcript repository operations
  - Test error handling and retries
  - _Requirements: 15.4, 15.5, 15.6, 19.3_

- [x] 10.6 Create S3 client wrapper


  - Initialize S3 client with AWS SDK
  - Implement retry logic with exponential backoff
  - _Requirements: 16.5_

- [x] 10.7 Implement recording repository


  - Create voiceter-demo-recordings bucket
  - Implement upload audio recording to S3
  - Implement download audio recording from S3
  - Use key format: sessionId/timestamp.wav
  - Configure lifecycle policy to delete after 90 days
  - Enable versioning
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ]* 10.8 Write unit tests for recording repository
  - Test audio upload
  - Test audio download
  - Test error handling and retries
  - _Requirements: 16.1, 16.2, 16.3, 16.5_

- [x] 11. Implement audio processor




- [x] 11.1 Create audio processor utility

  - Implement encodeToBase64 for PCM buffers
  - Implement decodeFromBase64 to PCM buffers
  - Implement validateAudioFormat
  - Implement createAudioChunk to split into streaming chunks
  - _Requirements: 6.3_

- [ ]* 11.2 Write unit tests for audio processor
  - Test base64 encoding/decoding round trip
  - Test audio format validation
  - Test chunk creation
  - _Requirements: 6.3_

- [x] 12. Implement error handling





- [x] 12.1 Create error handler middleware


  - Catch WebSocket errors and log with context
  - Catch Bedrock API errors and log with details
  - Catch DynamoDB errors and implement retry logic
  - Catch audio processing errors and continue session
  - Catch questionnaire logic errors and fall back
  - Catch tool execution errors and return error result
  - Catch unhandled exceptions and gracefully close session
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ]* 12.2 Write property test for error log completeness
  - **Property 16: Error Log Completeness**
  - **Validates: Requirements 19.6**

- [ ]* 12.3 Write property test for error message sanitization
  - **Property 17: Error Message Sanitization**
  - **Validates: Requirements 19.7**

- [x] 12.4 Implement error response formatting


  - Define error codes for all error types
  - Format error responses with code, message, recoverable flag
  - Sanitize error messages for frontend (no internal details)
  - Include error codes, messages, stack traces in logs
  - _Requirements: 19.6, 19.7_

- [ ]* 12.5 Write unit tests for error handling
  - Test WebSocket error handling
  - Test Bedrock error handling
  - Test database error handling
  - Test audio error handling
  - Test exception handling
  - Test error response formatting
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 13. Implement barge-in support




- [x] 13.1 Implement barge-in detection


  - Detect user audio while AI is speaking
  - Send new audio chunks to Nova Sonic
  - Receive interrupted:true flag from Nova Sonic
  - Notify frontend to stop audio playback
  - Maintain conversation context after barge-in
  - _Requirements: 22.1, 22.2, 22.3, 22.6_

- [ ]* 13.2 Write property test for barge-in state preservation
  - **Property 18: Barge-in State Preservation**
  - **Validates: Requirements 22.6**

- [ ]* 13.3 Write unit tests for barge-in handling
  - Test barge-in detection
  - Test frontend notification
  - Test state preservation
  - _Requirements: 22.1, 22.2, 22.3, 22.6_

- [x] 14. Implement authentication (optional)




- [x] 14.1 Create authentication middleware

  - Validate session ID from cookie or header
  - Validate origin and referrer headers
  - Validate JWT tokens from AWS Cognito (if enabled)
  - Reject invalid connections with 401/403
  - Assign unique session ID on success
  - Support optional authentication mode
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ]* 14.2 Write unit tests for authentication
  - Test session ID validation
  - Test origin validation
  - Test JWT validation
  - Test rejection handling
  - Test optional mode
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [x] 15. Implement graceful shutdown





- [x] 15.1 Create shutdown handler


  - Listen for SIGTERM signal
  - Stop accepting new WebSocket connections
  - Complete in-progress streaming sessions
  - Send sessionEnd to Nova Sonic for all active sessions
  - Close WebSocket connections with proper close frames
  - Wait up to 30 seconds for graceful completion
  - Force-close remaining connections after timeout
  - Persist session data before shutdown
  - Return unhealthy status on health check during shutdown
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

- [ ]* 15.2 Write unit tests for graceful shutdown
  - Test SIGTERM handling
  - Test session completion
  - Test cleanup
  - Test timeout enforcement
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

- [x] 16. Implement monitoring and metrics





- [x] 16.1 Create metrics emitter


  - Emit concurrent sessions metric
  - Emit WebSocket connections metric
  - Emit Bedrock latency metric
  - Emit database latency metric
  - Emit error rate metric
  - Emit audio chunks processed metric
  - Send metrics to CloudWatch
  - _Requirements: 21.5_

- [x] 16.2 Configure CloudWatch alarms


  - High error rate alarm (> 5%)
  - High latency alarm (> 500ms)
  - Low health check success alarm (< 80%)
  - High CPU utilization alarm (> 80%)
  - High memory utilization alarm (> 85%)
  - _Requirements: 21.6_

- [ ]* 16.3 Write unit tests for metrics emitter
  - Test metric emission
  - Test metric formatting
  - Test CloudWatch integration
  - _Requirements: 21.5_


- [x] 17. Implement health check endpoint



- [x] 17.1 Create health check endpoint


  - Implement GET /health endpoint
  - Return 200 when healthy
  - Check DynamoDB connectivity
  - Check Bedrock connectivity
  - Return 503 when unhealthy
  - Return unhealthy during shutdown
  - _Requirements: 20.4, 17.7_

- [ ]* 17.2 Write unit tests for health check
  - Test healthy response
  - Test unhealthy response
  - Test shutdown response
  - _Requirements: 20.4, 17.7_


- [x] 18. Create Docker container



- [x] 18.1 Write Dockerfile


  - Use node:18-alpine base image
  - Copy package files and install production dependencies
  - Copy compiled dist/ and questionnaires/
  - Expose port 8080
  - Set CMD to start server
  - _Requirements: 20.1_

- [x] 18.2 Build and test Docker image locally


  - Build Docker image
  - Run container locally
  - Test WebSocket connections
  - Test health check endpoint
  - _Requirements: 20.1_

- [x] 19. Create AWS infrastructure with CDK





- [x] 19.1 Write CDK stack for VPC and ECS cluster


  - Create VPC with 2 AZs
  - Create ECS cluster with container insights
  - _Requirements: 20.2, 20.3_

- [x] 19.2 Write CDK stack for ECS task and service


  - Create Fargate task definition (1 vCPU, 2GB memory)
  - Add container with environment variables
  - Create Fargate service with desired count 2
  - Configure auto-scaling (min 2, max 10, target CPU 70%)
  - _Requirements: 20.2, 20.5, 20.7_

- [x] 19.3 Write CDK stack for Application Load Balancer


  - Create ALB with HTTPS listener
  - Configure target group with health check
  - Enable sticky sessions (1 hour)
  - Configure WebSocket support (300s idle timeout)
  - _Requirements: 20.3_

- [x] 19.4 Write CDK stack for DynamoDB tables


  - Create demo-sessions table with GSI
  - Create demo-responses table
  - Create demo-transcripts table with TTL
  - Configure on-demand billing
  - Enable point-in-time recovery
  - _Requirements: 15.1, 15.2, 15.3_

- [x] 19.5 Write CDK stack for S3 bucket


  - Create voiceter-demo-recordings bucket
  - Enable versioning
  - Configure encryption (AES-256)
  - Configure lifecycle policy (delete after 90 days)
  - _Requirements: 16.1, 16.4, 16.5_

- [x] 19.6 Write CDK stack for IAM roles


  - Create task execution role
  - Create task role with Bedrock, DynamoDB, S3, CloudWatch permissions
  - _Requirements: 1.3_

- [x] 19.7 Write CDK stack for CloudWatch


  - Create log group with 30-day retention
  - Create CloudWatch alarms
  - _Requirements: 21.1, 21.6_

- [x] 19.8 Deploy CDK stack to AWS


  - Deploy to us-east-1 (or other supported region)
  - Verify all resources created
  - Test connectivity
  - _Requirements: 20.6, 20.7_


- [x] 20. Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.


- [x] 21. Integration testing




- [ ]* 21.1 Write integration tests for WebSocket communication
  - Test connect/disconnect cycles
  - Test message exchange
  - Test reconnection handling
  - Test error scenarios

- [ ]* 21.2 Write integration tests for Bedrock integration
  - Test stream initialization
  - Test audio streaming
  - Test event processing
  - Test stream cleanup

- [ ]* 21.3 Write integration tests for database integration
  - Test session persistence
  - Test response storage
  - Test transcript storage
  - Test query operations

- [ ]* 21.4 Write end-to-end integration tests
  - Test complete demo session flow
  - Test question progression
  - Test response recording
  - Test session completion


- [x] 22. Create API documentation






- [x] 22.1 Document WebSocket event schemas



  - Document all client-to-server events with examples
  - Document all server-to-client events with examples
  - Document error codes and messages
  - _Requirements: 25.2, 25.4_

- [x] 22.2 Document session lifecycle


  - Document initialization flow
  - Document audio streaming flow
  - Document question progression flow
  - Document termination flow
  - _Requirements: 25.3_

- [x] 22.3 Create integration guide


  - Provide example code snippets
  - Document common integration patterns
  - Document troubleshooting steps
  - _Requirements: 25.5_

- [x] 23. Create steering files





- [x] 23.1 Create product.md steering file

  - Document product vision and goals
  - Document demo questionnaire purposes
  - Document user experience guidelines
  - Document voice selection guidelines

- [x] 23.2 Create tech.md steering file

  - Document technology stack and architecture
  - Document AWS services and configuration
  - Document WebSocket protocol and events
  - Document Bedrock integration patterns
  - Document error handling strategies
  - Document performance optimization techniques

- [x] 23.3 Create structure.md steering file

  - Document project folder structure
  - Document code organization principles
  - Document naming conventions
  - Document module dependencies
  - Document testing structure

- [x] 24. Final checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.


- [x] 25. Integrate frontend application into project




- [x] 25.1 Copy frontend application to project root


  - Copy all files from docs/voiceter_ai_landing_page to voiceter-frontend/ directory
  - Preserve all existing files and folder structure
  - Maintain all configuration files
  - _Requirements: 26.1, 26.3, 26.4_

- [x] 25.2 Update frontend configuration for environment support


  - Create .env.local.example with backend URL configuration
  - Update configuration to support NEXT_PUBLIC_BACKEND_URL environment variable
  - Set development backend URL to ws://localhost:8080
  - Set production backend URL placeholder for deployment
  - _Requirements: 26.5_

- [x] 25.3 Verify frontend runs independently


  - Install dependencies with npm install
  - Run npm run dev and verify it starts on port 4028
  - Verify landing page loads correctly
  - Verify full demo experience page loads correctly
  - Verify waitlist API works
  - _Requirements: 26.2, 26.6_

- [x] 26. Install WebSocket client dependencies





- [x] 26.1 Add Socket.IO client to frontend


  - Install socket.io-client package
  - Install @types/socket.io-client for TypeScript support
  - Update package.json
  - _Requirements: 27.1_


- [x] 27. Create WebSocket service module




- [x] 27.1 Create WebSocket service class


  - Create src/services/websocket/WebSocketService.ts
  - Implement connection management (connect, disconnect, reconnect)
  - Implement event emitter pattern for WebSocket events
  - Implement connection state tracking (disconnected, connecting, connected, error)
  - Implement exponential backoff for reconnection (max 3 retries)
  - Support configurable backend URL from environment variables
  - _Requirements: 27.2, 27.3, 27.4_

- [x] 27.2 Implement session management in WebSocket service

  - Implement startSession method that emits session:start event
  - Implement endSession method that emits session:end event
  - Implement event listeners for session:ready, question:advance, session:complete
  - Store session ID from backend
  - _Requirements: 27.5, 27.6_

- [ ]* 27.3 Write unit tests for WebSocket service
  - Test connection lifecycle
  - Test reconnection logic
  - Test event emission
  - Test event listening
  - Test error handling
  - _Requirements: 27.2, 27.3_


- [x] 28. Implement audio capture functionality




- [x] 28.1 Create audio capture service


  - Create src/services/audio/AudioCaptureService.ts
  - Request microphone permission with proper error handling
  - Create AudioContext with 16kHz sample rate
  - Implement AudioWorklet for efficient audio processing
  - Create audio-processor.js worklet for PCM capture
  - _Requirements: 27.7, 28.1_

- [x] 28.2 Implement audio streaming to backend


  - Convert PCM audio to base64 encoding
  - Emit audio:chunk events with base64 data and sequence numbers
  - Implement continuous streaming while user is speaking
  - Handle audio capture errors gracefully
  - _Requirements: 28.2, 28.3_

- [ ]* 28.3 Write unit tests for audio capture service
  - Test microphone permission handling
  - Test audio context creation
  - Test PCM to base64 conversion
  - Test error handling
  - _Requirements: 28.1, 28.2_

- [x] 29. Implement audio playback functionality





- [x] 29.1 Create audio playback service


  - Create src/services/audio/AudioPlaybackService.ts
  - Implement audio queue for streaming chunks
  - Decode base64 audio to PCM format
  - Convert PCM to Float32Array for Web Audio API
  - Create AudioBuffer and play audio smoothly
  - _Requirements: 28.4, 28.5, 28.6_

- [x] 29.2 Implement barge-in support


  - Detect when user starts speaking during AI playback
  - Stop audio playback immediately
  - Clear audio queue
  - Allow new user audio to be captured
  - _Requirements: 28.7_

- [ ]* 29.3 Write unit tests for audio playback service
  - Test base64 to PCM conversion
  - Test audio queue management
  - Test barge-in handling
  - Test error handling
  - _Requirements: 28.4, 28.5, 28.6, 28.7_

- [x] 30. Create transcription display component






- [x] 30.1 Create TranscriptionView component

  - Create src/components/demo/TranscriptionView.tsx
  - Display user and AI transcriptions in conversation format
  - Differentiate between user and AI messages with styling
  - Handle interim and final transcriptions
  - Implement auto-scroll to latest message
  - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5_

- [x] 30.2 Integrate transcription listeners


  - Listen for transcription:user events from WebSocket
  - Listen for transcription:assistant events from WebSocket
  - Update transcription state in real-time
  - Clear transcriptions on new session start
  - _Requirements: 29.6, 29.7_

- [ ]* 30.3 Write component tests for TranscriptionView
  - Test transcription rendering
  - Test user/AI differentiation
  - Test auto-scroll behavior
  - Test clearing transcriptions
  - _Requirements: 29.1, 29.2, 29.4, 29.5_


- [x] 31. Create question display component




- [x] 31.1 Create QuestionDisplay component


  - Create src/components/demo/QuestionDisplay.tsx
  - Display current question text prominently
  - Display question options for choice questions
  - Display rating scale for rating questions
  - Display agent notes if available
  - Handle dynamic question text updates
  - _Requirements: 30.2, 30.3, 30.6, 30.7_

- [x] 31.2 Create progress indicator component


  - Create src/components/demo/ProgressIndicator.tsx
  - Display current question number and total
  - Display percentage complete with progress bar
  - Update in real-time as questions advance
  - _Requirements: 30.4, 30.5_

- [x] 31.3 Integrate question advancement listeners


  - Listen for question:advance events from WebSocket
  - Update current question state
  - Update progress state
  - Animate transitions between questions
  - _Requirements: 30.1_

- [ ]* 31.4 Write component tests for question display
  - Test question rendering for all question types
  - Test options display
  - Test progress indicator
  - Test question advancement
  - _Requirements: 30.1, 30.2, 30.3, 30.4_

- [x] 32. Create session completion component




- [x] 32.1 Create SessionComplete component


  - Create src/components/demo/SessionComplete.tsx
  - Display completion status (completed or terminated)
  - Display session summary (questions answered, duration)
  - Display appropriate messaging based on completion status
  - Provide options to start new demo or return to selection
  - _Requirements: 31.1, 31.2, 31.3, 31.5_

- [x] 32.2 Implement session completion handling


  - Listen for session:complete events from WebSocket
  - Stop audio capture when session completes
  - Close WebSocket connection
  - Clean up audio resources
  - Handle quota filled termination messages
  - _Requirements: 31.4, 31.6, 31.7_

- [ ]* 32.3 Write component tests for session completion
  - Test completion screen rendering
  - Test summary display
  - Test cleanup on completion
  - Test navigation options
  - _Requirements: 31.1, 31.2, 31.3, 31.4_


- [x] 33. Implement error handling and recovery




- [x] 33.1 Create error handling service


  - Create src/services/error/ErrorHandlingService.ts
  - Listen for error events from WebSocket
  - Map error codes to user-friendly messages
  - Display error notifications in UI
  - _Requirements: 32.1_

- [x] 33.2 Implement connection status indicator


  - Create ConnectionStatus component
  - Display connection state (connected, connecting, disconnected, error)
  - Update in real-time based on WebSocket state
  - Show reconnection attempts
  - _Requirements: 32.3_

- [x] 33.3 Implement automatic reconnection


  - Detect connection loss
  - Attempt reconnection up to 3 times with exponential backoff
  - Preserve session state during reconnection
  - Provide manual reconnect button if automatic fails
  - _Requirements: 32.2, 32.6, 32.7_

- [x] 33.4 Handle microphone permission errors


  - Detect microphone permission denial
  - Display clear instructions to enable microphone
  - Provide retry button after permission granted
  - _Requirements: 32.4_

- [ ]* 33.5 Write tests for error handling
  - Test error message display
  - Test reconnection logic
  - Test microphone permission handling
  - Test connection status updates
  - _Requirements: 32.1, 32.2, 32.3, 32.4_


- [x] 34. Create voice selection UI



- [x] 34.1 Create VoiceSelector component


  - Create src/components/demo/VoiceSelector.tsx
  - Display available voices grouped by language
  - Show voice characteristics (gender, language, tone)
  - Highlight default voice (matthew)
  - Implement voice preview functionality
  - _Requirements: 33.1, 33.2, 33.3, 33.7_

- [x] 34.2 Implement voice persistence


  - Store selected voice in localStorage
  - Load saved voice on component mount
  - Update voice selection in session:start event
  - Disable voice selection during active demo
  - _Requirements: 33.4, 33.5, 33.6_

- [ ]* 34.3 Write component tests for voice selector
  - Test voice display
  - Test voice selection
  - Test localStorage persistence
  - Test voice preview
  - _Requirements: 33.1, 33.2, 33.4_


- [x] 35. Create demo selection UI




- [x] 35.1 Update full demo experience page


  - Update src/app/full-demo-experience-page/page.tsx
  - Load questionnaire metadata from JSON files or API
  - Display demo cards for all 4 questionnaires
  - Show questionnaire name, description, duration, features
  - Implement demo card click handler
  - _Requirements: 34.1, 34.2, 34.3_



- [x] 35.2 Implement demo navigation





  - Navigate to demo interface when demo selected
  - Pass questionnaireId to demo interface
  - Allow return to demo selection after completion
  - _Requirements: 34.4, 34.5, 34.6, 34.7_

- [ ]* 35.3 Write component tests for demo selection
  - Test demo card rendering
  - Test demo selection
  - Test navigation
  - _Requirements: 34.1, 34.2, 34.4_



- [x] 36. Create main voice demo interface component


- [x] 36.1 Create VoiceDemoInterface component

  - Create src/components/demo/VoiceDemoInterface.tsx
  - Integrate WebSocket service
  - Integrate audio capture service
  - Integrate audio playback service
  - Integrate all sub-components (transcription, question, progress, completion)
  - Implement component lifecycle (mount, unmount, cleanup)
  - _Requirements: 35.1, 35.2, 35.4_


- [x] 36.2 Implement demo state management

  - Use React hooks (useState, useEffect, useRef) for state
  - Manage demo state (idle, connecting, active, completed, error)
  - Accept questionnaireId and voiceId as props
  - Emit lifecycle events to parent components
  - _Requirements: 35.3, 35.5_



- [x] 36.3 Implement responsive design

  - Ensure component works on desktop, tablet, mobile
  - Use Tailwind CSS for responsive styling
  - Follow existing design system conventions
  - Test on multiple screen sizes
  - _Requirements: 35.6, 35.7_

- [ ]* 36.4 Write integration tests for VoiceDemoInterface
  - Test complete demo flow
  - Test component integration
  - Test state management
  - Test cleanup on unmount
  - _Requirements: 35.1, 35.2, 35.4, 35.5_

- [x] 37. Create audio processor worklet




- [x] 37.1 Create audio-processor.js worklet


  - Create public/audio-processor.js
  - Implement AudioWorkletProcessor for PCM capture
  - Process audio in 32ms chunks (~512 bytes @ 16kHz)
  - Send audio data to main thread via postMessage
  - Handle buffer management efficiently
  - _Requirements: 28.1_

- [ ]* 37.2 Test audio processor worklet
  - Test audio processing
  - Test chunk size
  - Test message passing
  - _Requirements: 28.1_

- [x] 38. Update environment configuration






- [x] 38.1 Create environment configuration file

  - Create src/config/environment.ts
  - Export BACKEND_URL from environment variables
  - Support NEXT_PUBLIC_BACKEND_URL
  - Provide defaults for development and production
  - _Requirements: 27.4_



- [x] 38.2 Document environment variables




  - Update README.md with required environment variables
  - Document NEXT_PUBLIC_BACKEND_URL configuration
  - Provide examples for development and production
  - _Requirements: 26.5_



- [x] 39. Integration testing for frontend


- [ ]* 39.1 Write end-to-end tests for demo flow
  - Test complete demo session from start to finish
  - Test audio capture and playback
  - Test transcription display
  - Test question progression
  - Test session completion

- [ ]* 39.2 Write tests for error scenarios
  - Test connection failures
  - Test microphone permission denial
  - Test backend errors
  - Test reconnection

- [ ]* 39.3 Write tests for voice selection
  - Test voice selection UI
  - Test voice persistence
  - Test voice preview

- [x] 40. Final frontend checkpoint





  - Ensure all frontend components work correctly
  - Ensure WebSocket integration works with backend
  - Ensure audio capture and playback work smoothly
  - Ensure responsive design works on all devices
  - Ask the user if questions arise
