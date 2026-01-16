'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Progress information interface
 */
export interface ProgressInfo {
  current: number;
  total: number;
  percentage: number;
}

/**
 * ProgressIndicator component props
 */
export interface ProgressIndicatorProps {
  progress: ProgressInfo | null;
  className?: string;
}

/**
 * ProgressIndicator Component
 * 
 * Displays survey progress with:
 * - Current question number and total
 * - Percentage complete with progress bar
 * - Real-time updates as questions advance
 * - Visual feedback for completion
 * 
 * Requirements: 30.4, 30.5
 */
const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ progress, className = '' }) => {
  if (!progress) {
    return (
      <div className={`flex items-center justify-between bg-card rounded-lg border border-border shadow-sm px-6 py-4 ${className}`}>
        <div className="flex items-center space-x-3">
          <Icon name="ClockIcon" size={20} className="text-text-secondary" variant="outline" />
          <span className="text-sm text-text-secondary">Waiting to start...</span>
        </div>
      </div>
    );
  }

  const { current, total, percentage } = progress;
  const isComplete = current >= total;

  return (
    <div className={`bg-card rounded-lg border border-border shadow-sm ${className}`}>
      {/* Progress Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          {/* Question Counter */}
          <div className="flex items-center space-x-3">
            <Icon 
              name={isComplete ? "CheckCircleIcon" : "ChartBarIcon"} 
              size={20} 
              className={isComplete ? "text-green-500" : "text-primary"} 
              variant={isComplete ? "solid" : "outline"} 
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Question {current} of {total}
              </p>
              <p className="text-xs text-text-secondary">
                {isComplete ? 'Survey Complete!' : `${total - current} remaining`}
              </p>
            </div>
          </div>

          {/* Percentage Badge */}
          <div className="flex items-center space-x-2">
            <div className={`px-3 py-1 rounded-full ${
              isComplete 
                ? 'bg-green-500/10 border border-green-500/20' 
                : 'bg-primary/10 border border-primary/20'
            }`}>
              <span className={`text-sm font-semibold ${
                isComplete ? 'text-green-500' : 'text-primary'
              }`}>
                {Math.round(percentage)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4">
        <div className="relative">
          {/* Background Bar */}
          <div className="w-full h-3 bg-secondary/10 rounded-full overflow-hidden">
            {/* Progress Fill */}
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isComplete 
                  ? 'bg-gradient-to-r from-green-500 to-green-400' 
                  : 'bg-gradient-to-r from-primary to-primary/80'
              }`}
              style={{ width: `${percentage}%` }}
            >
              {/* Animated Shimmer Effect */}
              {!isComplete && percentage > 0 && (
                <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
              )}
            </div>
          </div>

          {/* Progress Markers */}
          {total > 1 && (
            <div className="absolute top-0 left-0 w-full h-3 flex justify-between px-1">
              {Array.from({ length: total - 1 }, (_, i) => {
                const markerPosition = ((i + 1) / total) * 100;
                const isPassed = percentage >= markerPosition;
                
                return (
                  <div
                    key={i}
                    className="relative"
                    style={{ left: `${markerPosition}%` }}
                  >
                    <div className={`w-1 h-3 rounded-full ${
                      isPassed ? 'bg-white/40' : 'bg-secondary/30'
                    }`}></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Progress Steps (for smaller surveys) */}
        {total <= 10 && (
          <div className="mt-4 flex items-center justify-between">
            {Array.from({ length: total }, (_, i) => {
              const questionNum = i + 1;
              const isActive = questionNum === current;
              const isCompleted = questionNum < current;
              const isFuture = questionNum > current;

              return (
                <div
                  key={i}
                  className="flex flex-col items-center space-y-1"
                  style={{ width: `${100 / total}%` }}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                      isCompleted
                        ? 'bg-primary text-primary-foreground scale-90'
                        : isActive
                        ? 'bg-primary text-primary-foreground scale-110 ring-2 ring-primary/30 ring-offset-2 ring-offset-card'
                        : 'bg-secondary/10 text-text-secondary scale-90'
                    }`}
                  >
                    {isCompleted ? (
                      <Icon name="CheckIcon" size={14} className="text-primary-foreground" variant="solid" />
                    ) : (
                      questionNum
                    )}
                  </div>
                  {total <= 5 && (
                    <span className={`text-xs ${
                      isActive ? 'text-primary font-medium' : 'text-text-secondary'
                    }`}>
                      Q{questionNum}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completion Message */}
      {isComplete && (
        <div className="px-6 py-4 border-t border-border bg-green-500/5">
          <div className="flex items-center space-x-2">
            <Icon name="SparklesIcon" size={16} className="text-green-500" variant="solid" />
            <p className="text-sm text-green-500 font-medium">
              Great job! You've completed all questions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;
