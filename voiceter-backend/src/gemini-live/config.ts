/**
 * Gemini Live API Configuration
 *
 * This module provides configuration management for the Gemini Live API integration.
 * It reads configuration from environment variables and validates required fields.
 */

/**
 * Configuration interface for Gemini Live API integration.
 */
export interface GeminiLiveConfig {
  /** Google Cloud Project ID */
  projectId: string;
  /** Google Cloud Region for Vertex AI */
  region: string;
  /** Gemini Live model name */
  model: string;
  /** Default voice for audio generation */
  defaultVoice: string;
  /** Mapping of legacy voice names to Gemini voices */
  voiceMapping: Record<string, string>;
  /** Maximum number of reconnection attempts */
  reconnectMaxRetries: number;
  /** Base delay for reconnection backoff in milliseconds */
  reconnectBaseDelayMs: number;
  /** Timeout for tool execution in milliseconds */
  toolTimeoutMs: number;
  /** Disable tools - run survey using only system prompt */
  disableTools: boolean;
  /** Feature flag to enable/disable Gemini Live */
  enabled: boolean;
}

/** Default Gemini Live model - GA version */
const DEFAULT_MODEL = 'gemini-live-2.5-flash-native-audio';

/** Default voice for Gemini Live */
const DEFAULT_VOICE = 'Charon';

/** Default reconnection settings */
const DEFAULT_RECONNECT_MAX_RETRIES = 3;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;

/** Default tool timeout */
const DEFAULT_TOOL_TIMEOUT_MS = 5000;

/**
 * Get environment variable value with optional default.
 */
function getEnvVar(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || defaultValue;
}

/**
 * Get required environment variable, throwing if not set.
 */
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Please set ${name} in your environment or .env file.`
    );
  }
  return value.trim();
}

/**
 * Parse environment variable as integer with default.
 */
function getEnvVarAsInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `Environment variable ${name} must be a valid integer, got: ${value}`
    );
  }

  return parsed;
}

/**
 * Parse environment variable as boolean with default.
 */
function getEnvVarAsBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

/**
 * Parse voice mapping from environment variable.
 * Format: "legacyName1:geminiVoice1,legacyName2:geminiVoice2"
 * 
 * Note: Legacy Nova Sonic voice mapping (matthew, tiffany, amy) has been removed.
 * The frontend now sends Gemini voice names directly.
 * Use this only if you need custom voice aliases.
 */
function parseVoiceMapping(value: string | undefined): Record<string, string> {
  const mapping: Record<string, string> = {};

  if (!value || value.trim() === '') {
    return mapping;
  }

  const pairs = value.split(',');
  for (const pair of pairs) {
    const [legacyName, geminiVoice] = pair.split(':').map((s) => s.trim());
    if (legacyName && geminiVoice) {
      mapping[legacyName.toLowerCase()] = geminiVoice;
    }
  }

  return mapping;
}

/**
 * Validate the Gemini Live configuration.
 */
function validateConfig(config: GeminiLiveConfig): void {
  if (config.enabled) {
    if (!config.projectId || config.projectId.trim() === '') {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT is required when USE_GEMINI_LIVE is true.'
      );
    }

    if (!config.region || config.region.trim() === '') {
      throw new Error(
        'GOOGLE_CLOUD_REGION is required when USE_GEMINI_LIVE is true.'
      );
    }
  }

  if (config.reconnectMaxRetries < 0 || config.reconnectMaxRetries > 10) {
    throw new Error('GEMINI_RECONNECT_MAX_RETRIES must be between 0 and 10');
  }

  if (config.reconnectBaseDelayMs < 100) {
    throw new Error('GEMINI_RECONNECT_BASE_DELAY_MS must be at least 100');
  }

  if (config.toolTimeoutMs < 1000) {
    throw new Error('GEMINI_TOOL_TIMEOUT_MS must be at least 1000');
  }
}

/**
 * Load Gemini Live configuration from environment variables.
 *
 * @returns GeminiLiveConfig object with all settings
 * @throws Error if required configuration is missing or invalid
 */
export function loadGeminiConfig(): GeminiLiveConfig {
  const enabled = getEnvVarAsBoolean('USE_GEMINI_LIVE', false);

  let projectId = '';
  let region = '';

  if (enabled) {
    projectId = getRequiredEnvVar('GOOGLE_CLOUD_PROJECT');
    region = getRequiredEnvVar('GOOGLE_CLOUD_REGION');
  } else {
    projectId = getEnvVar('GOOGLE_CLOUD_PROJECT', '') || '';
    region = getEnvVar('GOOGLE_CLOUD_REGION', '') || '';
  }

  const config: GeminiLiveConfig = {
    projectId,
    region,
    model: getEnvVar('GEMINI_MODEL', DEFAULT_MODEL) || DEFAULT_MODEL,
    defaultVoice: getEnvVar('GEMINI_DEFAULT_VOICE', DEFAULT_VOICE) || DEFAULT_VOICE,
    voiceMapping: parseVoiceMapping(getEnvVar('GEMINI_VOICE_MAPPING')),
    reconnectMaxRetries: getEnvVarAsInt('GEMINI_RECONNECT_MAX_RETRIES', DEFAULT_RECONNECT_MAX_RETRIES),
    reconnectBaseDelayMs: getEnvVarAsInt('GEMINI_RECONNECT_BASE_DELAY_MS', DEFAULT_RECONNECT_BASE_DELAY_MS),
    toolTimeoutMs: getEnvVarAsInt('GEMINI_TOOL_TIMEOUT_MS', DEFAULT_TOOL_TIMEOUT_MS),
    disableTools: getEnvVarAsBoolean('GEMINI_DISABLE_TOOLS', false),
    enabled,
  };

  validateConfig(config);

  return config;
}

/**
 * Build the Vertex AI WebSocket URL for Gemini Live.
 *
 * @param config - Gemini Live configuration
 * @returns WebSocket URL for connecting to Gemini Live API
 */
export function buildGeminiWebSocketUrl(config: GeminiLiveConfig): string {
  return (
    `wss://${config.region}-aiplatform.googleapis.com/ws/` +
    `google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`
  );
}

// Singleton instance for configuration
let configInstance: GeminiLiveConfig | null = null;

/**
 * Get the Gemini Live configuration singleton.
 * Loads configuration on first call.
 *
 * @returns GeminiLiveConfig instance
 */
export function getGeminiConfig(): GeminiLiveConfig {
  if (!configInstance) {
    configInstance = loadGeminiConfig();
    
    // DEBUG: Log the loaded config
    /* console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           GEMINI CONFIG LOADED (SINGLETON)                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('GEMINI_DISABLE_TOOLS env:', process.env.GEMINI_DISABLE_TOOLS);
    console.log('disableTools config value:', configInstance.disableTools);
    console.log('enabled:', configInstance.enabled);
    console.log('model:', configInstance.model);
    console.log('╚════════════════════════════════════════════════════════════════╝\n'); */
  }
  return configInstance;
}

/**
 * Reset the configuration singleton (for testing purposes).
 */
export function resetGeminiConfig(): void {
  configInstance = null;
}
