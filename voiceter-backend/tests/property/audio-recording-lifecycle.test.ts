/**
 * Property-based tests for audio recording lifecycle
 *
 * **Property 10: Audio recording lifecycle**
 * **Validates: Requirements 10.3, 10.4, 10.5**
 *
 * Requirement 10.3: THE Backend SHALL buffer audio chunks during the session
 *
 * Requirement 10.4: WHEN session ends, THE Backend SHALL upload combined
 * audio to S3
 *
 * Requirement 10.5: THE Backend SHALL store the S3 URL in session metadata
 */

import * as fc from 'fast-check';
import { RecordingRepository } from '../../src/data/recording-repository';

// Track uploaded files
const uploadedFiles: Map<string, { bucket: string; key: string; data: Buffer; contentType: string; metadata: any }> = new Map();

// Mock S3 upload
jest.mock('../../src/data/s3', () => ({
  uploadToS3: jest.fn(async (bucket: string, key: string, data: Buffer, contentType: string, metadata: any) => {
    uploadedFiles.set(key, { bucket, key, data, contentType, metadata });
    return `s3://${bucket}/${key}`;
  }),
}));

// Mock config
jest.mock('../../src/server/config', () => ({
  getConfig: () => ({
    aws: {
      s3BucketName: 'test-bucket',
      s3AudioPrefix: 'recordings/',
    },
    features: {
      enableAudioRecording: true,
    },
  }),
}));

// Mock logger
jest.mock('../../src/monitoring/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Property 10: Audio recording lifecycle', () => {
  let recordingRepository: RecordingRepository;

  beforeEach(() => {
    uploadedFiles.clear();
    recordingRepository = new RecordingRepository();
  });

  afterEach(() => {
    // Clean up any remaining buffers
    uploadedFiles.clear();
  });

  /**
   * Arbitrary for valid session IDs
   */
  const validSessionIdArb = fc.uuid();

  /**
   * Arbitrary for valid questionnaire IDs
   */
  const validQuestionnaireIdArb = fc.constantFrom(
    'demo1_csat_nps_electronics_retailer',
    'demo2_concept_test',
    'demo3_political_polling',
    'demo4_brand_tracker'
  );

  /**
   * Arbitrary for valid PCM audio chunks (16-bit samples)
   * Generates chunks that are multiples of 2 bytes (16-bit samples)
   */
  const validAudioChunkArb = fc.integer({ min: 64, max: 2048 })
    .chain(size => {
      // Ensure even size for 16-bit samples
      const evenSize = size - (size % 2);
      return fc.uint8Array({ minLength: evenSize, maxLength: evenSize });
    })
    .map(arr => Buffer.from(arr));

  /**
   * Arbitrary for audio source
   */
  const audioSourceArb = fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>;

  // Feature: direct-websocket-bedrock, Property 10: Buffer initialization
  it('should initialize buffer for new sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        async (sessionId) => {
          recordingRepository.initializeBuffer(sessionId);

          // Requirement 10.3: Buffer should exist after initialization
          expect(recordingRepository.hasBuffer(sessionId)).toBe(true);

          // Cleanup
          recordingRepository.cleanupBuffer(sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: User audio chunks are buffered
  it('should buffer user audio chunks', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 10 }),
        async (sessionId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          // Requirement 10.3: Add user audio chunks
          for (const chunk of chunks) {
            recordingRepository.addUserAudioChunk(sessionId, chunk);
          }

          // Buffer should still exist
          expect(recordingRepository.hasBuffer(sessionId)).toBe(true);

          // Cleanup
          recordingRepository.cleanupBuffer(sessionId);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Assistant audio chunks are buffered
  it('should buffer assistant audio chunks', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 10 }),
        async (sessionId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          // Requirement 10.3: Add assistant audio chunks
          for (const chunk of chunks) {
            recordingRepository.addAssistantAudioChunk(sessionId, chunk);
          }

          // Buffer should still exist
          expect(recordingRepository.hasBuffer(sessionId)).toBe(true);

          // Cleanup
          recordingRepository.cleanupBuffer(sessionId);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Mixed audio chunks are buffered
  it('should buffer mixed user and assistant audio chunks', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        fc.array(
          fc.tuple(audioSourceArb, validAudioChunkArb),
          { minLength: 2, maxLength: 20 }
        ),
        async (sessionId, chunksWithSource) => {
          recordingRepository.initializeBuffer(sessionId);

          // Requirement 10.3: Add mixed audio chunks
          for (const [source, chunk] of chunksWithSource) {
            if (source === 'user') {
              recordingRepository.addUserAudioChunk(sessionId, chunk);
            } else {
              recordingRepository.addAssistantAudioChunk(sessionId, chunk);
            }
          }

          // Buffer should still exist
          expect(recordingRepository.hasBuffer(sessionId)).toBe(true);

          // Cleanup
          recordingRepository.cleanupBuffer(sessionId);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Save recording uploads to S3
  it('should upload combined audio to S3 when session ends', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 5 }),
        async (sessionId, questionnaireId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          // Add some audio chunks
          for (const chunk of chunks) {
            recordingRepository.addUserAudioChunk(sessionId, chunk);
          }

          // Requirement 10.4: Save recording (uploads to S3)
          const metadata = await recordingRepository.saveRecording(sessionId, questionnaireId);

          // Should return metadata with S3 info
          expect(metadata).toBeDefined();
          expect(metadata!.s3Key).toBeDefined();
          expect(metadata!.s3Bucket).toBe('test-bucket');

          // Requirement 10.4: File should be uploaded to S3
          expect(uploadedFiles.size).toBeGreaterThan(0);
          
          // Find the uploaded file
          const uploadedFile = Array.from(uploadedFiles.values()).find(
            f => f.key.includes(sessionId)
          );
          expect(uploadedFile).toBeDefined();
          expect(uploadedFile!.contentType).toBe('audio/wav');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Recording metadata contains required fields
  it('should return recording metadata with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 5 }),
        async (sessionId, questionnaireId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          for (const chunk of chunks) {
            recordingRepository.addAssistantAudioChunk(sessionId, chunk);
          }

          const metadata = await recordingRepository.saveRecording(sessionId, questionnaireId);

          // Requirement 10.5: Metadata should contain S3 URL info
          expect(metadata).toBeDefined();
          expect(metadata!.sessionId).toBe(sessionId);
          expect(metadata!.questionnaireId).toBe(questionnaireId);
          expect(metadata!.s3Key).toBeDefined();
          expect(metadata!.s3Bucket).toBeDefined();
          expect(metadata!.format).toBe('wav');
          expect(metadata!.sampleRate).toBe(24000);
          expect(metadata!.uploadTime).toBeDefined();
          expect(typeof metadata!.duration).toBe('number');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Buffer is cleaned up after save
  it('should clean up buffer after saving recording', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 5 }),
        async (sessionId, questionnaireId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          for (const chunk of chunks) {
            recordingRepository.addUserAudioChunk(sessionId, chunk);
          }

          expect(recordingRepository.hasBuffer(sessionId)).toBe(true);

          await recordingRepository.saveRecording(sessionId, questionnaireId);

          // Buffer should be cleaned up after save
          expect(recordingRepository.hasBuffer(sessionId)).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Cleanup without save removes buffer
  it('should remove buffer on cleanup without saving', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 5 }),
        async (sessionId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          for (const chunk of chunks) {
            recordingRepository.addUserAudioChunk(sessionId, chunk);
          }

          expect(recordingRepository.hasBuffer(sessionId)).toBe(true);

          recordingRepository.cleanupBuffer(sessionId);

          // Buffer should be removed
          expect(recordingRepository.hasBuffer(sessionId)).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: No buffer returns null on save
  it('should return null when saving without buffer', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        async (sessionId, questionnaireId) => {
          // Don't initialize buffer
          const metadata = await recordingRepository.saveRecording(sessionId, questionnaireId);

          // Should return null when no buffer exists
          expect(metadata).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: WAV file has valid header
  it('should create valid WAV file with proper header', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 5 }),
        async (sessionId, questionnaireId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          for (const chunk of chunks) {
            recordingRepository.addAssistantAudioChunk(sessionId, chunk);
          }

          await recordingRepository.saveRecording(sessionId, questionnaireId);

          // Find the uploaded file
          const uploadedFile = Array.from(uploadedFiles.values()).find(
            f => f.key.includes(sessionId)
          );
          expect(uploadedFile).toBeDefined();

          const wavData = uploadedFile!.data;

          // Verify WAV header
          expect(wavData.slice(0, 4).toString()).toBe('RIFF');
          expect(wavData.slice(8, 12).toString()).toBe('WAVE');
          expect(wavData.slice(12, 16).toString()).toBe('fmt ');
          expect(wavData.slice(36, 40).toString()).toBe('data');

          // Verify audio format (PCM = 1)
          expect(wavData.readUInt16LE(20)).toBe(1);

          // Verify mono channel
          expect(wavData.readUInt16LE(22)).toBe(1);

          // Verify sample rate (24000 Hz)
          expect(wavData.readUInt32LE(24)).toBe(24000);

          // Verify bits per sample (16-bit)
          expect(wavData.readUInt16LE(34)).toBe(16);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: S3 key contains session ID
  it('should include session ID in S3 key', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 3 }),
        async (sessionId, questionnaireId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          for (const chunk of chunks) {
            recordingRepository.addUserAudioChunk(sessionId, chunk);
          }

          const metadata = await recordingRepository.saveRecording(sessionId, questionnaireId);

          // S3 key should contain session ID for organization
          expect(metadata!.s3Key).toContain(sessionId);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: S3 metadata includes session info
  it('should include session info in S3 metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        fc.array(validAudioChunkArb, { minLength: 1, maxLength: 3 }),
        async (sessionId, questionnaireId, chunks) => {
          recordingRepository.initializeBuffer(sessionId);

          for (const chunk of chunks) {
            recordingRepository.addUserAudioChunk(sessionId, chunk);
          }

          await recordingRepository.saveRecording(sessionId, questionnaireId);

          // Find the uploaded file
          const uploadedFile = Array.from(uploadedFiles.values()).find(
            f => f.key.includes(sessionId)
          );
          expect(uploadedFile).toBeDefined();

          // S3 metadata should include session info
          expect(uploadedFile!.metadata.sessionId).toBe(sessionId);
          expect(uploadedFile!.metadata.questionnaireId).toBe(questionnaireId);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Empty buffer creates valid empty WAV
  it('should create valid empty WAV for empty buffer', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validQuestionnaireIdArb,
        async (sessionId, questionnaireId) => {
          recordingRepository.initializeBuffer(sessionId);

          // Don't add any chunks
          const metadata = await recordingRepository.saveRecording(sessionId, questionnaireId);

          expect(metadata).toBeDefined();

          // Find the uploaded file
          const uploadedFile = Array.from(uploadedFiles.values()).find(
            f => f.key.includes(sessionId)
          );
          expect(uploadedFile).toBeDefined();

          const wavData = uploadedFile!.data;

          // Should still be a valid WAV file (just empty)
          expect(wavData.slice(0, 4).toString()).toBe('RIFF');
          expect(wavData.slice(8, 12).toString()).toBe('WAVE');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 10: Adding chunks to non-existent buffer is handled
  it('should handle adding chunks to non-existent buffer gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSessionIdArb,
        validAudioChunkArb,
        async (sessionId, chunk) => {
          // Don't initialize buffer, just try to add chunks
          // Should not throw
          expect(() => {
            recordingRepository.addUserAudioChunk(sessionId, chunk);
          }).not.toThrow();

          expect(() => {
            recordingRepository.addAssistantAudioChunk(sessionId, chunk);
          }).not.toThrow();
        }
      ),
      { numRuns: 50 }
    );
  });
});
