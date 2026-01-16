/**
 * Connection Status Component
 * 
 * Displays the current WebSocket connection state with visual indicators
 * and reconnection attempt information.
 */

'use client';

import React from 'react';
import { ConnectionState } from '@/services/websocket/WebSocketService';

/**
 * Connection status props
 */
export interface ConnectionStatusProps {
  connectionState: ConnectionState;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
  className?: string;
}

/**
 * Get status display information based on connection state
 */
function getStatusInfo(state: ConnectionState): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} {
  switch (state) {
    case ConnectionState.CONNECTED:
      return {
        label: 'Connected',
        color: 'text-success',
        bgColor: 'bg-success/10',
        icon: '●',
      };
    case ConnectionState.CONNECTING:
      return {
        label: 'Connecting',
        color: 'text-warning',
        bgColor: 'bg-warning/10',
        icon: '◐',
      };
    case ConnectionState.DISCONNECTED:
      return {
        label: 'Disconnected',
        color: 'text-text-secondary',
        bgColor: 'bg-muted',
        icon: '○',
      };
    case ConnectionState.ERROR:
      return {
        label: 'Connection Error',
        color: 'text-error',
        bgColor: 'bg-error/10',
        icon: '✕',
      };
    default:
      return {
        label: 'Unknown',
        color: 'text-text-secondary',
        bgColor: 'bg-muted',
        icon: '?',
      };
  }
}

/**
 * Connection Status Component
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connectionState,
  reconnectAttempt,
  maxReconnectAttempts = 3,
  className = '',
}) => {
  const statusInfo = getStatusInfo(connectionState);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${statusInfo.bgColor} ${statusInfo.color} ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Status icon with animation for connecting state */}
      <span
        className={`text-base ${
          connectionState === ConnectionState.CONNECTING ? 'animate-spin' : ''
        }`}
        aria-hidden="true"
      >
        {statusInfo.icon}
      </span>

      {/* Status label */}
      <span>{statusInfo.label}</span>

      {/* Reconnection attempt indicator */}
      {reconnectAttempt !== undefined && reconnectAttempt > 0 && (
        <span className="text-xs opacity-75">
          (Attempt {reconnectAttempt}/{maxReconnectAttempts})
        </span>
      )}
    </div>
  );
};

/**
 * Connection Status Banner Component
 * 
 * Full-width banner for displaying connection status prominently
 */

/***
 * Connection Status Export Code
 <div
      className={`w-full px-4 py-3 ${statusInfo.bgColor} border-b border-border ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`text-xl ${statusInfo.color} ${
              connectionState === ConnectionState.CONNECTING ? 'animate-spin' : ''
            }`}
            aria-hidden="true"
          >
            {statusInfo.icon}
          </span>

          <div>
            <p className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</p>
            {reconnectAttempt !== undefined && reconnectAttempt > 0 && (
              <p className="text-sm text-text-secondary">
                Reconnection attempt {reconnectAttempt} of {maxReconnectAttempts}
              </p>
            )}
            {connectionState === ConnectionState.ERROR &&
              reconnectAttempt === maxReconnectAttempts && (
                <p className="text-sm text-text-secondary">
                  Unable to reconnect automatically. Please try again manually.
                </p>
              )}
          </div>
        </div>

        {showRetryButton && onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg font-medium transition-smooth bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background"
            aria-label="Retry connection"
          >
            Retry Connection
          </button>
        )}
      </div>
    </div>
****/

export interface ConnectionStatusBannerProps {
  connectionState: ConnectionState;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
  onRetry?: () => void;
  className?: string;
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({
  connectionState,
  reconnectAttempt,
  maxReconnectAttempts = 3,
  onRetry,
  className = '',
}) => {
  // Only show banner for non-connected states
  if (connectionState === ConnectionState.CONNECTED) {
    return null;
  }

  const statusInfo = getStatusInfo(connectionState);
  const showRetryButton =
    connectionState === ConnectionState.ERROR ||
    (connectionState === ConnectionState.DISCONNECTED && onRetry);

  return (
    <div></div>
  );
};

export default ConnectionStatus;
