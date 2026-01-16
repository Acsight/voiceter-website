/**
 * Type definitions for database records and data access layer
 * 
 * Requirements:
 * - REQ-DATA-001: Design Database Schema
 * - REQ-DATA-002: Record Session Metadata
 * - REQ-DATA-003: Store Survey Responses
 * - REQ-DATA-004: Store Conversation Transcripts
 * - REQ-DATA-005: Aggregate Analytics Data
 */

/**
 * Session record in DynamoDB (demo-sessions table)
 * 
 * Requirements:
 * - REQ-DATA-001: Table 1 schema
 * - REQ-DATA-002: Session metadata fields
 */
export interface SessionRecord {
  sessionId: string;
  questionnaireId: string;
  questionnaireName: string;
  currentQuestionIndex: number;
  startTime: string; // ISO 8601
  lastActivityTime: string; // ISO 8601
  status: 'active' | 'completed' | 'abandoned' | 'terminated' | 'error';
  voiceId: string;
  metadata: Record<string, any>;
  // Optional fields
  endTime?: string; // ISO 8601
  duration?: number; // seconds
  userId?: string;
  completionRate?: number; // 0-100
  ipAddress?: string; // anonymized hash
  userAgent?: string;
  quotaFields?: Record<string, string>;
  audioFileId?: string; // S3 key for the audio recording file
  ttl?: number; // TTL for auto-deletion (90 days)
}

/**
 * Response record in DynamoDB (demo-responses table)
 * 
 * Requirements:
 * - REQ-DATA-001: Table 2 schema
 * - REQ-DATA-003: Store Survey Responses
 */
export interface ResponseRecord {
  sessionId: string;
  questionId: string;
  questionNumber?: number;
  questionType?: string;
  questionText?: string;
  response: string | number | Record<string, any>;
  responseType: 'structured' | 'transcription' | string;
  timestamp: string; // ISO 8601
  responseTime?: number; // seconds
  clarificationCount?: number;
  metadata: Record<string, any>;
  ttl?: number; // TTL for auto-deletion (90 days)
}

/**
 * Transcript record in DynamoDB (demo-transcripts table)
 * 
 * Requirements:
 * - REQ-DATA-001: Table 3 schema
 * - REQ-DATA-004: Store Conversation Transcripts
 */
export interface TranscriptRecord {
  sessionId: string;
  timestamp: string | number; // ISO 8601 or epoch ms (sort key)
  turnNumber?: number; // For ordering transcripts in conversation
  role: 'USER' | 'ASSISTANT';
  speaker?: 'USER' | 'ASSISTANT'; // Alias for role
  transcriptionType: 'ASR_FINAL' | 'SPECULATIVE' | 'FINAL';
  content: string;
  text?: string; // Alias for content
  interrupted: boolean;
  generationStage?: string;
  isFinal?: boolean; // Derived from transcriptionType
  guardrailBlocked?: boolean; // Whether content was blocked by guardrails
  ttl?: number; // TTL for auto-deletion (90 days)
}

/**
 * Analytics record in DynamoDB (demo-analytics table)
 * 
 * Requirements:
 * - REQ-DATA-001: Table 4 schema
 * - REQ-DATA-005: Aggregate Analytics Data
 */
export interface AnalyticsRecord {
  date: string; // YYYY-MM-DD (partition key)
  questionnaireId: string; // (sort key)
  totalSessions: number;
  completedSessions: number;
  averageDuration: number; // seconds
  averageCompletionRate: number; // 0-100
  popularVoices: Record<string, number>; // Map<voiceId, count>
  peakUsageHours?: Record<string, number>; // Map<hour, count>
  averageResponseTimePerQuestion?: Record<string, number>; // Map<questionId, avgTime>
  ttl?: number; // TTL for auto-deletion
}

/**
 * Recording metadata in S3
 */
export interface RecordingMetadata {
  sessionId: string;
  questionnaireId: string;
  duration: number; // seconds
  format: string;
  sampleRate: number;
  uploadTime: string; // ISO 8601
  s3Key: string;
  s3Bucket: string;
}

/**
 * Analytics aggregation input for batch processing
 */
export interface AnalyticsAggregationInput {
  date: string; // YYYY-MM-DD
  questionnaireId: string;
  sessions: SessionRecord[];
  responses: ResponseRecord[];
}

/**
 * Day-over-day trend data
 */
export interface AnalyticsTrend {
  date: string;
  questionnaireId: string;
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  averageDuration: number;
  dayOverDayChange?: {
    totalSessions: number; // percentage change
    completedSessions: number;
    completionRate: number;
    averageDuration: number;
  };
  weekOverWeekChange?: {
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
    averageDuration: number;
  };
}

/**
 * DynamoDB query options
 */
export interface QueryOptions {
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
  scanIndexForward?: boolean;
}

/**
 * DynamoDB query result
 */
export interface QueryResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
}

/**
 * Retry options for database operations
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
}

/**
 * Database operation result
 */
export interface OperationResult {
  success: boolean;
  error?: Error;
  retryCount?: number;
}

/**
 * S3 upload options
 */
export interface S3UploadOptions {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

/**
 * S3 download options
 */
export interface S3DownloadOptions {
  bucket: string;
  key: string;
}
