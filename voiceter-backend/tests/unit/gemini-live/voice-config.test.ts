/**
 * Unit tests for VoiceConfigManager
 *
 * Tests the voice configuration and mapping functionality including:
 * - Legacy voice mapping (Requirements 9.1, 9.2, 9.3)
 * - Default voice fallback (Requirement 9.4)
 * - Available voices (Requirement 9.5)
 */

import {
  VoiceConfigManager,
  GEMINI_VOICES,
  VOICE_MAPPING,
  GeminiVoice,
  mapVoice,
  getDefaultVoice,
  isValidVoice,
  getAvailableVoices,
  getVoiceConfigManager,
  resetVoiceConfigManager,
} from '../../../src/gemini-live/voice-config';

describe('VoiceConfigManager', () => {
  let voiceConfigManager: VoiceConfigManager;

  beforeEach(() => {
    voiceConfigManager = new VoiceConfigManager();
    resetVoiceConfigManager();
  });

  describe('GEMINI_VOICES constant', () => {
    it('should contain all Gemini Live voices (Requirement 9.5)', () => {
      expect(GEMINI_VOICES).toContain('Aoede');
      expect(GEMINI_VOICES).toContain('Charon');
      expect(GEMINI_VOICES).toContain('Fenrir');
      expect(GEMINI_VOICES).toContain('Kore');
      expect(GEMINI_VOICES).toContain('Puck');
      expect(GEMINI_VOICES).toContain('Orbit');
      expect(GEMINI_VOICES).toHaveLength(6);
    });
  });

  describe('VOICE_MAPPING constant', () => {
    it('should map matthew to Charon (Requirement 9.1)', () => {
      expect(VOICE_MAPPING['matthew']).toBe('Charon');
    });

    it('should map tiffany to Aoede (Requirement 9.2)', () => {
      expect(VOICE_MAPPING['tiffany']).toBe('Aoede');
    });

    it('should map amy to Kore (Requirement 9.3)', () => {
      expect(VOICE_MAPPING['amy']).toBe('Kore');
    });
  });

  describe('constructor', () => {
    it('should create instance with default voice', () => {
      const manager = new VoiceConfigManager();
      expect(manager.getDefaultVoice()).toBe('Charon');
    });

    it('should create instance with custom default voice', () => {
      const manager = new VoiceConfigManager('Aoede');
      expect(manager.getDefaultVoice()).toBe('Aoede');
    });

    it('should merge additional voice mappings', () => {
      const manager = new VoiceConfigManager(undefined, {
        custom: 'Fenrir',
      });
      expect(manager.mapVoice('custom')).toBe('Fenrir');
      // Original mappings should still work
      expect(manager.mapVoice('matthew')).toBe('Charon');
    });
  });

  describe('mapVoice', () => {
    it('should map matthew to Charon (Requirement 9.1)', () => {
      expect(voiceConfigManager.mapVoice('matthew')).toBe('Charon');
    });

    it('should map tiffany to Aoede (Requirement 9.2)', () => {
      expect(voiceConfigManager.mapVoice('tiffany')).toBe('Aoede');
    });

    it('should map amy to Kore (Requirement 9.3)', () => {
      expect(voiceConfigManager.mapVoice('amy')).toBe('Kore');
    });

    it('should return default voice for unknown names (Requirement 9.4)', () => {
      expect(voiceConfigManager.mapVoice('unknown')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('random')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('nonexistent')).toBe('Charon');
    });

    it('should return default voice for empty string', () => {
      expect(voiceConfigManager.mapVoice('')).toBe('Charon');
    });

    it('should return default voice for whitespace-only string', () => {
      expect(voiceConfigManager.mapVoice('   ')).toBe('Charon');
    });

    it('should handle case-insensitive legacy voice names', () => {
      expect(voiceConfigManager.mapVoice('MATTHEW')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('Matthew')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('TIFFANY')).toBe('Aoede');
      expect(voiceConfigManager.mapVoice('AMY')).toBe('Kore');
    });

    it('should pass through valid Gemini voice names', () => {
      expect(voiceConfigManager.mapVoice('Charon')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('Aoede')).toBe('Aoede');
      expect(voiceConfigManager.mapVoice('Fenrir')).toBe('Fenrir');
      expect(voiceConfigManager.mapVoice('Kore')).toBe('Kore');
      expect(voiceConfigManager.mapVoice('Puck')).toBe('Puck');
      expect(voiceConfigManager.mapVoice('Orbit')).toBe('Orbit');
    });

    it('should handle case-insensitive Gemini voice names', () => {
      expect(voiceConfigManager.mapVoice('charon')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('CHARON')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('aoede')).toBe('Aoede');
      expect(voiceConfigManager.mapVoice('FENRIR')).toBe('Fenrir');
    });

    it('should trim whitespace from voice names', () => {
      expect(voiceConfigManager.mapVoice('  matthew  ')).toBe('Charon');
      expect(voiceConfigManager.mapVoice('  Charon  ')).toBe('Charon');
    });
  });

  describe('getDefaultVoice', () => {
    it('should return Charon as default voice', () => {
      expect(voiceConfigManager.getDefaultVoice()).toBe('Charon');
    });

    it('should return custom default voice when configured', () => {
      const customManager = new VoiceConfigManager('Aoede');
      expect(customManager.getDefaultVoice()).toBe('Aoede');
    });
  });

  describe('isValidVoice', () => {
    it('should return true for valid Gemini voices', () => {
      expect(voiceConfigManager.isValidVoice('Charon')).toBe(true);
      expect(voiceConfigManager.isValidVoice('Aoede')).toBe(true);
      expect(voiceConfigManager.isValidVoice('Fenrir')).toBe(true);
      expect(voiceConfigManager.isValidVoice('Kore')).toBe(true);
      expect(voiceConfigManager.isValidVoice('Puck')).toBe(true);
      expect(voiceConfigManager.isValidVoice('Orbit')).toBe(true);
    });

    it('should return true for mapped legacy voice names', () => {
      expect(voiceConfigManager.isValidVoice('matthew')).toBe(true);
      expect(voiceConfigManager.isValidVoice('tiffany')).toBe(true);
      expect(voiceConfigManager.isValidVoice('amy')).toBe(true);
    });

    it('should return true for case-insensitive voice names', () => {
      expect(voiceConfigManager.isValidVoice('CHARON')).toBe(true);
      expect(voiceConfigManager.isValidVoice('charon')).toBe(true);
      expect(voiceConfigManager.isValidVoice('MATTHEW')).toBe(true);
    });

    it('should return false for unknown voice names', () => {
      expect(voiceConfigManager.isValidVoice('unknown')).toBe(false);
      expect(voiceConfigManager.isValidVoice('random')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(voiceConfigManager.isValidVoice('')).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      expect(voiceConfigManager.isValidVoice('   ')).toBe(false);
    });
  });

  describe('getAvailableVoices', () => {
    it('should return all Gemini voices (Requirement 9.5)', () => {
      const voices = voiceConfigManager.getAvailableVoices();
      expect(voices).toEqual(GEMINI_VOICES);
      expect(voices).toHaveLength(6);
    });

    it('should return readonly array', () => {
      const voices = voiceConfigManager.getAvailableVoices();
      // TypeScript should prevent modification, but we can verify it's the same reference
      expect(voices).toBe(GEMINI_VOICES);
    });
  });

  describe('getLegacyVoiceNames', () => {
    it('should return all legacy voice names', () => {
      const legacyNames = voiceConfigManager.getLegacyVoiceNames();
      expect(legacyNames).toContain('matthew');
      expect(legacyNames).toContain('tiffany');
      expect(legacyNames).toContain('amy');
    });
  });

  describe('getVoiceMapping', () => {
    it('should return a copy of the voice mapping', () => {
      const mapping = voiceConfigManager.getVoiceMapping();
      expect(mapping).toEqual(VOICE_MAPPING);
      // Should be a copy, not the original
      mapping['test'] = 'Charon' as GeminiVoice;
      expect(voiceConfigManager.getVoiceMapping()).not.toHaveProperty('test');
    });
  });
});

describe('Module-level convenience functions', () => {
  beforeEach(() => {
    resetVoiceConfigManager();
  });

  describe('getVoiceConfigManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getVoiceConfigManager();
      const manager2 = getVoiceConfigManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe('mapVoice', () => {
    it('should map legacy voice names correctly', () => {
      expect(mapVoice('matthew')).toBe('Charon');
      expect(mapVoice('tiffany')).toBe('Aoede');
      expect(mapVoice('amy')).toBe('Kore');
    });

    it('should return default for unknown names', () => {
      expect(mapVoice('unknown')).toBe('Charon');
    });
  });

  describe('getDefaultVoice', () => {
    it('should return Charon', () => {
      expect(getDefaultVoice()).toBe('Charon');
    });
  });

  describe('isValidVoice', () => {
    it('should validate voice names correctly', () => {
      expect(isValidVoice('Charon')).toBe(true);
      expect(isValidVoice('matthew')).toBe(true);
      expect(isValidVoice('unknown')).toBe(false);
    });
  });

  describe('getAvailableVoices', () => {
    it('should return all Gemini voices', () => {
      const voices = getAvailableVoices();
      expect(voices).toHaveLength(6);
      expect(voices).toContain('Charon');
    });
  });
});
