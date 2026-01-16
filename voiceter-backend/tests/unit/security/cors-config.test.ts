/**
 * Unit tests for CORS Configuration
 * 
 * REQ-SEC-003: Implement CORS Policies
 */

import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import {
  getAllowedOrigins,
  isOriginAllowed,
  getCorsConfig,
  getSocketIOCorsConfig,
} from '../../../src/security/cors-config';

describe('CORS Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getAllowedOrigins', () => {
    it('should include localhost in development', () => {
      process.env.NODE_ENV = 'development';
      const origins = getAllowedOrigins();
      
      expect(origins).toContain('http://localhost:3000');
      expect(origins).toContain('http://localhost:4028');
    });

    it('should include production origins in production', () => {
      process.env.NODE_ENV = 'production';
      const { getAllowedOrigins: getOrigins } = require('../../../src/security/cors-config');
      const origins = getOrigins();
      
      expect(origins).toContain('https://demo.voiceter.ai');
      expect(origins).toContain('https://voiceter.ai');
    });

    it('should include staging origins in staging environment', () => {
      process.env.NODE_ENV = 'production';
      process.env.DEPLOYMENT_ENV = 'staging';
      const { getAllowedOrigins: getOrigins } = require('../../../src/security/cors-config');
      const origins = getOrigins();
      
      expect(origins).toContain('https://demo-staging.voiceter.ai');
    });
  });

  describe('isOriginAllowed', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should allow requests without origin header', () => {
      expect(isOriginAllowed(undefined)).toBe(true);
    });

    it('should allow localhost in development', () => {
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    });

    it('should allow production origins', () => {
      expect(isOriginAllowed('https://demo.voiceter.ai')).toBe(true);
      expect(isOriginAllowed('https://voiceter.ai')).toBe(true);
    });

    it('should reject unknown origins', () => {
      process.env.NODE_ENV = 'production';
      const { isOriginAllowed: checkOrigin } = require('../../../src/security/cors-config');
      
      expect(checkOrigin('https://malicious-site.com')).toBe(false);
      expect(checkOrigin('http://localhost:3000')).toBe(false); // localhost not allowed in prod
    });
  });

  describe('getCorsConfig', () => {
    it('should return valid CORS configuration', () => {
      const config = getCorsConfig();
      
      expect(config).toHaveProperty('origin');
      expect(config).toHaveProperty('credentials', true);
      expect(config).toHaveProperty('methods');
      expect(config).toHaveProperty('allowedHeaders');
      expect(config).toHaveProperty('exposedHeaders');
      expect(config).toHaveProperty('maxAge');
    });

    it('should include rate limit headers in exposed headers', () => {
      const config = getCorsConfig();
      
      expect(config.exposedHeaders).toContain('X-RateLimit-Limit');
      expect(config.exposedHeaders).toContain('X-RateLimit-Remaining');
      expect(config.exposedHeaders).toContain('X-RateLimit-Reset');
      expect(config.exposedHeaders).toContain('Retry-After');
    });

    it('should allow GET, POST, OPTIONS methods', () => {
      const config = getCorsConfig();
      
      expect(config.methods).toContain('GET');
      expect(config.methods).toContain('POST');
      expect(config.methods).toContain('OPTIONS');
    });

    it('should allow required headers', () => {
      const config = getCorsConfig();
      
      expect(config.allowedHeaders).toContain('Content-Type');
      expect(config.allowedHeaders).toContain('Authorization');
      expect(config.allowedHeaders).toContain('X-Session-Id');
    });
  });

  describe('getSocketIOCorsConfig', () => {
    it('should return Socket.IO compatible CORS config', () => {
      const config = getSocketIOCorsConfig();
      
      expect(config).toHaveProperty('origin');
      expect(config).toHaveProperty('credentials', true);
      expect(config).toHaveProperty('methods');
    });

    it('should allow GET and POST for WebSocket upgrade', () => {
      const config = getSocketIOCorsConfig();
      
      expect(config.methods).toContain('GET');
      expect(config.methods).toContain('POST');
    });
  });
});

describe('Origin Validator Function', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  it('should call callback with true for allowed origins', (done) => {
    const config = getCorsConfig();
    const originValidator = config.origin as Function;
    
    originValidator('http://localhost:3000', (err: Error | null, allow?: boolean) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('should call callback with true for undefined origin', (done) => {
    const config = getCorsConfig();
    const originValidator = config.origin as Function;
    
    originValidator(undefined, (err: Error | null, allow?: boolean) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('should call callback with error for disallowed origins in production', (done) => {
    process.env.NODE_ENV = 'production';
    const { getCorsConfig: getConfig } = require('../../../src/security/cors-config');
    const config = getConfig();
    const originValidator = config.origin as Function;
    
    originValidator('https://malicious-site.com', (err: Error | null, allow?: boolean) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('not allowed by CORS policy');
      expect(allow).toBe(false);
      done();
    });
  });
});
