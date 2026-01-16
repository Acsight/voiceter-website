/**
 * CORS Configuration Module
 * 
 * Provides environment-aware CORS configuration for the Voiceter backend.
 * 
 * REQ-SEC-003: Implement CORS Policies
 * 
 * Allowed origins:
 * - Production: https://demo.voiceter.ai
 * - Staging: https://demo-staging.voiceter.ai
 * - Development: http://localhost:3000
 */

export interface CorsConfig {
  origin: string | string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
}

/**
 * Allowed origins by environment
 */
const ALLOWED_ORIGINS: Record<string, string[]> = {
  production: [
    'https://demo.voiceter.ai',
    'https://www.voiceter.ai',
    'https://voiceter.ai',
  ],
  staging: [
    'https://demo-staging.voiceter.ai',
    'https://staging.voiceter.ai',
  ],
  development: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4028',
    'http://127.0.0.1:3000',
  ],
};

/**
 * Allowed HTTP methods
 */
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];

/**
 * Allowed request headers
 */
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Session-Id',
  'X-Request-Id',
  'X-Forwarded-For',
  'User-Agent',
];

/**
 * Headers exposed to the client
 */
const EXPOSED_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'Retry-After',
];

/**
 * Get the current environment
 */
function getEnvironment(): 'production' | 'staging' | 'development' {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    // Check if it's actually staging
    const isStaging = process.env.DEPLOYMENT_ENV === 'staging' ||
                      process.env.AWS_ENV === 'staging';
    return isStaging ? 'staging' : 'production';
  }
  
  return 'development';
}

/**
 * Get allowed origins for the current environment
 */
export function getAllowedOrigins(): string[] {
  const env = getEnvironment();
  const envOrigins = ALLOWED_ORIGINS[env] || [];
  
  // In development, also allow production origins for testing
  if (env === 'development') {
    return [
      ...envOrigins,
      ...ALLOWED_ORIGINS.staging,
      ...ALLOWED_ORIGINS.production,
    ];
  }
  
  // In staging, also allow production origins
  if (env === 'staging') {
    return [...envOrigins, ...ALLOWED_ORIGINS.production];
  }
  
  return envOrigins;
}

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    // Allow requests without origin (e.g., same-origin, server-to-server)
    return true;
  }
  
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(origin);
}

/**
 * Origin validation function for dynamic CORS
 */
function originValidator(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  // Allow requests without origin (same-origin, curl, etc.)
  if (!origin) {
    callback(null, true);
    return;
  }
  
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
  }
}

/**
 * Get CORS configuration for Express middleware
 */
export function getCorsConfig(): CorsConfig {
  const env = getEnvironment();
  
  // In development, use permissive CORS for easier testing
  if (env === 'development') {
    return {
      origin: originValidator,
      credentials: true,
      methods: ALLOWED_METHODS,
      allowedHeaders: ALLOWED_HEADERS,
      exposedHeaders: EXPOSED_HEADERS,
      maxAge: 86400, // 24 hours
    };
  }
  
  // In production/staging, use strict CORS
  return {
    origin: originValidator,
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 86400, // 24 hours
  };
}

/**
 * Get CORS configuration for Socket.IO
 */
export function getSocketIOCorsConfig(): {
  origin: string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
  credentials: boolean;
  methods: string[];
} {
  const env = getEnvironment();
  
  // In development, allow all configured origins
  if (env === 'development') {
    return {
      origin: originValidator,
      credentials: true,
      methods: ['GET', 'POST'],
    };
  }
  
  // In production/staging, use strict origin list
  return {
    origin: originValidator,
    credentials: true,
    methods: ['GET', 'POST'],
  };
}

/**
 * Express CORS middleware
 */
export function corsMiddleware(
  req: any,
  res: any,
  next: () => void
): void {
  const origin = req.headers.origin;
  const config = getCorsConfig();
  
  // Check origin
  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  // Set other CORS headers
  res.header('Access-Control-Allow-Methods', config.methods.join(', '));
  res.header('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  res.header('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  res.header('Access-Control-Max-Age', String(config.maxAge));
  
  if (config.credentials) {
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
}
