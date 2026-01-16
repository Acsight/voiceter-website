'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Session completion status
 */
export type CompletionStatus = 'completed' | 'terminated';

/**
 * Session summary interface
 */
export interface SessionSummary {
  completionStatus: CompletionStatus;
  totalQuestions: number;
  answeredQuestions: number;
  duration: number; // in seconds
  terminationMessage?: string;
}

/**
 * SessionComplete component props
 */
export interface SessionCompleteProps {
  summary: SessionSummary;
  onStartNewDemo?: () => void;
  onReturnToSelection?: () => void;
  className?: string;
}

/**
 * SessionComplete Component
 * 
 * Displays session completion screen with:
 * - Completion status (completed or terminated)
 * - Session summary (questions answered, duration)
 * - Appropriate messaging based on completion status
 * - Options to start new demo or return to selection
 * - Quota filled termination messages
 * 
 * Requirements: 31.1, 31.2, 31.3, 31.5
 */
const SessionComplete: React.FC<SessionCompleteProps> = ({
  summary,
  onStartNewDemo,
  onReturnToSelection,
  className = '',
}) => {
  const isCompleted = summary.completionStatus === 'completed';
  const isTerminated = summary.completionStatus === 'terminated';
  const completionPercentage = summary.totalQuestions > 0
    ? Math.round((summary.answeredQuestions / summary.totalQuestions) * 100)
    : 0;

  // Format duration
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes === 0) {
      return `${remainingSeconds}s`;
    }
    
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen bg-background p-6 ${className}`}>
      <div className="w-full max-w-2xl">
        {/* Completion Card */}
        <div className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
          {/* Header Section */}
          <div className={`px-8 py-12 text-center ${
            isCompleted 
              ? 'bg-gradient-to-br from-green-500/10 to-green-400/5 border-b border-green-500/20' 
              : 'bg-gradient-to-br from-yellow-500/10 to-yellow-400/5 border-b border-yellow-500/20'
          }`}>
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
                isCompleted 
                  ? 'bg-green-500/20 border-4 border-green-500/30' 
                  : 'bg-yellow-500/20 border-4 border-yellow-500/30'
              }`}>
                <Icon
                  name={isCompleted ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'}
                  size={48}
                  className={isCompleted ? 'text-green-500' : 'text-yellow-500'}
                  variant="solid"
                />
              </div>
            </div>

            {/* Title */}
            <h1 className={`text-3xl font-bold mb-3 ${
              isCompleted ? 'text-green-500' : 'text-yellow-600'
            }`}>
              {isCompleted ? 'Survey Complete!' : 'Survey Ended'}
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-text-secondary">
              {isCompleted 
                ? 'Thank you for completing the survey. Your responses have been recorded.'
                : summary.terminationMessage || 'The survey has been terminated.'}
            </p>
          </div>

          {/* Summary Section */}
          <div className="px-8 py-8">
            <h2 className="text-xl font-semibold text-foreground mb-6 text-center">
              Session Summary
            </h2>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Questions Answered */}
              <div className="flex flex-col items-center p-6 bg-secondary/5 border border-secondary/10 rounded-lg">
                <Icon name="ChatBubbleBottomCenterTextIcon" size={32} className="text-primary mb-3" variant="outline" />
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {summary.answeredQuestions}
                  </p>
                  <p className="text-sm text-text-secondary">
                    of {summary.totalQuestions} questions
                  </p>
                </div>
              </div>

              {/* Completion Percentage */}
              <div className="flex flex-col items-center p-6 bg-secondary/5 border border-secondary/10 rounded-lg">
                <Icon name="ChartBarIcon" size={32} className="text-primary mb-3" variant="outline" />
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {completionPercentage}%
                  </p>
                  <p className="text-sm text-text-secondary">
                    completed
                  </p>
                </div>
              </div>

              {/* Duration */}
              <div className="flex flex-col items-center p-6 bg-secondary/5 border border-secondary/10 rounded-lg">
                <Icon name="ClockIcon" size={32} className="text-primary mb-3" variant="outline" />
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {formatDuration(summary.duration)}
                  </p>
                  <p className="text-sm text-text-secondary">
                    duration
                  </p>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-text-secondary">
                  Progress
                </span>
                <span className="text-sm font-semibold text-primary">
                  {completionPercentage}%
                </span>
              </div>
              <div className="w-full h-3 bg-secondary/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isCompleted 
                      ? 'bg-gradient-to-r from-green-500 to-green-400' 
                      : 'bg-gradient-to-r from-yellow-500 to-yellow-400'
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>

            {/* Completion Message */}
            {isCompleted && (
              <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg mb-8">
                <div className="flex items-start space-x-3">
                  <Icon name="SparklesIcon" size={20} className="text-green-500 mt-0.5" variant="solid" />
                  <div className="flex-1">
                    <p className="text-sm text-foreground leading-relaxed">
                      Your feedback is valuable and will help improve our services. 
                      We appreciate you taking the time to share your thoughts with us.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Termination Message */}
            {isTerminated && summary.terminationMessage && (
              <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg mb-8">
                <div className="flex items-start space-x-3">
                  <Icon name="InformationCircleIcon" size={20} className="text-yellow-600 mt-0.5" variant="outline" />
                  <div className="flex-1">
                    <p className="text-sm text-foreground leading-relaxed">
                      {summary.terminationMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              {onStartNewDemo && (
                <button
                  onClick={onStartNewDemo}
                  className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
                >
                  <Icon name="ArrowPathIcon" size={20} className="text-primary-foreground" variant="outline" />
                  <span>Start New Demo</span>
                </button>
              )}

              {onReturnToSelection && (
                <button
                  onClick={onReturnToSelection}
                  className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-secondary/10 text-foreground border border-secondary/20 rounded-lg font-medium hover:bg-secondary/20 transition-colors focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 focus:ring-offset-card"
                >
                  <Icon name="ArrowLeftIcon" size={20} className="text-foreground" variant="outline" />
                  <span>Return to Selection</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-text-secondary">
            This was a demo survey powered by Voiceter AI
          </p>
        </div>
      </div>
    </div>
  );
};

export default SessionComplete;
