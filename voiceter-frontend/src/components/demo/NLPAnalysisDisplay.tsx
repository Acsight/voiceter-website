'use client';

import React, { useState } from 'react';
import type { NLPAnalysisResult, AnalyzedTopic, KeyPhrase } from '@/types/nlp';

interface NLPAnalysisDisplayProps {
  analysis: NLPAnalysisResult;
  className?: string;
}

interface TooltipData {
  topic: AnalyzedTopic;
  x: number;
  y: number;
}

/**
 * Format sentiment score as percentage (-100% to 100%)
 */
function formatSentimentScore(score: number): string {
  const percentage = Math.round(score * 100);
  return `${percentage > 0 ? '+' : ''}${percentage}%`;
}

/**
 * Get color class based on sentiment score
 */
function getSentimentColor(score: number): string {
  if (score > 0.3) return 'text-green-500';
  if (score > 0) return 'text-green-400';
  if (score < -0.3) return 'text-red-500';
  if (score < 0) return 'text-red-400';
  return 'text-yellow-500';
}

/**
 * Get background color class for highlighted phrases
 */
function getPhraseHighlightClass(sentiment: string): string {
  switch (sentiment) {
    case 'positive':
      return 'bg-green-200 dark:bg-green-900/50 hover:bg-green-300 dark:hover:bg-green-800/50';
    case 'negative':
      return 'bg-red-200 dark:bg-red-900/50 hover:bg-red-300 dark:hover:bg-red-800/50';
    case 'mixed':
      return 'bg-yellow-200 dark:bg-yellow-900/50 hover:bg-yellow-300 dark:hover:bg-yellow-800/50';
    default:
      return 'bg-blue-200 dark:bg-blue-900/50 hover:bg-blue-300 dark:hover:bg-blue-800/50';
  }
}

/**
 * Get emotion emoji
 */
function getEmotionEmoji(emotion: string): string {
  const emojiMap: Record<string, string> = {
    happy: '😊',
    satisfied: '😌',
    frustrated: '😤',
    angry: '😠',
    disappointed: '😞',
    neutral: '😐',
    excited: '🤩',
    confused: '😕',
  };
  return emojiMap[emotion.toLowerCase()] || '💭';
}


/**
 * Render text with highlighted key phrases
 * Handles overlapping phrases by merging them
 */
function HighlightedText({
  text,
  topics,
  onPhraseHover,
  onPhraseLeave,
}: {
  text: string;
  topics: AnalyzedTopic[];
  onPhraseHover: (topic: AnalyzedTopic, phrase: KeyPhrase, event: React.MouseEvent) => void;
  onPhraseLeave: () => void;
}) {
  // Collect all phrases with their topic info
  const allPhrases: { phrase: KeyPhrase; topic: AnalyzedTopic }[] = [];
  topics.forEach((topic) => {
    topic.key_phrases.forEach((phrase) => {
      // Only add valid phrases with proper positions
      if (phrase.start_char >= 0 && phrase.end_char > phrase.start_char && phrase.end_char <= text.length) {
        allPhrases.push({ phrase, topic });
      }
    });
  });

  // Sort by start position, then by length (longer first for overlaps)
  allPhrases.sort((a, b) => {
    if (a.phrase.start_char !== b.phrase.start_char) {
      return a.phrase.start_char - b.phrase.start_char;
    }
    // For same start, prefer longer phrases
    return (b.phrase.end_char - b.phrase.start_char) - (a.phrase.end_char - a.phrase.start_char);
  });

  // Remove overlapping phrases - keep only non-overlapping ones
  const nonOverlappingPhrases: { phrase: KeyPhrase; topic: AnalyzedTopic }[] = [];
  let lastEnd = -1;
  
  for (const item of allPhrases) {
    // Skip if this phrase overlaps with the previous one
    if (item.phrase.start_char < lastEnd) {
      continue;
    }
    nonOverlappingPhrases.push(item);
    lastEnd = item.phrase.end_char;
  }

  // Build segments
  const segments: React.ReactNode[] = [];
  let currentPos = 0;

  nonOverlappingPhrases.forEach(({ phrase, topic }, index) => {
    // Add text before this phrase
    if (phrase.start_char > currentPos) {
      segments.push(
        <span key={`text-${index}`}>{text.substring(currentPos, phrase.start_char)}</span>
      );
    }

    // Add highlighted phrase
    segments.push(
      <span
        key={`phrase-${index}`}
        className={`cursor-pointer rounded px-0.5 transition-colors ${getPhraseHighlightClass(topic.sentiment)}`}
        onMouseEnter={(e) => onPhraseHover(topic, phrase, e)}
        onMouseLeave={onPhraseLeave}
      >
        {text.substring(phrase.start_char, phrase.end_char)}
      </span>
    );

    currentPos = phrase.end_char;
  });

  // Add remaining text
  if (currentPos < text.length) {
    segments.push(<span key="text-end">{text.substring(currentPos)}</span>);
  }

  return <>{segments}</>;
}

/**
 * Tooltip component for phrase details
 */
function PhraseTooltip({ topic, x, y }: TooltipData) {
  return (
    <div
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-3 max-w-xs"
      style={{ left: x + 10, top: y + 10 }}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">{topic.topic}</span>
          <span className="text-lg">{getEmotionEmoji(topic.emotion)}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-text-secondary">Sentiment:</span>
            <span className={`ml-1 font-medium ${getSentimentColor(topic.topic_sentiment_score)}`}>
              {topic.sentiment} ({formatSentimentScore(topic.topic_sentiment_score)})
            </span>
          </div>
          <div>
            <span className="text-text-secondary">Intent:</span>
            <span className="ml-1 text-foreground capitalize">{topic.intent}</span>
          </div>
          <div>
            <span className="text-text-secondary">Emotion:</span>
            <span className="ml-1 text-foreground capitalize">{topic.emotion}</span>
          </div>
        </div>

        {topic.keywords.length > 0 && (
          <div>
            <span className="text-xs text-text-secondary">Keywords:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {topic.keywords.map((kw, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * NLP Analysis Display Component
 */
const NLPAnalysisDisplay: React.FC<NLPAnalysisDisplayProps> = ({ analysis, className = '' }) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const handlePhraseHover = (topic: AnalyzedTopic, _phrase: KeyPhrase, event: React.MouseEvent) => {
    setTooltip({
      topic,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handlePhraseLeave = () => {
    setTooltip(null);
  };

  const overallScore = analysis.overall_sentiment_score;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Overall Sentiment Score */}
      <div className="bg-background rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">Overall Sentiment Score</span>
          <span className={`text-2xl font-bold ${getSentimentColor(overallScore)}`}>
            {formatSentimentScore(overallScore)}
          </span>
        </div>
        <div className="relative h-3 bg-muted rounded-full overflow-hidden">
          {/* Background gradient from red to green */}
          <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 opacity-30" />
          {/* Score indicator */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-foreground rounded"
            style={{ left: `${((overallScore + 1) / 2) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-text-secondary mt-1">
          <span>-100%</span>
          <span>0%</span>
          <span>+100%</span>
        </div>
      </div>

      {/* Analyzed Text with Highlights */}
      <div className="bg-background rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-2">Analyzed Response</h4>
        <p className="text-sm text-foreground leading-relaxed">
          <HighlightedText
            text={analysis.original_text}
            topics={analysis.analyzed_topics}
            onPhraseHover={handlePhraseHover}
            onPhraseLeave={handlePhraseLeave}
          />
        </p>
        <p className="text-xs text-text-secondary mt-2 italic">
          Hover over highlighted phrases to see detailed analysis
        </p>
      </div>

      {/* Topics Summary */}
      {analysis.analyzed_topics.length > 0 && (
        <div className="bg-background rounded-lg p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">Detected Topics</h4>
          <div className="space-y-2">
            {analysis.analyzed_topics.map((topic, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-muted/50 rounded"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{getEmotionEmoji(topic.emotion)}</span>
                  <span className="text-sm font-medium text-foreground">{topic.topic}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded capitalize">
                    {topic.intent}
                  </span>
                  <span className={`text-sm font-medium ${getSentimentColor(topic.topic_sentiment_score)}`}>
                    {formatSentimentScore(topic.topic_sentiment_score)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && <PhraseTooltip {...tooltip} />}
    </div>
  );
};

export default NLPAnalysisDisplay;
