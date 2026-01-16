/**
 * NLP Module
 * 
 * Exports NLP analysis functionality using Amazon Bedrock.
 */

export {
  analyzeOpenEndedResponse,
  getIndustryForQuestionnaire,
  type NLPAnalysisResult,
  type AnalyzedTopic,
  type KeyPhrase,
} from './bedrock-nlp-service';

export {
  extractSurveyAnswers,
  surveyOutputService,
  type SurveyAnswer,
  type SurveyOutputResult,
  type TranscriptEntry,
} from './survey-output-service';
