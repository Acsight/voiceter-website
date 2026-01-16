# Error Handling Service

The Error Handling Service provides centralized error management, user-friendly error messages, and notification functionality for the Voiceter frontend application.

## Features

- **Error Code Mapping**: Maps backend error codes to user-friendly messages
- **Error Severity Levels**: Categorizes errors by severity (info, warning, error, critical)
- **Notification Management**: Tracks and manages error notifications
- **Auto-dismissal**: Automatically dismisses info-level notifications after 5 seconds
- **Microphone Error Handling**: Specialized handling for microphone permission errors
- **Connection Error Handling**: Specialized handling for WebSocket connection errors

## Usage

### Basic Usage

```typescript
import { getErrorHandlingService } from '@/services/error';

const errorService = getErrorHandlingService();

// Set up notification callback
errorService.onNotification((notification) => {
  console.log('Error notification:', notification);
  // Display notification in UI
});

// Handle WebSocket error
errorService.handleWebSocketError({
  errorCode: 'WS_CONNECTION_FAILED',
  errorMessage: 'Connection failed',
  recoverable: true,
});

// Handle microphone error
try {
  await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (error) {
  errorService.handleMicrophoneError(error as Error);
}
```

### With React Hook

```typescript
import { useEffect, useState } from 'react';
import { getErrorHandlingService, ErrorNotification } from '@/services/error';

function MyComponent() {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);
  const errorService = getErrorHandlingService();

  useEffect(() => {
    const handleNotification = (notification: ErrorNotification) => {
      setNotifications((prev) => [...prev, notification]);
    };

    errorService.onNotification(handleNotification);

    return () => {
      errorService.clearAllNotifications();
    };
  }, []);

  return (
    <div>
      {notifications.map((notification) => (
        <div key={notification.id}>
          {notification.message}
          <button onClick={() => errorService.dismissNotification(notification.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
```

## Error Codes

The service recognizes the following error codes:

### WebSocket Errors
- `WS_CONNECTION_FAILED`: Unable to connect to server
- `WS_MESSAGE_INVALID`: Invalid message format

### Bedrock Errors
- `BEDROCK_INIT_FAILED`: Failed to initialize AI voice system
- `BEDROCK_STREAM_ERROR`: Error during voice conversation

### Database Errors
- `DB_WRITE_FAILED`: Failed to save response

### Audio Errors
- `AUDIO_PROCESSING_ERROR`: Error processing audio

### Questionnaire Errors
- `QUESTIONNAIRE_LOGIC_ERROR`: Error in survey logic

### Tool Execution Errors
- `TOOL_EXECUTION_ERROR`: Error processing response

### Session Errors
- `SESSION_EXPIRED`: Session has expired

### Quota Errors
- `QUOTA_FILLED`: Demographic quota filled

### Internal Errors
- `INTERNAL_ERROR`: Unexpected error occurred
- `UNKNOWN_ERROR`: Unknown error (fallback)

## Error Severity Levels

- **INFO**: Informational messages (auto-dismissed after 5 seconds)
- **WARNING**: Warning messages that don't prevent operation
- **ERROR**: Error messages that may affect functionality
- **CRITICAL**: Critical errors that prevent operation

## API Reference

### ErrorHandlingService

#### Methods

##### `onNotification(callback: ErrorNotificationCallback): void`
Register a callback to receive error notifications.

##### `handleWebSocketError(errorData: ErrorData): void`
Handle error from WebSocket connection.

##### `handleMicrophoneError(error: Error): void`
Handle microphone permission or access error.

##### `handleConnectionError(error: Error): void`
Handle connection error.

##### `handleAudioPlaybackError(error: Error): void`
Handle audio playback error.

##### `handleError(error: Error, code?: string): void`
Handle generic error.

##### `dismissNotification(id: string): void`
Dismiss a specific notification.

##### `getActiveNotifications(): ErrorNotification[]`
Get all active (non-dismissed) notifications.

##### `clearAllNotifications(): void`
Clear all notifications.

##### `destroy(): void`
Clean up resources.

### Types

#### ErrorNotification
```typescript
interface ErrorNotification {
  id: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  timestamp: Date;
  dismissed: boolean;
}
```

#### ErrorSeverity
```typescript
enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}
```

## Integration with Components

The Error Handling Service integrates with:

- **ConnectionStatus**: Displays connection state and errors
- **MicrophonePermissionPrompt**: Displays microphone permission errors
- **useWebSocketConnection**: Handles WebSocket connection errors
- **useMicrophonePermission**: Handles microphone permission errors

## Best Practices

1. **Always use the singleton**: Use `getErrorHandlingService()` to get the service instance
2. **Set up notification callback early**: Register the callback in your root component or early in the component lifecycle
3. **Clean up on unmount**: Clear notifications when components unmount
4. **Use appropriate error handlers**: Use specialized handlers (handleMicrophoneError, handleConnectionError) for better error messages
5. **Don't expose internal details**: The service automatically sanitizes error messages for users

## Example: Complete Error Handling Setup

See `ErrorHandlingExample.tsx` for a complete example of using the error handling service with connection status and microphone permission components.
