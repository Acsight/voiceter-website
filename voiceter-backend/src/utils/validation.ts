/**
 * Common validation utilities
 */

/**
 * Validate if a value is a non-empty string
 * @param value - The value to validate
 * @returns true if valid non-empty string, false otherwise
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate if a value is a valid number
 * @param value - The value to validate
 * @returns true if valid number, false otherwise
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Validate if a value is within a range
 * @param value - The number to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns true if within range, false otherwise
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Validate if a string matches a pattern
 * @param value - The string to validate
 * @param pattern - The regex pattern to match
 * @returns true if matches pattern, false otherwise
 */
export function matchesPattern(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

/**
 * Validate if an object has required properties
 * @param obj - The object to validate
 * @param requiredProps - Array of required property names
 * @returns true if all required properties exist, false otherwise
 */
export function hasRequiredProperties(obj: unknown, requiredProps: string[]): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  return requiredProps.every((prop) => prop in obj);
}

/**
 * Validate if a value is a valid email address
 * @param value - The string to validate
 * @returns true if valid email, false otherwise
 */
export function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validate if a value is a valid URL
 * @param value - The string to validate
 * @returns true if valid URL, false otherwise
 */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize a string by removing potentially dangerous characters
 * @param value - The string to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(value: string): string {
  return value.replace(/[<>'"]/g, '');
}

/**
 * Validate if a value is a valid JSON string
 * @param value - The string to validate
 * @returns true if valid JSON, false otherwise
 */
export function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
