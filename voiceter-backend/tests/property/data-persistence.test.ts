/**
 * Property-based tests for data persistence
 *
 * **Property 7: Data persistence completeness**
 * **Validates: Requirements 7.2, 7.3, 7.4, 8.3, 8.4**
 *
 * Requirement 7.2: THE Backend SHALL persist response data to DynamoDB
 * when record_response tool executes
 *
 * Requirement 7.3: THE Backend SHALL store response data with sessionId,
 * questionId, response, and timestamp
 *
 * Requirement 7.4: THE Backend SHALL store response metadata including
 * questionNumber, questionType, and responseTime
 *
 * Requirement 8.3: THE Backend SHALL persist user transcripts to DynamoDB
 * with sessionId, role, content, and timestamp
 *
 * Requirement 8.4: THE Backend SHALL persist assistant transcripts to DynamoDB
 * with sessionId, role, content, and timestamp
 */

import * as fc from 'fast-check';
import type { ResponseRecord, TranscriptRecord } from '../../src/data/types';

// Shared mock storage - must be defined before mocks
const mockStorage = new Map<string, Map<string, any>>();

// Mock DynamoDB client
jest.mock('../../src/data/dynamodb', () => {
  return {
    getDynamoDBClient: () => ({
      putItem: jest.fn(async (tableName: string, item: any) => {
        if (!mockStorage.has(tableName)) {
          mockStorage.set(tableName, new Map());
        }
        const table = mockStorage.get(tableName)!;
        // Use composite key for responses, transcriptId for transcripts
        const key = item.responseId || item.transcriptId || `${item.sessionId}-${item.questionId || item.timestamp}`;
        table.set(key, item);
      }),
      getItem: jest.fn(async (tableName: string, key: any) => {
        const table = mockStorage.get(tableName);
        if (!table) return null;
        // Find by sessionId and questionId/timestamp
        for (const item of table.values()) {
          if (item.sessionId === key.sessionId) {
            if (key.questionId && item.questionId === key.questionId) return item;
            if (key.timestamp && item.timestamp === key.timestamp) return item;
          }
        }
        return null;
      }),
      query: jest.fn(async (tableName: string, _keyCondition: string, values: any) => {
        const table = mockStorage.get(tableName);
        if (!table) return [];
        const sessionId = values[':sessionId'];
        return Array.from(table.values()).filter(item => item.sessionId === sessionId);
      }),
      deleteItem: jest.fn(async (tableName: string, key: any) => {
        const table = mockStorage.get(tableName);
        if (!table) return;
        for (const [k, item] of table.entries()) {
          if (item.sessionId === key.sessionId) {
            if (key.questionId && item.questionId === key.questionId) {
              table.delete(k);
              return;
            }
            if (key.timestamp && item.timestamp === key.timestamp) {
              table.delete(k);
              return;
            }
          }
        }
      }),
    }),
  };
});

// Mock logger
jest.mock('../../src/monitoring/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Import after mocks are set up
import { ResponseRepository } from '../../src/data/response-repository';
import { TranscriptRepository } from '../../src/data/transcript-repository';

describe('Property 7: Data persistence completeness', () => {
  let responseRepository: ResponseRepository;
  let transcriptRepository: TranscriptRepository;

  beforeEach(() => {
    // Clear mock storage before each test
    mockStorage.clear();
    
    responseRepository = new ResponseRepository();
    transcriptRepository = new TranscriptRepository();
  });

  /**
   * Arbitrary for valid session IDs (UUID format)
   */
  const validSessionIdArb = fc.uuid();

  /**
   * Arbitrary for valid question IDs
   */
  const validQuestionIdArb = fc.string({ minLength: 1, maxLength: 30 })
    .map(s => `q-${s.replace(/[^a-zA-Z0-9-]/g, '')}`);

  /**
   * Arbitrary for valid question types
   */
  const validQuestionTypeArb = fc.constantFrom(
    'text',
    'number',
    'rating',
    'single_choice',
    'multiple_choice',
    'yes_no',
    'nps',
    'open_ended'
  );

  /**
   * Arbitrary for valid response types
   */
  const validResponseTypeArb = fc.constantFrom(
    'text',
    'number',
    'rating',
    'single_choice',
    'multiple_choice',
    'structured'
  );

  /**
   * Arbitrary for valid response values
   */
  const validResponseValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 500 }),
    fc.integer({ min: 0, max: 10 }).map(String),
    fc.constantFrom('yes', 'no', 'Yes', 'No'),
    fc.constantFrom('1', '2', '3', '4', '5')
  );

  /**
   * Arbitrary for valid ISO 8601 timestamps
   * Using integer-based approach to avoid invalid date issues
   */
  const validTimestampArb = fc.integer({ min: 1704067200000, max: 1735689600000 }) // 2024-01-01 to 2025-01-01
    .map(ms => new Date(ms).toISOString());

  /**
   * Arbitrary for valid response records
   */
  const validResponseRecordArb: fc.Arbitrary<ResponseRecord> = fc.record({
    sessionId: validSessionIdArb,
    questionId: validQuestionIdArb,
    questionNumber: fc.integer({ min: 1, max: 50 }),
    questionType: validQuestionTypeArb,
    questionText: fc.string({ minLength: 5, maxLength: 200 }),
    response: validResponseValueArb,
    responseType: validResponseTypeArb,
    timestamp: validTimestampArb,
    responseTime: fc.integer({ min: 100, max: 60000 }),
    clarificationCount: fc.integer({ min: 0, max: 5 }),
    metadata: fc.constant({}),
  });

  /**
   * Arbitrary for valid transcript roles
   */
  const validRoleArb = fc.constantFrom('USER', 'ASSISTANT') as fc.Arbitrary<'USER' | 'ASSISTANT'>;

  /**
   * Arbitrary for valid transcription types
   */
  const validTranscriptionTypeArb = fc.constantFrom('ASR_FINAL', 'SPECULATIVE', 'FINAL') as fc.Arbitrary<'ASR_FINAL' | 'SPECULATIVE' | 'FINAL'>;

  /**
   * Arbitrary for valid transcript records
   * Note: timestamp can be string (ISO 8601) or number (epoch ms) per types.ts
   */
  const validTranscriptRecordArb: fc.Arbitrary<TranscriptRecord> = fc.record({
    sessionId: validSessionIdArb,
    timestamp: fc.oneof(
      validTimestampArb,
      fc.integer({ min: 1700000000000, max: 1800000000000 })
    ),
    role: validRoleArb,
    transcriptionType: validTranscriptionTypeArb,
    content: fc.string({ minLength: 1, maxLength: 1000 }),
    interrupted: fc.boolean(),
    generationStage: fc.constantFrom('FINAL', 'SPECULATIVE'),
    isFinal: fc.boolean(),
    turnNumber: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    guardrailBlocked: fc.option(fc.boolean(), { nil: undefined }),
  });

  // Feature: direct-websocket-bedrock, Property 7: Response records contain required fields
  it('should persist response records with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        validResponseRecordArb,
        async (response) => {
          await responseRepository.saveResponse(response);

          // Verify the record was stored
          const table = mockStorage.get('responses');
          expect(table).toBeDefined();
          expect(table!.size).toBeGreaterThan(0);

          // Find the stored record
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === response.sessionId && r.questionId === response.questionId
          );
          expect(storedRecords.length).toBeGreaterThan(0);

          const storedRecord = storedRecords[0] as any;

          // Requirement 7.3: Must have sessionId, questionId, response, timestamp
          expect(storedRecord.sessionId).toBe(response.sessionId);
          expect(storedRecord.questionId).toBe(response.questionId);
          expect(storedRecord.response).toBe(response.response);
          expect(storedRecord.timestamp).toBe(response.timestamp);

          // Requirement 7.4: Must have questionNumber, questionType, responseTime
          expect(storedRecord.questionNumber).toBe(response.questionNumber);
          expect(storedRecord.questionType).toBe(response.questionType);
          expect(storedRecord.responseTime).toBe(response.responseTime);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Response records have TTL
  it('should set TTL on response records', async () => {
    await fc.assert(
      fc.asyncProperty(
        validResponseRecordArb,
        async (response) => {
          await responseRepository.saveResponse(response);

          const table = mockStorage.get('responses');
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === response.sessionId && r.questionId === response.questionId
          );
          const storedRecord = storedRecords[0] as any;

          // TTL should be set (90 days from now)
          expect(storedRecord.ttl).toBeDefined();
          expect(typeof storedRecord.ttl).toBe('number');
          
          // TTL should be approximately 90 days in the future
          const now = Math.floor(Date.now() / 1000);
          const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
          expect(storedRecord.ttl).toBeGreaterThan(now);
          expect(storedRecord.ttl).toBeLessThanOrEqual(now + ninetyDaysInSeconds + 60); // Allow 60s tolerance
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Transcript records contain required fields
  it('should persist transcript records with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTranscriptRecordArb,
        async (transcript) => {
          await transcriptRepository.saveTranscript(transcript);

          // Verify the record was stored
          const table = mockStorage.get('transcripts');
          expect(table).toBeDefined();
          expect(table!.size).toBeGreaterThan(0);

          // Find the stored record
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === transcript.sessionId
          );
          expect(storedRecords.length).toBeGreaterThan(0);

          const storedRecord = storedRecords[storedRecords.length - 1] as any;

          // Requirement 8.3, 8.4: Must have sessionId, role, content, timestamp
          expect(storedRecord.sessionId).toBe(transcript.sessionId);
          expect(storedRecord.role).toBe(transcript.role);
          expect(storedRecord.content).toBe(transcript.content);
          expect(typeof storedRecord.timestamp).toBe('number');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: User transcripts are persisted correctly
  it('should persist user transcripts with correct role', async () => {
    const userTranscriptArb = validTranscriptRecordArb.map(t => ({
      ...t,
      role: 'USER' as const,
    }));

    await fc.assert(
      fc.asyncProperty(
        userTranscriptArb,
        async (transcript) => {
          await transcriptRepository.saveTranscript(transcript);

          const table = mockStorage.get('transcripts');
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === transcript.sessionId
          );
          const storedRecord = storedRecords[storedRecords.length - 1] as any;

          // Requirement 8.3: User transcripts must have role USER
          expect(storedRecord.role).toBe('USER');
          expect(storedRecord.content).toBe(transcript.content);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Assistant transcripts are persisted correctly
  it('should persist assistant transcripts with correct role', async () => {
    const assistantTranscriptArb = validTranscriptRecordArb.map(t => ({
      ...t,
      role: 'ASSISTANT' as const,
    }));

    await fc.assert(
      fc.asyncProperty(
        assistantTranscriptArb,
        async (transcript) => {
          await transcriptRepository.saveTranscript(transcript);

          const table = mockStorage.get('transcripts');
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === transcript.sessionId
          );
          const storedRecord = storedRecords[storedRecords.length - 1] as any;

          // Requirement 8.4: Assistant transcripts must have role ASSISTANT
          expect(storedRecord.role).toBe('ASSISTANT');
          expect(storedRecord.content).toBe(transcript.content);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Transcript records have turn number
  it('should persist transcript records with turn number', async () => {
    const transcriptWithTurnArb = validTranscriptRecordArb.map(t => ({
      ...t,
      turnNumber: Math.floor(Math.random() * 100),
    }));

    await fc.assert(
      fc.asyncProperty(
        transcriptWithTurnArb,
        async (transcript) => {
          await transcriptRepository.saveTranscript(transcript);

          const table = mockStorage.get('transcripts');
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === transcript.sessionId
          );
          const storedRecord = storedRecords[storedRecords.length - 1] as any;

          // Turn number should be stored
          expect(storedRecord.turnNumber).toBeDefined();
          expect(typeof storedRecord.turnNumber).toBe('number');
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Transcript records have TTL
  it('should set TTL on transcript records', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTranscriptRecordArb,
        async (transcript) => {
          await transcriptRepository.saveTranscript(transcript);

          const table = mockStorage.get('transcripts');
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === transcript.sessionId
          );
          const storedRecord = storedRecords[storedRecords.length - 1] as any;

          // TTL should be set
          expect(storedRecord.ttl).toBeDefined();
          expect(typeof storedRecord.ttl).toBe('number');
          
          // TTL should be in the future
          const now = Math.floor(Date.now() / 1000);
          expect(storedRecord.ttl).toBeGreaterThan(now);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Response records have unique IDs
  it('should generate unique response IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validResponseRecordArb, { minLength: 2, maxLength: 10 }),
        async (responses) => {
          // Save all responses
          for (const response of responses) {
            await responseRepository.saveResponse(response);
          }

          const table = mockStorage.get('responses');
          const allRecords = Array.from(table!.values()) as any[];

          // All responseIds should be unique
          const responseIds = allRecords.map(r => r.responseId);
          const uniqueIds = new Set(responseIds);
          expect(uniqueIds.size).toBe(responseIds.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Transcript records have unique IDs
  it('should generate unique transcript IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validTranscriptRecordArb, { minLength: 2, maxLength: 10 }),
        async (transcripts) => {
          // Save all transcripts with slightly different timestamps to ensure uniqueness
          const baseTime = Date.now();
          for (let i = 0; i < transcripts.length; i++) {
            const transcript = { ...transcripts[i], timestamp: baseTime + i };
            await transcriptRepository.saveTranscript(transcript);
          }

          const table = mockStorage.get('transcripts');
          const allRecords = Array.from(table!.values()) as any[];

          // All transcriptIds should be unique
          const transcriptIds = allRecords.map(r => r.transcriptId);
          const uniqueIds = new Set(transcriptIds);
          expect(uniqueIds.size).toBe(transcriptIds.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: direct-websocket-bedrock, Property 7: Guardrail blocked flag is persisted
  it('should persist guardrail blocked flag on transcripts', async () => {
    const transcriptWithGuardrailArb = validTranscriptRecordArb.map(t => ({
      ...t,
      guardrailBlocked: true,
    }));

    await fc.assert(
      fc.asyncProperty(
        transcriptWithGuardrailArb,
        async (transcript) => {
          await transcriptRepository.saveTranscript(transcript);

          const table = mockStorage.get('transcripts');
          const storedRecords = Array.from(table!.values()).filter(
            (r: any) => r.sessionId === transcript.sessionId
          );
          const storedRecord = storedRecords[storedRecords.length - 1] as any;

          // Guardrail blocked flag should be persisted
          expect(storedRecord.guardrailBlocked).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});
