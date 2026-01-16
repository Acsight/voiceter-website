# Design Document: Gemini Live Migration

## Overview

This design document describes the architecture and implementation approach for migrating the Voiceter backend from ElevenLabs Conversational AI to Google Gemini Live API. The migration replaces the voice AI platform while maintaining backward compatibility with the existing Socket.IO interface used by the frontend.

The system will use Gemini Live's native audio understanding and generation capabilities to provide low-latency bidirectional voice conversations for conducting AI-powered surveys.

## Architecture

### High-Level Architecture

```
┌─────────────────┐     Socket.IO      ┌─────────────────────────────────────────┐
│                 │◄──────────────────►│              Backend                     │
│    Frontend     │   (unchanged)      │                                         │
│  (React Client) │                    │  ┌─────────────────────────────────┐   │
│                 │                    │  │      WebSocket Handler          │   │
└─────────────────┘                    │  │   (translates Socket.IO ↔       │   │
                                       │  │    Gemini Live events)          │   │
                                       │  └──────────────┬──────────────────┘   │
                                       │                 │                       │
                                       │  ┌──────────────▼──────────────────┐   │
                                       │  │      GeminiLiveClient           │   │
                                       │  │   (WebSocket to Vertex AI)      │   │
                                       │  └──────────────┬──────────────────┘   │
                                       │                 │                       │
                                       └─────────────────┼───────────────────────┘
                                                         │
                                                         │ WebSocket (WSS)
                                                         │ Bearer Token Auth
                                                         ▼
                                       ┌─────────────────────────────────────────┐
                                       │         Google Vertex AI                │
                                       │    Gemini Live API (us-central1)        │
                                       │                                         │
                                       │  Model: gemini-live-2.5-flash-preview   │
                                       │         -native-audio                   │
                                       └─────────────────────────────────────────┘
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           voiceter-backend/src                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │   websocket/     │    │   gemini-live/   │    │    session/      │      │
│  │                  │    │                  │    │                  │      │
│  │  - handler.ts    │───►│  - client.ts     │───►│  - manager.ts    │      │
│  │  - server.ts     │    │  - auth.ts       │    │  - types.ts      │      │
│  │  - events.ts     │    │  - types.ts      │    │  - storage.ts    │      │
│  │                  │    │  - voice-config  │    │                  │      │
│  └──────────────────┘    │  - tool-adapter  │    └──────────────────┘      │
│           │              │  - transcription │              │               │
│           │              └──────────────────┘              │               │
│           │                       │                        │               │
│           ▼                       ▼                        ▼               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │     tools/       │    │  questionnaire/  │    │      data/       │      │
│  │                  │    │                  │    │                  │      │
│  │  - executor.ts   │◄───│  - engine.ts     │    │  - dynamodb.ts   │      │
│  │  - record-resp   │    │  - logic.ts      │    │  - s3.ts         │      │
│  │  - get-next-q    │    │  - loader.ts     │    │  - repositories  │      │
│  │  - validate-ans  │    │                  │    │                  │      │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. GeminiLiveClient

The core component responsible for WebSocket communication with Gemini Live API.

```typescript
interface GeminiLiveClient {
  // Connection management
  connect(sessionId: string, config: GeminiSessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Audio streaming
  sendAudioChunk(audioData: string): void;
  
  // Tool responses
  sendToolResponse(callId: string, response: ToolResponse): void;
  
  // Events (EventEmitter pattern)
  on(event: 'setupComplete', handler: (data: SetupCompleteEvent) => void): void;
  on(event: 'audioOutput', handler: (data: AudioOutputEvent) => void): void;
  on(event: 'inputTranscription', handler: (data: TranscriptionEvent) => void): void;
  on(event: 'outputTranscription', handler: (data: TranscriptionEvent) => void): void;
  on(event: 'toolCall', handler: (data: ToolCallEvent) => void): void;
  on(event: 'interrupted', handler: () => void): void;
  on(event: 'turnComplete', handler: () => void): void;
  on(event: 'error', handler: (error: GeminiError) => void): void;
  on(event: 'goAway', handler: (data: GoAwayEvent) => void): void;
}

interface GeminiSessionConfig {
  voiceName: string;
  systemPrompt: string;
  tools: ToolDeclaration[];
  vadConfig?: VADConfig;
}

interface VADConfig {
  startSensitivity: 'START_SENSITIVITY_HIGH' | 'START_SENSITIVITY_LOW';
  endSensitivity: 'END_SENSITIVITY_HIGH' | 'END_SENSITIVITY_LOW';
  prefixPaddingMs: number;
  silenceDurationMs: number;
}
```

### 2. GeminiAuthManager

Handles OAuth2 authentication with Google Cloud.

```typescript
interface GeminiAuthManager {
  // Get valid access token (refreshes if needed)
  getAccessToken(): Promise<string>;
  
  // Check if token needs refresh
  isTokenExpiringSoon(): boolean;
  
  // Force token refresh
  refreshToken(): Promise<string>;
}
```

### 3. VoiceConfigManager

Manages voice configuration and mapping.

```typescript
interface VoiceConfigManager {
  // Map legacy voice name to Gemini voice
  mapVoice(legacyVoiceName: string): string;
  
  // Get default voice
  getDefaultVoice(): string;
  
  // Validate voice name
  isValidVoice(voiceName: string): boolean;
  
  // Get all available voices
  getAvailableVoices(): string[];
}

const GEMINI_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck', 'Orbit'] as const;

const VOICE_MAPPING: Record<string, string> = {
  'matthew': 'Charon',
  'tiffany': 'Aoede',
  'amy': 'Kore',
};
```

### 4. GeminiToolAdapter

Converts between internal tool format and Gemini Live format.

```typescript
interface GeminiToolAdapter {
  // Convert internal tool definitions to Gemini format
  toGeminiFormat(tools: InternalTool[]): GeminiFunctionDeclaration[];
  
  // Extract tool call from Gemini event
  parseToolCall(event: GeminiToolCallEvent): ParsedToolCall[];
  
  // Format tool response for Gemini
  formatToolResponse(callId: string, result: any): GeminiToolResponse;
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required: string[];
  };
}
```

### 5. TranscriptionHandler

Processes transcription events from Gemini Live.

```typescript
interface TranscriptionHandler {
  // Handle input (user) transcription
  handleInputTranscription(sessionId: string, text: string): void;
  
  // Handle output (assistant) transcription
  handleOutputTranscription(sessionId: string, text: string): void;
  
  // Get conversation history
  getConversationHistory(sessionId: string): ConversationTurn[];
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}
```

## Data Models

### Gemini Live Message Types

```typescript
// Setup message (client → Gemini)
interface GeminiSetupMessage {
  setup: {
    model: string;
    generationConfig: {
      responseModalities: ['AUDIO'];
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: string;
          };
        };
      };
    };
    systemInstruction: {
      parts: Array<{ text: string }>;
    };
    tools: Array<{
      functionDeclarations: GeminiFunctionDeclaration[];
    }>;
    inputAudioTranscription: {};
    outputAudioTranscription: {};
    realtimeInputConfig?: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: string;
        endOfSpeechSensitivity: string;
        prefixPaddingMs: number;
        silenceDurationMs: number;
      };
      activityHandling: 'START_OF_ACTIVITY_INTERRUPTS';
    };
  };
}

// Audio input message (client → Gemini)
interface GeminiAudioInputMessage {
  realtimeInput: {
    audio: {
      mimeType: 'audio/pcm;rate=16000';
      data: string; // base64
    };
  };
}

// Tool response message (client → Gemini)
interface GeminiToolResponseMessage {
  toolResponse: {
    functionResponses: Array<{
      id: string;
      response: any;
    }>;
  };
}

// Server content event (Gemini → client)
interface GeminiServerContentEvent {
  serverContent: {
    modelTurn?: {
      parts: Array<{
        inlineData?: {
          mimeType: string;
          data: string; // base64 audio
        };
      }>;
    };
    inputTranscription?: {
      text: string;
    };
    outputTranscription?: {
      text: string;
    };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
}

// Tool call event (Gemini → client)
interface GeminiToolCallEvent {
  toolCall: {
    functionCalls: Array<{
      id: string;
      name: string;
      args: Record<string, any>;
    }>;
  };
}

// Setup complete event (Gemini → client)
interface GeminiSetupCompleteEvent {
  setupComplete: {
    sessionId: string;
  };
}

// Go away event (Gemini → client)
interface GeminiGoAwayEvent {
  goAway: {
    timeLeft: string; // duration format
  };
}
```

### Session State

```typescript
interface GeminiSessionFields {
  geminiSessionId?: string;
  voiceName: string;
  isConnected: boolean;
  connectionAttempts: number;
  lastReconnectTime?: Date;
}

interface Session {
  sessionId: string;
  questionnaireId: string;
  currentQuestionIndex: number;
  responses: Map<string, Response>;
  conversationHistory: ConversationTurn[];
  gemini: GeminiSessionFields;
  audioConfig: AudioConfiguration;
  startTime: Date;
  lastActivityTime: Date;
  status: 'connecting' | 'active' | 'completed' | 'terminated' | 'error';
}
```

### Configuration

```typescript
interface GeminiLiveConfig {
  projectId: string;
  region: string;
  model: string;
  defaultVoice: string;
  voiceMapping: Record<string, string>;
  reconnectMaxRetries: number;
  reconnectBaseDelayMs: number;
  toolTimeoutMs: number;
  vad: {
    startSensitivity: string;
    endSensitivity: string;
    prefixPaddingMs: number;
    silenceDurationMs: number;
  };
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the acceptance criteria analysis, the following correctness properties must be validated through property-based testing:

### Property 1: Token Refresh Timing

*For any* Access_Token with expiration time T, if T is within 5 minutes of current time, the WebSocket_Client SHALL trigger a token refresh before establishing a new connection.

**Validates: Requirements 1.2**

### Property 2: Authentication Error Event Completeness

*For any* authentication failure, the WebSocket_Client SHALL emit an error event containing errorCode 'GEMINI_AUTH_FAILED', a non-empty errorMessage, sessionId, and timestamp.

**Validates: Requirements 1.3, 11.6**

### Property 3: Authorization Header Format

*For any* WebSocket connection to Vertex AI, the Authorization header SHALL be formatted as `Bearer {token}` where token is a valid OAuth2 access token.

**Validates: Requirements 1.5**

### Property 4: Setup Message Ordering

*For any* WebSocket connection, the first message sent after connection opens SHALL be a setup message, and no audio data SHALL be sent before receiving setupComplete.

**Validates: Requirements 2.2**

### Property 5: Setup Message Completeness

*For any* GeminiSessionConfig, the generated setup message SHALL contain: model name, responseModalities=['AUDIO'], systemInstruction with the provided prompt, all tool declarations, inputAudioTranscription, outputAudioTranscription, and voiceConfig with the mapped voice name.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 6: Reconnection Exponential Backoff

*For any* sequence of N consecutive connection failures (where N < maxRetries), the delay before attempt N+1 SHALL be baseDelay * 2^N milliseconds.

**Validates: Requirements 2.4**

### Property 7: Reconnection Retry Limit

*For any* session experiencing connection failures, after exactly maxRetries (default 3) failed attempts, the WebSocket_Client SHALL emit a GEMINI_CONNECTION_FAILED error and set session status to 'error'.

**Validates: Requirements 2.5**

### Property 8: Audio Input Forwarding

*For any* base64-encoded PCM audio chunk received from the frontend, the WebSocket_Client SHALL forward it to Gemini Live as a realtimeInput message with mimeType 'audio/pcm;rate=16000' and the original data.

**Validates: Requirements 4.1**

### Property 9: Audio Output Forwarding

*For any* serverContent.modelTurn.parts containing inlineData with audio, the WebSocket_Client SHALL emit an audio:chunk event to the frontend containing the base64 audio data.

**Validates: Requirements 4.2**

### Property 10: Audio Chunk Ordering

*For any* sequence of audio chunks sent or received, the order of chunks SHALL be preserved between input and output.

**Validates: Requirements 4.4**

### Property 11: Invalid Audio Resilience

*For any* audio chunk with invalid format (wrong encoding, corrupt data), the WebSocket_Client SHALL log the error and continue processing subsequent chunks without terminating the session.

**Validates: Requirements 4.5**

### Property 12: VAD Configuration Defaults

*For any* setup message where VAD config is not explicitly overridden, the automaticActivityDetection SHALL have startOfSpeechSensitivity='START_SENSITIVITY_HIGH', endOfSpeechSensitivity='END_SENSITIVITY_LOW', and silenceDurationMs=500.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 13: Interruption Event Forwarding

*For any* serverContent event with interrupted=true, the WebSocket_Client SHALL emit an 'interruption' event to the frontend within 50ms.

**Validates: Requirements 6.1**

### Property 14: Tool Call Execution

*For any* toolCall event containing N functionCalls, the Tool_Executor SHALL execute all N functions and return a toolResponse with exactly N functionResponses, each containing the matching call ID.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 15: Tool Response Round-Trip

*For any* tool execution that completes successfully, the toolResponse sent to Gemini SHALL contain the call ID from the original toolCall and the result from the tool handler.

**Validates: Requirements 7.3**

### Property 16: Tool Timeout Enforcement

*For any* tool execution that does not complete within toolTimeoutMs (default 5000ms), the Tool_Executor SHALL return an error response with success=false and an appropriate timeout error message.

**Validates: Requirements 7.4**

### Property 17: Transcription Event Transformation

*For any* inputTranscription or outputTranscription event from Gemini, the Transcription_Handler SHALL emit a corresponding transcription event to the frontend containing the text, sessionId, timestamp, and correct role ('user' or 'assistant').

**Validates: Requirements 8.1, 8.2, 8.3**

### Property 18: Transcription Persistence

*For any* transcription event processed, the Transcription_Handler SHALL append a ConversationTurn to the session's conversationHistory with matching role, text, and timestamp.

**Validates: Requirements 8.4**

### Property 19: Voice Mapping Consistency

*For any* legacy voice name in the mapping (matthew, tiffany, amy), the VoiceConfigManager SHALL return the corresponding Gemini voice (Charon, Aoede, Kore respectively).

**Validates: Requirements 9.1, 9.2, 9.3**

### Property 20: Session State Machine

*For any* session, the status transitions SHALL follow: connecting → active (on setupComplete), active → completed (on normal end), active → terminated (on user termination), active → error (on unrecoverable error), and no other transitions are valid.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

### Property 21: Activity Time Tracking

*For any* audio chunk or event processed for a session, the Session_Manager SHALL update lastActivityTime to the current timestamp.

**Validates: Requirements 10.6**

### Property 22: Session Timeout Cleanup

*For any* session where (currentTime - lastActivityTime) exceeds 30 minutes, the Session_Manager SHALL terminate the session, close the Gemini connection, and clean up resources.

**Validates: Requirements 10.7**

### Property 23: Error Code Categorization

*For any* error of type connection failure, authentication failure, rate limit, streaming error, or tool timeout, the WebSocket_Client SHALL assign the corresponding error code (GEMINI_CONNECTION_FAILED, GEMINI_AUTH_FAILED, GEMINI_RATE_LIMITED, GEMINI_STREAM_ERROR, GEMINI_TOOL_TIMEOUT).

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

### Property 24: Error Event Completeness

*For any* error emitted, the error event SHALL contain sessionId, timestamp (ISO 8601), errorCode, errorMessage (non-empty), and recoverable (boolean).

**Validates: Requirements 11.6**

### Property 25: Error Logging Completeness

*For any* error logged, the log entry SHALL contain sessionId, errorCode, errorMessage, and stack trace.

**Validates: Requirements 11.8**

### Property 26: Configuration Loading

*For any* environment variable in the GeminiLiveConfig schema that is set, the loaded configuration SHALL reflect that value; if not set, the default value SHALL be used.

**Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8**

### Property 27: Configuration Validation

*For any* startup where GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_REGION is not set, the Configuration SHALL throw an error with a message identifying the missing variable.

**Validates: Requirements 12.9**

### Property 28: Socket.IO Event Format Compatibility

*For any* event emitted to the frontend (session:ready, transcription:user, transcription:assistant, audio:chunk, question:advance, session:complete, interruption, error), the event payload SHALL match the schema expected by the existing frontend.

**Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10**

## Error Handling

### Error Categories and Recovery

| Error Type | Error Code | Recoverable | Recovery Action |
|------------|------------|-------------|-----------------|
| Connection failure | GEMINI_CONNECTION_FAILED | Yes (up to 3 retries) | Exponential backoff reconnection |
| Authentication failure | GEMINI_AUTH_FAILED | Yes (token refresh) | Refresh token and retry |
| Rate limit exceeded | GEMINI_RATE_LIMITED | Yes | Wait and retry with backoff |
| Streaming error | GEMINI_STREAM_ERROR | Depends | Reconnect if transient |
| Tool timeout | GEMINI_TOOL_TIMEOUT | Yes | Return error response, continue session |
| Tool execution error | GEMINI_TOOL_ERROR | Yes | Return error response, continue session |
| Invalid audio format | AUDIO_FORMAT_ERROR | Yes | Skip chunk, continue session |
| Session expired | SESSION_EXPIRED | No | Terminate session |
| Internal error | INTERNAL_ERROR | No | Log and terminate session |

### Error Response Format

```typescript
interface ErrorEvent {
  event: 'error';
  sessionId: string;
  timestamp: string; // ISO 8601
  data: {
    errorCode: string;
    errorMessage: string;
    recoverable: boolean;
    retryAfter?: number; // milliseconds, for rate limiting
  };
}
```

### Error Handling Flow

```
┌─────────────────┐
│   Error Occurs  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Yes     ┌─────────────────┐
│  Is Recoverable?│────────────►│  Attempt Recovery│
└────────┬────────┘             └────────┬────────┘
         │ No                            │
         │                               ▼
         │                      ┌─────────────────┐
         │                      │ Recovery Success?│
         │                      └────────┬────────┘
         │                               │
         │              No ◄─────────────┴─────────────► Yes
         │                                               │
         ▼                                               │
┌─────────────────┐                                      │
│   Log Error     │◄─────────────────────────────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Emit Error     │
│  Event to       │
│  Frontend       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Yes     ┌─────────────────┐
│ Session Fatal?  │────────────►│ Terminate Session│
└────────┬────────┘             └─────────────────┘
         │ No
         ▼
┌─────────────────┐
│ Continue Session│
└─────────────────┘
```

## Testing Strategy

### Unit Tests

Unit tests will verify individual component behavior in isolation:

- **GeminiAuthManager**: Token retrieval, refresh logic, expiration detection
- **GeminiLiveClient**: Message serialization, event parsing, state management
- **VoiceConfigManager**: Voice mapping, default handling, validation
- **GeminiToolAdapter**: Format conversion, parameter extraction
- **TranscriptionHandler**: Event transformation, history storage

### Property-Based Tests (fast-check)

Property-based tests will validate the 28 correctness properties defined above. Each property test will:

- Run minimum 100 iterations with randomly generated inputs
- Use fast-check for input generation
- Be tagged with the property number and requirements reference
- Focus on universal properties that should hold for all valid inputs

Example test structure:
```typescript
// Property 5: Setup Message Completeness
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
describe('Property 5: Setup Message Completeness', () => {
  it('should generate complete setup message for any valid config', () => {
    fc.assert(
      fc.property(
        arbitraryGeminiSessionConfig(),
        (config) => {
          const setupMessage = buildSetupMessage(config);
          
          expect(setupMessage.setup.model).toContain('gemini-live');
          expect(setupMessage.setup.generationConfig.responseModalities).toEqual(['AUDIO']);
          expect(setupMessage.setup.systemInstruction.parts[0].text).toBe(config.systemPrompt);
          expect(setupMessage.setup.tools).toHaveLength(config.tools.length);
          expect(setupMessage.setup.inputAudioTranscription).toBeDefined();
          expect(setupMessage.setup.outputAudioTranscription).toBeDefined();
          expect(setupMessage.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName)
            .toBe(mapVoice(config.voiceName));
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Tests

Integration tests will verify component interactions:

- **WebSocket Communication**: End-to-end message flow between backend and mock Gemini server
- **Tool Execution Flow**: Complete tool call → execution → response cycle
- **Session Lifecycle**: Full session from start to completion
- **Error Recovery**: Reconnection and error handling scenarios

### Test Configuration

```typescript
// jest.config.js additions for property tests
module.exports = {
  // ... existing config
  testMatch: [
    '**/*.test.ts',
    '**/property/**/*.test.ts'
  ],
  testTimeout: 30000, // Allow time for 100+ iterations
};
```

### Test File Structure

```
voiceter-backend/tests/
├── unit/
│   └── gemini-live/
│       ├── auth.test.ts
│       ├── client.test.ts
│       ├── voice-config.test.ts
│       ├── tool-adapter.test.ts
│       └── transcription-handler.test.ts
├── property/
│   ├── token-refresh-timing.test.ts
│   ├── setup-message-completeness.test.ts
│   ├── reconnection-backoff.test.ts
│   ├── audio-forwarding.test.ts
│   ├── tool-execution.test.ts
│   ├── transcription-handling.test.ts
│   ├── voice-mapping.test.ts
│   ├── session-state-machine.test.ts
│   ├── error-handling.test.ts
│   ├── configuration-loading.test.ts
│   └── socket-io-compatibility.test.ts
└── integration/
    └── gemini-live-integration.test.ts
```
