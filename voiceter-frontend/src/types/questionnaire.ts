/**
 * Questionnaire metadata types for demo selection
 */

export interface QuestionnaireMetadata {
  questionnaireId: string;
  questionnaireName: string;
  version: string;
  industry: string;
  researchObjective: string;
  targetAudience: {
    description: string;
    demographicCriteria: string[];
  };
  estimatedDuration: number | string; // in seconds (number) or formatted string like "3-4 minutes"
  totalQuestions: number;
  createdBy: string;
  createdDate: string;
  metadata: {
    mockBrand?: string;
    mockProduct?: string;
    demoScenario: string;
    keyFeatures: string[];
  };
}

export interface DemoCard {
  id: string;
  title: string;
  description: string;
  duration: string;
  features: string[];
  industry: string;
  icon: string;
}
