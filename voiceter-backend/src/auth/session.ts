/**
 * Session ID validation utilities.
 * 
 * Validates session IDs to ensure they are properly formatted
 * and meet security requirements.
 */

/**
 * Session ID validation result.
 */
export interface SessionIdValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validate session ID format and security requirements.
 * 
 * Session IDs should be:
 * - UUIDs (v4 format)
 * - 36 characters long (including hyphens)
 * - Contain only alphanumeric characters and hyphens
 * 
 * @param sessionId - Session ID to validate
 * @returns Validation result
 */
export function validateSessionId(sessionId: string): SessionIdValidation {
  // Check if session ID is provided
  if (!sessionId) {
    return {
      valid: false,
      reason: 'Session ID is required',
    };
  }

  // Check if session ID is a string
  if (typeof sessionId !== 'string') {
    return {
      valid: false,
      reason: 'Session ID must be a string',
    };
  }

  // Check length (UUID v4 is 36 characters with hyphens)
  if (sessionId.length !== 36) {
    return {
      valid: false,
      reason: 'Session ID must be 36 characters long',
    };
  }

  // Check UUID v4 format
  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidV4Regex.test(sessionId)) {
    return {
      valid: false,
      reason: 'Session ID must be a valid UUID v4',
    };
  }

  // Check for suspicious patterns
  // Reject session IDs with all zeros or all ones
  if (/^[0-]+$/.test(sessionId.replace(/-/g, ''))) {
    return {
      valid: false,
      reason: 'Session ID contains suspicious pattern',
    };
  }

  if (/^[f]+$/i.test(sessionId.replace(/-/g, ''))) {
    return {
      valid: false,
      reason: 'Session ID contains suspicious pattern',
    };
  }

  // Session ID is valid
  return {
    valid: true,
  };
}

/**
 * Sanitize session ID for logging.
 * 
 * Masks part of the session ID to prevent full session ID exposure in logs.
 * 
 * @param sessionId - Session ID to sanitize
 * @returns Sanitized session ID
 */
export function sanitizeSessionId(sessionId: string): string {
  if (!sessionId || sessionId.length < 8) {
    return '****';
  }

  // Show first 8 characters and last 4 characters
  const start = sessionId.substring(0, 8);
  const end = sessionId.substring(sessionId.length - 4);

  return `${start}...${end}`;
}

/**
 * Validate session ID from multiple sources.
 * 
 * Checks cookie, header, and query parameter for session ID.
 * Returns the first valid session ID found.
 * 
 * @param sources - Object containing potential session ID sources
 * @returns Valid session ID or null
 */
export function extractValidSessionId(sources: {
  cookie?: string;
  header?: string;
  query?: string;
}): string | null {
  // Priority: query > header > cookie
  const candidates = [sources.query, sources.header, sources.cookie];

  for (const candidate of candidates) {
    if (candidate) {
      const validation = validateSessionId(candidate);
      if (validation.valid) {
        return candidate;
      }
    }
  }

  return null;
}

