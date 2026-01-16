/**
 * Questionnaire engine for managing survey logic and question progression
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Questionnaire,
  Question,
  Response,
  QuestionnaireProgress,
  NextQuestionResult,
  Option,
} from './types';
import type { Session } from '../session/types';
import { evaluateDisplayLogic, evaluateSkipLogic, evaluateCondition } from './logic';

/**
 * QuestionnaireEngine manages survey logic and question progression
 */
export class QuestionnaireEngine {
  private questionnaires: Map<string, Questionnaire> = new Map();
  private questionnairesPath: string;

  constructor(questionnairesPath: string = path.join(process.cwd(), 'questionnaires')) {
    this.questionnairesPath = questionnairesPath;
  }

  /**
   * Loads a questionnaire from JSON file
   * 
   * @param questionnaireId - The questionnaire ID
   * @returns The loaded questionnaire
   * @throws Error if questionnaire file not found or invalid
   */
  loadQuestionnaire(questionnaireId: string): Questionnaire {
    // Check cache first
    if (this.questionnaires.has(questionnaireId)) {
      return this.questionnaires.get(questionnaireId)!;
    }

    // Try to load from file
    const filePath = path.join(this.questionnairesPath, `${questionnaireId}.json`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Questionnaire file not found: ${filePath}`);
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const questionnaire = JSON.parse(fileContent) as Questionnaire;

      // Normalize field names (handle aliases)
      questionnaire.id = questionnaire.questionnaireId || questionnaire.id;
      questionnaire.name = questionnaire.questionnaireName || questionnaire.name;
      questionnaire.totalQuestions = questionnaire.totalQuestions || questionnaire.questions?.length || 0;

      // Normalize question field names
      if (questionnaire.questions) {
        questionnaire.questions = questionnaire.questions.map((q) => ({
          ...q,
          id: q.questionId || q.id,
          text: q.questionText || q.text,
          type: q.questionType || q.type,
        }));
      }

      // Cache the questionnaire
      this.questionnaires.set(questionnaireId, questionnaire);

      return questionnaire;
    } catch (error) {
      throw new Error(`Failed to load questionnaire ${questionnaireId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets the next question based on current session state
   * 
   * @param session - The current session
   * @returns Next question result with question, completion status, and progress
   */
  getNextQuestion(session: Session): NextQuestionResult {
    const questionnaire = session.questionnaire || this.loadQuestionnaire(session.questionnaireId);
    const questions = questionnaire.questions || [];
    
    let currentIndex = session.currentQuestionIndex;

    // Start from the next question
    currentIndex++;

    // Find the next eligible question
    while (currentIndex < questions.length) {
      const question = questions[currentIndex];

      // Check display logic
      if (question.displayLogic) {
        const shouldDisplay = evaluateDisplayLogic(question.displayLogic, session.responses);
        if (!shouldDisplay) {
          // Skip this question
          currentIndex++;
          continue;
        }
      }

      // Check skip logic
      if (question.skipLogic) {
        const skipTarget = evaluateSkipLogic(question.skipLogic, session.responses);
        if (skipTarget) {
          // Find the target question index
          const targetIndex = questions.findIndex((q) => q.id === skipTarget || q.questionId === skipTarget);
          if (targetIndex !== -1) {
            currentIndex = targetIndex;
            continue; // Re-evaluate the target question
          }
        }
      }

      // Apply dynamic question text if configured
      let questionText = question.text || question.questionText;
      if (question.dynamicQuestionText) {
        questionText = this.applyDynamicQuestionText(question, session.responses);
      }

      // Apply dynamic options filtering if configured
      let options = question.options;
      if (question.dynamicOptions && options) {
        options = this.filterDynamicOptions(question, session.responses);
      }

      // Return the question with applied transformations
      const transformedQuestion: Question = {
        ...question,
        text: questionText,
        questionText: questionText,
        options: options,
      };

      return {
        question: transformedQuestion,
        isComplete: false,
        progress: this.getProgress(session, currentIndex),
      };
    }

    // No more questions - questionnaire is complete
    return {
      question: null,
      isComplete: true,
      progress: this.getProgress(session, questions.length),
    };
  }

  /**
   * Applies dynamic question text based on prior responses
   * 
   * @param question - The question with dynamic text configuration
   * @param responses - Map of prior responses
   * @returns The selected question text
   */
  applyDynamicQuestionText(
    question: Question,
    responses: Map<string, Response>
  ): string {
    const dynamicConfig = question.dynamicQuestionText;
    if (!dynamicConfig) {
      return question.text || question.questionText;
    }

    // Handle NPS-style dynamic text (detractors, passives, promoters)
    if (dynamicConfig.detractors || dynamicConfig.passives || dynamicConfig.promoters) {
      const basedOnQuestionId = dynamicConfig.basedOn;
      const priorResponse = responses.get(basedOnQuestionId);

      if (priorResponse && priorResponse.response !== undefined) {
        const score = Number(priorResponse.response);

        if (!isNaN(score)) {
          // NPS scoring: 0-6 = detractors, 7-8 = passives, 9-10 = promoters
          if (score >= 0 && score <= 6 && dynamicConfig.detractors) {
            return dynamicConfig.detractors;
          } else if (score >= 7 && score <= 8 && dynamicConfig.passives) {
            return dynamicConfig.passives;
          } else if (score >= 9 && score <= 10 && dynamicConfig.promoters) {
            return dynamicConfig.promoters;
          }
        }
      }
    }

    // Handle rule-based dynamic text
    if (dynamicConfig.rules && dynamicConfig.rules.length > 0) {
      for (const rule of dynamicConfig.rules) {
        if (evaluateCondition(rule.condition, responses)) {
          return rule.questionText;
        }
      }
    }

    // Fallback to default question text
    return question.text || question.questionText;
  }

  /**
   * Filters dynamic options based on prior selections
   * 
   * @param question - The question with dynamic options configuration
   * @param responses - Map of prior responses
   * @returns Filtered options array
   */
  filterDynamicOptions(
    question: Question,
    responses: Map<string, Response>
  ): Option[] {
    const dynamicConfig = question.dynamicOptions;
    const options = question.options || [];

    if (!dynamicConfig) {
      return options;
    }

    // Get the prior response from the source question
    const sourceResponse = responses.get(dynamicConfig.sourceQuestionId);
    if (!sourceResponse || (!sourceResponse.response && !sourceResponse.responseValue)) {
      return options; // No prior response, return all options
    }

    // Parse the prior selections (could be a single value or array)
    // Check responseValue first (parsed value), then fall back to response
    const responseData = sourceResponse.responseValue !== undefined ? sourceResponse.responseValue : sourceResponse.response;
    
    let priorSelections: string[] = [];
    if (Array.isArray(responseData)) {
      priorSelections = responseData;
    } else if (typeof responseData === 'string') {
      priorSelections = [responseData];
    }

    // Apply filter based on filter type
    const filterType = dynamicConfig.filterType || dynamicConfig.filterRule;

    if (filterType === 'include' || filterType === 'selected_in_source') {
      // Include only options that were selected in the source question
      return options.filter((option) => {
        const optionValue = option.optionValue || option.value;
        return priorSelections.includes(optionValue);
      });
    } else if (filterType === 'exclude' || filterType === 'not_selected_in_source') {
      // Exclude options that were selected in the source question
      return options.filter((option) => {
        const optionValue = option.optionValue || option.value;
        return !priorSelections.includes(optionValue);
      });
    }

    // Unknown filter type, return all options
    return options;
  }

  /**
   * Calculates questionnaire progress
   * 
   * @param session - The current session
   * @param currentIndex - Optional current question index (defaults to session's current index)
   * @returns Progress information
   */
  getProgress(session: Session, currentIndex?: number): QuestionnaireProgress {
    const questionnaire = session.questionnaire || this.loadQuestionnaire(session.questionnaireId);
    const totalQuestions = questionnaire.totalQuestions || questionnaire.questions?.length || 0;
    const current = currentIndex !== undefined ? currentIndex : session.currentQuestionIndex;

    const percentComplete = totalQuestions > 0 ? Math.round((current / totalQuestions) * 100) : 0;

    return {
      current,
      total: totalQuestions,
      percentComplete,
    };
  }

  /**
   * Checks if the questionnaire is complete
   * 
   * @param session - The current session
   * @returns true if all questions are answered, false otherwise
   */
  isQuestionnaireComplete(session: Session): boolean {
    const questionnaire = session.questionnaire || this.loadQuestionnaire(session.questionnaireId);
    const questions = questionnaire.questions || [];
    
    // Check if we've reached the end of the questions
    return session.currentQuestionIndex >= questions.length;
  }

  /**
   * Preloads all questionnaires from the questionnaires directory
   * Useful for startup initialization
   */
  preloadQuestionnaires(): void {
    if (!fs.existsSync(this.questionnairesPath)) {
      console.warn(`Questionnaires directory not found: ${this.questionnairesPath}`);
      return;
    }

    const files = fs.readdirSync(this.questionnairesPath);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    for (const file of jsonFiles) {
      const questionnaireId = file.replace('.json', '');
      try {
        this.loadQuestionnaire(questionnaireId);
        console.log(`Preloaded questionnaire: ${questionnaireId}`);
      } catch (error) {
        console.error(`Failed to preload questionnaire ${questionnaireId}:`, error);
      }
    }
  }
}
