/**
 * Error Handling Service
 * 
 * Manages error events from WebSocket, maps error codes to user-friendly messages,
 * and provides error notification functionality.
 */

import { ErrorData } from '../websocket/WebSocketService';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Error notification interface
 */
export interface ErrorNotification {
  id: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  timestamp: Date;
  dismissed: boolean;
}

/**
 * Error notification callback type
 */
export type ErrorNotificationCallback = (notification: ErrorNotification) => void;

/**
 * Error code to user-friendly message mapping
 */
const ERROR_MESSAGES: Record<string, { message: string; severity: ErrorSeverity }> = {
  // WebSocket errors
  WS_CONNECTION_FAILED: {
    message: 'Unable to connect to the server. Please check your internet connection and try again.',
    severity: ErrorSeverity.ERROR,
  },
  WS_MESSAGE_INVALID: {
    message: 'An error occurred while communicating with the server. Please try again.',
    severity: ErrorSeverity.WARNING,
  },
  
  // Bedrock errors
  BEDROCK_INIT_FAILED: {
    message: 'Failed to initialize the AI voice system. Please try again later.',
    severity: ErrorSeverity.ERROR,
  },
  BEDROCK_STREAM_ERROR: {
    message: 'An error occurred during the voice conversation. Please try again.',
    severity: ErrorSeverity.ERROR,
  },
  
  // Bedrock-specific error types (Requirements: 9.3, 9.4, 9.6)
  MODEL_STREAM_ERROR: {
    message: 'The AI voice system encountered an error. Please restart the conversation.',
    severity: ErrorSeverity.ERROR,
  },
  INTERNAL_SERVER_ERROR: {
    message: 'A temporary server error occurred. Please wait a moment and try again.',
    severity: ErrorSeverity.ERROR,
  },
  CONNECTION_FAILED: {
    message: 'Unable to connect to the AI voice system. Please check your connection and try again.',
    severity: ErrorSeverity.ERROR,
  },
  CONNECTION_TIMEOUT: {
    message: 'Connection timed out. Please check your internet connection and try again.',
    severity: ErrorSeverity.ERROR,
  },
  URL_EXPIRED: {
    message: 'Your session has expired. Please start a new conversation.',
    severity: ErrorSeverity.ERROR,
  },
  WEBSOCKET_CLOSED: {
    message: 'Connection was lost. Attempting to reconnect...',
    severity: ErrorSeverity.WARNING,
  },
  MAX_RECONNECT_EXCEEDED: {
    message: 'Unable to reconnect after multiple attempts. Please start a new session.',
    severity: ErrorSeverity.ERROR,
  },
  
  // Database errors
  DB_WRITE_FAILED: {
    message: 'Failed to save your response. Your progress may not be saved.',
    severity: ErrorSeverity.WARNING,
  },
  
  // Audio errors
  AUDIO_PROCESSING_ERROR: {
    message: 'An error occurred while processing audio. Please check your microphone.',
    severity: ErrorSeverity.WARNING,
  },
  
  // Questionnaire errors
  QUESTIONNAIRE_LOGIC_ERROR: {
    message: 'An error occurred in the survey logic. Continuing with the next question.',
    severity: ErrorSeverity.WARNING,
  },
  
  // Tool execution errors
  TOOL_EXECUTION_ERROR: {
    message: 'An error occurred while processing your response. Please try again.',
    severity: ErrorSeverity.WARNING,
  },
  
  // Session errors
  SESSION_EXPIRED: {
    message: 'Your session has expired. Please start a new demo.',
    severity: ErrorSeverity.ERROR,
  },
  
  // Quota errors
  QUOTA_FILLED: {
    message: 'Thank you for your interest! This demographic quota has been filled.',
    severity: ErrorSeverity.INFO,
  },
  
  // Internal errors
  INTERNAL_ERROR: {
    message: 'An unexpected error occurred. Please try again later.',
    severity: ErrorSeverity.CRITICAL,
  },
  
  // Default error
  UNKNOWN_ERROR: {
    message: 'An error occurred. Please try again.',
    severity: ErrorSeverity.ERROR,
  },
};

/**
 * Error Handling Service Class
 * 
 * Provides error handling, message mapping, and notification management
 * for the application.
 */
export class ErrorHandlingService {
  private notifications: Map<string, ErrorNotification> = new Map();
  private notificationCallback: ErrorNotificationCallback | null = null;
  private notificationIdCounter = 0;

  /**
   * Set notification callback
   */
  public onNotification(callback: ErrorNotificationCallback): void {
    this.notificationCallback = callback;
  }

  /**
   * Handle error from WebSocket
   */
  public handleWebSocketError(errorData: ErrorData): void {
    const notification = this.createNotification(
      errorData.errorCode,
      errorData.errorMessage,
      errorData.recoverable
    );

    this.addNotification(notification);
  }

  /**
   * Handle microphone permission error
   */
  public handleMicrophoneError(error: Error): void {
    let message = 'Unable to access your microphone. ';
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      message += 'Please grant microphone permission in your browser settings and try again.';
    } else if (error.name === 'NotFoundError') {
      message += 'No microphone was found. Please connect a microphone and try again.';
    } else if (error.name === 'NotReadableError') {
      message += 'Your microphone is already in use by another application.';
    } else {
      message += 'Please check your microphone settings and try again.';
    }

    const notification: ErrorNotification = {
      id: this.generateNotificationId(),
      code: 'MICROPHONE_ERROR',
      message,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      timestamp: new Date(),
      dismissed: false,
    };

    this.addNotification(notification);
  }

  /**
   * Handle connection error
   */
  public handleConnectionError(error: Error): void {
    const notification: ErrorNotification = {
      id: this.generateNotificationId(),
      code: 'CONNECTION_ERROR',
      message: 'Connection lost. Attempting to reconnect...',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      timestamp: new Date(),
      dismissed: false,
    };

    this.addNotification(notification);
  }

  /**
   * Handle audio playback error
   */
  public handleAudioPlaybackError(error: Error): void {
    const notification: ErrorNotification = {
      id: this.generateNotificationId(),
      code: 'AUDIO_PLAYBACK_ERROR',
      message: 'Unable to play audio. Please check your speakers or headphones.',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      timestamp: new Date(),
      dismissed: false,
    };

    this.addNotification(notification);
  }

  /**
   * Handle Bedrock error events
   * Requirements: 9.3, 9.4, 9.6 - Handle modelStreamErrorException and internalServerException
   */
  public handleBedrockError(
    errorType: string,
    message: string,
    recoverable: boolean,
    sessionId?: string
  ): void {
    // Map error type to error code
    const errorCode = errorType.toUpperCase().replace(/EXCEPTION$/, '').replace(/ERROR$/, '_ERROR');
    
    const notification = this.createNotification(
      errorCode,
      message,
      recoverable
    );

    this.addNotification(notification);

    // Log for backend forwarding (will be handled by caller)
    console.error('ErrorHandlingService: Bedrock error', {
      errorType,
      message,
      recoverable,
      sessionId,
      notificationId: notification.id,
    });
  }

  /**
   * Handle reconnection attempt notification
   * Requirements: 9.1, 9.2
   */
  public handleReconnectionAttempt(attempt: number, maxAttempts: number): void {
    // Dismiss any previous reconnection notifications
    this.dismissNotificationsByCode('RECONNECTING');

    const notification: ErrorNotification = {
      id: this.generateNotificationId(),
      code: 'RECONNECTING',
      message: `Connection lost. Reconnecting... (attempt ${attempt}/${maxAttempts})`,
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      timestamp: new Date(),
      dismissed: false,
    };

    this.addNotification(notification);
  }

  /**
   * Handle reconnection success
   */
  public handleReconnectionSuccess(): void {
    // Dismiss reconnection notifications
    this.dismissNotificationsByCode('RECONNECTING');
    this.dismissNotificationsByCode('CONNECTION_ERROR');

    const notification: ErrorNotification = {
      id: this.generateNotificationId(),
      code: 'RECONNECTED',
      message: 'Connection restored successfully.',
      severity: ErrorSeverity.INFO,
      recoverable: true,
      timestamp: new Date(),
      dismissed: false,
    };

    this.addNotification(notification);
  }

  /**
   * Handle reconnection failure
   * Requirements: 9.2
   */
  public handleReconnectionFailure(): void {
    // Dismiss reconnection notifications
    this.dismissNotificationsByCode('RECONNECTING');

    const notification: ErrorNotification = {
      id: this.generateNotificationId(),
      code: 'MAX_RECONNECT_EXCEEDED',
      message: 'Unable to reconnect after multiple attempts. Please start a new session.',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      timestamp: new Date(),
      dismissed: false,
    };

    this.addNotification(notification);
  }

  /**
   * Dismiss notifications by error code
   */
  private dismissNotificationsByCode(code: string): void {
    const idsToRemove: string[] = [];
    this.notifications.forEach((notification, id) => {
      if (notification.code === code && !notification.dismissed) {
        idsToRemove.push(id);
      }
    });
    idsToRemove.forEach(id => this.dismissNotification(id));
  }

  /**
   * Handle generic error
   */
  public handleError(error: Error, code: string = 'UNKNOWN_ERROR'): void {
    const notification = this.createNotification(code, error.message, false);
    this.addNotification(notification);
  }

  /**
   * Create error notification from error code
   */
  private createNotification(
    code: string,
    fallbackMessage: string,
    recoverable: boolean
  ): ErrorNotification {
    const errorInfo = ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN_ERROR;

    return {
      id: this.generateNotificationId(),
      code,
      message: errorInfo.message || fallbackMessage,
      severity: errorInfo.severity,
      recoverable,
      timestamp: new Date(),
      dismissed: false,
    };
  }

  /**
   * Add notification and trigger callback
   */
  private addNotification(notification: ErrorNotification): void {
    this.notifications.set(notification.id, notification);

    if (this.notificationCallback) {
      this.notificationCallback(notification);
    }

    // Auto-dismiss info notifications after 5 seconds
    if (notification.severity === ErrorSeverity.INFO) {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, 5000);
    }
  }

  /**
   * Dismiss notification
   */
  public dismissNotification(id: string): void {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.dismissed = true;
      this.notifications.delete(id);
    }
  }

  /**
   * Get all active notifications
   */
  public getActiveNotifications(): ErrorNotification[] {
    return Array.from(this.notifications.values()).filter((n) => !n.dismissed);
  }

  /**
   * Clear all notifications
   */
  public clearAllNotifications(): void {
    this.notifications.clear();
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    this.notificationIdCounter++;
    return `notification-${Date.now()}-${this.notificationIdCounter}`;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.notifications.clear();
    this.notificationCallback = null;
  }
}

/**
 * Create a singleton instance of the error handling service
 */
let errorHandlingServiceInstance: ErrorHandlingService | null = null;

export function getErrorHandlingService(): ErrorHandlingService {
  if (!errorHandlingServiceInstance) {
    errorHandlingServiceInstance = new ErrorHandlingService();
  }
  return errorHandlingServiceInstance;
}

export function resetErrorHandlingService(): void {
  if (errorHandlingServiceInstance) {
    errorHandlingServiceInstance.destroy();
    errorHandlingServiceInstance = null;
  }
}
