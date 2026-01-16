'use client';

import React, { useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Transcription message interface
 */
export interface TranscriptionMessage {
  id: string;
  role: 'user' | 'assistant';
  transcript: string;
  isFinal: boolean;
  timestamp: Date;
}

/**
 * TranscriptionView component props
 */
export interface TranscriptionViewProps {
  messages: TranscriptionMessage[];
  className?: string;
}

/**
 * TranscriptionView Component
 * 
 * Displays user and AI transcriptions in a conversation format with:
 * - Visual differentiation between user and AI messages
 * - Support for interim and final transcriptions
 * - Auto-scroll to latest message
 * - Responsive design
 * 
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5
 */
const TranscriptionView: React.FC<TranscriptionViewProps> = ({ messages, className = '' }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Auto-scroll to the latest message when messages update
   * Requirement: 29.5 - Implement auto-scroll to latest message
   */
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full overflow-y-auto bg-card rounded-lg border border-border shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center space-x-2">
          <Icon name="ChatBubbleLeftRightIcon" size={20} className="text-primary" variant="outline" />
          <h3 className="text-lg font-semibold text-foreground">Conversation</h3>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Icon name="MicrophoneIcon" size={48} className="text-text-secondary mb-4" variant="outline" />
            <p className="text-text-secondary text-sm">
              Start speaking to begin the conversation
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <TranscriptionMessage key={message.id} message={message} />
          ))
        )}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

/**
 * Format timestamp for display
 */
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * Individual transcription message component
 * 
 * Requirements: 29.1, 29.2, 29.3, 29.4
 */
interface TranscriptionMessageProps {
  message: TranscriptionMessage;
}

const TranscriptionMessage: React.FC<TranscriptionMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary/10 text-foreground border border-secondary/20'
        } ${!message.isFinal ? 'opacity-70 italic' : ''}`}
      >
        {/* Message Header */}
        <div className="flex items-center space-x-2 mb-1">
          <Icon
            name={isUser ? 'UserIcon' : 'SparklesIcon'}
            size={16}
            className={isUser ? 'text-primary-foreground' : 'text-secondary'}
            variant={isUser ? 'solid' : 'outline'}
          />
          <span
            className={`text-xs font-medium ${
              isUser ? 'text-primary-foreground/80' : 'text-text-secondary'
            }`}
          >
            {isUser ? 'You' : 'AI Assistant'}
          </span>
          {!message.isFinal && (
            <span
              className={`text-xs ${
                isUser ? 'text-primary-foreground/60' : 'text-text-secondary/60'
              }`}
            >
              (interim)
            </span>
          )}
        </div>

        {/* Message Content */}
        <p
          className={`text-sm leading-relaxed ${
            isUser ? 'text-primary-foreground' : 'text-foreground'
          }`}
        >
          {message.transcript}
        </p>

        {/* Timestamp (only for final messages) */}
        {message.isFinal && (
          <div className="mt-2 text-xs opacity-60">
            {formatTime(message.timestamp)}
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptionView;
