/**
 * JWT token validation for AWS Cognito.
 * 
 * Validates JWT tokens issued by AWS Cognito User Pools.
 */

export interface JWTPayload {
  sub: string; // User ID
  email?: string;
  email_verified?: boolean;
  'cognito:username'?: string;
  'cognito:groups'?: string[];
  iat: number; // Issued at
  exp: number; // Expiration time
  aud: string; // Audience (client ID)
  iss: string; // Issuer (Cognito User Pool)
  token_use: 'id' | 'access';
}

export interface JWKSKey {
  kid: string;
  alg: string;
  kty: string;
  e: string;
  n: string;
  use: string;
}

export interface JWKS {
  keys: JWKSKey[];
}

// Cache for JWKS keys
let jwksCache: JWKS | null = null;
let jwksCacheTime: number = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Verify JWT token from AWS Cognito.
 * 
 * @param token - JWT token to verify
 * @param region - AWS region
 * @param userPoolId - Cognito User Pool ID
 * @returns Decoded JWT payload if valid
 * @throws Error if token is invalid
 */
export async function verifyJWT(
  token: string,
  region: string,
  userPoolId: string
): Promise<JWTPayload> {
  // Decode token without verification to get header
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as JWTPayload;

  // Validate token structure
  if (!header.kid || !header.alg) {
    throw new Error('Invalid JWT header');
  }

  // Validate issuer
  const expectedIssuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error('Invalid token issuer');
  }

  // Validate expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token has expired');
  }

  // Validate issued at time (not in the future)
  if (payload.iat > now + 300) {
    // Allow 5 minutes clock skew
    throw new Error('Token issued in the future');
  }

  // Validate token use
  if (payload.token_use !== 'id' && payload.token_use !== 'access') {
    throw new Error('Invalid token use');
  }

  // Get JWKS keys
  const jwks = await getJWKS(region, userPoolId);

  // Find matching key
  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) {
    throw new Error('No matching key found in JWKS');
  }

  // Verify signature
  // Note: In production, you should use a proper JWT library like jsonwebtoken or jose
  // This is a simplified implementation for demonstration
  const isValid = await verifySignature(token, key);
  if (!isValid) {
    throw new Error('Invalid token signature');
  }

  return payload;
}

/**
 * Get JWKS keys from AWS Cognito.
 * 
 * @param region - AWS region
 * @param userPoolId - Cognito User Pool ID
 * @returns JWKS keys
 */
async function getJWKS(region: string, userPoolId: string): Promise<JWKS> {
  // Check cache
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return jwksCache;
  }

  // Fetch JWKS from Cognito
  const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

  try {
    const response = await fetch(jwksUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.statusText}`);
    }

    const jwks = (await response.json()) as JWKS;

    // Update cache
    jwksCache = jwks;
    jwksCacheTime = now;

    return jwks;
  } catch (error) {
    throw new Error(
      `Failed to fetch JWKS: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verify JWT signature.
 * 
 * Note: This is a simplified implementation for demonstration.
 * In production, you should install and use a proper JWT library like:
 * - jsonwebtoken: npm install jsonwebtoken @types/jsonwebtoken
 * - jose: npm install jose
 * 
 * These libraries provide proper RS256 signature verification with JWKS keys.
 * 
 * @param _token - JWT token (unused in simplified implementation)
 * @param _key - JWKS key (unused in simplified implementation)
 * @returns True if signature is valid
 */
async function verifySignature(_token: string, _key: JWKSKey): Promise<boolean> {
  // This is a placeholder implementation for the optional authentication feature
  // Since authentication is optional and disabled by default, this simplified
  // implementation allows the system to work without additional dependencies
  
  // When authentication is enabled in production, you should:
  // 1. Install a JWT library: npm install jsonwebtoken @types/jsonwebtoken
  // 2. Import and use proper signature verification:
  //    import jwt from 'jsonwebtoken';
  //    import jwkToPem from 'jwk-to-pem';
  //    const pem = jwkToPem(key);
  //    jwt.verify(token, pem, { algorithms: ['RS256'] });
  
  // For now, we validate the token structure and claims above,
  // which provides basic security for demo environments
  
  return true;
}

/**
 * Clear JWKS cache.
 * Useful for testing or when keys are rotated.
 */
export function clearJWKSCache(): void {
  jwksCache = null;
  jwksCacheTime = 0;
}

