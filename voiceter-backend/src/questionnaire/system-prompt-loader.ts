/**
 * System Prompt Loader
 *
 * Loads pre-defined system prompts from the system_prompts folder.
 * Supports multiple languages (EN, TR) and maps questionnaire IDs to prompt files.
 *
 * The prompts contain complete CATI instructions, conversation guidelines,
 * and questionnaire definitions that are sent to Gemini Live API.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../monitoring/logger';

const logger = getLogger();

/**
 * Mapping of questionnaire IDs to their system prompt files
 */
const QUESTIONNAIRE_PROMPT_MAP: Record<string, Record<string, string>> = {
  // English prompts
  EN: {
    // Demo 1a: Electronics Retail CSAT/NPS
    'demo-01a-electronics-retail-personalized': 'demo1a_electronics_retail_prompt_EN.rtf',
    'demo-01a-electronics-retail': 'demo1a_electronics_retail_prompt_EN.rtf',
    
    // Demo 1b: E-Commerce Delivery CSAT/NPS
    'demo-01b-ecommerce-delivery-personalized': 'demo1b_ecommerce_prompt_EN.rtf',
    'demo-01b-ecommerce-delivery': 'demo1b_ecommerce_prompt_EN.rtf',
    'demo-01b-ecommerce': 'demo1b_ecommerce_prompt_EN.rtf',
    
    // Demo 1c: Automotive Service CSAT/NPS
    'demo-01c-automotive-service-personalized': 'demo1c_automotive_prompt_EN.rtf',
    'demo-01c-automotive-service': 'demo1c_automotive_prompt_EN.rtf',
    'demo-01c-automotive': 'demo1c_automotive_prompt_EN.rtf',
    
    // Demo 2: Concept Test
    'demo-02-concept-test': 'demo2_concept_test_prompt_EN.rtf',
    'demo-02b-smart-security-camera-concept': 'demo2_concept_test_prompt_EN.rtf',
    
    // Demo 3: Political Polling
    'demo-03-political-polling': 'demo3_political_polling_EN.rtf',
    
    // Demo 4: Brand Tracker (no prompt file yet - will use fallback)
    'demo-04-brand-tracker': 'demo4_brand_tracker_prompt_EN.rtf',
    
    // Legacy IDs (for backward compatibility)
    'demo-01-csat-nps': 'demo1a_electronics_retail_prompt_EN.rtf',
    'demo1_csat_nps_electronics_retailer': 'demo1a_electronics_retail_prompt_EN.rtf',
    'demo_5_csat_nps_ecommerce_delivery': 'demo1b_ecommerce_prompt_EN.rtf',
    'demo_6_csat_nps_automotive_service': 'demo1c_automotive_prompt_EN.rtf',
    'demo2_concept_test': 'demo2_concept_test_prompt_EN.rtf',
    'demo3_political_polling': 'demo3_political_polling_EN.rtf',
    'demo4_brand_tracker': 'demo4_brand_tracker_prompt_EN.rtf',
  },
  // Turkish prompts
  TR: {
    // Demo 1a: Electronics Retail CSAT/NPS
    'demo-01a-electronics-retail-personalized': 'demo1a_retail_electronics_prompt_TR.rtf',
    'demo-01a-electronics-retail': 'demo1a_retail_electronics_prompt_TR.rtf',
    
    // Demo 1b: E-Commerce Delivery CSAT/NPS
    'demo-01b-ecommerce-delivery-personalized': 'demo1b_ecommerce_prompt_TR.rtf',
    'demo-01b-ecommerce-delivery': 'demo1b_ecommerce_prompt_TR.rtf',
    'demo-01b-ecommerce': 'demo1b_ecommerce_prompt_TR.rtf',
    
    // Demo 1c: Automotive Service CSAT/NPS
    'demo-01c-automotive-service-personalized': 'demo1c_automotive_prompt_TR.rtf',
    'demo-01c-automotive-service': 'demo1c_automotive_prompt_TR.rtf',
    'demo-01c-automotive': 'demo1c_automotive_prompt_TR.rtf',
    
    // Demo 2: Concept Test
    'demo-02-concept-test': 'demo2_concept_test_prompt_TR.rtf',
    'demo-02b-smart-security-camera-concept': 'demo2_concept_test_prompt_TR.rtf',
    
    // Demo 3: Political Polling
    'demo-03-political-polling': 'demo3_political_poll_prompt_TR.rtf',
  },
};

/**
 * Default language for system prompts
 */
const DEFAULT_LANGUAGE = 'EN';

/**
 * Cache for loaded system prompts
 */
const promptCache: Map<string, string> = new Map();

/**
 * Get the system prompts directory path
 */
function getSystemPromptsDir(): string {
  return path.join(process.cwd(), 'system_prompts');
}

/**
 * Strip RTF formatting and extract plain text content
 *
 * @param rtfContent - Raw RTF file content
 * @returns Plain text content
 */
function stripRtfFormatting(rtfContent: string): string {
  // Check if it's actually RTF format
  if (!rtfContent.startsWith('{\\rtf')) {
    // Not RTF, return as-is (might be plain text saved with .rtf extension)
    return rtfContent;
  }

  let text = rtfContent;

  // Remove RTF header and font tables
  text = text.replace(/\{\\rtf[^}]*\}/g, '');
  text = text.replace(/\{\\fonttbl[^}]*\}/g, '');
  text = text.replace(/\{\\colortbl[^}]*\}/g, '');
  text = text.replace(/\{\\stylesheet[^}]*\}/g, '');

  // Remove RTF control words
  text = text.replace(/\\[a-z]+\d*\s?/gi, '');

  // Remove curly braces
  text = text.replace(/[{}]/g, '');

  // Convert RTF special characters
  text = text.replace(/\\'([0-9a-f]{2})/gi, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Clean up whitespace
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Load a system prompt file
 *
 * @param language - Language code (EN, TR)
 * @param filename - Prompt filename
 * @returns Prompt content or null if not found
 */
function loadPromptFile(language: string, filename: string): string | null {
  const cacheKey = `${language}/${filename}`;

  // Check cache first
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey)!;
  }

  const filePath = path.join(getSystemPromptsDir(), language, filename);

  try {
    if (!fs.existsSync(filePath)) {
      logger.warn('System prompt file not found', {
        event: 'prompt_file_not_found',
        filePath,
        language,
        filename,
      });
      return null;
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const content = stripRtfFormatting(rawContent);

    // Cache the processed content
    promptCache.set(cacheKey, content);

    logger.debug('System prompt loaded', {
      event: 'prompt_loaded',
      language,
      filename,
      contentLength: content.length,
    });

    return content;
  } catch (error) {
    logger.error('Failed to load system prompt file', {
      event: 'prompt_load_error',
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get the system prompt for a questionnaire
 *
 * @param questionnaireId - The questionnaire ID
 * @param language - Language code (default: EN)
 * @returns System prompt content or null if not found
 * 
 * @remarks
 * - Turkish (TR) uses TR folder
 * - All other languages use EN folder
 */
export function getSystemPromptForQuestionnaire(
  questionnaireId: string,
  language: string = DEFAULT_LANGUAGE
): string | null {
  // Determine which folder to use:
  // - Turkish (TR) uses TR folder
  // - All other languages use EN folder
  const langUpper = language.toUpperCase();
  const effectiveLanguage = langUpper === 'TR' ? 'TR' : 'EN';
  
  // Debug logging
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           SYSTEM PROMPT LOADER DEBUG                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('📥 Requested questionnaireId:', questionnaireId);
  console.log('📥 Requested language:', language);
  console.log('🔄 langUpper:', langUpper);
  console.log('🔄 effectiveLanguage (folder):', effectiveLanguage);
  
  const promptMap = QUESTIONNAIRE_PROMPT_MAP[effectiveLanguage];

  if (!promptMap) {
    logger.warn('Language folder not found for system prompts', {
      event: 'language_folder_not_found',
      requestedLanguage: langUpper,
      effectiveLanguage,
      questionnaireId,
    });
    return null;
  }

  // Try exact match first
  let filename = promptMap[questionnaireId];

  // Try normalized ID (lowercase, replace underscores with hyphens)
  if (!filename) {
    const normalizedId = questionnaireId.toLowerCase().replace(/_/g, '-');
    filename = promptMap[normalizedId];
  }

  // Try partial match (for IDs with version suffixes)
  if (!filename) {
    const baseId = questionnaireId.split('-').slice(0, 3).join('-');
    filename = promptMap[baseId];
  }

  if (!filename) {
    logger.warn('No system prompt mapping found for questionnaire', {
      event: 'no_prompt_mapping',
      questionnaireId,
      requestedLanguage: langUpper,
      effectiveLanguage,
      availableIds: Object.keys(promptMap),
    });
    console.log('❌ No prompt mapping found!');
    console.log('   Available IDs:', Object.keys(promptMap).join(', '));
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    return null;
  }

  console.log('✅ Found prompt file:', filename);
  console.log('📂 Full path: system_prompts/' + effectiveLanguage + '/' + filename);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  logger.debug('Loading system prompt', {
    event: 'loading_prompt',
    questionnaireId,
    requestedLanguage: langUpper,
    effectiveLanguage,
    filename,
  });

  return loadPromptFile(effectiveLanguage, filename);
}

/**
 * Check if a system prompt exists for a questionnaire
 *
 * @param questionnaireId - The questionnaire ID
 * @param language - Language code (default: EN)
 * @returns true if prompt exists
 * 
 * @remarks
 * - Turkish (TR) uses TR folder
 * - All other languages use EN folder
 */
export function hasSystemPrompt(
  questionnaireId: string,
  language: string = DEFAULT_LANGUAGE
): boolean {
  // Determine which folder to use:
  // - Turkish (TR) uses TR folder
  // - All other languages use EN folder
  const langUpper = language.toUpperCase();
  const effectiveLanguage = langUpper === 'TR' ? 'TR' : 'EN';
  
  const promptMap = QUESTIONNAIRE_PROMPT_MAP[effectiveLanguage];

  if (!promptMap) {
    return false;
  }

  return (
    questionnaireId in promptMap ||
    questionnaireId.toLowerCase().replace(/_/g, '-') in promptMap
  );
}

/**
 * Get all available questionnaire IDs with system prompts
 *
 * @param language - Language code (default: EN)
 * @returns Array of questionnaire IDs
 */
export function getAvailableQuestionnaireIds(
  language: string = DEFAULT_LANGUAGE
): string[] {
  const langUpper = language.toUpperCase();
  const promptMap = QUESTIONNAIRE_PROMPT_MAP[langUpper];

  if (!promptMap) {
    return [];
  }

  return Object.keys(promptMap);
}

/**
 * Clear the prompt cache (useful for testing or hot-reloading)
 */
export function clearPromptCache(): void {
  promptCache.clear();
  logger.debug('System prompt cache cleared', {
    event: 'prompt_cache_cleared',
  });
}

/**
 * Preload all system prompts into cache
 *
 * @param languages - Languages to preload (default: all)
 */
export function preloadSystemPrompts(languages?: string[]): void {
  const langsToLoad = languages || Object.keys(QUESTIONNAIRE_PROMPT_MAP);

  for (const lang of langsToLoad) {
    const promptMap = QUESTIONNAIRE_PROMPT_MAP[lang];
    if (!promptMap) continue;

    const uniqueFiles = Array.from(new Set(Object.values(promptMap)));

    for (const filename of uniqueFiles) {
      loadPromptFile(lang, filename);
    }
  }

  logger.info('System prompts preloaded', {
    event: 'prompts_preloaded',
    languages: langsToLoad,
    cacheSize: promptCache.size,
  });
}
