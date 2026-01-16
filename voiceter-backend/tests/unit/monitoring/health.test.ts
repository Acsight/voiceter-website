import { HealthCheck } from '../../../src/monitoring/health';

describe('HealthCheck', () => {
  let healthCheck: HealthCheck;

  beforeEach(() => {
    healthCheck = new HealthCheck();
  });

  describe('performHealthChecks', () => {
    it('should return healthy status when all checks pass', async () => {
      const result = await healthCheck.performHealthChecks();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.checks.server).toEqual({ status: 'pass' });
    });

    it('should return unhealthy status when service is shutting down', async () => {
      healthCheck.markShuttingDown();

      const result = await healthCheck.performHealthChecks();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.shutdown).toEqual({
        status: 'fail',
        message: 'Service is shutting down',
      });
    });

    it('should return unhealthy status when a check fails', async () => {
      healthCheck.registerCheck('failing-check', async () => false);

      const result = await healthCheck.performHealthChecks();

      expect(result.status).toBe('unhealthy');
      expect(result.checks['failing-check']).toEqual({ status: 'fail' });
    });

    it('should handle check errors gracefully', async () => {
      healthCheck.registerCheck('error-check', async () => {
        throw new Error('Check failed');
      });

      const result = await healthCheck.performHealthChecks();

      expect(result.status).toBe('unhealthy');
      expect(result.checks['error-check']).toEqual({
        status: 'fail',
        message: 'Check failed',
      });
    });
  });

  describe('registerCheck', () => {
    it('should register a custom health check', async () => {
      let checkCalled = false;
      healthCheck.registerCheck('custom-check', async () => {
        checkCalled = true;
        return true;
      });

      const result = await healthCheck.performHealthChecks();

      expect(checkCalled).toBe(true);
      expect(result.checks['custom-check']).toEqual({ status: 'pass' });
    });
  });

  describe('markShuttingDown', () => {
    it('should mark service as shutting down', () => {
      expect(healthCheck.isServiceShuttingDown()).toBe(false);

      healthCheck.markShuttingDown();

      expect(healthCheck.isServiceShuttingDown()).toBe(true);
    });
  });

  describe('handleHealthCheck', () => {
    it('should return 200 when healthy', async () => {
      const req = {} as any;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await healthCheck.handleHealthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
        })
      );
    });

    it('should return 503 when unhealthy', async () => {
      healthCheck.registerCheck('failing-check', async () => false);

      const req = {} as any;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await healthCheck.handleHealthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
        })
      );
    });

    it('should return 503 when shutting down', async () => {
      healthCheck.markShuttingDown();

      const req = {} as any;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await healthCheck.handleHealthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          checks: expect.objectContaining({
            shutdown: {
              status: 'fail',
              message: 'Service is shutting down',
            },
          }),
        })
      );
    });
  });
});
