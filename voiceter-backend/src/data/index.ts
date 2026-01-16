/**
 * Data module exports
 * 
 * Requirements:
 * - REQ-DATA-001: Design Database Schema
 * - REQ-DATA-002: Record Session Metadata
 * - REQ-DATA-003: Store Survey Responses
 * - REQ-DATA-004: Store Conversation Transcripts
 * - REQ-DATA-005: Aggregate Analytics Data
 */

export * from './types';
export * from './dynamodb';
export { SessionRepository, getSessionRepository, anonymizeIpAddress } from './session-repository';
export * from './response-repository';
export * from './transcript-repository';
export * from './error-handler';
