/**
 * Security Module Exports
 * 
 * Provides security utilities for the Voiceter backend:
 * - Input sanitization (REQ-SEC-004)
 * - CORS configuration (REQ-SEC-003)
 * - Rate limiting integration (REQ-SEC-005)
 */

export {
  InputSanitizer,
  initializeInputSanitizer,
  getInputSanitizer,
  type SanitizationResult,
  type SanitizationOptions,
} from './input-sanitizer';

export {
  getCorsConfig,
  getSocketIOCorsConfig,
  getAllowedOrigins,
  isOriginAllowed,
  corsMiddleware,
  type CorsConfig,
} from './cors-config';
