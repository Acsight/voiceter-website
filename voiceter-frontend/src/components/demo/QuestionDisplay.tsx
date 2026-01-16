'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Question types supported by the system
 */
export type QuestionType =
  | 'voice_prompt'
  | 'single_choice'
  | 'multiple_choice'
  | 'rating_scale'
  | 'nps'
  | 'yes_no'
  | 'open_ended';

/**
 * Option interface for choice questions
 */
export interface QuestionOption {
  optionId: string;
  optionText: string;
  optionValue: string;
}

/**
 * Question configuration interface
 */
export interface QuestionConfiguration {
  randomizeChoices?: boolean;
  addOtherOption?: boolean;
  addNoneOption?: boolean;
  scaleType?: '5_point' | 'nps';
  scaleRange?: { min: number; max: number };
  minValueDescription?: string;
  maxValueDescription?: string;
  sentimentDetectionEnabled?: boolean;
  maxResponseLength?: number;
  allowMultipleSelections?: boolean;
  minSelections?: number;
  maxSelections?: number;
}

/**
 * Question interface
 */
export interface Question {
  questionId: string;
  questionNumber: number;
  questionType: QuestionType;
  questionText: string;
  isRequired: boolean;
  options?: QuestionOption[];
  configuration: QuestionConfiguration;
  agentNotes?: string;
}

/**
 * QuestionDisplay component props
 */
export interface QuestionDisplayProps {
  question: Question | null;
  className?: string;
}

/**
 * QuestionDisplay Component
 * 
 * Displays the current survey question with:
 * - Prominent question text display
 * - Question options for choice questions
 * - Rating scales for rating questions
 * - Agent notes if available
 * - Dynamic question text updates
 * 
 * Requirements: 30.2, 30.3, 30.6, 30.7
 */
const QuestionDisplay: React.FC<QuestionDisplayProps> = ({ question, className = '' }) => {
  if (!question) {
    return (
      <div className={`flex flex-col items-center justify-center h-full bg-card rounded-lg border border-border shadow-sm p-8 ${className}`}>
        <Icon name="QuestionMarkCircleIcon" size={48} className="text-text-secondary mb-4" variant="outline" />
        <p className="text-text-secondary text-sm text-center">
          Waiting for question...
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-card rounded-lg border border-border shadow-sm ${className}`}>
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center space-x-2">
          <Icon name="ChatBubbleBottomCenterTextIcon" size={20} className="text-primary" variant="outline" />
          <h3 className="text-lg font-semibold text-foreground">Current Question</h3>
        </div>
      </div>

      {/* Question Content */}
      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Question Text */}
        <div className="space-y-2">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">Q{question.questionNumber}</span>
            </div>
            <div className="flex-1">
              <p className="text-lg font-medium text-foreground leading-relaxed">
                {question.questionText}
              </p>
              {question.isRequired && (
                <span className="inline-block mt-2 text-xs text-text-secondary">
                  * Required
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Question Type Specific Content */}
        {renderQuestionTypeContent(question)}

        {/* Agent Notes */}
        {question.agentNotes && (
          <div className="mt-6 p-4 bg-secondary/5 border border-secondary/20 rounded-lg">
            <div className="flex items-start space-x-2">
              <Icon name="InformationCircleIcon" size={16} className="text-secondary mt-0.5" variant="outline" />
              <div className="flex-1">
                <p className="text-xs font-medium text-secondary mb-1">Agent Notes</p>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {question.agentNotes}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Render question type specific content
 * Requirements: 30.3
 */
function renderQuestionTypeContent(question: Question): React.ReactNode {
  switch (question.questionType) {
    case 'single_choice':
    case 'multiple_choice':
      return renderChoiceOptions(question);
    
    case 'rating_scale':
    case 'nps':
      return renderRatingScale(question);
    
    case 'yes_no':
      return renderYesNoOptions(question);
    
    case 'open_ended':
      return renderOpenEndedHint(question);
    
    case 'voice_prompt':
      return renderVoicePromptHint();
    
    default:
      return null;
  }
}

/**
 * Render choice options for single/multiple choice questions
 * Requirements: 30.3
 */
function renderChoiceOptions(question: Question): React.ReactNode {
  if (!question.options || question.options.length === 0) {
    return null;
  }

  const isMultiple = question.questionType === 'multiple_choice';

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-secondary">
        {isMultiple ? 'Select all that apply:' : 'Select one:'}
      </p>
      <div className="space-y-2">
        {question.options.map((option, index) => (
          <div
            key={option.optionId}
            className="flex items-start space-x-3 p-3 bg-secondary/5 border border-secondary/10 rounded-lg hover:border-secondary/30 transition-colors"
          >
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-medium text-primary">
                {String.fromCharCode(65 + index)}
              </span>
            </div>
            <p className="flex-1 text-sm text-foreground">
              {option.optionText}
            </p>
          </div>
        ))}
      </div>
      {isMultiple && question.configuration.minSelections && question.configuration.maxSelections && (
        <p className="text-xs text-text-secondary italic">
          Select between {question.configuration.minSelections} and {question.configuration.maxSelections} options
        </p>
      )}
    </div>
  );
}

/**
 * Render rating scale for rating/NPS questions
 * Requirements: 30.3
 */
function renderRatingScale(question: Question): React.ReactNode {
  const isNPS = question.questionType === 'nps';
  const config = question.configuration;
  
  const min = isNPS ? 0 : (config.scaleRange?.min ?? 1);
  const max = isNPS ? 10 : (config.scaleRange?.max ?? 5);
  
  const minLabel = isNPS ? 'Not at all likely' : (config.minValueDescription || 'Low');
  const maxLabel = isNPS ? 'Extremely likely' : (config.maxValueDescription || 'High');

  const scaleValues = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-text-secondary">
        {isNPS ? 'Rate from 0 (Not at all likely) to 10 (Extremely likely):' : 'Select a rating:'}
      </p>
      
      {/* Scale */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center justify-between space-x-2">
          {scaleValues.map((value) => (
            <div
              key={value}
              className="flex-1 flex flex-col items-center space-y-1"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition-colors">
                <span className="text-sm font-semibold text-primary">{value}</span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Labels */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">{minLabel}</span>
          <span className="text-xs text-text-secondary">{maxLabel}</span>
        </div>
      </div>

      {isNPS && (
        <div className="flex items-center space-x-4 text-xs text-text-secondary">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/40"></div>
            <span>0-6: Detractors</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-sm bg-yellow-500/20 border border-yellow-500/40"></div>
            <span>7-8: Passives</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-sm bg-green-500/20 border border-green-500/40"></div>
            <span>9-10: Promoters</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Render yes/no options
 * Requirements: 30.3
 */
function renderYesNoOptions(question: Question): React.ReactNode {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-secondary">
        Select your answer:
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-center p-4 bg-green-500/10 border border-green-500/20 rounded-lg hover:border-green-500/40 transition-colors">
          <Icon name="CheckCircleIcon" size={20} className="text-green-500 mr-2" variant="solid" />
          <span className="text-sm font-medium text-foreground">Yes</span>
        </div>
        <div className="flex items-center justify-center p-4 bg-red-500/10 border border-red-500/20 rounded-lg hover:border-red-500/40 transition-colors">
          <Icon name="XCircleIcon" size={20} className="text-red-500 mr-2" variant="solid" />
          <span className="text-sm font-medium text-foreground">No</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Render hint for open-ended questions
 * Requirements: 30.3
 */
function renderOpenEndedHint(question: Question): React.ReactNode {
  const maxLength = question.configuration.maxResponseLength;
  
  return (
    <div className="p-4 bg-secondary/5 border border-secondary/20 rounded-lg">
      <div className="flex items-start space-x-2">
        <Icon name="MicrophoneIcon" size={16} className="text-secondary mt-0.5" variant="outline" />
        <div className="flex-1">
          <p className="text-sm text-text-secondary">
            Please speak your answer. The AI will listen and record your response.
          </p>
          {maxLength && (
            <p className="text-xs text-text-secondary mt-1">
              Maximum response length: {maxLength} characters
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Render hint for voice prompt questions
 * Requirements: 30.3
 */
function renderVoicePromptHint(): React.ReactNode {
  return (
    <div className="p-4 bg-secondary/5 border border-secondary/20 rounded-lg">
      <div className="flex items-start space-x-2">
        <Icon name="SpeakerWaveIcon" size={16} className="text-secondary mt-0.5" variant="outline" />
        <div className="flex-1">
          <p className="text-sm text-text-secondary">
            Listen to the AI's message. No response is required for this prompt.
          </p>
        </div>
      </div>
    </div>
  );
}

export default QuestionDisplay;
