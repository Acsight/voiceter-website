/**
 * Bedrock Guardrails Service
 * 
 * Uses the ApplyGuardrail API to check user inputs and AI outputs
 * for harmful content, PII, and off-topic conversations.
 */

import {
  BedrockRuntimeClient,
  ApplyGuardrailCommand,
  GuardrailContentSource,
} from '@aws-sdk/client-bedrock-runtime';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

/**
 * Guardrail check result
 */
export interface GuardrailCheckResult {
  allowed: boolean;
  action: 'NONE' | 'GUARDRAIL_INTERVENED';
  blockedReason?: string;
  filteredText?: string;
  assessments?: any[];
}

/**
 * Guardrails configuration
 */
export interface GuardrailsConfig {
  guardrailId: string;
  guardrailVersion: string;
  region?: string;
}

/**
 * Bedrock Guardrails Service
 */
export class GuardrailsService {
  private client: BedrockRuntimeClient;
  private guardrailId: string;
  private guardrailVersion: string;
  private enabled: boolean;

  constructor(config?: GuardrailsConfig) {
    const region = config?.region || process.env.AWS_REGION || 'us-east-1';
    
    this.client = new BedrockRuntimeClient({ region });
    this.guardrailId = config?.guardrailId || process.env.BEDROCK_GUARDRAIL_ID || '';
    this.guardrailVersion = config?.guardrailVersion || process.env.BEDROCK_GUARDRAIL_VERSION || '1';
    this.enabled = !!this.guardrailId;

    if (this.enabled) {
      logger.info('Guardrails service initialized', {
        guardrailId: this.guardrailId,
        guardrailVersion: this.guardrailVersion,
        region,
      });
    } else {
      logger.warn('Guardrails service disabled - no guardrail ID configured');
    }
  }

  /**
   * Check if guardrails are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check user input against guardrails
   * 
   * @param text - The user's transcribed speech
   * @param sessionId - Session ID for logging
   * @returns GuardrailCheckResult
   */
  async checkUserInput(text: string, sessionId: string): Promise<GuardrailCheckResult> {
    return this.applyGuardrail(text, 'INPUT', sessionId);
  }

  /**
   * Check AI output against guardrails
   * 
   * @param text - The AI's response text
   * @param sessionId - Session ID for logging
   * @returns GuardrailCheckResult
   */
  async checkAIOutput(text: string, sessionId: string): Promise<GuardrailCheckResult> {
    return this.applyGuardrail(text, 'OUTPUT', sessionId);
  }

  /**
   * Apply guardrail to text content
   */
  private async applyGuardrail(
    text: string,
    source: 'INPUT' | 'OUTPUT',
    sessionId: string
  ): Promise<GuardrailCheckResult> {
    // If guardrails not enabled, allow everything
    if (!this.enabled) {
      return { allowed: true, action: 'NONE' };
    }

    // Skip empty or very short text
    if (!text || text.trim().length < 2) {
      return { allowed: true, action: 'NONE' };
    }

    const startTime = Date.now();

    try {
      const command = new ApplyGuardrailCommand({
        guardrailIdentifier: this.guardrailId,
        guardrailVersion: this.guardrailVersion,
        source: source as GuardrailContentSource,
        content: [
          {
            text: {
              text: text,
            },
          },
        ],
      });

      const response = await this.client.send(command);
      const duration = Date.now() - startTime;

      const action = response.action || 'NONE';
      const allowed = action === 'NONE';

      // Extract blocked reason if content was blocked
      let blockedReason: string | undefined;
      let filteredText: string | undefined;

      if (!allowed && response.outputs && response.outputs.length > 0) {
        // Get the filtered/replacement text if available
        const output = response.outputs[0];
        if (output.text) {
          filteredText = output.text;
        }
      }

      // Check assessments for specific block reasons
      if (response.assessments && response.assessments.length > 0) {
        const assessment = response.assessments[0];
        
        // Check topic policy
        if (assessment.topicPolicy?.topics) {
          const blockedTopics = assessment.topicPolicy.topics
            .filter((t: any) => t.action === 'BLOCKED')
            .map((t: any) => t.name);
          if (blockedTopics.length > 0) {
            blockedReason = `Blocked topics: ${blockedTopics.join(', ')}`;
          }
        }

        // Check content policy
        if (assessment.contentPolicy?.filters) {
          const blockedFilters = assessment.contentPolicy.filters
            .filter((f: any) => f.action === 'BLOCKED')
            .map((f: any) => f.type);
          if (blockedFilters.length > 0) {
            blockedReason = blockedReason 
              ? `${blockedReason}; Content filters: ${blockedFilters.join(', ')}`
              : `Content filters: ${blockedFilters.join(', ')}`;
          }
        }

        // Check sensitive info policy (PII)
        if (assessment.sensitiveInformationPolicy?.piiEntities) {
          const piiTypes = assessment.sensitiveInformationPolicy.piiEntities
            .filter((p: any) => p.action === 'BLOCKED' || p.action === 'ANONYMIZED')
            .map((p: any) => p.type);
          if (piiTypes.length > 0) {
            blockedReason = blockedReason
              ? `${blockedReason}; PII detected: ${piiTypes.join(', ')}`
              : `PII detected: ${piiTypes.join(', ')}`;
          }
        }

        // Check word policy
        if (assessment.wordPolicy?.customWords) {
          const blockedWords = assessment.wordPolicy.customWords
            .filter((w: any) => w.action === 'BLOCKED')
            .map((w: any) => w.match);
          if (blockedWords.length > 0) {
            blockedReason = blockedReason
              ? `${blockedReason}; Blocked words detected`
              : 'Blocked words detected';
          }
        }
      }

      logger.info('Guardrail check completed', {
        sessionId,
        source,
        allowed,
        action,
        blockedReason,
        duration,
        textLength: text.length,
      });

      return {
        allowed,
        action: action as 'NONE' | 'GUARDRAIL_INTERVENED',
        blockedReason,
        filteredText,
        assessments: response.assessments,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Guardrail check failed', {
        sessionId,
        source,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // On error, allow the content to avoid blocking legitimate conversations
      // Log the error for monitoring
      return {
        allowed: true,
        action: 'NONE',
        blockedReason: `Guardrail check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get a user-friendly message when content is blocked
   */
  getBlockedMessage(source: 'INPUT' | 'OUTPUT', _blockedReason?: string): string {
    if (source === 'INPUT') {
      return "I'm sorry, but I can't process that response. Could you please rephrase your answer focusing on the survey question?";
    } else {
      return "I apologize, but I need to rephrase my response. Let me continue with the survey.";
    }
  }
}

// Singleton instance
let guardrailsService: GuardrailsService | null = null;

/**
 * Get the guardrails service singleton
 */
export function getGuardrailsService(): GuardrailsService {
  if (!guardrailsService) {
    guardrailsService = new GuardrailsService();
  }
  return guardrailsService;
}

/**
 * Initialize guardrails service with custom config
 */
export function initializeGuardrailsService(config: GuardrailsConfig): GuardrailsService {
  guardrailsService = new GuardrailsService(config);
  return guardrailsService;
}
