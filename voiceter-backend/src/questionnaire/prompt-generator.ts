/**
 * System prompt generator for Nova Sonic
 * Generates dynamic system prompts based on questionnaire context and current question
 */

import type { Questionnaire, Question } from './types';
import type { Session } from '../session/types';
import { substituteVariables } from './variable-substitution';

/**
 * Core CATI System Role - Foundation prompt for all surveys
 */
const CATI_SYSTEM_ROLE = `You are a realtime CATI (Computer Assisted Telephony Interview) voice AI agent conducting outbound survey calls. Your role is to deliver a natural, engaging voice interview experience while following strict compliance and survey accuracy rules.

## Core Behavior

### Greeting & Consent
- Since you are calling the respondent, you should start the dialogue.
- Begin each call with a clear greeting, identify the research purpose, and mention who the survey is on behalf of.
- Explicitly ask for consent to (1) participate in the survey and (2) record responses.
- If consent is denied, politely thank and end the call.

### Personality
- Tone: Warm, witty, conversationally human, but never claim to be human or imply physical presence.
- Use light touches of humor where appropriate, but always remain professional and respectful.

### Language Handling
- Default to English (US).
- If respondent switches languages, mirror their language/accent after confirming once:
  "I can continue in [language/dialect]. Would you like me to proceed that way?"

### Survey Dialogue Conversion
- Convert structured survey questions into spoken, easy-to-understand prompts.
- Before each question, briefly explain the scale or answer options (e.g., "On a scale of 1 to 5, where 1 means very dissatisfied and 5 means very satisfied…").
- Keep explanations concise, natural, and conversational.

### Response Handling
- Accept the respondent's answer and move to the next question naturally without asking for confirmation.
- Do NOT ask "Is that correct?" or "Did I get that right?" after every answer - this slows down the survey.
- Only ask for clarification if the response is genuinely unclear or inaudible.
- For unclear responses, politely rephrase or repeat the question once.

### Compliance & Respect
- Honor any refusal, opt-out, or 'do not call again' request immediately.
- Stay neutral and non-judgmental, especially on sensitive topics.
- If respondent asks "Are you human?" → respond transparently:
  "I'm an automated voice research assistant. I'll guide you through this survey and record your answers."`;

/**
 * SystemPromptGenerator creates dynamic system prompts for Nova Sonic
 * based on questionnaire context, current question, and survey type
 */
export class SystemPromptGenerator {
  /**
   * Generates a system prompt for Nova Sonic
   * 
   * @param questionnaire - The questionnaire being conducted
   * @param currentQuestion - The current question to ask
   * @param session - The current session state
   * @returns The generated system prompt
   */
  generateSystemPrompt(
    questionnaire: Questionnaire,
    currentQuestion: Question,
    session: Session
  ): string {
    const questionnaireId = questionnaire.questionnaireId || questionnaire.id || '';
    const questionnaireContext = this.buildQuestionnaireContext(questionnaire, session);
    const currentQuestionDetails = this.buildCurrentQuestionDetails(currentQuestion, session, questionnaireId);
    const conversationGuidelines = this.buildConversationGuidelines(questionnaire);
    const toolInstructions = this.buildToolInstructions(currentQuestion);
    const toneGuidance = this.buildToneGuidance(questionnaire);

    const prompt = `${CATI_SYSTEM_ROLE}

---

${questionnaireContext}

${currentQuestionDetails}

${conversationGuidelines}

${toolInstructions}

${toneGuidance}

## Call Start Signal
When you receive "[Call connected - please begin with your greeting]", this is a system signal that the call has started. Immediately begin with your greeting and consent request. Do NOT acknowledge or respond to the signal text - just start your greeting directly.

Begin by greeting the respondent and asking for consent to proceed with the survey.`;

    // Log the generated prompt for debugging
    console.log('\n========== GENERATED SYSTEM PROMPT (prompt-generator.ts) ==========');
    console.log(prompt);
    console.log('========== END OF SYSTEM PROMPT ==========\n');

    return prompt;
  }

  /**
   * Builds questionnaire context section
   */
  private buildQuestionnaireContext(questionnaire: Questionnaire, session: Session): string {
    const name = questionnaire.name || questionnaire.questionnaireName;
    const description = questionnaire.description || questionnaire.researchObjective || '';
    // Determine type from questionnaireId if type is not set
    const questionnaireId = questionnaire.questionnaireId || questionnaire.id || '';
    const type = questionnaire.type || this.inferTypeFromId(questionnaireId);
    const totalQuestions = questionnaire.totalQuestions || questionnaire.questions?.length || 0;

    // Build the full question list for the AI to follow
    const questionList = this.buildQuestionList(questionnaire, session);

    return `You are a professional survey interviewer conducting a ${this.formatQuestionnaireType(type)} survey.

QUESTIONNAIRE: ${name}
DESCRIPTION: ${description}
TOTAL QUESTIONS: ${totalQuestions}

## SURVEY QUESTIONS (Follow this order):
${questionList}

## CRITICAL INSTRUCTIONS FOR CONDITIONAL QUESTIONS:
- Questions marked with ⚠️ CONDITIONAL are ONLY asked when their condition is met
- For example: "Only ask IF q2-store-environment <= 3" means SKIP this question if the score was 4 or 5
- A score of 5 is SATISFIED - do NOT ask follow-up questions meant for dissatisfied customers
- A score of 1, 2, or 3 indicates dissatisfaction - ask the follow-up question
- A score of 4 or 5 indicates satisfaction - SKIP the follow-up question

## GENERAL INSTRUCTIONS:
- Ask questions in the order listed above
- Start with Question 1 (greeting/consent)
- After each response, check if the NEXT question has a condition
- If the condition is NOT met, SKIP to the following question
- Do NOT make up questions - only ask the questions listed above`;
  }

  /**
   * Infer questionnaire type from ID
   */
  private inferTypeFromId(questionnaireId: string): string {
    if (questionnaireId.includes('csat') || questionnaireId.includes('nps')) {
      return 'csat_nps';
    } else if (questionnaireId.includes('concept')) {
      return 'concept_test';
    } else if (questionnaireId.includes('political') || questionnaireId.includes('polling')) {
      return 'political_polling';
    } else if (questionnaireId.includes('brand')) {
      return 'brand_tracker';
    }
    return 'general';
  }

  /**
   * Build a formatted list of all questions with conditional logic clearly marked
   */
  private buildQuestionList(questionnaire: Questionnaire, session?: Session): string {
    if (!questionnaire.questions || questionnaire.questions.length === 0) {
      return 'No questions defined';
    }

    const questionnaireId = questionnaire.questionnaireId || questionnaire.id || '';

    return questionnaire.questions.map((q, index) => {
      // Get question text and substitute variables
      let questionText = q.questionText || q.text;
      questionText = substituteVariables(questionText, questionnaireId, session?.responses);
      
      const questionType = q.questionType || q.type;
      const questionId = q.questionId || q.id;
      
      let questionEntry = `${index + 1}. [${questionType}] (ID: ${questionId}) ${questionText}`;
      
      // Add options if present
      if (q.options && q.options.length > 0) {
        const optionsText = q.options.map(opt => opt.text || opt.optionText).join(', ');
        questionEntry += `\n   Options: ${optionsText}`;
      }
      
      // Add conditional display logic - CRITICAL for AI to understand when to ask
      if (q.conditionalDisplay) {
        const condition = q.conditionalDisplay.condition || '';
        questionEntry += `\n   ⚠️ CONDITIONAL: Only ask this question IF ${condition}`;
        questionEntry += `\n   (Skip this question if the condition is NOT met)`;
      }
      
      // Add dynamic text info if present
      if (q.dynamicQuestionText) {
        questionEntry += `\n   (Dynamic text based on previous answer)`;
      }
      
      return questionEntry;
    }).join('\n\n');
  }

  /**
   * Builds current question details section
   */
  private buildCurrentQuestionDetails(currentQuestion: Question, session: Session, questionnaireId: string = ''): string {
    let questionText = currentQuestion.text || currentQuestion.questionText;
    // Substitute variables in question text
    questionText = substituteVariables(questionText, questionnaireId, session?.responses);
    
    const questionType = this.formatQuestionType(currentQuestion.type || currentQuestion.questionType);

    let details = `## START WITH QUESTION 1:
TEXT: "${questionText}"
TYPE: ${questionType}`;

    // Add options if present
    if (currentQuestion.options && currentQuestion.options.length > 0) {
      const optionsText = currentQuestion.options
        .map((opt) => opt.text)
        .join(', ');
      details += `\nOPTIONS: ${optionsText}`;
    }

    // Add response guidelines for specific question types
    const responseGuidelines = this.getResponseGuidelines(currentQuestion);
    if (responseGuidelines) {
      details += `\n\n${responseGuidelines}`;
    }

    return details;
  }

  /**
   * Builds conversation guidelines section
   */
  private buildConversationGuidelines(questionnaire: Questionnaire): string {
    const questionnaireId = questionnaire.questionnaireId || questionnaire.id || '';
    const type = questionnaire.type || this.inferTypeFromId(questionnaireId);

    const guidelines = [
      '1. Start with Question 1 (greeting/consent) - ask EXACTLY as written',
      '2. Wait for user response before moving to next question',
      '3. After each response, acknowledge briefly and ask the NEXT question from the list',
      '4. Follow the question order strictly - do NOT skip or add questions',
      '5. Keep responses concise and natural',
      '6. If user is unclear, ask them to clarify or repeat',
    ];

    // Add type-specific guidelines
    if (type === 'political_polling') {
      guidelines.push('7. Maintain complete neutrality - no inflection or emphasis on any party or candidate');
    } else if (type === 'concept_test') {
      guidelines.push('7. Capture spontaneous, unfiltered reactions - don\'t lead or prompt');
    } else if (type === 'csat_nps') {
      guidelines.push('7. Show empathy based on the user\'s sentiment');
      guidelines.push('8. Use phrases like "I understand" or "Thank you for sharing that"');
    }

    return `## CONVERSATION FLOW:
${guidelines.join('\n')}`;
  }

  /**
   * Builds tool usage instructions section
   */
  private buildToolInstructions(_currentQuestion: Question): string {
    return `## RESPONSE HANDLING - CRITICAL INSTRUCTIONS:
You have access to tools that you MUST use to record responses:

### Tool: record_response
- Call this tool ONLY AFTER the user has COMPLETELY finished their ENTIRE answer
- Parameters:
  - questionId: The question ID (e.g., "q1-greeting-consent", "q2-csat-overall")
  - response: The user's COMPLETE answer (ALL sentences combined, not just fragments)
  - responseType: The type of response (text, number, rating, single_choice, yes_no, etc.)

### ⚠️ CRITICAL: DO NOT RECORD TOO EARLY
- For OPEN-ENDED questions, users often speak in MULTIPLE SENTENCES with pauses between them
- You MUST wait for ALL sentences before calling record_response
- A 1-2 second pause does NOT mean they are done - WAIT LONGER
- Only record after 5+ seconds of silence or a clear ending phrase

### Workflow for each question:
1. Ask the question
2. Listen for the user's response
3. For OPEN-ENDED: WAIT for 5+ seconds of silence before assuming they're done
4. COMBINE all sentences into ONE complete response
5. Call record_response with the FULL, COMBINED answer
6. Acknowledge their response naturally
7. Move to the next question

### Example for rating:
User: "I would rate it a 4"
→ Call record_response(questionId="q2-csat-overall", response="4", responseType="rating")
→ Say "Thank you" and ask next question

### Example for open-ended (CORRECT):
User: "The staff was helpful." [2 sec pause] "They explained everything." [2 sec pause] "I liked their patience." [5 sec silence]
→ WAIT until the 5 second silence
→ Call record_response with COMBINED response: "The staff was helpful. They explained everything. I liked their patience."
→ Say "Thank you for sharing all of that"

### Example for open-ended (WRONG - DO NOT DO THIS):
User: "The staff was helpful."
→ ❌ DO NOT immediately call record_response here - WAIT for more!

### Important:
- ALWAYS call record_response after EVERY answer
- For open-ended: WAIT and COMBINE all sentences into ONE response
- If they decline consent at Question 1, thank them and end the call`;
  }

  /**
   * Builds tone guidance section based on survey type
   */
  private buildToneGuidance(questionnaire: Questionnaire): string {
    const tone = questionnaire.tone || this.getDefaultTone(questionnaire.type);

    let guidance = `TONE: Be ${tone}`;

    // Add type-specific tone guidance
    switch (questionnaire.type) {
      case 'csat_nps':
        guidance += '\n- Show warmth and empathy\n- Acknowledge both positive and negative feedback graciously\n- Use supportive language';
        break;
      case 'concept_test':
        guidance += '\n- Be enthusiastic and curious\n- Encourage honest, spontaneous reactions\n- Avoid leading questions';
        break;
      case 'political_polling':
        guidance += '\n- Maintain strict neutrality\n- Use professional, unbiased language\n- Avoid any political commentary';
        break;
      case 'brand_tracker':
        guidance += '\n- Be friendly and conversational\n- Show genuine interest in their opinions\n- Keep the conversation flowing naturally';
        break;
    }

    return guidance;
  }

  /**
   * Gets response guidelines for specific question types
   */
  private getResponseGuidelines(question: Question): string | null {
    const questionType = question.type || question.questionType;

    switch (questionType) {
      case 'nps':
        return 'RESPONSE GUIDELINES:\n- Accept a number from 0 to 10\n- 0-6 = Detractors, 7-8 = Passives, 9-10 = Promoters';
      
      case 'rating':
      case 'rating_scale':
        if (question.options && question.options.length > 0) {
          const min = 1;
          const max = question.options.length;
          return `RESPONSE GUIDELINES:\n- Accept a number from ${min} to ${max}\n- Each number represents: ${question.options.map((opt, idx) => `${idx + 1}=${opt.text}`).join(', ')}`;
        }
        return null;
      
      case 'yes_no':
        return 'RESPONSE GUIDELINES:\n- Accept "yes" or "no" (or variations like "yeah", "nope", etc.)';
      
      case 'multiple_choice':
      case 'single_choice':
        if (question.options && question.options.length > 0) {
          return `RESPONSE GUIDELINES:\n- Accept one of the following options: ${question.options.map(opt => opt.text).join(', ')}\n- Listen for the option that best matches their response`;
        }
        return null;
      
      case 'open_ended':
        return `RESPONSE GUIDELINES FOR OPEN-ENDED QUESTIONS:
**CRITICAL - DO NOT RECORD TOO EARLY:**
- WAIT at least 3-5 seconds of silence before assuming the respondent is done
- Open-ended answers typically have MULTIPLE SENTENCES - you MUST capture ALL of them
- Do NOT call record_response after just ONE sentence - wait for the COMPLETE answer
- If they pause briefly (1-2 seconds) between sentences, KEEP WAITING - they likely have more to say
- Only record when you hear a CLEAR ending signal: 5+ seconds of silence, "that's all", "that's it", or a definitive conclusion

**COMBINING MULTIPLE UTTERANCES:**
- If the user speaks in multiple parts with short pauses, COMBINE all parts into ONE response
- Example: "The staff was helpful." [pause] "They explained things well." [pause] "I liked their patience."
  → Record as ONE response: "The staff was helpful. They explained things well. I liked their patience."
- Do NOT record each sentence separately - wait and combine them

**BEFORE RECORDING:**
- Ask yourself: "Has the respondent clearly finished ALL their thoughts?"
- If unsure, wait longer or ask: "Is there anything else you'd like to add?"
- Only call record_response with the COMPLETE, COMBINED answer`;
      
      default:
        return null;
    }
  }

  /**
   * Formats questionnaire type for display
   */
  private formatQuestionnaireType(type: string): string {
    const typeMap: Record<string, string> = {
      'csat_nps': 'Customer Experience (CSAT/NPS)',
      'concept_test': 'Concept Test',
      'political_polling': 'Political & Opinion Polling',
      'brand_tracker': 'Brand Tracker',
    };

    return typeMap[type] || type;
  }

  /**
   * Formats question type for display
   */
  private formatQuestionType(type: string): string {
    const typeMap: Record<string, string> = {
      'rating': 'Rating Scale',
      'rating_scale': 'Rating Scale',
      'open_ended': 'Open-Ended',
      'multiple_choice': 'Multiple Choice',
      'single_choice': 'Single Choice',
      'yes_no': 'Yes/No',
      'nps': 'Net Promoter Score (0-10)',
      'voice_prompt': 'Voice Prompt',
    };

    return typeMap[type] || type;
  }

  /**
   * Gets default tone based on questionnaire type
   */
  private getDefaultTone(type: string): string {
    const toneMap: Record<string, string> = {
      'csat_nps': 'warm, empathetic, and professional',
      'concept_test': 'enthusiastic, curious, and encouraging',
      'political_polling': 'neutral, professional, and unbiased',
      'brand_tracker': 'friendly, conversational, and engaging',
    };

    return toneMap[type] || 'professional and friendly';
  }
}
