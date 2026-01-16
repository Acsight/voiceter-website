/**
 * Environment Configuration
 * 
 * Centralized configuration for environment-specific settings.
 * All environment variables should be accessed through this module.
 * 
 * Note: Direct WebSocket mode is now the only supported architecture.
 * The proxy mode has been removed.
 */

/**
 * Backend WebSocket URL
 * 
 * Development: ws://localhost:8080
 * Production: wss://your-backend-domain.com
 * 
 * This URL is used by the WebSocket service to connect to the Voiceter backend.
 * It supports both secure (wss://) and insecure (ws://) WebSocket connections.
 * 
 * @example
 * // Development
 * NEXT_PUBLIC_BACKEND_URL=ws://localhost:8080
 * 
 * @example
 * // Production
 * NEXT_PUBLIC_BACKEND_URL=wss://api.voiceter.com
 */
export const BACKEND_URL = 
  (typeof window !== 'undefined' && (window as any).__VOICETER_CONFIG__?.BACKEND_URL) ||
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  'ws://localhost:8080';

/**
 * Environment Detection
 */
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Get HTTP base URL from WebSocket URL
 * Converts ws:// to http:// and wss:// to https://
 */
export function getHttpBaseUrl(wsUrl: string = BACKEND_URL): string {
  if (wsUrl.startsWith('ws://')) {
    return wsUrl.replace('ws://', 'http://');
  }
  if (wsUrl.startsWith('wss://')) {
    return wsUrl.replace('wss://', 'https://');
  }
  return wsUrl;
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(): void {
  const required = [
    { name: 'NEXT_PUBLIC_BACKEND_URL', value: process.env.NEXT_PUBLIC_BACKEND_URL },
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    console.warn(
      'Missing environment variables:',
      missing.map(({ name }) => name).join(', ')
    );
  }
}
