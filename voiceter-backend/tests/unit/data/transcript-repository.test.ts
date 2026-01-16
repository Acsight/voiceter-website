/**
 * Unit tests for TranscriptRepository
 */

import { TranscriptRepository } from '../../../src/data/transcript-repository';

describe('TranscriptRepository', () => {
  let repository: TranscriptRepository;

  beforeEach(() => {
    repository = new TranscriptRepository();
  });

  describe('saveTranscript', () => {
    it('should accept a valid TranscriptRecord', () => {
      // This test verifies the method signature is correct
      // Actual database operations would be tested in integration tests
      expect(typeof repository.saveTranscript).toBe('function');
      expect(repository.saveTranscript.length).toBe(1);
    });
  });

  describe('create', () => {
    it('should accept legacy format with role and content fields', () => {
      // This test verifies the method signature is correct
      expect(typeof repository.create).toBe('function');
      expect(repository.create.length).toBe(1);
    });

    it('should accept format with speaker and text fields', () => {
      // This test verifies the method signature is correct
      expect(typeof repository.create).toBe('function');
    });
  });

  describe('getTranscripts', () => {
    it('should accept a sessionId parameter', () => {
      // This test verifies the method signature is correct
      expect(typeof repository.getTranscripts).toBe('function');
      expect(repository.getTranscripts.length).toBe(1);
    });
  });

  describe('getTranscriptsBySpeaker', () => {
    it('should accept sessionId and speaker parameters', () => {
      // This test verifies the method signature is correct
      expect(typeof repository.getTranscriptsBySpeaker).toBe('function');
      expect(repository.getTranscriptsBySpeaker.length).toBe(2);
    });
  });

  describe('getFinalTranscripts', () => {
    it('should accept a sessionId parameter', () => {
      // This test verifies the method signature is correct
      expect(typeof repository.getFinalTranscripts).toBe('function');
      expect(repository.getFinalTranscripts.length).toBe(1);
    });
  });
});
