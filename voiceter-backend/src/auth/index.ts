/**
 * Authentication module exports.
 * 
 * Provides authentication middleware, JWT validation, and session ID validation.
 */

export { AuthenticationMiddleware, AuthenticationResult } from './middleware';
export { verifyJWT, clearJWKSCache, JWTPayload, JWKSKey, JWKS } from './jwt';
export {
  validateSessionId,
  sanitizeSessionId,
  extractValidSessionId,
  SessionIdValidation,
} from './session';

