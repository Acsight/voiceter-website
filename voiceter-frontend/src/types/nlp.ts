/**
 * NLP Analysis Types
 * 
 * Types for NLP analysis results from Bedrock.
 */

/**
 * Key phrase with position information
 */
export interface KeyPhrase {
  phrase: string;
  start_char: number;
  end_char: number;
}

/**
 * Analyzed topic from NLP
 */
export interface AnalyzedTopic {
  topic: string;
  sentiment: string;
  topic_sentiment_score: number;
  intent: string;
  emotion: string;
  keywords: string[];
  key_phrases: KeyPhrase[];
}

/**
 * NLP Analysis Result
 */
export interface NLPAnalysisResult {
  overall_sentiment_score: number;
  analyzed_topics: AnalyzedTopic[];
  original_text: string;
  questionId: string;
  questionnaireId: string;
}

/**
 * Recorded response with optional NLP analysis
 */
export interface RecordedResponseWithNLP {
  qid: string;
  question: string;
  answer: string;
  nlpAnalysis?: NLPAnalysisResult;
}
