import { Request, Response } from 'express';
import { getLogger } from './logger';
import { getDynamoDBClient } from '../data/dynamodb';

const logger = getLogger();

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  activeSessions: number;
  socketConnections: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
    };
  };
}

export class HealthCheck {
  private isShuttingDown: boolean = false;
  private healthChecks: Map<string, () => Promise<boolean>> = new Map();
  private getActiveSessionsCount: () => number | Promise<number>;
  private getSocketConnectionsCount: () => number;

  constructor(
    getActiveSessionsCount: () => number | Promise<number> = () => 0,
    getSocketConnectionsCount: () => number = () => 0
  ) {
    this.getActiveSessionsCount = getActiveSessionsCount;
    this.getSocketConnectionsCount = getSocketConnectionsCount;
    
    // Register default health checks
    this.registerCheck('server', async () => true);
  }

  /**
   * Register AWS service health checks (DynamoDB)
   * Should be called after AWS clients are initialized
   */
  registerAWSHealthChecks(): void {
    // Register DynamoDB connectivity check
    this.registerCheck('dynamodb', async () => {
      try {
        const dynamoClient = getDynamoDBClient();
        // Try to get a non-existent item to test connectivity
        // This is a lightweight operation that tests the connection
        await dynamoClient.getItem('sessions', { sessionId: '__health_check__' });
        return true;
      } catch (error) {
        logger.error('DynamoDB health check failed', {
          event: 'dynamodb_health_check_failed',
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    });

    logger.debug('AWS health checks registered');
  }

  /**
   * Register a health check function
   */
  registerCheck(name: string, checkFn: () => Promise<boolean>): void {
    this.healthChecks.set(name, checkFn);
    logger.debug(`Health check registered: ${name}`);
  }

  /**
   * Mark the service as shutting down
   */
  markShuttingDown(): void {
    this.isShuttingDown = true;
    logger.info('Service marked as shutting down');
  }

  /**
   * Check if the service is shutting down
   */
  isServiceShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Perform all health checks
   */
  async performHealthChecks(): Promise<HealthCheckResult> {
    // Get active sessions count (may be async)
    const activeSessionsCount = await Promise.resolve(this.getActiveSessionsCount());
    
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSessions: activeSessionsCount,
      socketConnections: this.getSocketConnectionsCount(),
      checks: {},
    };

    // If shutting down, return unhealthy immediately
    if (this.isShuttingDown) {
      result.status = 'unhealthy';
      result.checks.shutdown = {
        status: 'fail',
        message: 'Service is shutting down',
      };
      return result;
    }

    // Run all registered health checks
    for (const [name, checkFn] of this.healthChecks.entries()) {
      try {
        const passed = await checkFn();
        result.checks[name] = {
          status: passed ? 'pass' : 'fail',
        };

        if (!passed) {
          result.status = 'unhealthy';
        }
      } catch (error) {
        result.checks[name] = {
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
        result.status = 'unhealthy';

        logger.error(`Health check failed: ${name}`, {
          event: 'health_check_failed',
          checkName: name,
        }, error as Error);
      }
    }

    return result;
  }

  /**
   * Express middleware for health check endpoint
   */
  async handleHealthCheck(_req: Request, res: Response): Promise<void> {
    const result = await this.performHealthChecks();

    const statusCode = result.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json(result);

    logger.debug('Health check performed', {
      event: 'health_check',
      status: result.status,
      statusCode,
    });
  }
}

// Singleton instance
let healthCheckInstance: HealthCheck | null = null;

/**
 * Create the health check instance
 */
export function createHealthCheck(
  getActiveSessionsCount?: () => number | Promise<number>,
  getSocketConnectionsCount?: () => number
): HealthCheck {
  if (!healthCheckInstance) {
    healthCheckInstance = new HealthCheck(getActiveSessionsCount, getSocketConnectionsCount);
  }
  return healthCheckInstance;
}

/**
 * Get the health check instance
 */
export function getHealthCheck(): HealthCheck {
  if (!healthCheckInstance) {
    throw new Error('HealthCheck not initialized. Call createHealthCheck first.');
  }
  return healthCheckInstance;
}

export default HealthCheck;
