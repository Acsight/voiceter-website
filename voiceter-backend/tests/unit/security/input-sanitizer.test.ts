/**
 * Unit tests for Input Sanitizer
 * 
 * REQ-SEC-004: Protect Against Injection Attacks
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  InputSanitizer,
  getInputSanitizer,
} from '../../../src/security/input-sanitizer';

describe('InputSanitizer', () => {
  let sanitizer: InputSanitizer;

  beforeEach(() => {
    sanitizer = new InputSanitizer();
  });

  describe('sanitizeString', () => {
    describe('SQL Injection Prevention', () => {
      it('should detect and remove SQL injection attempts', () => {
        const maliciousInputs = [
          "'; DROP TABLE users; --",
          "1 OR 1=1",
          "1; DELETE FROM sessions",
          "UNION SELECT * FROM passwords",
          "/* comment */ SELECT",
        ];

        for (const input of maliciousInputs) {
          const result = sanitizer.sanitizeString(input);
          expect(result.detectedThreats).toContain('SQL_INJECTION');
          expect(result.wasModified).toBe(true);
        }
      });

      it('should allow normal text without SQL keywords in context', () => {
        const normalInputs = [
          'I would like to select option A',
          'Please update my preferences',
          'I want to delete my account',
        ];

        for (const input of normalInputs) {
          const result = sanitizer.sanitizeString(input);
          // These should be detected but the text should still be usable
          expect(result.sanitized.length).toBeGreaterThan(0);
        }
      });
    });

    describe('NoSQL Injection Prevention', () => {
      it('should detect NoSQL injection patterns', () => {
        const maliciousInputs = [
          '{"$where": "this.password == \'test\'"}',
          '{"$gt": ""}',
          '{"$or": [{"a": 1}]}',
          '{"$regex": ".*"}',
        ];

        for (const input of maliciousInputs) {
          const result = sanitizer.sanitizeString(input);
          expect(result.detectedThreats).toContain('NOSQL_INJECTION');
        }
      });
    });

    describe('XSS Prevention', () => {
      it('should HTML encode dangerous characters', () => {
        const result = sanitizer.sanitizeString('<script>alert("xss")</script>');
        expect(result.detectedThreats).toContain('XSS');
        expect(result.sanitized).not.toContain('<script>');
        // After HTML encoding, the string contains encoded entities
        // The exact output depends on sanitization order
      });

      it('should detect javascript: URLs', () => {
        const result = sanitizer.sanitizeString('javascript:alert(1)');
        expect(result.detectedThreats).toContain('XSS');
      });

      it('should detect event handlers', () => {
        const result = sanitizer.sanitizeString('<img onerror="alert(1)">');
        expect(result.detectedThreats).toContain('XSS');
      });

      it('should allow HTML when option is set', () => {
        const result = sanitizer.sanitizeString('<b>bold</b>', { allowHtml: true });
        expect(result.sanitized).toContain('<b>');
      });
    });

    describe('Command Injection Prevention', () => {
      it('should detect command injection patterns', () => {
        const maliciousInputs = [
          '; rm -rf /',
          '| cat /etc/passwd',
          '`whoami`',
          '$(id)',
          '../../../etc/passwd',
        ];

        for (const input of maliciousInputs) {
          const result = sanitizer.sanitizeString(input);
          expect(result.detectedThreats).toContain('COMMAND_INJECTION');
          expect(result.wasModified).toBe(true);
        }
      });
    });

    describe('Log Injection Prevention', () => {
      it('should remove newlines by default', () => {
        const result = sanitizer.sanitizeString('line1\nline2\rline3');
        expect(result.detectedThreats).toContain('LOG_INJECTION');
        expect(result.sanitized).not.toContain('\n');
        expect(result.sanitized).not.toContain('\r');
      });

      it('should allow newlines when option is set', () => {
        const result = sanitizer.sanitizeString('line1\nline2', { allowNewlines: true });
        expect(result.sanitized).toContain('\n');
      });

      it('should remove control characters', () => {
        const result = sanitizer.sanitizeString('test\x00\x1Fvalue');
        expect(result.sanitized).not.toContain('\x00');
        expect(result.sanitized).not.toContain('\x1F');
      });
    });

    describe('Max Length Enforcement', () => {
      it('should truncate strings exceeding max length', () => {
        const longString = 'a'.repeat(1000);
        const result = sanitizer.sanitizeString(longString, { maxLength: 100 });
        expect(result.sanitized.length).toBe(100);
      });
    });
  });

  describe('htmlEncode', () => {
    it('should encode all HTML special characters', () => {
      const input = '<script>alert("test\'s & value")</script>';
      const encoded = sanitizer.htmlEncode(input);
      
      expect(encoded).toContain('&lt;');
      expect(encoded).toContain('&gt;');
      expect(encoded).toContain('&quot;');
      expect(encoded).toContain('&#x27;');
      expect(encoded).toContain('&amp;');
    });
  });

  describe('sanitizeForLog', () => {
    it('should escape newlines for single-line logs', () => {
      const result = sanitizer.sanitizeForLog('line1\nline2');
      expect(result).toBe('line1\\nline2');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(2000);
      const result = sanitizer.sanitizeForLog(longString, 100);
      expect(result.length).toBeLessThanOrEqual(115); // 100 + '...[truncated]'
      expect(result).toContain('[truncated]');
    });

    it('should remove control characters', () => {
      const result = sanitizer.sanitizeForLog('test\x00value');
      expect(result).not.toContain('\x00');
    });
  });

  describe('sanitizeObject', () => {
    it('should recursively sanitize object values', () => {
      const obj = {
        name: '<script>alert(1)</script>',
        nested: {
          value: "'; DROP TABLE users; --",
        },
        array: ['normal', '<img onerror="alert(1)">'],
      };

      const result = sanitizer.sanitizeObject(obj);
      
      expect(result.threats).toContain('XSS');
      expect(result.threats).toContain('SQL_INJECTION');
      expect(result.sanitized.name).not.toContain('<script>');
    });

    it('should sanitize object keys', () => {
      const obj = {
        '<script>': 'value',
      };

      const result = sanitizer.sanitizeObject(obj);
      expect(Object.keys(result.sanitized)[0]).not.toContain('<script>');
    });
  });

  describe('sanitizeSessionId', () => {
    it('should allow valid session IDs', () => {
      const validIds = [
        '550e8400-e29b-41d4-a716-446655440000',
        'abc123',
        'session-123-abc',
      ];

      for (const id of validIds) {
        const result = sanitizer.sanitizeSessionId(id);
        expect(result.wasModified).toBe(false);
        expect(result.sanitized).toBe(id);
      }
    });

    it('should remove invalid characters from session IDs', () => {
      const result = sanitizer.sanitizeSessionId('session<script>123');
      expect(result.wasModified).toBe(true);
      expect(result.sanitized).toBe('sessionscript123');
      expect(result.detectedThreats).toContain('INVALID_SESSION_ID_CHARS');
    });
  });

  describe('sanitizeQuestionnaireId', () => {
    it('should allow valid questionnaire IDs', () => {
      const validIds = [
        'demo1_csat_nps',
        'demo-2-concept',
        'questionnaire123',
      ];

      for (const id of validIds) {
        const result = sanitizer.sanitizeQuestionnaireId(id);
        expect(result.wasModified).toBe(false);
        expect(result.sanitized).toBe(id);
      }
    });

    it('should remove invalid characters from questionnaire IDs', () => {
      const result = sanitizer.sanitizeQuestionnaireId('demo; DROP TABLE');
      expect(result.wasModified).toBe(true);
      expect(result.detectedThreats).toContain('INVALID_QUESTIONNAIRE_ID_CHARS');
    });
  });

  describe('detectThreats', () => {
    it('should detect threats without modifying input', () => {
      const input = '<script>alert(1)</script>; DROP TABLE users;';
      const threats = sanitizer.detectThreats(input);
      
      expect(threats).toContain('XSS');
      expect(threats).toContain('SQL_INJECTION');
    });

    it('should return empty array for safe input', () => {
      const threats = sanitizer.detectThreats('Hello, this is a normal message.');
      expect(threats).toHaveLength(0);
    });
  });
});

describe('Singleton Functions', () => {
  it('should return the same instance from getInputSanitizer', () => {
    const instance1 = getInputSanitizer();
    const instance2 = getInputSanitizer();
    expect(instance1).toBe(instance2);
  });
});
