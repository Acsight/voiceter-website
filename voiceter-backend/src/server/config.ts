import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  GeminiLiveConfig,
  loadGeminiConfig,
} from '../gemini-live/config';

// Load environment variables from .env file
dotenv.config();

// Re-export GeminiLiveConfig for convenience
export { GeminiLiveConfig };

export interface Config {
  aws: {
    region: string;
    dynamodbTablePrefix: string;
    sessionsTable: string;
    responsesTable: string;
    transcriptsTable: string;
    s3BucketName: string;
    s3AudioPrefix: string;
  };
  server: {
    port: number;
    logLevel: string;
    nodeEnv: string;
  };
  auth: {
    enabled: boolean;
    cognitoUserPoolId?: string;
  };
  redis?: {
    url: string;
    sessionTtl: number;
  };
  features: {
    enableAudioRecording: boolean;
    enableSentimentAnalysis: boolean;
    useGeminiLive: boolean; // Feature flag for Gemini Live API
  };
  rateLimiting: {
    maxMessagesPerSecond: number;
    maxAudioChunkSizeMB: number;
  };
  timeouts: {
    sessionTimeoutMinutes: number;
    cleanupTimeoutSeconds: number;
    disconnectCleanupTimeoutSeconds: number;
  };
  monitoring: {
    cloudwatchNamespace: string;
    enableXrayTracing: boolean;
  };
  questionnaires: {
    directory: string;
  };
  geminiLive: GeminiLiveConfig;
}

function getEnvVar(name: string, required: boolean = true, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  
  return value || '';
}

function getEnvVarAsInt(name: string, required: boolean = true, defaultValue?: number): number {
  const value = process.env[name];
  
  if (!value) {
    if (required && defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return defaultValue || 0;
  }
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, got: ${value}`);
  }
  
  return parsed;
}

function getEnvVarAsBoolean(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  
  if (!value) {
    return defaultValue;
  }
  
  return value.toLowerCase() === 'true';
}

function validateConfig(config: Config): void {
  // Validate AWS region
  const validRegions = ['us-east-1', 'us-west-2', 'ap-northeast-1', 'eu-north-1'];
  if (!validRegions.includes(config.aws.region)) {
    throw new Error(
      `Invalid AWS_REGION: ${config.aws.region}. Must be one of: ${validRegions.join(', ')}`
    );
  }

  // Validate port
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error(`Invalid PORT: ${config.server.port}. Must be between 1 and 65535.`);
  }

  // Validate log level
  const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  if (!validLogLevels.includes(config.server.logLevel)) {
    throw new Error(
      `Invalid LOG_LEVEL: ${config.server.logLevel}. Must be one of: ${validLogLevels.join(', ')}`
    );
  }

  // Validate Cognito configuration if auth is enabled
  if (config.auth.enabled && !config.auth.cognitoUserPoolId) {
    throw new Error('COGNITO_USER_POOL_ID is required when ENABLE_AUTH is true');
  }

  // Validate rate limiting
  if (config.rateLimiting.maxMessagesPerSecond < 1) {
    throw new Error('MAX_MESSAGES_PER_SECOND must be at least 1');
  }
  
  if (config.rateLimiting.maxAudioChunkSizeMB < 0.1) {
    throw new Error('MAX_AUDIO_CHUNK_SIZE_MB must be at least 0.1');
  }

  // Validate timeouts
  if (config.timeouts.sessionTimeoutMinutes < 1) {
    throw new Error('SESSION_TIMEOUT_MINUTES must be at least 1');
  }
  
  if (config.timeouts.cleanupTimeoutSeconds < 1) {
    throw new Error('CLEANUP_TIMEOUT_SECONDS must be at least 1');
  }
  
  if (config.timeouts.disconnectCleanupTimeoutSeconds < 1) {
    throw new Error('DISCONNECT_CLEANUP_TIMEOUT_SECONDS must be at least 1');
  }

  // Validate Redis TTL if Redis is configured
  if (config.redis && config.redis.sessionTtl < 60) {
    throw new Error('REDIS_SESSION_TTL must be at least 60 seconds');
  }

  // Note: Questionnaires are now defined in code (loader.ts) and use system prompts
  // from system_prompts/EN/ and system_prompts/TR/ folders.
  // The questionnaires directory validation is no longer needed.

  // Note: Gemini Live configuration is validated by loadGeminiConfig()
  // which is called during config loading. The validation includes:
  // - GOOGLE_CLOUD_PROJECT required when USE_GEMINI_LIVE=true (Requirement 12.9)
  // - GOOGLE_CLOUD_REGION required when USE_GEMINI_LIVE=true (Requirement 12.9)
  // - Reconnection settings validation
  // - Tool timeout validation
  // - VAD settings validation
}

export function loadConfig(): Config {
  // Determine questionnaires directory
  const questionnairesDir = getEnvVar(
    'QUESTIONNAIRES_DIR',
    false,
    path.join(process.cwd(), 'questionnaires')
  );

  // Build table names from prefix
  const tablePrefix = getEnvVar('DYNAMODB_TABLE_PREFIX', false, 'demo-');
  
  // Load Gemini Live configuration (handles its own validation)
  const geminiLiveConfig = loadGeminiConfig();
  
  const config: Config = {
    aws: {
      region: getEnvVar('AWS_REGION', false, 'us-east-1'),
      dynamodbTablePrefix: tablePrefix,
      sessionsTable: getEnvVar('DYNAMODB_SESSIONS_TABLE', false, `${tablePrefix}sessions`),
      responsesTable: getEnvVar('DYNAMODB_RESPONSES_TABLE', false, `${tablePrefix}responses`),
      transcriptsTable: getEnvVar('DYNAMODB_TRANSCRIPTS_TABLE', false, `${tablePrefix}transcripts`),
      s3BucketName: getEnvVar('S3_BUCKET_NAME', false, 'voiceter-demo-recordings'),
      s3AudioPrefix: getEnvVar('S3_AUDIO_PREFIX', false, 'recordings/'),
    },
    server: {
      port: getEnvVarAsInt('PORT', false, 8080),
      logLevel: getEnvVar('LOG_LEVEL', false, 'INFO'),
      nodeEnv: getEnvVar('NODE_ENV', false, 'development'),
    },
    auth: {
      enabled: getEnvVarAsBoolean('ENABLE_AUTH', false),
      cognitoUserPoolId: getEnvVar('COGNITO_USER_POOL_ID', false),
    },
    features: {
      enableAudioRecording: getEnvVarAsBoolean('ENABLE_AUDIO_RECORDING', false),
      enableSentimentAnalysis: getEnvVarAsBoolean('ENABLE_SENTIMENT_ANALYSIS', false),
      useGeminiLive: geminiLiveConfig.enabled,
    },
    rateLimiting: {
      maxMessagesPerSecond: getEnvVarAsInt('MAX_MESSAGES_PER_SECOND', false, 100),
      maxAudioChunkSizeMB: getEnvVarAsInt('MAX_AUDIO_CHUNK_SIZE_MB', false, 1),
    },
    timeouts: {
      sessionTimeoutMinutes: getEnvVarAsInt('SESSION_TIMEOUT_MINUTES', false, 30),
      cleanupTimeoutSeconds: getEnvVarAsInt('CLEANUP_TIMEOUT_SECONDS', false, 5),
      disconnectCleanupTimeoutSeconds: getEnvVarAsInt('DISCONNECT_CLEANUP_TIMEOUT_SECONDS', false, 3),
    },
    monitoring: {
      cloudwatchNamespace: getEnvVar('CLOUDWATCH_NAMESPACE', false, 'Voiceter/Backend'),
      enableXrayTracing: getEnvVarAsBoolean('ENABLE_XRAY_TRACING', false),
    },
    questionnaires: {
      directory: questionnairesDir,
    },
    geminiLive: geminiLiveConfig,
  };

  // Add Redis configuration if URL is provided
  const redisUrl = getEnvVar('REDIS_URL', false);
  if (redisUrl) {
    config.redis = {
      url: redisUrl,
      sessionTtl: getEnvVarAsInt('REDIS_SESSION_TTL', false, 1800), // 30 minutes default
    };
  }

  // Validate configuration
  validateConfig(config);

  // Log configuration (excluding sensitive data)
  /* console.log('Configuration loaded successfully:', {
    aws: {
      region: config.aws.region,
      dynamodbTablePrefix: config.aws.dynamodbTablePrefix,
      sessionsTable: config.aws.sessionsTable,
      responsesTable: config.aws.responsesTable,
      transcriptsTable: config.aws.transcriptsTable,
      s3BucketName: config.aws.s3BucketName,
      s3AudioPrefix: config.aws.s3AudioPrefix,
    },
    server: {
      port: config.server.port,
      logLevel: config.server.logLevel,
      nodeEnv: config.server.nodeEnv,
    },
    auth: {
      enabled: config.auth.enabled,
      cognitoConfigured: !!config.auth.cognitoUserPoolId,
    },
    features: config.features,
    rateLimiting: config.rateLimiting,
    timeouts: config.timeouts,
    monitoring: config.monitoring,
    questionnaires: {
      directory: config.questionnaires.directory,
    },
    geminiLive: {
      enabled: config.geminiLive.enabled,
      projectId: config.geminiLive.projectId ? '***configured***' : 'not set',
      region: config.geminiLive.region || 'not set',
      model: config.geminiLive.model,
      defaultVoice: config.geminiLive.defaultVoice,
      voiceMappingCount: Object.keys(config.geminiLive.voiceMapping).length,
      reconnectMaxRetries: config.geminiLive.reconnectMaxRetries,
      reconnectBaseDelayMs: config.geminiLive.reconnectBaseDelayMs,
      toolTimeoutMs: config.geminiLive.toolTimeoutMs,
      disableTools: config.geminiLive.disableTools,
    },
    redis: config.redis ? { configured: true, sessionTtl: config.redis.sessionTtl } : { configured: false },
  }); */

  return config;
}

// Export a singleton instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// For testing purposes - reset the singleton
export function resetConfig(): void {
  configInstance = null;
}
