/**
 * Unit tests for Configuration Management
 * 
 * Tests configuration loading, validation, and default values including:
 * - Environment variable loading
 * - Configuration validation
 * - Default values for optional configuration
 * - Error handling for missing required variables
 * - Error handling for invalid values
 */

// Mock fs module BEFORE any imports
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

describe('Configuration Management', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    process.env = {};
    
    // Reset fs mock
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    
    // Clear module cache to force reload
    jest.resetModules();
    
    // Re-mock fs after reset
    jest.mock('fs', () => ({
      existsSync: jest.fn(() => true),
    }));
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load configuration with all default values', () => {
      const { loadConfig } = require('../../../src/server/config');
      
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.aws.region).toBe('us-east-1');
      expect(config.server.port).toBe(8080);
      expect(config.server.logLevel).toBe('INFO');
    });

    it('should load AWS configuration from environment variables', () => {
      process.env.AWS_REGION = 'us-west-2';
      process.env.DYNAMODB_TABLE_PREFIX = 'test-';
      process.env.S3_BUCKET_NAME = 'test-bucket';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.aws.region).toBe('us-west-2');
      expect(config.aws.dynamodbTablePrefix).toBe('test-');
      expect(config.aws.s3BucketName).toBe('test-bucket');
    });

    it('should load server configuration from environment variables', () => {
      process.env.PORT = '3000';
      process.env.LOG_LEVEL = 'DEBUG';
      process.env.NODE_ENV = 'production';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.server.port).toBe(3000);
      expect(config.server.logLevel).toBe('DEBUG');
      expect(config.server.nodeEnv).toBe('production');
    });

    it('should load authentication configuration', () => {
      process.env.ENABLE_AUTH = 'true';
      process.env.COGNITO_USER_POOL_ID = 'us-east-1_ABC123';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.auth.enabled).toBe(true);
      expect(config.auth.cognitoUserPoolId).toBe('us-east-1_ABC123');
    });

    it('should load Redis configuration when URL is provided', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.REDIS_SESSION_TTL = '3600';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.redis).toBeDefined();
      expect(config.redis?.url).toBe('redis://localhost:6379');
      expect(config.redis?.sessionTtl).toBe(3600);
    });

    it('should not include Redis configuration when URL is not provided', () => {
      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.redis).toBeUndefined();
    });

    it('should load feature flags', () => {
      process.env.ENABLE_AUDIO_RECORDING = 'true';
      process.env.ENABLE_SENTIMENT_ANALYSIS = 'true';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.features.enableAudioRecording).toBe(true);
      expect(config.features.enableSentimentAnalysis).toBe(true);
    });

    it('should load rate limiting configuration', () => {
      process.env.MAX_MESSAGES_PER_SECOND = '200';
      process.env.MAX_AUDIO_CHUNK_SIZE_MB = '2';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.rateLimiting.maxMessagesPerSecond).toBe(200);
      expect(config.rateLimiting.maxAudioChunkSizeMB).toBe(2);
    });

    it('should load timeout configuration', () => {
      process.env.SESSION_TIMEOUT_MINUTES = '60';
      process.env.CLEANUP_TIMEOUT_SECONDS = '10';
      process.env.DISCONNECT_CLEANUP_TIMEOUT_SECONDS = '5';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.timeouts.sessionTimeoutMinutes).toBe(60);
      expect(config.timeouts.cleanupTimeoutSeconds).toBe(10);
      expect(config.timeouts.disconnectCleanupTimeoutSeconds).toBe(5);
    });

    it('should load monitoring configuration', () => {
      process.env.CLOUDWATCH_NAMESPACE = 'Test/Backend';
      process.env.ENABLE_XRAY_TRACING = 'true';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.monitoring.cloudwatchNamespace).toBe('Test/Backend');
      expect(config.monitoring.enableXrayTracing).toBe(true);
    });

    it('should build table names from prefix', () => {
      process.env.DYNAMODB_TABLE_PREFIX = 'prod-';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.aws.sessionsTable).toBe('prod-sessions');
      expect(config.aws.responsesTable).toBe('prod-responses');
      expect(config.aws.transcriptsTable).toBe('prod-transcripts');
    });

    it('should allow explicit table name overrides', () => {
      process.env.DYNAMODB_TABLE_PREFIX = 'demo-';
      process.env.DYNAMODB_SESSIONS_TABLE = 'custom-sessions';
      process.env.DYNAMODB_RESPONSES_TABLE = 'custom-responses';
      process.env.DYNAMODB_TRANSCRIPTS_TABLE = 'custom-transcripts';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(config.aws.sessionsTable).toBe('custom-sessions');
      expect(config.aws.responsesTable).toBe('custom-responses');
      expect(config.aws.transcriptsTable).toBe('custom-transcripts');
    });
  });

  describe('Configuration Validation', () => {
    it('should reject invalid AWS region', () => {
      process.env.AWS_REGION = 'invalid-region';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('Invalid AWS_REGION');
    });

    it('should accept valid AWS regions', () => {
      const validRegions = ['us-east-1', 'us-west-2', 'ap-northeast-1', 'eu-north-1'];

      validRegions.forEach((region) => {
        jest.resetModules();
        process.env.AWS_REGION = region;

        const { loadConfig } = require('../../../src/server/config');
        const config = loadConfig();

        expect(config.aws.region).toBe(region);
      });
    });

    it('should reject invalid port numbers', () => {
      process.env.PORT = '0';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('Invalid PORT');
    });

    it('should reject port numbers above 65535', () => {
      process.env.PORT = '70000';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('Invalid PORT');
    });

    it('should reject invalid log levels', () => {
      process.env.LOG_LEVEL = 'INVALID';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('Invalid LOG_LEVEL');
    });

    it('should accept valid log levels', () => {
      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

      validLevels.forEach((level) => {
        jest.resetModules();
        process.env.LOG_LEVEL = level;

        const { loadConfig } = require('../../../src/server/config');
        const config = loadConfig();

        expect(config.server.logLevel).toBe(level);
      });
    });

    it('should require COGNITO_USER_POOL_ID when auth is enabled', () => {
      process.env.ENABLE_AUTH = 'true';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('COGNITO_USER_POOL_ID is required');
    });

    it('should not require COGNITO_USER_POOL_ID when auth is disabled', () => {
      process.env.ENABLE_AUTH = 'false';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).not.toThrow();
    });

    it('should reject invalid rate limiting values', () => {
      process.env.MAX_MESSAGES_PER_SECOND = '0';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('MAX_MESSAGES_PER_SECOND must be at least 1');
    });

    it('should reject invalid audio chunk size', () => {
      process.env.MAX_AUDIO_CHUNK_SIZE_MB = '0';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('MAX_AUDIO_CHUNK_SIZE_MB must be at least 0.1');
    });

    it('should reject invalid timeout values', () => {
      process.env.SESSION_TIMEOUT_MINUTES = '0';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('SESSION_TIMEOUT_MINUTES must be at least 1');
    });

    it('should reject invalid Redis TTL', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.REDIS_SESSION_TTL = '30';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('REDIS_SESSION_TTL must be at least 60 seconds');
    });

    it('should reject when questionnaires directory does not exist', () => {
      const fs = require('fs');
      fs.existsSync.mockReturnValue(false);

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('Questionnaires directory does not exist');
    });
  });

  describe('getConfig singleton', () => {
    it('should return the same instance on multiple calls', () => {
      const { getConfig } = require('../../../src/server/config');

      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    it('should load config only once', () => {
      const { getConfig } = require('../../../src/server/config');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      getConfig();
      getConfig();
      getConfig();

      // Should only log once
      const loadCalls = consoleSpy.mock.calls.filter(
        (call) => call[0] === 'Configuration loaded successfully:'
      );
      expect(loadCalls.length).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe('resetConfig', () => {
    it('should reset the singleton instance', () => {
      const { getConfig, resetConfig } = require('../../../src/server/config');

      const config1 = getConfig();
      resetConfig();
      const config2 = getConfig();

      // Should be different instances after reset
      expect(config1).not.toBe(config2);
    });
  });

  describe('Type conversions', () => {
    it('should parse integer environment variables correctly', () => {
      process.env.PORT = '9000';
      process.env.MAX_MESSAGES_PER_SECOND = '150';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(typeof config.server.port).toBe('number');
      expect(config.server.port).toBe(9000);
      expect(typeof config.rateLimiting.maxMessagesPerSecond).toBe('number');
      expect(config.rateLimiting.maxMessagesPerSecond).toBe(150);
    });

    it('should parse boolean environment variables correctly', () => {
      process.env.ENABLE_AUTH = 'false'; // Set to false to avoid requiring COGNITO_USER_POOL_ID
      process.env.ENABLE_AUDIO_RECORDING = 'false';
      process.env.ENABLE_XRAY_TRACING = 'TRUE';

      const { loadConfig } = require('../../../src/server/config');
      const config = loadConfig();

      expect(typeof config.auth.enabled).toBe('boolean');
      expect(config.auth.enabled).toBe(false);
      expect(typeof config.features.enableAudioRecording).toBe('boolean');
      expect(config.features.enableAudioRecording).toBe(false);
      expect(config.monitoring.enableXrayTracing).toBe(true);
    });

    it('should reject non-integer values for integer fields', () => {
      process.env.PORT = 'not-a-number';

      const { loadConfig } = require('../../../src/server/config');

      expect(() => loadConfig()).toThrow('must be a valid integer');
    });
  });

  describe('Configuration logging', () => {
    it('should log configuration on successful load', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const { loadConfig } = require('../../../src/server/config');
      loadConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Configuration loaded successfully:',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should not log sensitive data', () => {
      process.env.ENABLE_AUTH = 'true';
      process.env.COGNITO_USER_POOL_ID = 'sensitive-pool-id';
      process.env.REDIS_URL = 'redis://sensitive-url:6379';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const { loadConfig } = require('../../../src/server/config');
      loadConfig();

      // Find the configuration log call
      const configLogCall = consoleSpy.mock.calls.find(
        (call) => call[0] === 'Configuration loaded successfully:'
      );
      
      expect(configLogCall).toBeDefined();
      const loggedData = configLogCall ? configLogCall[1] : {};
      
      // Should not include actual sensitive values
      expect(JSON.stringify(loggedData)).not.toContain('sensitive-pool-id');
      expect(JSON.stringify(loggedData)).not.toContain('sensitive-url');
      
      // Should indicate that auth is configured but not show the actual value
      expect(loggedData.auth.cognitoConfigured).toBe(true);
      expect(loggedData.redis.configured).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
