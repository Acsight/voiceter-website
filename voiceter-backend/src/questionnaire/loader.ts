/**
 * Questionnaire Loader
 * 
 * Creates minimal questionnaire metadata from system prompt definitions.
 * The actual survey logic is contained in system prompts (system_prompts/EN/ and system_prompts/TR/).
 * Caches questionnaires in memory for fast access.
 */

import { Questionnaire } from './types';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

/**
 * Questionnaire definitions - minimal metadata for each demo
 * The actual survey logic is in system prompts
 * 
 * Industry values must match the NLP service mapping:
 * - "Retail Electronics": Electronics retail surveys
 * - "E-Commerce": E-commerce/marketplace surveys  
 * - "Automotive AfterSales": Automotive service surveys
 * - "Concept Test": Concept testing surveys
 * - "Politician": Political polling surveys
 * - "Brand Tracker": Brand tracking surveys
 */
const QUESTIONNAIRE_DEFINITIONS: Array<{
  questionnaireId: string;
  questionnaireName: string;
  industry: string;
  estimatedDuration: string;
}> = [
  {
    questionnaireId: 'demo-01a-electronics-retail-personalized',
    questionnaireName: 'Electronics Retail - In-Store Purchase Experience',
    industry: 'Retail Electronics',
    estimatedDuration: '5-7 minutes',
  },
  {
    questionnaireId: 'demo-01b-ecommerce-delivery-personalized',
    questionnaireName: 'E-Commerce - Online Delivery Experience',
    industry: 'E-Commerce',
    estimatedDuration: '5-7 minutes',
  },
  {
    questionnaireId: 'demo-01c-automotive-service-personalized',
    questionnaireName: 'Automotive After-Sales Service',
    industry: 'Automotive AfterSales',
    estimatedDuration: '5-7 minutes',
  },
  {
    questionnaireId: 'demo-02-concept-test',
    questionnaireName: 'FlexiDesk Pro - Concept Test Snapshot',
    industry: 'Concept Test',
    estimatedDuration: '4-6 minutes',
  },
  {
    questionnaireId: 'demo-03-political-polling',
    questionnaireName: '2026 Midterm Election Sentiment Poll',
    industry: 'Politician',
    estimatedDuration: '5-8 minutes',
  },
  {
    questionnaireId: 'demo-04-brand-tracker',
    questionnaireName: 'Sustainable Athletic Footwear - Brand Tracker Pulse',
    industry: 'Brand Tracker',
    estimatedDuration: '5-7 minutes',
  },
];

export class QuestionnaireLoader {
  private questionnaires: Map<string, Questionnaire> = new Map();

  constructor(_questionnairesDir?: string) {
    // questionnairesDir is no longer used - questionnaires are defined in code
    // System prompts contain the actual survey logic
  }

  /**
   * Load all questionnaires at startup
   * Creates minimal questionnaire objects from definitions
   */
  loadAll(): void {
    logger.info('Loading questionnaire definitions');

    for (const def of QUESTIONNAIRE_DEFINITIONS) {
      try {
        this.createQuestionnaire(def);
      } catch (error) {
        logger.error('Failed to create questionnaire', {
          questionnaireId: def.questionnaireId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    logger.info('All questionnaires loaded successfully', {
      count: this.questionnaires.size,
      questionnaireIds: Array.from(this.questionnaires.keys()),
    });
  }

  /**
   * Create a questionnaire from definition
   * Creates minimal questionnaire object - actual survey logic is in system prompts
   */
  private createQuestionnaire(def: typeof QUESTIONNAIRE_DEFINITIONS[0]): void {
    // Create minimal questionnaire with placeholder question
    // The actual questions and logic are in the system prompts
    const questionnaire: Questionnaire = {
      id: def.questionnaireId,
      questionnaireId: def.questionnaireId,
      name: def.questionnaireName,
      questionnaireName: def.questionnaireName,
      industry: def.industry,
      description: `${def.questionnaireName} - Voice Survey Demo`,
      type: 'csat_nps',
      tone: 'professional',
      recommendedVoice: 'Charon',
      estimatedDuration: def.estimatedDuration,
      totalQuestions: 10, // Approximate - actual count is in system prompt
      metadata: {},
      questions: [
        {
          id: 'q1-start',
          questionId: 'q1-start',
          questionNumber: 1,
          type: 'voice_prompt',
          questionType: 'voice_prompt',
          text: 'Survey start - see system prompt for full survey logic',
          questionText: 'Survey start - see system prompt for full survey logic',
          isRequired: false,
          metadata: {},
        },
      ],
    };

    // Cache questionnaire
    this.questionnaires.set(questionnaire.questionnaireId, questionnaire);

    logger.info('Questionnaire created', {
      questionnaireId: questionnaire.questionnaireId,
      questionnaireName: questionnaire.questionnaireName,
    });
  }

  /**
   * Get questionnaire by ID
   */
  getQuestionnaire(questionnaireId: string): Questionnaire | null {
    return this.questionnaires.get(questionnaireId) || null;
  }

  /**
   * Get all questionnaire IDs
   */
  getQuestionnaireIds(): string[] {
    return Array.from(this.questionnaires.keys());
  }

  /**
   * Get all questionnaires
   */
  getAllQuestionnaires(): Questionnaire[] {
    return Array.from(this.questionnaires.values());
  }

  /**
   * Check if questionnaire exists
   */
  hasQuestionnaire(questionnaireId: string): boolean {
    return this.questionnaires.has(questionnaireId);
  }

  /**
   * Get questionnaire count
   */
  getCount(): number {
    return this.questionnaires.size;
  }
}

// Singleton instance
let loaderInstance: QuestionnaireLoader | null = null;

/**
 * Get singleton loader instance
 */
export function getQuestionnaireLoader(questionnairesDir?: string): QuestionnaireLoader {
  if (!loaderInstance) {
    loaderInstance = new QuestionnaireLoader(questionnairesDir);
  }
  return loaderInstance;
}

/**
 * Initialize questionnaire loader
 */
export function initializeQuestionnaireLoader(questionnairesDir?: string): void {
  const loader = getQuestionnaireLoader(questionnairesDir);
  loader.loadAll();

  logger.info('Questionnaire loader initialized', {
    count: loader.getCount(),
    questionnaireIds: loader.getQuestionnaireIds(),
  });
}
