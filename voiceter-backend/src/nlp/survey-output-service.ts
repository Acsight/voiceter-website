/**
 * Survey Output Service
 * 
 * Extracts structured survey answers from conversation transcripts using
 * AWS Bedrock Prompt Management.
 * 
 * Prompt Name: Survey_Output
 * Version: 2
 * Version ARN: arn:aws:bedrock:us-east-1:119764646179:prompt/MEXXGH0O6B:2
 * 
 * Parameters:
 * - questionnaire: The questionnaire JSON used for the survey
 * - transcript: All conversation transcripts as JSON object
 * 
 * This service is called when a session completes to extract clean,
 * structured survey responses from the conversation.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentClient, GetPromptCommand } from '@aws-sdk/client-bedrock-agent';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

/**
 * Bedrock Prompt Management Configuration for Survey Output
 */
const SURVEY_OUTPUT_PROMPT_ARN = process.env.SURVEY_OUTPUT_PROMPT_ARN || 'arn:aws:bedrock:us-east-1:119764646179:prompt/MEXXGH0O6B';
const SURVEY_OUTPUT_PROMPT_VERSION = process.env.SURVEY_OUTPUT_PROMPT_VERSION || '2';

/**
 * Model ID for Survey Output extraction (fallback)
 */
const SURVEY_OUTPUT_MODEL_ID = process.env.SURVEY_OUTPUT_MODEL_ID || 'amazon.nova-lite-v1:0';

/**
 * Survey Answer extracted from transcript
 */
export interface SurveyAnswer {
  questionId: string;
  questionNumber?: number;
  questionText: string;
  answer: string;
  answerType?: string;
  confidence?: number;
  rawUserResponse?: string;
}

/**
 * Survey Output Result
 */
export interface SurveyOutputResult {
  sessionId: string;
  questionnaireId: string;
  answers: SurveyAnswer[];
  extractedAt: string;
  promptVersion: string;
  processingTimeMs: number;
}

/**
 * Transcript entry for processing
 */
export interface TranscriptEntry {
  role: 'USER' | 'ASSISTANT' | 'user' | 'assistant';
  content: string;
  timestamp?: number | string;
  isFinal?: boolean;
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
 * Extract survey answers from conversation transcripts using Bedrock Prompt Management
 * 
 * @param sessionId - The session ID
 * @param questionnaireId - The questionnaire ID
 * @param questionnaire - The questionnaire JSON object
 * @param transcripts - Array of conversation transcripts
 * @returns Survey output result with extracted answers
 */
export async function extractSurveyAnswers(
  sessionId: string,
  questionnaireId: string,
  questionnaire: any,
  transcripts: TranscriptEntry[]
): Promise<SurveyOutputResult | null> {
  const startTime = Date.now();

  logger.info('Starting survey answer extraction with Bedrock Prompt Management', {
    sessionId,
    questionnaireId,
    promptArn: SURVEY_OUTPUT_PROMPT_ARN,
    promptVersion: SURVEY_OUTPUT_PROMPT_VERSION,
    transcriptCount: transcripts.length,
  });

  // Skip if no transcripts
  if (!transcripts || transcripts.length === 0) {
    logger.warn('No transcripts to process for survey extraction', { sessionId });
    return null;
  }

  try {
    // Try Prompt Management first, fall back to direct model if it fails
    const result = await extractWithPromptManagement(
      sessionId,
      questionnaireId,
      questionnaire,
      transcripts
    );

    const processingTime = Date.now() - startTime;
    
    if (result) {
      result.processingTimeMs = processingTime;
      logger.info('Survey answer extraction completed', {
        sessionId,
        questionnaireId,
        answerCount: result.answers.length,
        processingTimeMs: processingTime,
      });
    }

    return result;
  } catch (error) {
    logger.error('Survey answer extraction failed', {
      sessionId,
      questionnaireId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}


/**
 * Extract survey answers using Bedrock Prompt Management
 * Retrieves the managed prompt and invokes it with variables
 */
async function extractWithPromptManagement(
  sessionId: string,
  questionnaireId: string,
  questionnaire: any,
  transcripts: TranscriptEntry[]
): Promise<SurveyOutputResult | null> {
  const startTime = Date.now();

  logger.info('Using Bedrock Prompt Management for survey extraction', {
    sessionId,
    promptArn: SURVEY_OUTPUT_PROMPT_ARN,
    promptVersion: SURVEY_OUTPUT_PROMPT_VERSION,
  });

  try {
    const runtimeClient = getBedrockRuntimeClient();
    const agentClient = getBedrockAgentClient();

    // Format questionnaire as JSON string
    const questionnaireJson = JSON.stringify(questionnaire, null, 2);

    // Format transcripts as JSON string
    const transcriptJson = JSON.stringify(
      transcripts.map((t, index) => ({
        turn: index + 1,
        role: t.role.toUpperCase(),
        content: t.content,
        timestamp: t.timestamp,
      })),
      null,
      2
    );

    // Get the prompt template from Bedrock Prompt Management
    const promptId = SURVEY_OUTPUT_PROMPT_ARN.split('/').pop() || 'MEXXGH0O6B';

    logger.info('Fetching Survey_Output prompt from Bedrock Prompt Management', {
      sessionId,
      promptId,
      version: SURVEY_OUTPUT_PROMPT_VERSION,
    });

    const getPromptCommand = new GetPromptCommand({
      promptIdentifier: promptId,
      promptVersion: SURVEY_OUTPUT_PROMPT_VERSION,
    });

    const promptResponse = await agentClient.send(getPromptCommand);

    // Extract the prompt template
    const promptVariant = promptResponse.variants?.[0];
    if (!promptVariant || !promptVariant.templateConfiguration) {
      logger.error('No prompt variant found for Survey_Output', { promptId, sessionId });
      return extractWithDirectModel(sessionId, questionnaireId, questionnaire, transcripts);
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
      logger.error('Could not extract prompt template for Survey_Output', { promptId, sessionId });
      return extractWithDirectModel(sessionId, questionnaireId, questionnaire, transcripts);
    }

    // Replace variables in the prompt template
    // Variables are in format {{variable_name}}
    let resolvedPrompt = promptTemplate
      .replace(/\{\{questionnaire\}\}/g, questionnaireJson)
      .replace(/\{\{transcript\}\}/g, transcriptJson);

    /*
    logger.info('Survey_Output prompt resolved with variables', {
      sessionId,
      promptLength: resolvedPrompt.length,
      questionnaireLength: questionnaireJson.length,
      transcriptLength: transcriptJson.length,
    });
    */

    // Get the model ID from the prompt variant or use default
    const modelId = promptVariant.modelId || SURVEY_OUTPUT_MODEL_ID;

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
        temperature: 0.3, // Lower temperature for more deterministic extraction
        topP: 0.9,
      },
    });

    const response = await runtimeClient.send(command);

    // Extract text from Converse API response
    const responseText = response.output?.message?.content?.[0]?.text || '';

    logger.info('Survey_Output response received from Prompt Management', {
      sessionId,
      responseLength: responseText.length,
      durationMs: Date.now() - startTime,
      stopReason: response.stopReason,
      modelId,
    });

    if (!responseText) {
      logger.warn('Empty response from Survey_Output model', { sessionId, questionnaireId });
      return null;
    }

    // Parse the JSON response
    return parseExtractedAnswers(sessionId, questionnaireId, responseText);
  } catch (error) {
    logger.error('Survey extraction with Prompt Management failed, falling back to direct model', {
      sessionId,
      questionnaireId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Fallback to direct model invocation
    return extractWithDirectModel(sessionId, questionnaireId, questionnaire, transcripts);
  }
}


/**
 * Extract survey answers using direct model invocation (fallback)
 * Uses the same prompt structure as the Bedrock Prompt Management prompt
 */
async function extractWithDirectModel(
  sessionId: string,
  questionnaireId: string,
  questionnaire: any,
  transcripts: TranscriptEntry[]
): Promise<SurveyOutputResult | null> {
  const startTime = Date.now();

  logger.info('Using Bedrock Converse API for survey extraction (fallback)', {
    sessionId,
    model: SURVEY_OUTPUT_MODEL_ID,
  });

  try {
    const client = getBedrockRuntimeClient();

    // Format questionnaire as JSON string
    const questionnaireJson = JSON.stringify(questionnaire, null, 2);

    // Format transcripts as JSON string
    const transcriptJson = JSON.stringify(
      transcripts.map((t, index) => ({
        turn: index + 1,
        role: t.role.toUpperCase(),
        content: t.content,
        timestamp: t.timestamp,
      })),
      null,
      2
    );

    // Build the prompt for survey answer extraction
    const prompt = `## Survey Answer Extraction Task

You are an expert survey data analyst. Your task is to extract structured survey answers from a conversation transcript between an AI interviewer and a survey respondent.

### Questionnaire Definition
${questionnaireJson}

### Conversation Transcript
${transcriptJson}

## Instructions

1. Analyze the conversation transcript to identify responses to each survey question
2. For each question in the questionnaire, extract the respondent's answer
3. Clean up conversational fillers (um, uh, well, etc.) from answers
4. For rating/scale questions, extract the numeric value
5. For yes/no questions, normalize to "Yes" or "No"
6. For multiple choice questions, extract the selected option(s)
7. For open-ended questions, capture the essence of the response
8. If a question was not answered or skipped, indicate "Not answered"

## Output Format

Return a JSON object with the following structure:
\`\`\`json
{
  "answers": [
    {
      "questionId": "q1-store-environment",
      "questionNumber": 1,
      "questionText": "How satisfied were you with the store environment?",
      "answer": "4",
      "answerType": "rating",
      "confidence": 0.95,
      "rawUserResponse": "I would say four, it was pretty good"
    }
  ]
}
\`\`\`

### Answer Types
- "rating": Numeric rating (1-5, 0-10, etc.)
- "nps": Net Promoter Score (0-10)
- "yes_no": Yes or No response
- "single_choice": Single selection from options
- "multiple_choice": Multiple selections from options
- "open_ended": Free-form text response
- "not_answered": Question was skipped or not answered

### Confidence Score
- 1.0: Clear, unambiguous answer
- 0.8-0.9: Answer is clear but required some interpretation
- 0.5-0.7: Answer is somewhat unclear or ambiguous
- Below 0.5: Answer is very unclear or may be incorrect

Return only the JSON output without any additional explanation or commentary.`;

    // Use Converse API
    const command = new ConverseCommand({
      modelId: SURVEY_OUTPUT_MODEL_ID,
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
        temperature: 0.3,
        topP: 0.9,
      },
    });

    const response = await client.send(command);

    // Extract text from Converse API response
    const responseText = response.output?.message?.content?.[0]?.text || '';

    logger.info('Survey extraction response received (fallback)', {
      sessionId,
      responseLength: responseText.length,
      durationMs: Date.now() - startTime,
      stopReason: response.stopReason,
    });

    if (!responseText) {
      logger.warn('Empty response from survey extraction model', { sessionId });
      return null;
    }

    return parseExtractedAnswers(sessionId, questionnaireId, responseText);
  } catch (error) {
    logger.error('Survey extraction with direct model failed', {
      sessionId,
      questionnaireId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Parse extracted answers from model response
 */
function parseExtractedAnswers(
  sessionId: string,
  questionnaireId: string,
  responseText: string
): SurveyOutputResult | null {
  try {
    // Strip markdown code blocks if present (handle ```json ... ``` format)
    let cleanedResponse = responseText.trim();
    
    // Remove markdown code block wrapper if present
    // Match ```json or ``` at start and ``` at end
    const codeBlockMatch = cleanedResponse.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (codeBlockMatch) {
      cleanedResponse = codeBlockMatch[1].trim();
      logger.debug('Stripped markdown code block from response', { sessionId });
    }
    
    // Also handle case where code block is in the middle of response
    const inlineCodeBlockMatch = cleanedResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (inlineCodeBlockMatch && !codeBlockMatch) {
      cleanedResponse = inlineCodeBlockMatch[1].trim();
      logger.debug('Extracted JSON from inline code block', { sessionId });
    }

    let parsed: any;

    // Try to parse as array first (most common format from Bedrock)
    if (cleanedResponse.startsWith('[')) {
      try {
        const answersArray = JSON.parse(cleanedResponse);
        parsed = { answers: answersArray };
        logger.debug('Parsed response as JSON array', { sessionId, answerCount: answersArray.length });
      } catch (arrayError) {
        // Try to extract just the array portion
        const arrayMatch = cleanedResponse.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          const answersArray = JSON.parse(arrayMatch[0]);
          parsed = { answers: answersArray };
          logger.debug('Extracted and parsed JSON array from response', { sessionId });
        } else {
          throw arrayError;
        }
      }
    } else if (cleanedResponse.startsWith('{')) {
      // Try to parse as object
      try {
        parsed = JSON.parse(cleanedResponse);
      } catch (objError) {
        // Try to extract just the object portion
        const objMatch = cleanedResponse.match(/\{[\s\S]*?\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
          logger.debug('Extracted and parsed JSON object from response', { sessionId });
        } else {
          throw objError;
        }
      }
    } else {
      // Try to find JSON anywhere in the response
      const arrayMatch = cleanedResponse.match(/\[[\s\S]*\]/);
      const objMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      
      if (arrayMatch) {
        const answersArray = JSON.parse(arrayMatch[0]);
        parsed = { answers: answersArray };
      } else if (objMatch) {
        parsed = JSON.parse(objMatch[0]);
      } else {
        logger.warn('No JSON found in survey extraction response', {
          sessionId,
          responsePreview: responseText.substring(0, 200),
        });
        return null;
      }
    }

    // Handle case where parsed is an array (model returned array instead of object)
    if (Array.isArray(parsed)) {
      parsed = { answers: parsed };
    }

    // Validate and normalize answers
    const answers: SurveyAnswer[] = (parsed.answers || []).map((a: any) => ({
      questionId: a.questionId || '',
      questionNumber: a.questionNumber,
      questionText: a.questionText || '',
      // Handle both 'answer' and 'Answer' (case-insensitive)
      answer: a.answer !== undefined ? String(a.answer) : (a.Answer !== undefined ? String(a.Answer) : 'Not answered'),
      answerType: a.answerType || 'unknown',
      confidence: typeof a.confidence === 'number' ? a.confidence : 0.8,
      rawUserResponse: a.rawUserResponse,
    }));

    logger.info('Survey answers parsed successfully', {
      sessionId,
      questionnaireId,
      answerCount: answers.length,
      answersWithHighConfidence: answers.filter((a) => (a.confidence || 0) >= 0.8).length,
    });

    return {
      sessionId,
      questionnaireId,
      answers,
      extractedAt: new Date().toISOString(),
      promptVersion: SURVEY_OUTPUT_PROMPT_VERSION,
      processingTimeMs: 0, // Will be set by caller
    };
  } catch (error) {
    logger.error('Failed to parse survey extraction response', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      responsePreview: responseText.substring(0, 500),
    });
    return null;
  }
}

/**
 * Get singleton instance for survey output service
 */
export const surveyOutputService = {
  extractSurveyAnswers,
};
