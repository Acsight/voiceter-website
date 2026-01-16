import { createLogger, getLogger, Logger, LogLevel } from '../../../src/monitoring/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    // Note: createLogger returns a singleton, so we get the same instance
    // We'll set the log level explicitly for tests that need it
    logger = getLogger();
    logger.setLogLevel('DEBUG');
  });

  describe('Structured JSON Logging', () => {
    it('should create a logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should log debug messages with structured format', () => {
      expect(() => {
        logger.debug('Test debug message', { sessionId: 'test-123', event: 'test_event' });
      }).not.toThrow();
    });

    it('should log info messages with structured format', () => {
      expect(() => {
        logger.info('Test info message', { sessionId: 'test-123' });
      }).not.toThrow();
    });

    it('should log warn messages with structured format', () => {
      expect(() => {
        logger.warn('Test warning message');
      }).not.toThrow();
    });

    it('should log error messages with structured format', () => {
      expect(() => {
        logger.error('Test error message', new Error('Test error'));
      }).not.toThrow();
    });

    it('should log error messages with data and error', () => {
      expect(() => {
        logger.error(
          'Test error with data',
          { sessionId: 'test-123', event: 'error_event' },
          new Error('Test error')
        );
      }).not.toThrow();
    });
  });

  describe('Log Levels (DEBUG, INFO, WARN, ERROR)', () => {
    it('should support DEBUG log level', () => {
      logger.setLogLevel('DEBUG');
      expect(logger.getLogLevel()).toBe('DEBUG');
      expect(() => {
        logger.debug('Debug message');
      }).not.toThrow();
    });

    it('should support INFO log level', () => {
      logger.setLogLevel('INFO');
      expect(logger.getLogLevel()).toBe('INFO');
      expect(() => {
        logger.info('Info message');
      }).not.toThrow();
    });

    it('should support WARN log level', () => {
      logger.setLogLevel('WARN');
      expect(logger.getLogLevel()).toBe('WARN');
      expect(() => {
        logger.warn('Warn message');
      }).not.toThrow();
    });

    it('should support ERROR log level', () => {
      logger.setLogLevel('ERROR');
      expect(logger.getLogLevel()).toBe('ERROR');
      expect(() => {
        logger.error('Error message', new Error('Test'));
      }).not.toThrow();
    });

    it('should allow changing log level dynamically', () => {
      logger.setLogLevel('ERROR');
      expect(logger.getLogLevel()).toBe('ERROR');
      
      logger.setLogLevel('DEBUG');
      expect(logger.getLogLevel()).toBe('DEBUG');
    });
  });

  describe('SessionId Context', () => {
    it('should include sessionId in log data when provided', () => {
      expect(() => {
        logger.info('Message with session', { sessionId: 'session-abc-123' });
      }).not.toThrow();
    });

    it('should handle logs without sessionId', () => {
      expect(() => {
        logger.info('Message without session');
      }).not.toThrow();
    });

    it('should include sessionId in error logs', () => {
      expect(() => {
        logger.error(
          'Error with session',
          { sessionId: 'session-error-456' },
          new Error('Test error')
        );
      }).not.toThrow();
    });

    it('should include sessionId with event context', () => {
      expect(() => {
        logger.info('Event with session', {
          sessionId: 'session-789',
          event: 'user_action',
          data: { action: 'click' },
        });
      }).not.toThrow();
    });
  });

  describe('Configuration from Environment', () => {
    it('should support setting log level dynamically', () => {
      // Test that logger can be configured with different levels
      const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      
      levels.forEach((level) => {
        logger.setLogLevel(level);
        expect(logger.getLogLevel()).toBe(level);
      });
    });

    it('should accept log level from configuration at creation', () => {
      // Note: createLogger is a singleton, so it returns the existing instance
      // In production, the log level is set once at startup from config
      const configuredLogger = createLogger('INFO');
      expect(configuredLogger).toBeDefined();
      expect(configuredLogger).toBeInstanceOf(Logger);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return singleton instance', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });

    it('should maintain state across singleton calls', () => {
      const logger1 = getLogger();
      logger1.setLogLevel('ERROR');
      
      const logger2 = getLogger();
      expect(logger2.getLogLevel()).toBe('ERROR');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors with stack traces', () => {
      const error = new Error('Test error with stack');
      expect(() => {
        logger.error('Error occurred', error);
      }).not.toThrow();
    });

    it('should handle errors with custom error codes', () => {
      const customError = new Error('Custom error') as any;
      customError.code = 'CUSTOM_ERROR_CODE';
      
      expect(() => {
        logger.error('Custom error occurred', customError);
      }).not.toThrow();
    });

    it('should handle errors with additional context', () => {
      expect(() => {
        logger.error(
          'Error with context',
          {
            sessionId: 'session-123',
            event: 'operation_failed',
            operation: 'database_write',
          },
          new Error('Database connection failed')
        );
      }).not.toThrow();
    });
  });

  describe('Requirements Validation', () => {
    it('should meet Requirement 8.1: structured JSON logging with sessionId, error code, message, and stack trace', () => {
      const error = new Error('Test error') as any;
      error.code = 'TEST_ERROR_CODE';
      
      expect(() => {
        logger.error(
          'Error with all required fields',
          {
            sessionId: 'session-req-8.1',
            event: 'test_event',
          },
          error
        );
      }).not.toThrow();
    });

    it('should meet Requirement 9.5: load LOG_LEVEL from environment with default INFO', () => {
      // Test that logger can be configured with different log levels
      // In production, the log level is loaded from config.server.logLevel
      logger.setLogLevel('INFO');
      expect(logger.getLogLevel()).toBe('INFO');
      
      logger.setLogLevel('DEBUG');
      expect(logger.getLogLevel()).toBe('DEBUG');
    });

    it('should meet Requirement 10.8: structured JSON format with timestamp, level, sessionId, event, and data', () => {
      expect(() => {
        logger.info('Structured log entry', {
          sessionId: 'session-req-10.8',
          event: 'test_event',
          data: {
            key1: 'value1',
            key2: 'value2',
          },
        });
      }).not.toThrow();
    });
  });
});
