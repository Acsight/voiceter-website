/**
 * Type definitions for questionnaire models
 */

/**
 * Questionnaire type
 */
export type QuestionnaireType =
  | 'csat_nps'
  | 'concept_test'
  | 'political_polling'
  | 'brand_tracker';

/**
 * Question type
 */
export type QuestionType =
  | 'rating'
  | 'rating_scale'
  | 'open_ended'
  | 'multiple_choice'
  | 'single_choice'
  | 'yes_no'
  | 'nps'
  | 'voice_prompt';

/**
 * Logical operator for conditions
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Comparison operator for conditions
 */
export type ComparisonOperator =
  | 'equals'
  | '=='
  | '==='
  | 'not_equals'
  | '!='
  | '!=='
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | '>'
  | 'greater_than_or_equal'
  | '>='
  | 'less_than'
  | '<'
  | 'less_than_or_equal'
  | '<='
  | 'in'
  | 'not_in'
  | 'is_answered'
  | 'is_not_answered'
  | 'always_display_after';

/**
 * Filter type for dynamic options
 */
export type FilterType = 'include' | 'exclude' | 'selected_in_source' | 'not_selected_in_source';

/**
 * Validation rule type
 */
export type ValidationRuleType =
  | 'required'
  | 'min_length'
  | 'max_length'
  | 'pattern'
  | 'range';

/**
 * Question option
 */
export interface Option {
  value: string;
  optionValue: string; // Alias for value
  text: string;
  optionText?: string; // Alias for text
  optionId?: string;
  metadata?: Record<string, any>;
}

/**
 * Condition for logic evaluation
 */
export interface Condition {
  questionId: string;
  operator: ComparisonOperator;
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

/**
 * Display logic configuration
 */
export interface DisplayLogic {
  operator: LogicalOperator;
  conditions: Condition[];
  questionTextDynamic?: DynamicQuestionText;
}

/**
 * Skip condition with target
 */
export interface SkipCondition extends Condition {
  targetQuestionId: string;
}

/**
 * Skip logic configuration
 */
export interface SkipLogic {
  conditions: SkipCondition[];
}

/**
 * Dynamic text rule
 */
export interface DynamicTextRule {
  condition: Condition;
  questionText: string;
}

/**
 * Dynamic question text configuration
 */
export interface DynamicQuestionText {
  basedOn: string;
  rules: DynamicTextRule[];
  questionTextDynamic?: boolean;
  detractors?: string;
  passives?: string;
  promoters?: string;
}

/**
 * Dynamic options configuration
 */
export interface DynamicOptions {
  sourceQuestionId: string;
  filterType: FilterType;
  filterRule?: 'include' | 'exclude';
}

/**
 * Validation rule
 */
export interface ValidationRule {
  type: ValidationRuleType;
  value: any;
  message: string;
}

/**
 * Conditional display configuration
 */
export interface ConditionalDisplay {
  ruleId?: string;
  condition: string;
}

/**
 * Question definition
 */
export interface Question {
  id: string;
  questionId: string; // Alias for id
  text: string;
  questionText: string; // Alias for text
  type: QuestionType;
  questionType: QuestionType; // Alias for type
  questionNumber?: number;
  isRequired?: boolean;
  options?: Option[];
  displayLogic?: DisplayLogic;
  skipLogic?: SkipLogic;
  conditionalDisplay?: ConditionalDisplay;
  dynamicQuestionText?: DynamicQuestionText;
  dynamicOptions?: DynamicOptions;
  validation?: ValidationRule[];
  configuration?: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Questionnaire definition
 */
export interface Questionnaire {
  id: string;
  questionnaireId: string; // Alias for id
  name: string;
  questionnaireName: string; // Alias for name
  description: string;
  type: QuestionnaireType;
  tone: string;
  recommendedVoice: string;
  questions: Question[];
  totalQuestions?: number;
  estimatedDuration?: string;
  industry?: string;
  researchObjective?: string;
  surveyLogic?: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Response to a question
 */
export interface Response {
  questionId: string;
  response?: string;
  responseValue?: any; // Parsed response value (alias for response)
  responseType: string;
  timestamp: Date | string;
  metadata?: Record<string, any>;
}

/**
 * Questionnaire progress
 */
export interface QuestionnaireProgress {
  current: number;
  total: number;
  percentComplete: number;
}

/**
 * Next question result
 */
export interface NextQuestionResult {
  question: Question | null;
  isComplete: boolean;
  progress: QuestionnaireProgress;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid?: boolean;
  isValid?: boolean; // Alias for valid
  message?: string;
  errors?: string[];
}

/**
 * Logic evaluation context
 */
export interface LogicEvaluationContext {
  responses: Map<string, Response>;
  currentQuestionIndex: number;
}
