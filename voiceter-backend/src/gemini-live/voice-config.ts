/**
 * Gemini Live Voice Configuration Manager
 *
 * This module manages voice configuration and mapping for the Gemini Live API.
 * It provides functionality to map legacy voice names to Gemini voices and
 * validate voice selections.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

/**
 * All available Gemini Live voices.
 * Requirement 9.5: Support all Gemini Live voices
 */
export const GEMINI_VOICES = [
  'Aoede',
  'Charon',
  'Fenrir',
  'Kore',
  'Puck',
  'Orbit',
] as const;

/**
 * Type representing valid Gemini voice names.
 */
export type GeminiVoice = (typeof GEMINI_VOICES)[number];

/**
 * Mapping of legacy voice names to Gemini voices.
 * Requirements: 9.1, 9.2, 9.3
 * - matthew → Charon (Requirement 9.1)
 * - tiffany → Aoede (Requirement 9.2)
 * - amy → Kore (Requirement 9.3)
 */
export const VOICE_MAPPING: Record<string, GeminiVoice> = {
  matthew: 'Charon',
  tiffany: 'Aoede',
  amy: 'Kore',
};

/**
 * Default voice when no voice is specified or unknown voice is provided.
 * Requirement 9.4: Fall back to default voice (Charon)
 */
const DEFAULT_VOICE: GeminiVoice = 'Charon';

/**
 * VoiceConfigManager class for managing Gemini Live voice configuration.
 *
 * Provides methods to:
 * - Map legacy voice names to Gemini voices
 * - Get the default voice
 * - Validate voice names
 * - Get all available voices
 */
export class VoiceConfigManager {
  private readonly defaultVoice: GeminiVoice;
  private readonly voiceMapping: Record<string, GeminiVoice>;

  /**
   * Create a new VoiceConfigManager instance.
   *
   * @param defaultVoice - Optional custom default voice (defaults to Charon)
   * @param additionalMappings - Optional additional voice mappings to merge with defaults
   */
  constructor(
    defaultVoice?: GeminiVoice,
    additionalMappings?: Record<string, GeminiVoice>
  ) {
    this.defaultVoice = defaultVoice || DEFAULT_VOICE;
    this.voiceMapping = {
      ...VOICE_MAPPING,
      ...additionalMappings,
    };
  }

  /**
   * Map a legacy voice name to a Gemini voice.
   *
   * Requirements: 9.1, 9.2, 9.3, 9.4
   * - matthew → Charon (Requirement 9.1)
   * - tiffany → Aoede (Requirement 9.2)
   * - amy → Kore (Requirement 9.3)
   * - Unknown names → default voice (Requirement 9.4)
   *
   * @param legacyVoiceName - The legacy voice name to map
   * @returns The corresponding Gemini voice name
   */
  mapVoice(legacyVoiceName: string): GeminiVoice {
    if (!legacyVoiceName || legacyVoiceName.trim() === '') {
      return this.defaultVoice;
    }

    const normalizedName = legacyVoiceName.toLowerCase().trim();

    // Check if it's already a valid Gemini voice (case-insensitive)
    const matchingGeminiVoice = GEMINI_VOICES.find(
      (voice) => voice.toLowerCase() === normalizedName
    );
    if (matchingGeminiVoice) {
      return matchingGeminiVoice;
    }

    // Check the voice mapping
    const mappedVoice = this.voiceMapping[normalizedName];
    if (mappedVoice) {
      return mappedVoice;
    }

    // Requirement 9.4: Fall back to default voice for unknown names
    return this.defaultVoice;
  }

  /**
   * Get the default voice.
   *
   * @returns The default Gemini voice name
   */
  getDefaultVoice(): GeminiVoice {
    return this.defaultVoice;
  }

  /**
   * Check if a voice name is valid (either a Gemini voice or a mapped legacy name).
   *
   * @param voiceName - The voice name to validate
   * @returns true if the voice name is valid, false otherwise
   */
  isValidVoice(voiceName: string): boolean {
    if (!voiceName || voiceName.trim() === '') {
      return false;
    }

    const normalizedName = voiceName.toLowerCase().trim();

    // Check if it's a valid Gemini voice
    const isGeminiVoice = GEMINI_VOICES.some(
      (voice) => voice.toLowerCase() === normalizedName
    );
    if (isGeminiVoice) {
      return true;
    }

    // Check if it's a mapped legacy voice
    return normalizedName in this.voiceMapping;
  }

  /**
   * Get all available Gemini voices.
   *
   * Requirement 9.5: Support all Gemini Live voices
   *
   * @returns Array of all available Gemini voice names
   */
  getAvailableVoices(): readonly GeminiVoice[] {
    return GEMINI_VOICES;
  }

  /**
   * Get all legacy voice names that have mappings.
   *
   * @returns Array of legacy voice names
   */
  getLegacyVoiceNames(): string[] {
    return Object.keys(this.voiceMapping);
  }

  /**
   * Get the voice mapping configuration.
   *
   * @returns Record of legacy voice names to Gemini voices
   */
  getVoiceMapping(): Record<string, GeminiVoice> {
    return { ...this.voiceMapping };
  }
}

// ============================================================================
// Module-level convenience functions
// ============================================================================

// Default singleton instance
let defaultInstance: VoiceConfigManager | null = null;

/**
 * Get the default VoiceConfigManager instance.
 *
 * @returns The default VoiceConfigManager singleton
 */
export function getVoiceConfigManager(): VoiceConfigManager {
  if (!defaultInstance) {
    defaultInstance = new VoiceConfigManager();
  }
  return defaultInstance;
}

/**
 * Reset the default VoiceConfigManager instance (for testing purposes).
 */
export function resetVoiceConfigManager(): void {
  defaultInstance = null;
}

/**
 * Map a legacy voice name to a Gemini voice using the default manager.
 *
 * @param legacyVoiceName - The legacy voice name to map
 * @returns The corresponding Gemini voice name
 */
export function mapVoice(legacyVoiceName: string): GeminiVoice {
  return getVoiceConfigManager().mapVoice(legacyVoiceName);
}

/**
 * Get the default voice using the default manager.
 *
 * @returns The default Gemini voice name
 */
export function getDefaultVoice(): GeminiVoice {
  return getVoiceConfigManager().getDefaultVoice();
}

/**
 * Check if a voice name is valid using the default manager.
 *
 * @param voiceName - The voice name to validate
 * @returns true if the voice name is valid, false otherwise
 */
export function isValidVoice(voiceName: string): boolean {
  return getVoiceConfigManager().isValidVoice(voiceName);
}

/**
 * Get all available Gemini voices using the default manager.
 *
 * @returns Array of all available Gemini voice names
 */
export function getAvailableVoices(): readonly GeminiVoice[] {
  return getVoiceConfigManager().getAvailableVoices();
}
