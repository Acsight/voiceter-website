import type { QuestionnaireMetadata, DemoCard } from '@/types/questionnaire';

/**
 * Static questionnaire definitions
 * The actual survey logic is in system prompts on the backend
 */
const QUESTIONNAIRE_DEFINITIONS: QuestionnaireMetadata[] = [
  {
    questionnaireId: 'demo-01a-electronics-retail-personalized',
    questionnaireName: 'Electronics Retail - In-Store Purchase Experience',
    version: '1.0',
    industry: 'Electronic Retailers',
    researchObjective: 'Measure customer satisfaction with in-store electronics purchase experience',
    targetAudience: {
      description: 'Recent electronics purchasers',
      demographicCriteria: ['Adults 18+', 'Recent in-store purchase'],
    },
    estimatedDuration: '5-7 minutes',
    totalQuestions: 8,
    createdBy: 'Voiceter',
    createdDate: '2025-01-15',
    metadata: {
      demoScenario: 'Post-purchase satisfaction survey for electronics retail',
      keyFeatures: ['CSAT Rating', 'NPS Score', 'Open-ended Feedback', 'Sentiment Analysis'],
    },
  },
  {
    questionnaireId: 'demo-01b-ecommerce-delivery-personalized',
    questionnaireName: 'E-Commerce - Online Delivery Experience',
    version: '1.0',
    industry: 'E-Commerce',
    researchObjective: 'Evaluate customer satisfaction with online delivery experience',
    targetAudience: {
      description: 'Recent online shoppers',
      demographicCriteria: ['Adults 18+', 'Recent online purchase'],
    },
    estimatedDuration: '5-7 minutes',
    totalQuestions: 8,
    createdBy: 'Voiceter',
    createdDate: '2025-01-15',
    metadata: {
      demoScenario: 'Post-delivery satisfaction survey for e-commerce',
      keyFeatures: ['Delivery Satisfaction', 'NPS Score', 'Issue Resolution', 'Feedback Collection'],
    },
  },
  {
    questionnaireId: 'demo-01c-automotive-service-personalized',
    questionnaireName: 'Automotive After-Sales Service',
    version: '1.0',
    industry: 'Automotive Aftersales',
    researchObjective: 'Assess customer satisfaction with automotive service experience',
    targetAudience: {
      description: 'Recent automotive service customers',
      demographicCriteria: ['Adults 18+', 'Recent service visit'],
    },
    estimatedDuration: '5-7 minutes',
    totalQuestions: 8,
    createdBy: 'Voiceter',
    createdDate: '2025-01-15',
    metadata: {
      demoScenario: 'Post-service satisfaction survey for automotive aftersales',
      keyFeatures: ['Service Quality', 'NPS Score', 'Technician Feedback', 'Recommendation Intent'],
    },
  },
  {
    questionnaireId: 'demo-02-concept-test',
    questionnaireName: 'FlexiDesk Pro - Concept Test Snapshot',
    version: '1.0',
    industry: 'General',
    researchObjective: 'Test new product concepts and capture spontaneous reactions',
    targetAudience: {
      description: 'General consumers',
      demographicCriteria: ['Adults 18+'],
    },
    estimatedDuration: '4-6 minutes',
    totalQuestions: 7,
    createdBy: 'Voiceter',
    createdDate: '2025-01-15',
    metadata: {
      demoScenario: 'New product concept testing with spontaneous feedback',
      keyFeatures: ['First Impressions', 'Purchase Intent', 'Feature Prioritization', 'Innovation Ideas'],
    },
  },
  {
    questionnaireId: 'demo-03-political-polling',
    questionnaireName: '2026 Midterm Election Sentiment Poll',
    version: '1.0',
    industry: 'Politician',
    researchObjective: 'Conduct professional political opinion polling with quota management',
    targetAudience: {
      description: 'Registered voters',
      demographicCriteria: ['Adults 18+', 'Registered voters'],
    },
    estimatedDuration: '5-8 minutes',
    totalQuestions: 10,
    createdBy: 'Voiceter',
    createdDate: '2025-01-15',
    metadata: {
      demoScenario: 'Political opinion polling with quota management',
      keyFeatures: ['Age Screening', 'Voter Registration', 'Political Affiliation', 'Quota Management'],
    },
  },
  {
    questionnaireId: 'demo-04-brand-tracker',
    questionnaireName: 'Sustainable Athletic Footwear - Brand Tracker Pulse',
    version: '1.0',
    industry: 'General',
    researchObjective: 'Track brand awareness, preference, and perception',
    targetAudience: {
      description: 'Athletic footwear consumers',
      demographicCriteria: ['Adults 18+', 'Athletic footwear purchasers'],
    },
    estimatedDuration: '5-7 minutes',
    totalQuestions: 9,
    createdBy: 'Voiceter',
    createdDate: '2025-01-15',
    metadata: {
      demoScenario: 'Brand tracking for athletic footwear market',
      keyFeatures: ['Brand Awareness', 'Purchase Consideration', 'Brand Preference', 'NPS Score'],
    },
  },
];

/**
 * Get questionnaire metadata by ID
 */
export async function loadQuestionnaireMetadata(
  questionnaireId: string
): Promise<QuestionnaireMetadata | null> {
  const questionnaire = QUESTIONNAIRE_DEFINITIONS.find(
    (q) => q.questionnaireId === questionnaireId
  );
  return questionnaire || null;
}

/**
 * Load all available questionnaires
 */
export async function loadAllQuestionnaires(): Promise<QuestionnaireMetadata[]> {
  return QUESTIONNAIRE_DEFINITIONS;
}

/**
 * Convert questionnaire metadata to demo card format
 */
export function convertToDemoCard(metadata: QuestionnaireMetadata): DemoCard {
  // Handle both old (estimatedDuration as number) and new (estimatedDuration as string like "3-4 minutes")
  let durationMinutes: number;
  if (typeof metadata.estimatedDuration === 'number') {
    durationMinutes = Math.ceil(metadata.estimatedDuration / 60);
  } else if (typeof metadata.estimatedDuration === 'string') {
    // Extract first number from string like "3-4 minutes"
    const match = metadata.estimatedDuration.match(/\d+/);
    durationMinutes = match ? parseInt(match[0], 10) : 4;
  } else {
    durationMinutes = 4; // default
  }

  // Map questionnaire IDs to icons
  const iconMap: Record<string, string> = {
    'demo-01a-electronics-retail-personalized': '🛒',
    'demo-02-concept-test': '💡',
    'demo-03-political-polling': '🗳️',
    'demo-04-brand-tracker': '🏷️',
    'demo-01b-ecommerce-delivery-personalized': '📦',
    'demo-01c-automotive-service-personalized': '🚗',
  };

  // Handle both old (researchObjective) and new (description) schemas
  const description = metadata.researchObjective || (metadata as any).description || '';

  // Handle both old (metadata.keyFeatures) and new (no keyFeatures) schemas
  const features = metadata.metadata?.keyFeatures || [];

  return {
    id: metadata.questionnaireId,
    title: metadata.questionnaireName,
    description: description,
    duration: `${durationMinutes} min`,
    features: features,
    industry: metadata.industry,
    icon: iconMap[metadata.questionnaireId] || '📋',
  };
}

/**
 * Load all demo cards
 */
export async function loadDemoCards(): Promise<DemoCard[]> {
  const questionnaires = await loadAllQuestionnaires();
  return questionnaires.map(convertToDemoCard);
}
