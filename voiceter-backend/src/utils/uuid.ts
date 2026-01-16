/**
 * UUID generation utilities
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique session ID
 * @returns A unique UUID v4 string
 */
export function generateSessionId(): string {
  return uuidv4();
}

/**
 * Generate a unique prompt name for Bedrock streaming
 * @returns A unique prompt identifier
 */
export function generatePromptName(): string {
  return `prompt-${uuidv4()}`;
}

/**
 * Generate a unique content name for Bedrock streaming
 * @returns A unique content identifier
 */
export function generateContentName(): string {
  return `content-${uuidv4()}`;
}

/**
 * Validate if a string is a valid UUID
 * @param id - The string to validate
 * @returns true if valid UUID, false otherwise
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
