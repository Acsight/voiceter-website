/**
 * Microphone Permission Prompt Component
 * 
 * Displays instructions and controls for handling microphone permission errors.
 */

'use client';

import React from 'react';

/**
 * Microphone permission error types
 */
export enum MicrophoneErrorType {
  NOT_ALLOWED = 'not_allowed',
  NOT_FOUND = 'not_found',
  NOT_READABLE = 'not_readable',
  UNKNOWN = 'unknown',
}

/**
 * Microphone permission prompt props
 */
export interface MicrophonePermissionPromptProps {
  errorType: MicrophoneErrorType;
  onRetry: () => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * Get error information based on error type
 */
function getErrorInfo(errorType: MicrophoneErrorType): {
  title: string;
  message: string;
  instructions: string[];
  icon: string;
} {
  switch (errorType) {
    case MicrophoneErrorType.NOT_ALLOWED:
      return {
        title: 'Microphone Access Denied',
        message: 'We need access to your microphone to conduct the voice survey.',
        instructions: [
          'Click the lock icon in your browser\'s address bar',
          'Find "Microphone" in the permissions list',
          'Change the setting to "Allow"',
          'Click the "Try Again" button below',
        ],
        icon: '🎤',
      };
    case MicrophoneErrorType.NOT_FOUND:
      return {
        title: 'No Microphone Found',
        message: 'We couldn\'t detect a microphone on your device.',
        instructions: [
          'Connect a microphone to your device',
          'Make sure your microphone is properly plugged in',
          'Check that your microphone is enabled in system settings',
          'Click the "Try Again" button below',
        ],
        icon: '🔍',
      };
    case MicrophoneErrorType.NOT_READABLE:
      return {
        title: 'Microphone In Use',
        message: 'Your microphone is currently being used by another application.',
        instructions: [
          'Close other applications that might be using your microphone',
          'Check for video conferencing apps (Zoom, Teams, etc.)',
          'Restart your browser if the issue persists',
          'Click the "Try Again" button below',
        ],
        icon: '⚠️',
      };
    default:
      return {
        title: 'Microphone Error',
        message: 'We encountered an error while trying to access your microphone.',
        instructions: [
          'Check that your microphone is connected and working',
          'Try refreshing the page',
          'Make sure no other application is using your microphone',
          'Click the "Try Again" button below',
        ],
        icon: '❌',
      };
  }
}

/**
 * Microphone Permission Prompt Component
 */
export const MicrophonePermissionPrompt: React.FC<MicrophonePermissionPromptProps> = ({
  errorType,
  onRetry,
  onCancel,
  className = '',
}) => {
  const errorInfo = getErrorInfo(errorType);

  return (
    <div
      className={`bg-card border border-border rounded-xl shadow-card p-6 max-w-md mx-auto ${className}`}
      role="alert"
      aria-live="assertive"
    >
      {/* Icon */}
      <div className="text-center mb-4">
        <span className="text-6xl" aria-hidden="true">
          {errorInfo.icon}
        </span>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-foreground text-center mb-2">
        {errorInfo.title}
      </h2>

      {/* Message */}
      <p className="text-text-secondary text-center mb-6">{errorInfo.message}</p>

      {/* Instructions */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-foreground mb-3">How to fix this:</h3>
        <ol className="space-y-2">
          {errorInfo.instructions.map((instruction, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="font-semibold text-primary flex-shrink-0">
                {index + 1}.
              </span>
              <span>{instruction}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="flex-1 bg-gradient-cta text-primary-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
          aria-label="Try again to access microphone"
        >
          Try Again
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 bg-muted text-foreground px-6 py-3 rounded-lg font-medium hover:bg-muted/80 transition-smooth focus:outline-none focus:ring-2 focus:ring-border focus:ring-offset-2 focus:ring-offset-background"
            aria-label="Cancel and go back"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Additional help */}
      <div className="mt-4 text-center">
        <p className="text-xs text-text-secondary">
          Still having trouble?{' '}
          <a
            href="#"
            className="text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              // Could open a help modal or link to support
            }}
          >
            Get help
          </a>
        </p>
      </div>
    </div>
  );
};

/**
 * Microphone Permission Banner Component
 * 
 * Compact banner for displaying microphone permission errors
 */
export interface MicrophonePermissionBannerProps {
  errorType: MicrophoneErrorType;
  onRetry: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const MicrophonePermissionBanner: React.FC<MicrophonePermissionBannerProps> = ({
  errorType,
  onRetry,
  onDismiss,
  className = '',
}) => {
  const errorInfo = getErrorInfo(errorType);

  return (
    <div
      className={`bg-error/10 border-l-4 border-error p-4 ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          {/* Icon */}
          <span className="text-2xl flex-shrink-0" aria-hidden="true">
            {errorInfo.icon}
          </span>

          {/* Content */}
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-1">{errorInfo.title}</h3>
            <p className="text-sm text-text-secondary mb-2">{errorInfo.message}</p>
            <button
              onClick={onRetry}
              className="text-sm font-medium text-primary hover:text-primary/80 underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded"
            >
              Try Again
            </button>
          </div>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-text-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded p-1"
            aria-label="Dismiss"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Helper function to determine error type from error object
 */
export function getMicrophoneErrorType(error: Error): MicrophoneErrorType {
  const errorName = error.name.toLowerCase();

  if (errorName.includes('notallowed') || errorName.includes('permissiondenied')) {
    return MicrophoneErrorType.NOT_ALLOWED;
  } else if (errorName.includes('notfound')) {
    return MicrophoneErrorType.NOT_FOUND;
  } else if (errorName.includes('notreadable')) {
    return MicrophoneErrorType.NOT_READABLE;
  } else {
    return MicrophoneErrorType.UNKNOWN;
  }
}

export default MicrophonePermissionPrompt;
