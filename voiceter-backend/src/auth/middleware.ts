/**
 * Authentication middleware for WebSocket connections.
 * 
 * Validates:
 * - Session ID from cookie or header
 * - Origin and referrer headers
 * - JWT tokens from AWS Cognito (if enabled)
 * 
 * Supports optional authentication mode for demo environments.
 */

import { Socket } from 'socket.io';
import { Logger } from '../monitoring/logger';
import { Config } from '../server/config';
import { ERROR_CODES } from '../errors/codes';

export interface AuthenticationResult {
  authenticated: boolean;
  sessionId?: string;
  userId?: string;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

export class AuthenticationMiddleware {
  private logger: Logger;
  private config: Config;
  private allowedOrigins: Set<string>;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    // Initialize allowed origins
    // In production, this should be configured via environment variables
    this.allowedOrigins = new Set([
      'http://localhost:3000',
      'http://localhost:4028',
      'https://voiceter.ai',
      'https://www.voiceter.ai',
      'https://demo.voiceter.ai',
    ]);
  }

  /**
   * Authenticate WebSocket connection.
   * 
   * @param socket - Socket.IO socket instance
   * @returns Authentication result with session ID and user ID if successful
   * 
   * Requirement 14.4: Add origin validation for WebSocket connections
   * Requirement 14.6: Add request logging with sanitization
   */
  public async authenticate(socket: Socket): Promise<AuthenticationResult> {
    const startTime = Date.now();

    try {
      // Log connection attempt with sanitized data (requirement 14.6)
      this.logConnectionAttempt(socket);

      // If authentication is disabled, allow all connections
      if (!this.config.auth.enabled) {
        this.logger.debug('Authentication disabled, allowing connection', {
          event: 'auth_disabled',
          data: {
            socketId: socket.id,
          },
        });

        return {
          authenticated: true,
        };
      }

      // Step 1: Validate origin and referrer headers
      const originValidation = this.validateOrigin(socket);
      if (!originValidation.valid) {
        this.logger.warn('Origin validation failed', {
          event: 'auth_origin_failed',
          data: {
            socketId: socket.id,
            origin: socket.handshake.headers.origin,
            referer: socket.handshake.headers.referer,
            reason: originValidation.reason,
          },
        });

        return {
          authenticated: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Invalid origin',
            statusCode: 403,
          },
        };
      }

      // Step 2: Validate session ID from cookie or header
      const sessionId = this.extractSessionId(socket);
      if (sessionId) {
        // Import validateSessionId dynamically to avoid circular dependency
        const { validateSessionId } = await import('./session');
        const sessionValidation = validateSessionId(sessionId);
        if (!sessionValidation.valid) {
          this.logger.warn('Session ID validation failed', {
            event: 'auth_session_invalid',
            data: {
              socketId: socket.id,
              sessionId,
              reason: sessionValidation.reason,
            },
          });

          return {
            authenticated: false,
            error: {
              code: ERROR_CODES.SESSION_INVALID,
              message: 'Invalid session ID',
              statusCode: 401,
            },
          };
        }
      }

      // Step 3: Validate JWT token from AWS Cognito (if enabled)
      let jwtPayload: { sub: string } | null = null;
      if (this.config.auth.cognitoUserPoolId) {
        const token = this.extractJWTToken(socket);
        
        if (!token) {
          this.logger.warn('JWT token missing', {
            event: 'auth_jwt_missing',
            data: {
              socketId: socket.id,
            },
          });

          return {
            authenticated: false,
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: 'Authentication token required',
              statusCode: 401,
            },
          };
        }

        try {
          // Import verifyJWT dynamically to avoid circular dependency
          const { verifyJWT } = await import('./jwt');
          jwtPayload = await verifyJWT(
            token,
            this.config.aws.region,
            this.config.auth.cognitoUserPoolId
          );

          this.logger.debug('JWT token validated successfully', {
            event: 'auth_jwt_valid',
            data: {
              socketId: socket.id,
              userId: jwtPayload.sub,
            },
          });
        } catch (error) {
          this.logger.warn('JWT token validation failed', {
            event: 'auth_jwt_invalid',
            data: {
              socketId: socket.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });

          return {
            authenticated: false,
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: 'Invalid authentication token',
              statusCode: 401,
            },
          };
        }
      }

      // Authentication successful
      const duration = Date.now() - startTime;
      this.logger.info('Authentication successful', {
        event: 'auth_success',
        data: {
          socketId: socket.id,
          sessionId,
          userId: jwtPayload?.sub,
          duration,
        },
      });

      return {
        authenticated: true,
        sessionId,
        userId: jwtPayload?.sub,
      };
    } catch (error) {
      this.logger.error('Authentication error', {
        event: 'auth_error',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        data: {
          socketId: socket.id,
        },
      });

      return {
        authenticated: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Authentication error occurred',
          statusCode: 500,
        },
      };
    }
  }

  /**
   * Validate origin and referrer headers.
   * 
   * @param socket - Socket.IO socket instance
   * @returns Validation result
   */
  private validateOrigin(socket: Socket): { valid: boolean; reason?: string } {
    const origin = socket.handshake.headers.origin;
    const referer = socket.handshake.headers.referer;

    // Check origin header
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const originHost = `${originUrl.protocol}//${originUrl.host}`;

        if (this.allowedOrigins.has(originHost)) {
          return { valid: true };
        }

        return {
          valid: false,
          reason: `Origin not allowed: ${originHost}`,
        };
      } catch (error) {
        return {
          valid: false,
          reason: 'Invalid origin format',
        };
      }
    }

    // Check referer header as fallback
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererHost = `${refererUrl.protocol}//${refererUrl.host}`;

        if (this.allowedOrigins.has(refererHost)) {
          return { valid: true };
        }

        return {
          valid: false,
          reason: `Referer not allowed: ${refererHost}`,
        };
      } catch (error) {
        return {
          valid: false,
          reason: 'Invalid referer format',
        };
      }
    }

    // If neither origin nor referer is present, reject
    return {
      valid: false,
      reason: 'Missing origin and referer headers',
    };
  }

  /**
   * Extract session ID from cookie or header.
   * 
   * @param socket - Socket.IO socket instance
   * @returns Session ID if found, undefined otherwise
   */
  private extractSessionId(socket: Socket): string | undefined {
    // Try to get from query parameter (for reconnection)
    const querySessionId = socket.handshake.query.sessionId as string;
    if (querySessionId) {
      return querySessionId;
    }

    // Try to get from custom header
    const headerSessionId = socket.handshake.headers['x-session-id'] as string;
    if (headerSessionId) {
      return headerSessionId;
    }

    // Try to get from cookie
    const cookies = socket.handshake.headers.cookie;
    if (cookies) {
      const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
      if (sessionIdMatch) {
        return sessionIdMatch[1];
      }
    }

    return undefined;
  }

  /**
   * Extract JWT token from authorization header or query parameter.
   * 
   * @param socket - Socket.IO socket instance
   * @returns JWT token if found, undefined otherwise
   */
  private extractJWTToken(socket: Socket): string | undefined {
    // Try to get from authorization header
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match) {
        return match[1];
      }
    }

    // Try to get from query parameter (for WebSocket connections)
    const queryToken = socket.handshake.query.token as string;
    if (queryToken) {
      return queryToken;
    }

    return undefined;
  }

  /**
   * Add allowed origin to the whitelist.
   * 
   * @param origin - Origin to add (e.g., 'https://example.com')
   */
  public addAllowedOrigin(origin: string): void {
    this.allowedOrigins.add(origin);
    this.logger.info('Added allowed origin', {
      event: 'auth_origin_added',
      data: { origin },
    });
  }

  /**
   * Remove allowed origin from the whitelist.
   * 
   * @param origin - Origin to remove
   */
  public removeAllowedOrigin(origin: string): void {
    this.allowedOrigins.delete(origin);
    this.logger.info('Removed allowed origin', {
      event: 'auth_origin_removed',
      data: { origin },
    });
  }

  /**
   * Get list of allowed origins.
   * 
   * @returns Array of allowed origins
   */
  public getAllowedOrigins(): string[] {
    return Array.from(this.allowedOrigins);
  }

  /**
   * Log connection attempt with sanitized data
   * 
   * @param socket - Socket.IO socket instance
   * 
   * Requirement 14.6: Add request logging with sanitization
   * 
   * @remarks
   * Sanitizes sensitive data:
   * - JWT tokens (only logs presence, not value)
   * - Session IDs (only logs presence, not full value)
   * - IP addresses (logs but doesn't include in error messages)
   */
  private logConnectionAttempt(socket: Socket): void {
    const headers = socket.handshake.headers;
    
    // Sanitize headers - remove sensitive data
    const sanitizedHeaders: Record<string, any> = {
      origin: headers.origin,
      referer: headers.referer,
      'user-agent': headers['user-agent'],
      'accept-language': headers['accept-language'],
    };

    // Check for authorization header but don't log the token
    if (headers.authorization) {
      sanitizedHeaders.authorization = headers.authorization.startsWith('Bearer ')
        ? 'Bearer [REDACTED]'
        : '[REDACTED]';
    }

    // Check for session ID but only log presence
    const sessionId = this.extractSessionId(socket);
    const hasSessionId = !!sessionId;
    const sessionIdPreview = sessionId ? `${sessionId.substring(0, 8)}...` : undefined;

    // Get client IP address
    const clientIp = this.getClientIp(socket);

    this.logger.info('WebSocket connection attempt', {
      event: 'ws_connection_attempt',
      data: {
        socketId: socket.id,
        headers: sanitizedHeaders,
        hasSessionId,
        sessionIdPreview,
        clientIp,
        query: this.sanitizeQuery(socket.handshake.query),
      },
    });
  }

  /**
   * Get client IP address from socket
   * 
   * @param socket - Socket.IO socket instance
   * @returns Client IP address
   */
  private getClientIp(socket: Socket): string {
    // Try to get from X-Forwarded-For header (if behind proxy)
    const forwardedFor = socket.handshake.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      return ips.split(',')[0].trim();
    }

    // Try to get from X-Real-IP header
    const realIp = socket.handshake.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to socket address
    return socket.handshake.address || 'unknown';
  }

  /**
   * Sanitize query parameters
   * 
   * @param query - Query parameters
   * @returns Sanitized query parameters
   */
  private sanitizeQuery(query: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(query)) {
      // Redact sensitive parameters
      if (key === 'token' || key === 'apiKey' || key === 'secret') {
        sanitized[key] = '[REDACTED]';
      } else if (key === 'sessionId' && typeof value === 'string') {
        // Only show preview of session ID
        sanitized[key] = `${value.substring(0, 8)}...`;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

