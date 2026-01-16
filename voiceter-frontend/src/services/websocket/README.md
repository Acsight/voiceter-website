# WebSocket Service

The WebSocket Service provides a robust connection management layer for real-time communication with the Voiceter backend.

## Features

- **Connection Management**: Automatic connection, disconnection, and reconnection handling
- **Exponential Backoff**: Smart reconnection strategy with configurable retry attempts
- **Event-Driven Architecture**: Type-safe event emitter pattern for handling WebSocket events
- **Session Management**: Built-in session tracking and lifecycle management
- **Audio Streaming**: Support for sending and receiving audio chunks
- **TypeScript Support**: Full TypeScript support with comprehensive type definitions

## Usage

### Basic Setup

```typescript
import { getWebSocketService, ConnectionState } from '@/services/websocket';

// Get singleton instance
const wsService = getWebSocketService({
  backendUrl: 'ws://localhost:8080', // Optional, defaults to BACKEND_URL from env
  maxReconnectAttempts: 3,           // Optional, defaults to 3
  reconnectDelay: 1000,              // Optional, defaults to 1000ms
});
```

### Connection Management

```typescript
// Connect to backend
wsService.connect();

// Listen for connection state changes
wsService.on('connection:state', (state: ConnectionState) => {
  console.log('Connection state:', state);
  // States: DISCONNECTED, CONNECTING, CONNECTED, ERROR
});

// Listen for connection errors
wsService.on('connection:error', (error: Error) => {
  console.error('Connection error:', error);
});

// Disconnect
wsService.disconnect();
```

### Session Management

```typescript
// Start a demo session
wsService.startSession('demo1_csat_nps', 'matthew', 'user-123');

// Listen for session ready
wsService.on('session:ready', (data) => {
  console.log('Session ready:', data.questionnaireName);
  console.log('First question:', data.firstQuestion);
});

// Listen for session complete
wsService.on('session:complete', (data) => {
  console.log('Session completed:', data.completionStatus);
  console.log('Questions answered:', data.answeredQuestions);
});

// End session
wsService.endSession('user_ended');
```

### Audio Streaming

```typescript
// Send audio chunk to backend
wsService.sendAudioChunk(base64AudioData, sequenceNumber);

// Listen for audio chunks from backend
wsService.on('audio:chunk', (data) => {
  const { audioData, sequenceNumber } = data;
  // Play audio...
});
```

### Transcription Events

```typescript
// Listen for user transcriptions (ASR)
wsService.on('transcription:user', (data) => {
  console.log('User said:', data.transcript);
  console.log('Is final:', data.isFinal);
});

// Listen for AI transcriptions
wsService.on('transcription:assistant', (data) => {
  console.log('AI said:', data.transcript);
  console.log('Is final:', data.isFinal);
});
```

### Question Progression

```typescript
// Listen for question advancement
wsService.on('question:advance', (data) => {
  console.log('Current question:', data.question);
  console.log('Progress:', data.progress.percentage + '%');
});
```

### Error Handling

```typescript
// Listen for backend errors
wsService.on('error', (data) => {
  console.error('Error:', data.errorMessage);
  console.log('Error code:', data.errorCode);
  console.log('Recoverable:', data.recoverable);
});
```

### Cleanup

```typescript
// Remove event listener
const listener = (state) => console.log(state);
wsService.on('connection:state', listener);
wsService.off('connection:state', listener);

// Destroy service (disconnect and clean up all listeners)
wsService.destroy();
```

## React Hook Example

```typescript
import { useEffect, useState } from 'react';
import { getWebSocketService, ConnectionState } from '@/services/websocket';

export function useWebSocket() {
  const [connectionState, setConnectionState] = useState(ConnectionState.DISCONNECTED);
  const [wsService] = useState(() => getWebSocketService());

  useEffect(() => {
    // Connect on mount
    wsService.connect();

    // Listen for connection state changes
    wsService.on('connection:state', setConnectionState);

    // Cleanup on unmount
    return () => {
      wsService.off('connection:state', setConnectionState);
      wsService.disconnect();
    };
  }, [wsService]);

  return {
    wsService,
    connectionState,
    isConnected: connectionState === ConnectionState.CONNECTED,
  };
}
```

## Event Types

### Connection Events
- `connection:state` - Connection state changed
- `connection:error` - Connection error occurred

### Session Events
- `session:ready` - Session initialized and ready
- `session:complete` - Session completed or terminated

### Transcription Events
- `transcription:user` - User speech transcription (ASR)
- `transcription:assistant` - AI speech transcription

### Audio Events
- `audio:chunk` - Audio chunk received from backend

### Question Events
- `question:advance` - Question advanced with progress

### Error Events
- `error` - Error occurred during session

## Configuration

### Environment Variables

```bash
# Backend WebSocket URL
NEXT_PUBLIC_BACKEND_URL=ws://localhost:8080  # Development
NEXT_PUBLIC_BACKEND_URL=wss://api.voiceter.ai  # Production
```

### Service Options

```typescript
interface WebSocketServiceConfig {
  backendUrl?: string;           // Backend URL (defaults to BACKEND_URL from env)
  maxReconnectAttempts?: number; // Max reconnection attempts (defaults to 3)
  reconnectDelay?: number;       // Base reconnection delay in ms (defaults to 1000)
}
```

## Reconnection Strategy

The service implements exponential backoff for reconnection:

- Attempt 1: 1 second delay
- Attempt 2: 2 seconds delay
- Attempt 3: 4 seconds delay
- After 3 attempts: Connection state set to ERROR

## Best Practices

1. **Use Singleton**: Use `getWebSocketService()` to get the singleton instance
2. **Clean Up Listeners**: Always remove event listeners when components unmount
3. **Handle Errors**: Always listen for error events and handle them appropriately
4. **Check Connection**: Check connection state before sending messages
5. **Graceful Degradation**: Handle connection failures gracefully in the UI

## Troubleshooting

### Connection Fails Immediately

- Check that backend URL is correct
- Verify backend is running and accessible
- Check browser console for CORS errors

### Reconnection Not Working

- Check that maxReconnectAttempts is set appropriately
- Verify backend is accepting connections
- Check network connectivity

### Events Not Firing

- Ensure event listeners are registered before events occur
- Check that event names match exactly
- Verify WebSocket is connected before expecting events

## Architecture

```
┌─────────────────────────────────────────┐
│         React Components                │
│  (useWebSocket hook, UI components)     │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│      WebSocketService (Singleton)       │
│  - Connection Management                │
│  - Event Emitter                        │
│  - Session Management                   │
│  - Reconnection Logic                   │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│         Socket.IO Client                │
│  - WebSocket Transport                  │
│  - Protocol Handling                    │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│      Voiceter Backend (Node.js)         │
│  - Session Management                   │
│  - Bedrock Integration                  │
│  - Audio Processing                     │
└─────────────────────────────────────────┘
```
