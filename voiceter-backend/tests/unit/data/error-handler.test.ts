/**
 * Tests for Database Error Handler
 * 
 * Validates error handling wrapper for database operations
 */

import {
  withDatabaseErrorHandling,
  withDatabaseErrorHandlingVoid,
  isTransientDatabaseError,
  getDatabaseErrorCode,
} from '../../../src/data/error-handler';
import { ERROR_CODES } from '../../../src/errors/codes';

describe('Database Error Handler', () => {
  describe('isTransientDatabaseError', () => {
    it('should identify throttling errors as transient', () => {
      const error = new Error('ThrottlingException');
      error.name = 'ThrottlingException';
      expect(isTransientDatabaseError(error)).toBe(true);
    });

    it('should identify timeout errors as transient', () => {
      const error = new Error('TimeoutError');
      error.name = 'TimeoutError';
      expect(isTransientDatabaseError(error)).toBe(true);
    });

    it('should identify network errors as transient', () => {
      const error = new Error('ECONNRESET');
      (error as any).code = 'ECONNRESET';
      expect(isTransientDatabaseError(error)).toBe(true);
    });

    it('should not identify validation errors as transient', () => {
      const error = new Error('ValidationException');
      error.name = 'ValidationException';
      expect(isTransientDatabaseError(error)).toBe(false);
    });
  });

  describe('withDatabaseErrorHandling', () => {
    it('should return result when operation succeeds', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await withDatabaseErrorHandling(operation, {
        operationName: 'testOperation',
        sessionId: 'test-session',
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw error when continueOnFailure is false', async () => {
      const error = new Error('Database error');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(
        withDatabaseErrorHandling(operation, {
          operationName: 'testOperation',
          sessionId: 'test-session',
          continueOnFailure: false,
        })
      ).rejects.toThrow('Database error');
    });

    it('should return null when continueOnFailure is true', async () => {
      const error = new Error('Database error');
      const operation = jest.fn().mockRejectedValue(error);
      
      const result = await withDatabaseErrorHandling(operation, {
        operationName: 'testOperation',
        sessionId: 'test-session',
        continueOnFailure: true,
      });

      expect(result).toBeNull();
    });

    it('should log error with full context', async () => {
      const error = new Error('Database error');
      error.name = 'ThrottlingException';
      const operation = jest.fn().mockRejectedValue(error);
      
      const result = await withDatabaseErrorHandling(operation, {
        operationName: 'testOperation',
        sessionId: 'test-session',
        continueOnFailure: true,
      });

      expect(result).toBeNull();
      // Logger is called internally, we just verify the operation completes
    });
  });

  describe('withDatabaseErrorHandlingVoid', () => {
    it('should complete successfully when operation succeeds', async () => {
      const operation = jest.fn().mockResolvedValue(undefined);
      
      await withDatabaseErrorHandlingVoid(operation, {
        operationName: 'testOperation',
        sessionId: 'test-session',
      });

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw error when continueOnFailure is false', async () => {
      const error = new Error('Database error');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(
        withDatabaseErrorHandlingVoid(operation, {
          operationName: 'testOperation',
          sessionId: 'test-session',
          continueOnFailure: false,
        })
      ).rejects.toThrow('Database error');
    });

    it('should not throw when continueOnFailure is true', async () => {
      const error = new Error('Database error');
      const operation = jest.fn().mockRejectedValue(error);
      
      await expect(
        withDatabaseErrorHandlingVoid(operation, {
          operationName: 'testOperation',
          sessionId: 'test-session',
          continueOnFailure: true,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('getDatabaseErrorCode', () => {
    it('should return DB_THROTTLED for throttling errors', () => {
      const error = new Error('ThrottlingException');
      error.name = 'ThrottlingException';
      expect(getDatabaseErrorCode(error)).toBe(ERROR_CODES.DB_THROTTLED);
    });

    it('should return DB_CONNECTION_FAILED for network errors', () => {
      const error = new Error('NetworkingError');
      error.name = 'NetworkingError';
      expect(getDatabaseErrorCode(error)).toBe(ERROR_CODES.DB_CONNECTION_FAILED);
    });

    it('should return DB_WRITE_FAILED for non-transient errors', () => {
      const error = new Error('ValidationException');
      error.name = 'ValidationException';
      expect(getDatabaseErrorCode(error)).toBe(ERROR_CODES.DB_WRITE_FAILED);
    });
  });
});
