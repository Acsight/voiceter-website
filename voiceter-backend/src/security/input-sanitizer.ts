/**
 * Input Sanitization Module
 * 
 * Provides comprehensive input sanitization to prevent injection attacks:
 * - SQL/NoSQL injection prevention
 * - XSS prevention (HTML encoding)
 * - Command injection prevention
 * - Log injection prevention
 * 
 * REQ-SEC-004: Protect Against Injection Attacks
 */

import { Logger } from '../monitoring/logger';

/**
 * Dangerous patterns that could indicate injection attempts
 */
const INJECTION_PATTERNS = {
  // SQL/NoSQL injection patterns
  sql: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|UNION|DECLARE)\b)/gi,
    /(--)|(\/\*)|(\*\/)/g,
    /(\bOR\b\s+\d+\s*=\s*\d+)/gi,
    /(\bAND\b\s+\d+\s*=\s*\d+)/gi,
    /(;\s*(DROP|DELETE|UPDATE|INSERT))/gi,
  ],
  // NoSQL injection patterns (MongoDB-style)
  nosql: [
    /\$where/gi,
    /\$gt|\$lt|\$gte|\$lte|\$ne|\$eq/gi,
    /\$regex/gi,
    /\$or|\$and|\$not|\$nor/gi,
  ],
  // XSS patterns
  xss: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<link/gi,
    /<meta/gi,
  ],
  // Command injection patterns
  command: [
    /[;&|`$(){}[\]]/g,
    /\b(rm|del|format|shutdown|reboot|kill|pkill)\b/gi,
    /\.\.\//g,
  ],
  // Log injection patterns (newlines, control characters)
  log: [
    /[\r\n]/g,
    /[\x00-\x1F\x7F]/g,
  ],
};

/**
 * HTML entities for encoding
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

export interface SanitizationResult {
  sanitized: string;
  wasModified: boolean;
  detectedThreats: string[];
}

export interface SanitizationOptions {
  allowHtml?: boolean;
  allowNewlines?: boolean;
  maxLength?: number;
  logThreats?: boolean;
}

/**
 * Input Sanitizer class
 * 
 * Provides methods to sanitize various types of input
 */
export class InputSanitizer {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Sanitize a string input
   * 
   * @param input - The input string to sanitize
   * @param options - Sanitization options
   * @returns Sanitization result with sanitized string and threat info
   */
  sanitizeString(input: string, options: SanitizationOptions = {}): SanitizationResult {
    const detectedThreats: string[] = [];
    let sanitized = input;
    const original = input;

    // Check for XSS FIRST and HTML encode before other sanitization
    if (!options.allowHtml) {
      for (const pattern of INJECTION_PATTERNS.xss) {
        if (pattern.test(sanitized)) {
          detectedThreats.push('XSS');
        }
      }
      // HTML encode to prevent XSS
      sanitized = this.htmlEncode(sanitized);
    }

    // Check for SQL injection (after HTML encoding so we check original patterns)
    for (const pattern of INJECTION_PATTERNS.sql) {
      if (pattern.test(input)) {
        detectedThreats.push('SQL_INJECTION');
        // Remove SQL keywords from sanitized string
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Check for NoSQL injection
    for (const pattern of INJECTION_PATTERNS.nosql) {
      if (pattern.test(input)) {
        detectedThreats.push('NOSQL_INJECTION');
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Check for command injection
    for (const pattern of INJECTION_PATTERNS.command) {
      if (pattern.test(input)) {
        detectedThreats.push('COMMAND_INJECTION');
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Check for log injection
    if (!options.allowNewlines) {
      for (const pattern of INJECTION_PATTERNS.log) {
        if (pattern.test(sanitized)) {
          detectedThreats.push('LOG_INJECTION');
          sanitized = sanitized.replace(pattern, ' ');
        }
      }
    }

    // Enforce max length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    // Log threats if detected and logging enabled
    if (options.logThreats && detectedThreats.length > 0 && this.logger) {
      this.logger.warn('Injection attempt detected', {
        event: 'injection_attempt_detected',
        data: {
          threats: [...new Set(detectedThreats)],
          inputLength: original.length,
        },
      });
    }

    return {
      sanitized,
      wasModified: sanitized !== original,
      detectedThreats: [...new Set(detectedThreats)],
    };
  }

  /**
   * HTML encode a string to prevent XSS
   */
  htmlEncode(input: string): string {
    return input.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
  }

  /**
   * Sanitize for logging (remove control characters, limit length)
   */
  sanitizeForLog(input: string, maxLength: number = 1000): string {
    let sanitized = input;
    
    // Remove control characters except newlines
    sanitized = sanitized.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Replace newlines with escaped version for single-line logs
    sanitized = sanitized.replace(/\r?\n/g, '\\n');
    
    // Truncate if too long
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...[truncated]';
    }
    
    return sanitized;
  }

  /**
   * Sanitize an object recursively
   */
  sanitizeObject<T extends Record<string, any>>(
    obj: T,
    options: SanitizationOptions = {}
  ): { sanitized: T; threats: string[] } {
    const allThreats: string[] = [];
    
    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        const result = this.sanitizeString(value, options);
        allThreats.push(...result.detectedThreats);
        return result.sanitized;
      }
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      if (value && typeof value === 'object') {
        const sanitizedObj: Record<string, any> = {};
        for (const [key, val] of Object.entries(value)) {
          // Also sanitize keys
          const keyResult = this.sanitizeString(key, { ...options, maxLength: 100 });
          allThreats.push(...keyResult.detectedThreats);
          sanitizedObj[keyResult.sanitized] = sanitizeValue(val);
        }
        return sanitizedObj;
      }
      return value;
    };

    return {
      sanitized: sanitizeValue(obj) as T,
      threats: [...new Set(allThreats)],
    };
  }

  /**
   * Validate and sanitize a session ID
   */
  sanitizeSessionId(sessionId: string): SanitizationResult {
    // Session IDs should only contain alphanumeric characters and hyphens
    const sanitized = sessionId.replace(/[^a-zA-Z0-9-]/g, '');
    const wasModified = sanitized !== sessionId;
    
    return {
      sanitized,
      wasModified,
      detectedThreats: wasModified ? ['INVALID_SESSION_ID_CHARS'] : [],
    };
  }

  /**
   * Validate and sanitize a questionnaire ID
   */
  sanitizeQuestionnaireId(questionnaireId: string): SanitizationResult {
    // Questionnaire IDs should only contain alphanumeric, hyphens, underscores
    const sanitized = questionnaireId.replace(/[^a-zA-Z0-9_-]/g, '');
    const wasModified = sanitized !== questionnaireId;
    
    return {
      sanitized,
      wasModified,
      detectedThreats: wasModified ? ['INVALID_QUESTIONNAIRE_ID_CHARS'] : [],
    };
  }

  /**
   * Check if input contains potential injection attempts without modifying
   */
  detectThreats(input: string): string[] {
    const threats: string[] = [];
    
    for (const pattern of INJECTION_PATTERNS.sql) {
      if (pattern.test(input)) threats.push('SQL_INJECTION');
    }
    for (const pattern of INJECTION_PATTERNS.nosql) {
      if (pattern.test(input)) threats.push('NOSQL_INJECTION');
    }
    for (const pattern of INJECTION_PATTERNS.xss) {
      if (pattern.test(input)) threats.push('XSS');
    }
    for (const pattern of INJECTION_PATTERNS.command) {
      if (pattern.test(input)) threats.push('COMMAND_INJECTION');
    }
    
    return [...new Set(threats)];
  }
}

// Singleton instance
let sanitizerInstance: InputSanitizer | null = null;

/**
 * Initialize the global InputSanitizer instance
 */
export function initializeInputSanitizer(logger?: Logger): InputSanitizer {
  sanitizerInstance = new InputSanitizer(logger);
  return sanitizerInstance;
}

/**
 * Get the global InputSanitizer instance
 */
export function getInputSanitizer(): InputSanitizer {
  if (!sanitizerInstance) {
    sanitizerInstance = new InputSanitizer();
  }
  return sanitizerInstance;
}
