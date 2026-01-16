/**
 * Bedrock NLP Service
 * 
 * Analyzes open-ended survey responses using Amazon Bedrock Prompt Management.
 * Extracts sentiment, topics, intents, emotions, and key phrases.
 * 
 * Prompt ARN: arn:aws:bedrock:us-east-1:119764646179:prompt/PEE5V0ZZQH
 * Version: 1
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentClient, GetPromptCommand } from '@aws-sdk/client-bedrock-agent';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

/**
 * Bedrock Prompt Management Configuration
 */
const NLP_PROMPT_ARN = process.env.NLP_PROMPT_ARN || 'arn:aws:bedrock:us-east-1:119764646179:prompt/PEE5V0ZZQH';
const NLP_PROMPT_VERSION = process.env.NLP_PROMPT_VERSION || '1';

/**
 * Model ID for NLP analysis - Amazon Nova Lite (fallback)
 */
const NLP_MODEL_ID = process.env.NLP_MODEL_ID || 'amazon.nova-lite-v1:0';

/**
 * Questionnaire to topic file mapping (base filename without language suffix)
 */
const QUESTIONNAIRE_TOPIC_FILE_MAP: Record<string, string> = {
  'demo-01a-electronics-retail-personalized': 'Retail_Electronics_Topics',
  'demo-02-concept-test': 'ConceptTest_Topics',
  'demo-03-political-polling': 'Political_polling_Topics',
  'demo-04-brand-tracker': 'Brand_Tracker_Topics',
  'demo-01b-ecommerce-delivery-personalized': 'MarketPlace_Topics',
  'demo-01c-automotive-service-personalized': 'Automotive_Aftersales_Topics',
};

/**
 * Industry mapping for questionnaires
 * Maps questionnaire IDs to industry names for AWS Bedrock Prompt Management
 * 
 * Industry values (must match Bedrock Prompt parameters):
 * - "Automotive AfterSales": Automotive service surveys
 * - "Brand Tracker": Brand tracking surveys
 * - "Concept Test": Concept testing surveys
 * - "E-Commerce": E-commerce/marketplace surveys
 * - "Retail Electronics": Electronics retail surveys
 * - "Politician": Political polling surveys
 */
const QUESTIONNAIRE_INDUSTRY_MAP: Record<string, string> = {
  'demo-01a-electronics-retail-personalized': 'Retail Electronics',
  'demo-02-concept-test': 'Concept Test',
  'demo-03-political-polling': 'Politician',
  'demo-04-brand-tracker': 'Brand Tracker',
  'demo-01b-ecommerce-delivery-personalized': 'E-Commerce',
  'demo-01c-automotive-service-personalized': 'Automotive AfterSales',
};

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

// Topic cache - keyed by questionnaireId:language
const topicCache: Map<string, any[]> = new Map();

/**
 * Load topics for a questionnaire with language support
 * 
 * @param questionnaireId - The questionnaire ID
 * @param language - Language code (EN, TR, etc.) - defaults to EN
 */
function loadTopicsForQuestionnaire(questionnaireId: string, language: string = 'EN'): any[] {
  const cacheKey = `${questionnaireId}:${language}`;
  
  // Check cache first
  if (topicCache.has(cacheKey)) {
    return topicCache.get(cacheKey)!;
  }

  const baseTopicFile = QUESTIONNAIRE_TOPIC_FILE_MAP[questionnaireId];
  if (!baseTopicFile) {
    logger.warn('No topic file mapping for questionnaire', { questionnaireId });
    return [];
  }

  // Build the topic file path based on language
  // EN: key_topics/EN/Retail_Electronics_Topics.json
  // TR: key_topics/TR/Retail_Electronics_Topics_TR.json
  const langUpper = language.toUpperCase();
  let topicFile: string;
  
  if (langUpper === 'EN') {
    topicFile = `${baseTopicFile}.json`;
  } else {
    topicFile = `${baseTopicFile}_${langUpper}.json`;
  }

  try {
    const topicPath = join(__dirname, '../../key_topics', langUpper, topicFile);
    logger.debug('Loading topics from path', { topicPath, questionnaireId, language: langUpper });
    
    const content = readFileSync(topicPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Handle different JSON structures (array vs object with nested array)
    let topics: any[];
    if (Array.isArray(parsed)) {
      topics = parsed;
    } else {
      // Get the first array value from the object
      const keys = Object.keys(parsed);
      topics = keys.length > 0 ? parsed[keys[0]] : [];
    }

    topicCache.set(cacheKey, topics);
    logger.info('Loaded topics for questionnaire', { 
      questionnaireId, 
      language: langUpper,
      topicFile, 
      topicCount: topics.length 
    });
    return topics;
  } catch (error) {
    // If language-specific file not found, fall back to English
    if (langUpper !== 'EN') {
      logger.warn('Language-specific topics not found, falling back to English', { 
        questionnaireId, 
        language: langUpper,
        topicFile,
        error: error instanceof Error ? error.message : String(error) 
      });
      return loadTopicsForQuestionnaire(questionnaireId, 'EN');
    }
    
    logger.error('Failed to load topics', { 
      questionnaireId, 
      language: langUpper,
      topicFile, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return [];
  }
}

/**
 * Get industry for a questionnaire
 */
export function getIndustryForQuestionnaire(questionnaireId: string): string {
  return QUESTIONNAIRE_INDUSTRY_MAP[questionnaireId] || 'General';
}

// Bedrock client singletons
let bedrockRuntimeClient: BedrockRuntimeClient | null = null;
let bedrockAgentClient: BedrockAgentClient | null = null;

/**
 * Get or create Bedrock Runtime client (for Converse API)
 */
function getBedrockRuntimeClient(): BedrockRuntimeClient {
  if (!bedrockRuntimeClient) {
    bedrockRuntimeClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return bedrockRuntimeClient;
}

/**
 * Get or create Bedrock Agent client (for Prompt Management)
 */
function getBedrockAgentClient(): BedrockAgentClient {
  if (!bedrockAgentClient) {
    bedrockAgentClient = new BedrockAgentClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return bedrockAgentClient;
}

/**
 * Analyze open-ended response using Bedrock Prompt Management
 * 
 * Uses the managed prompt with variables:
 * - customer_feedback: The open-ended answer text
 * - industry: Industry type based on questionnaire
 * - key_topics: JSON array of topics from key_topics folder
 * 
 * @param customerFeedback - The open-ended answer text
 * @param questionnaireId - The questionnaire ID
 * @param questionId - The question ID
 * @param language - Language code (EN, TR, etc.) - defaults to EN
 * @returns NLP analysis result
 */
export async function analyzeOpenEndedResponse(
  customerFeedback: string,
  questionnaireId: string,
  questionId: string,
  language: string = 'EN'
): Promise<NLPAnalysisResult | null> {
  const industry = getIndustryForQuestionnaire(questionnaireId);
  const topics = loadTopicsForQuestionnaire(questionnaireId, language);
  
  logger.info('Starting NLP analysis with Bedrock Prompt Management', {
    questionnaireId,
    questionId,
    language,
    industry,
    feedbackLength: customerFeedback.length,
    feedbackText: customerFeedback,
    topicCount: topics.length,
    promptArn: NLP_PROMPT_ARN,
    promptVersion: NLP_PROMPT_VERSION,
  });

  // Skip analysis for very short responses
  if (customerFeedback.trim().length < 10) {
    logger.info('Skipping NLP for short response', { questionId, length: customerFeedback.length });
    return createFallbackResult(customerFeedback, questionId, questionnaireId, topics);
  }

  // Use Bedrock Prompt Management
  return analyzeWithPromptManagement(customerFeedback, questionnaireId, questionId, industry, topics, language);
}

/**
 * Analyze feedback using Bedrock Prompt Management
 * Retrieves the managed prompt and invokes it with variables
 * 
 * @param customerFeedback - The open-ended answer text
 * @param questionnaireId - The questionnaire ID
 * @param questionId - The question ID
 * @param industry - Industry type based on questionnaire
 * @param topics - Topic list for analysis
 * @param language - Language code (EN, TR, etc.)
 */
async function analyzeWithPromptManagement(
  customerFeedback: string,
  questionnaireId: string,
  questionId: string,
  industry: string,
  topics: any[],
  language: string = 'EN'
): Promise<NLPAnalysisResult | null> {
  const startTime = Date.now();
  logger.info('Using Bedrock Prompt Management for NLP analysis', { 
    questionId, 
    promptArn: NLP_PROMPT_ARN,
    promptVersion: NLP_PROMPT_VERSION,
    feedbackLength: customerFeedback.length,
  });

  try {
    const runtimeClient = getBedrockRuntimeClient();
    const agentClient = getBedrockAgentClient();
    
    // Build key_topics as JSON string
    const keyTopicsJson = JSON.stringify(topics.map(t => ({
      topic_name: t.topic_name,
      description: t.description
    })));

    // Get the prompt template from Bedrock Prompt Management
    const promptId = NLP_PROMPT_ARN.split('/').pop() || 'PEE5V0ZZQH';
    
    logger.info('Fetching prompt from Bedrock Prompt Management', {
      promptId,
      version: NLP_PROMPT_VERSION,
    });

    const getPromptCommand = new GetPromptCommand({
      promptIdentifier: promptId,
      promptVersion: NLP_PROMPT_VERSION,
    });

    const promptResponse = await agentClient.send(getPromptCommand);
    
    // Extract the prompt template
    const promptVariant = promptResponse.variants?.[0];
    if (!promptVariant || !promptVariant.templateConfiguration) {
      logger.error('No prompt variant found', { promptId });
      return analyzeWithDirectModel(customerFeedback, questionnaireId, questionId, industry, topics, language);
    }

    // Get the template text
    let promptTemplate = '';
    const templateConfig = promptVariant.templateConfiguration;
    
    if ('text' in templateConfig && templateConfig.text?.text) {
      promptTemplate = templateConfig.text.text;
    } else if ('chat' in templateConfig && templateConfig.chat?.messages) {
      // For chat templates, concatenate messages
      promptTemplate = templateConfig.chat.messages
        .map((m: any) => m.content?.map((c: any) => c.text).join('') || '')
        .join('\n');
    }

    if (!promptTemplate) {
      logger.error('Could not extract prompt template', { promptId });
      return analyzeWithDirectModel(customerFeedback, questionnaireId, questionId, industry, topics, language);
    }

    // Replace variables in the prompt template
    // Variables are in format {{variable_name}}
    let resolvedPrompt = promptTemplate
      .replace(/\{\{customer_feedback\}\}/g, customerFeedback)
      .replace(/\{\{industry\}\}/g, industry)
      .replace(/\{\{key_topics\}\}/g, keyTopicsJson);

    logger.info('Prompt resolved with variables', {
      questionId,
      promptLength: resolvedPrompt.length,
      industry,
      topicCount: topics.length,
    });

    // Get the model ID from the prompt variant or use default
    const modelId = promptVariant.modelId || NLP_MODEL_ID;

    // Invoke the model with the resolved prompt using Converse API
    const command = new ConverseCommand({
      modelId: modelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: resolvedPrompt,
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 10000,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const response = await runtimeClient.send(command);
    
    // Extract text from Converse API response
    const responseText = response.output?.message?.content?.[0]?.text || '';
    
    logger.info('NLP Response Received from Prompt Management', {
      questionId,
      responseLength: responseText.length,
      durationMs: Date.now() - startTime,
      stopReason: response.stopReason,
      modelId,
    });
    
    if (!responseText) {
      logger.warn('Empty response from model', { questionnaireId, questionId });
      return createFallbackResult(customerFeedback, questionId, questionnaireId, topics);
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('No JSON found in response', { questionnaireId, questionId, responsePreview: responseText.substring(0, 200) });
      return createFallbackResult(customerFeedback, questionId, questionnaireId, topics);
    }

    const nlpResult = JSON.parse(jsonMatch[0]);
    
    logger.info('Raw NLP result from Prompt Management', {
      questionId,
      overallScore: nlpResult.overall_sentiment_score,
      topicCount: nlpResult.analyzed_topics?.length || 0,
      topics: nlpResult.analyzed_topics?.map((t: any) => t.topic),
    });
    
    // Convert overall_sentiment_score from -1 to 1 range to -100 to 100 percentage
    if (nlpResult.overall_sentiment_score !== undefined) {
      nlpResult.overall_sentiment_score = Math.round(nlpResult.overall_sentiment_score * 100);
    }
    
    // Also convert topic sentiment scores
    if (nlpResult.analyzed_topics) {
      nlpResult.analyzed_topics = nlpResult.analyzed_topics.map((topic: any) => ({
        ...topic,
        topic_sentiment_score: topic.topic_sentiment_score !== undefined 
          ? Math.round(topic.topic_sentiment_score * 100) 
          : 0,
      }));
    }
    
    const validatedResult = validateAndFixKeyPhrases(nlpResult, customerFeedback);

    const duration = Date.now() - startTime;
    logger.info('NLP analysis completed via Prompt Management', {
      questionnaireId,
      questionId,
      duration,
      overallScore: validatedResult.overall_sentiment_score,
      topicCount: validatedResult.analyzed_topics?.length || 0,
      topics: validatedResult.analyzed_topics?.map((t: AnalyzedTopic) => ({
        topic: t.topic,
        sentiment: t.sentiment,
        score: t.topic_sentiment_score,
      })),
    });

    return {
      ...validatedResult,
      original_text: customerFeedback,
      questionId,
      questionnaireId,
    };
  } catch (error) {
    logger.error('NLP analysis with Prompt Management failed, falling back to direct model', {
      questionnaireId,
      questionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Fallback to direct model invocation
    return analyzeWithDirectModel(customerFeedback, questionnaireId, questionId, industry, topics, language);
  }
}

/**
 * Analyze feedback using Bedrock Converse API with Nova Lite
 * Uses the same prompt structure as the Bedrock Prompt Management prompt
 * 
 * @param customerFeedback - The open-ended answer text
 * @param questionnaireId - The questionnaire ID
 * @param questionId - The question ID
 * @param industry - Industry type based on questionnaire
 * @param topics - Topic list for analysis
 * @param language - Language code (EN, TR, etc.)
 */
async function analyzeWithDirectModel(
  customerFeedback: string,
  questionnaireId: string,
  questionId: string,
  industry: string,
  topics: any[],
  language: string = 'EN'
): Promise<NLPAnalysisResult | null> {
  const startTime = Date.now();
  logger.info('Using Bedrock Converse API for NLP analysis', { 
    questionId, 
    model: NLP_MODEL_ID,
    feedbackLength: customerFeedback.length,
    language,
  });

  try {
    const client = getBedrockRuntimeClient();
    
    // Build topic list in JSON format (matching Bedrock Prompt Management)
    const topicList = JSON.stringify(topics.map(t => ({
      topic_name: t.topic_name,
      description: t.description
    })), null, 2);

    // Use the EXACT prompt structure from Bedrock Prompt Management
    const prompt = `## Customer Feedback Analysis Task

### Input
${customerFeedback}

## Objective
You are an expert feedback analyzer for a company in the ${industry} sector. Your task is to perform a comprehensive analysis of customer feedback using predefined topics, identifying sentiment, intent, emotions, and extracting key linguistic elements.

## Analysis Framework

### Predefined Topics
${topicList}

## Analysis Requirements

### 1. Overall Sentiment Score
Provide a sentiment score between -1 and 1 for the whole text

### 2. Topic Detection
Identify which of the predefined topics the feedback relates to. Multiple topics may be detected if relevant.

### 3. For Each Detected Topic, Perform:

#### 3.1 Sentiment Analysis
Classify the sentiment as exactly one of:
- Positive
- Negative
- Neutral

Provide a sentiment score for the detected topic between -1 and 1

#### 3.2 Intent Classification
Identify the customer's primary intent as exactly one of:
- No Intent
- Complaint
- Churn
- Gratefulness
- Information/Process Request
- Suggestion

#### 3.3 Emotion Detection
Identify the dominant emotion as exactly one of:
- Happy: Positive feelings of joy and satisfaction
- Surprised: Unexpected positive or negative outcomes
- Trust: Confidence in the reliability and integrity of the brand
- Excited: High level of enthusiasm and eagerness
- Disappointed: Mild dissatisfaction due to unmet expectations
- Frustrated: Annoyance or irritation caused by obstacles or poor service
- Angry: Strong negative emotion triggered by injustice, obstruction, and unmet expectations
- Sad: Feeling of sorrow or unhappiness related to negative experiences
- Anxious: Feelings of worry or unease about potential issues
- Neutral: Objective feedback without emotional content

#### 3.4 Linguistic Element Extraction
- Extract relevant keywords that capture the essence of the feedback
- Identify key phrases that represent important statements or opinions
- For each key phrase, determine the exact start and end character positions (including spaces)
- Maintain the original language of the feedback in all extractions

## Output Format
Provide the analysis as a JSON object with the following structure:
\`\`\`json
{"overall_sentiment_score": 0.7, "analyzed_topics": [ { "topic": "topic_name", "sentiment": "detected_sentiment", "topic_sentiment_score": -0.9, "intent": "detected_intent", "emotion": "detected_emotion", "keywords": ["keyword1", "keyword2", "keyword3"], "key_phrases": [ { "phrase": "extracted_phrase", "start_char": start_position, "end_char": end_position} ] } ] }
\`\`\`

Return only the JSON output without any additional explanation or commentary.`;

    // Log request details
    logger.info('NLP Request Payload', {
      questionId,
      model: NLP_MODEL_ID,
      customerFeedback,
      industry,
      topicCount: topics.length,
      promptLength: prompt.length,
    });

    // Use Converse API for Nova Lite
    const command = new ConverseCommand({
      modelId: NLP_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: prompt,
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 10000,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const response = await client.send(command);
    
    // Extract text from Converse API response
    const responseText = response.output?.message?.content?.[0]?.text || '';
    
    logger.info('NLP Response Received', {
      questionId,
      responseLength: responseText.length,
      durationMs: Date.now() - startTime,
      stopReason: response.stopReason,
    });
    
    if (!responseText) {
      logger.warn('Empty response from model', { questionnaireId, questionId });
      return createFallbackResult(customerFeedback, questionId, questionnaireId, topics);
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('No JSON found in response', { questionnaireId, questionId, responsePreview: responseText.substring(0, 200) });
      return createFallbackResult(customerFeedback, questionId, questionnaireId, topics);
    }

    const nlpResult = JSON.parse(jsonMatch[0]);
    
    logger.info('Raw NLP result from model', {
      questionId,
      overallScore: nlpResult.overall_sentiment_score,
      topicCount: nlpResult.analyzed_topics?.length || 0,
      topics: nlpResult.analyzed_topics?.map((t: any) => t.topic),
    });
    
    const validatedResult = validateAndFixKeyPhrases(nlpResult, customerFeedback);

    const duration = Date.now() - startTime;
    logger.info('NLP analysis completed', {
      questionnaireId,
      questionId,
      duration,
      overallScore: validatedResult.overall_sentiment_score,
      topicCount: validatedResult.analyzed_topics?.length || 0,
      topics: validatedResult.analyzed_topics?.map((t: AnalyzedTopic) => ({
        topic: t.topic,
        sentiment: t.sentiment,
        score: t.topic_sentiment_score,
      })),
    });

    return {
      ...validatedResult,
      original_text: customerFeedback,
      questionId,
      questionnaireId,
    };
  } catch (error) {
    logger.error('NLP analysis failed', {
      questionnaireId,
      questionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return createFallbackResult(customerFeedback, questionId, questionnaireId, topics);
  }
}

/**
 * Validate and fix key phrase positions in NLP result
 * Only modifies positions if they are incorrect - preserves correct positions from the model
 */
function validateAndFixKeyPhrases(nlpResult: any, customerFeedback: string): any {
  if (!nlpResult.analyzed_topics) {
    return nlpResult;
  }

  nlpResult.analyzed_topics = nlpResult.analyzed_topics.map((topic: AnalyzedTopic) => {
    if (topic.key_phrases) {
      topic.key_phrases = topic.key_phrases.map((kp: KeyPhrase) => {
        // First, verify if the provided positions are correct
        const providedPhrase = customerFeedback.substring(kp.start_char, kp.end_char);
        if (providedPhrase.toLowerCase() === kp.phrase.toLowerCase()) {
          // Positions are correct, use the actual text from the feedback
          return {
            phrase: providedPhrase,
            start_char: kp.start_char,
            end_char: kp.end_char,
          };
        }
        
        // Positions are incorrect, try to find the actual position (case-insensitive)
        const lowerFeedback = customerFeedback.toLowerCase();
        const lowerPhrase = kp.phrase.toLowerCase();
        const actualStart = lowerFeedback.indexOf(lowerPhrase);
        
        if (actualStart >= 0) {
          return {
            phrase: customerFeedback.substring(actualStart, actualStart + kp.phrase.length),
            start_char: actualStart,
            end_char: actualStart + kp.phrase.length,
          };
        }
        
        // If exact match not found, try to find a partial match using key words
        const words = kp.phrase.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        for (const word of words) {
          const wordStart = lowerFeedback.indexOf(word);
          if (wordStart >= 0) {
            // Find a reasonable phrase around this word (sentence or clause)
            // Look for sentence boundaries
            let sentenceStart = lowerFeedback.lastIndexOf('.', wordStart);
            sentenceStart = sentenceStart >= 0 ? sentenceStart + 1 : 0;
            
            // Also check for clause boundaries
            const commaPos = lowerFeedback.lastIndexOf(',', wordStart);
            if (commaPos > sentenceStart) sentenceStart = commaPos + 1;
            
            let sentenceEnd = lowerFeedback.indexOf('.', wordStart);
            if (sentenceEnd < 0) sentenceEnd = customerFeedback.length;
            
            // Also check for next clause
            const nextComma = lowerFeedback.indexOf(',', wordStart);
            if (nextComma > 0 && nextComma < sentenceEnd) sentenceEnd = nextComma;
            
            const phrase = customerFeedback.substring(sentenceStart, sentenceEnd).trim();
            const trimmedStart = customerFeedback.indexOf(phrase);
            
            return {
              phrase: phrase.substring(0, Math.min(80, phrase.length)),
              start_char: trimmedStart >= 0 ? trimmedStart : sentenceStart,
              end_char: trimmedStart >= 0 ? trimmedStart + Math.min(80, phrase.length) : sentenceStart + Math.min(80, phrase.length),
            };
          }
        }
        return null; // Mark for removal
      }).filter((kp: KeyPhrase | null): kp is KeyPhrase => kp !== null);
    }
    return topic;
  }).filter((_topic: AnalyzedTopic) => {
    // Keep topics even if they have no key phrases (the topic detection is still valuable)
    return true;
  });

  return nlpResult;
}

/**
 * Create a fallback result when NLP fails
 * Uses enhanced keyword-based analysis with strict topic matching
 */
function createFallbackResult(
  customerFeedback: string,
  questionId: string,
  questionnaireId: string,
  topics: any[]
): NLPAnalysisResult {
  const lowerText = customerFeedback.toLowerCase();
  
  // Split feedback into clauses for better analysis
  const clauses = customerFeedback.split(/[,;]|\s+but\s+|\s+however\s+|\s+although\s+|\s+while\s+/i)
    .map(c => c.trim())
    .filter(c => c.length > 5);
  
  // Enhanced sentiment word lists with weights
  const sentimentWords = {
    veryPositive: ['excellent', 'amazing', 'fantastic', 'outstanding', 'wonderful', 'perfect', 'love', 'best'],
    positive: ['good', 'great', 'nice', 'happy', 'satisfied', 'helpful', 'friendly', 'quick', 'easy', 'recommend', 'knowledgeable', 'competitive'],
    negative: ['bad', 'poor', 'slow', 'difficult', 'problem', 'issue', 'disappointed', 'frustrated', 'confusing', 'complicated', 'longer', 'long'],
    veryNegative: ['terrible', 'horrible', 'awful', 'worst', 'hate', 'angry', 'unacceptable', 'ridiculous'],
  };

  // Topic keyword mapping for strict matching
  const topicKeywords: Record<string, string[]> = {
    'Staff / Friendliness': ['staff', 'friendly', 'helpful', 'polite', 'rude', 'attitude'],
    'Staff / Product Knowledge': ['knowledgeable', 'knowledge', 'explain', 'recommend'],
    'Product / Availability': ['product', 'available', 'stock', 'out of stock'],
    'Product / Condition & Authenticity': ['quality', 'condition', 'authentic', 'original'],
    'Price / Pricing & Promotions': ['price', 'pricing', 'competitive', 'expensive', 'cheap', 'value'],
    'Price / Comparison': ['compared', 'competitor', 'other retailers', 'other stores'],
    'Address Delivery': ['delivery', 'shipping', 'delivered', 'arrive', 'arrived'],
    'Return and Exchange Policy': ['return', 'exchange', 'refund', 'return process'],
    'Checkout / Speed & Efficiency': ['checkout', 'wait', 'waiting', 'queue', 'line'],
    'Store / Cleanliness & Ambience': ['store', 'clean', 'environment', 'atmosphere'],
    'Overall Satisfaction': ['overall', 'experience', 'satisfied', 'satisfaction'],
  };

  // Match topics based on explicit keyword presence
  const matchedTopics: AnalyzedTopic[] = [];
  const usedClauses = new Set<number>();
  
  for (const topic of topics) {
    const topicName = topic.topic_name || '';
    const keywords = topicKeywords[topicName] || [];
    
    // Also extract keywords from topic name and description
    const topicNameWords = topicName.toLowerCase().split(/[\s\/]+/).filter((w: string) => w.length > 3);
    const descWords = (topic.description || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
    const allKeywords = [...keywords, ...topicNameWords, ...descWords.slice(0, 3)];
    
    // Find clauses that match this topic
    let matchedClauseIndex = -1;
    let matchedKeyword = '';
    
    for (let i = 0; i < clauses.length; i++) {
      if (usedClauses.has(i)) continue;
      const clauseLower = clauses[i].toLowerCase();
      
      for (const kw of allKeywords) {
        if (clauseLower.includes(kw)) {
          matchedClauseIndex = i;
          matchedKeyword = kw;
          break;
        }
      }
      if (matchedClauseIndex >= 0) break;
    }
    
    if (matchedClauseIndex >= 0) {
      usedClauses.add(matchedClauseIndex);
      const matchedClause = clauses[matchedClauseIndex];
      const clauseLower = matchedClause.toLowerCase();
      
      // Calculate sentiment for this specific clause
      let clauseScore = 0;
      const clauseKeywords: string[] = [];
      
      sentimentWords.veryPositive.forEach(word => {
        if (clauseLower.includes(word)) { clauseScore += 0.5; clauseKeywords.push(word); }
      });
      sentimentWords.positive.forEach(word => {
        if (clauseLower.includes(word)) { clauseScore += 0.3; clauseKeywords.push(word); }
      });
      sentimentWords.negative.forEach(word => {
        if (clauseLower.includes(word)) { clauseScore -= 0.3; clauseKeywords.push(word); }
      });
      sentimentWords.veryNegative.forEach(word => {
        if (clauseLower.includes(word)) { clauseScore -= 0.5; clauseKeywords.push(word); }
      });
      
      // Clamp score
      clauseScore = Math.max(-1, Math.min(1, clauseScore));
      
      // Find the position of the matched clause in the original text
      const startIdx = customerFeedback.toLowerCase().indexOf(matchedClause.toLowerCase());
      
      // Convert to percentage (-100 to 100)
      const percentageScore = Math.round(clauseScore * 100);
      
      matchedTopics.push({
        topic: topicName,
        sentiment: clauseScore > 0.1 ? 'Positive' : clauseScore < -0.1 ? 'Negative' : 'Neutral',
        topic_sentiment_score: percentageScore,
        intent: clauseScore < -0.1 ? 'Complaint' : clauseScore > 0.1 ? 'Gratefulness' : 'Information/Process Request',
        emotion: clauseScore > 0.3 ? 'Happy' : clauseScore < -0.3 ? 'Disappointed' : 'Neutral',
        keywords: [matchedKeyword, ...clauseKeywords].slice(0, 4),
        key_phrases: startIdx >= 0 ? [{
          phrase: matchedClause.substring(0, Math.min(60, matchedClause.length)),
          start_char: startIdx,
          end_char: startIdx + Math.min(60, matchedClause.length),
        }] : [],
      });
    }
  }

  // Calculate overall score as weighted average
  let overallScore = 0;
  if (matchedTopics.length > 0) {
    overallScore = matchedTopics.reduce((sum, t) => sum + t.topic_sentiment_score, 0) / matchedTopics.length;
  } else {
    // No topics matched - calculate from whole text (in decimal first)
    let decimalScore = 0;
    sentimentWords.veryPositive.forEach(word => {
      if (lowerText.includes(word)) decimalScore += 0.4;
    });
    sentimentWords.positive.forEach(word => {
      if (lowerText.includes(word)) decimalScore += 0.2;
    });
    sentimentWords.negative.forEach(word => {
      if (lowerText.includes(word)) decimalScore -= 0.2;
    });
    sentimentWords.veryNegative.forEach(word => {
      if (lowerText.includes(word)) decimalScore -= 0.4;
    });
    decimalScore = Math.max(-1, Math.min(1, decimalScore));
    overallScore = Math.round(decimalScore * 100);
    
    // Create a general feedback topic
    matchedTopics.push({
      topic: 'Overall Satisfaction',
      sentiment: decimalScore > 0.1 ? 'Positive' : decimalScore < -0.1 ? 'Negative' : 'Neutral',
      topic_sentiment_score: overallScore,
      intent: decimalScore < -0.1 ? 'Complaint' : decimalScore > 0.1 ? 'Gratefulness' : 'Information/Process Request',
      emotion: decimalScore > 0.3 ? 'Happy' : decimalScore < -0.3 ? 'Disappointed' : 'Neutral',
      keywords: [],
      key_phrases: [{
        phrase: customerFeedback.substring(0, Math.min(60, customerFeedback.length)),
        start_char: 0,
        end_char: Math.min(60, customerFeedback.length),
      }],
    });
  }

  return {
    overall_sentiment_score: Math.round(overallScore),
    analyzed_topics: matchedTopics,
    original_text: customerFeedback,
    questionId,
    questionnaireId,
  };
}
