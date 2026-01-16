/**
 * DynamoDB Client Wrapper
 * 
 * Provides a simplified interface for DynamoDB operations with retry logic
 * and connection pooling.
 * 
 * Requirements:
 * - 7.6: Retry database operations up to 3 times with exponential backoff
 * - 8.6: Handle database errors gracefully with retry logic
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  PutItemCommandInput,
  GetItemCommandInput,
  UpdateItemCommandInput,
  DeleteItemCommandInput,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { getLogger } from '../monitoring/logger';
import { getMetricsEmitter } from '../monitoring/metrics';

const logger = getLogger();

/**
 * DynamoDB client configuration
 */
export interface DynamoDBClientConfig {
  region: string;
  tablePrefix?: string;
  maxConnections?: number;
  requestTimeout?: number;
  connectionTimeout?: number;
}

/**
 * DynamoDB client wrapper with retry logic and connection pooling
 */
export class DynamoDBClientWrapper {
  private client: DynamoDBClient;
  private tablePrefix: string;
  private maxRetries: number;
  private baseDelay: number;
  private maxDelay: number;

  constructor(config: DynamoDBClientConfig) {
    const {
      region,
      tablePrefix = 'demo-',
      maxConnections = 50,
      requestTimeout = 30000,
      connectionTimeout = 5000,
    } = config;

    // Configure HTTP handler with connection pooling
    // Note: Connection pooling is handled by Node.js http.Agent
    // The maxSockets option is set via the httpAgent/httpsAgent
    const requestHandler = new NodeHttpHandler({
      requestTimeout,
      connectionTimeout,
      httpAgent: {
        maxSockets: maxConnections,
      },
      httpsAgent: {
        maxSockets: maxConnections,
      },
    });

    this.client = new DynamoDBClient({
      region,
      requestHandler,
    });

    this.tablePrefix = tablePrefix;
    this.maxRetries = 3;
    this.baseDelay = 100; // 100ms base delay
    this.maxDelay = 10000; // 10 second max delay

    logger.info('DynamoDB client initialized', {
      region,
      tablePrefix,
      maxConnections,
      requestTimeout,
      connectionTimeout,
    });
  }

  /**
   * Get full table name with prefix
   */
  private getTableName(tableName: string): string {
    return `${this.tablePrefix}${tableName}`;
  }

  /**
   * Retry operation with exponential backoff
   * 
   * Implements exponential backoff strategy:
   * - Attempt 1: 100ms delay
   * - Attempt 2: 200ms delay
   * - Attempt 3: 400ms delay
   * - Max delay capped at 10 seconds
   * 
   * Requirements:
   * - 7.6: Retry up to 3 times with exponential backoff
   * - 8.6: Handle transient errors gracefully
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string = 'DynamoDB operation',
    tableName?: string
  ): Promise<T> {
    let lastError: Error | undefined;
    const startTime = Date.now();

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Emit database latency metric
        const latencyMs = Date.now() - startTime;
        try {
          const metricsEmitter = getMetricsEmitter();
          await metricsEmitter.emitDatabaseLatency(latencyMs, operationName, tableName);
        } catch (error) {
          // Metrics emitter not initialized, skip
        }
        
        // Log successful retry if this wasn't the first attempt
        if (attempt > 0) {
          logger.info(`${operationName} succeeded after retry`, {
            attempt: attempt + 1,
            totalAttempts: this.maxRetries,
          });
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isLastAttempt = attempt === this.maxRetries - 1;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError);

        if (isLastAttempt || !isRetryable) {
          logger.error(`${operationName} failed`, {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            isRetryable,
            error: lastError.message,
            errorName: lastError.name,
          });
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          Math.pow(2, attempt) * this.baseDelay,
          this.maxDelay
        );

        logger.warn(`${operationName} failed, retrying`, {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delay,
          error: lastError.message,
          errorName: lastError.name,
        });

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Check if error is retryable
   * 
   * Retryable errors include:
   * - Throttling errors
   * - Network errors
   * - Timeout errors
   * - Service unavailable errors
   */
  private isRetryableError(error: Error): boolean {
    const retryableErrorNames = [
      'ThrottlingException',
      'ProvisionedThroughputExceededException',
      'RequestLimitExceeded',
      'ServiceUnavailable',
      'InternalServerError',
      'NetworkingError',
      'TimeoutError',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
    ];

    return retryableErrorNames.some(
      (name) =>
        error.name === name ||
        error.message.includes(name) ||
        (error as any).code === name
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Put item into table
   * 
   * Requirements:
   * - 7.6: Retry on failure with exponential backoff
   */
  async putItem(tableName: string, item: Record<string, any>): Promise<void> {
    const fullTableName = this.getTableName(tableName);

    await this.retryOperation(async () => {
      const params: PutItemCommandInput = {
        TableName: fullTableName,
        Item: marshall(item, { removeUndefinedValues: true }),
      };

      await this.client.send(new PutItemCommand(params));
      logger.debug('Item put successfully', { tableName: fullTableName });
    }, `PutItem to ${fullTableName}`, tableName);
  }

  /**
   * Get item from table
   * 
   * Requirements:
   * - 7.6: Retry on failure with exponential backoff
   */
  async getItem(
    tableName: string,
    key: Record<string, any>
  ): Promise<Record<string, any> | null> {
    const fullTableName = this.getTableName(tableName);

    return await this.retryOperation(async () => {
      const params: GetItemCommandInput = {
        TableName: fullTableName,
        Key: marshall(key),
      };

      const result = await this.client.send(new GetItemCommand(params));

      if (!result.Item) {
        return null;
      }

      return unmarshall(result.Item);
    }, `GetItem from ${fullTableName}`, tableName);
  }

  /**
   * Update item in table
   * 
   * Requirements:
   * - 7.6: Retry on failure with exponential backoff
   */
  async updateItem(
    tableName: string,
    key: Record<string, any>,
    updates: Record<string, any>
  ): Promise<void> {
    const fullTableName = this.getTableName(tableName);

    await this.retryOperation(async () => {
      // Build update expression
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      Object.entries(updates).forEach(([key, value], index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      });

      const params: UpdateItemCommandInput = {
        TableName: fullTableName,
        Key: marshall(key),
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues, {
          removeUndefinedValues: true,
        }),
      };

      await this.client.send(new UpdateItemCommand(params));
      logger.debug('Item updated successfully', { tableName: fullTableName });
    }, `UpdateItem in ${fullTableName}`, tableName);
  }

  /**
   * Delete item from table
   * 
   * Requirements:
   * - 7.6: Retry on failure with exponential backoff
   */
  async deleteItem(tableName: string, key: Record<string, any>): Promise<void> {
    const fullTableName = this.getTableName(tableName);

    await this.retryOperation(async () => {
      const params: DeleteItemCommandInput = {
        TableName: fullTableName,
        Key: marshall(key),
      };

      await this.client.send(new DeleteItemCommand(params));
      logger.debug('Item deleted successfully', { tableName: fullTableName });
    }, `DeleteItem from ${fullTableName}`, tableName);
  }

  /**
   * Query items from table
   * 
   * Requirements:
   * - 7.6: Retry on failure with exponential backoff
   */
  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<Record<string, any>[]> {
    const fullTableName = this.getTableName(tableName);

    return await this.retryOperation(async () => {
      const params: QueryCommandInput = {
        TableName: fullTableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues, {
          removeUndefinedValues: true,
        }),
      };

      if (expressionAttributeNames) {
        params.ExpressionAttributeNames = expressionAttributeNames;
      }

      const result = await this.client.send(new QueryCommand(params));

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      return result.Items.map((item) => unmarshall(item));
    }, `Query ${fullTableName}`, tableName);
  }

  /**
   * Close client connection
   */
  destroy(): void {
    this.client.destroy();
    logger.info('DynamoDB client destroyed');
  }
}

// Singleton instance
let clientInstance: DynamoDBClientWrapper | null = null;

/**
 * Get singleton DynamoDB client instance
 * 
 * Initializes client with default configuration from environment variables
 * if not already initialized.
 */
export function getDynamoDBClient(): DynamoDBClientWrapper {
  if (!clientInstance) {
    const config: DynamoDBClientConfig = {
      region: process.env.AWS_REGION || 'us-east-1',
      tablePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'demo-',
      maxConnections: parseInt(process.env.DYNAMODB_MAX_CONNECTIONS || '50', 10),
      requestTimeout: parseInt(process.env.DYNAMODB_REQUEST_TIMEOUT || '30000', 10),
      connectionTimeout: parseInt(process.env.DYNAMODB_CONNECTION_TIMEOUT || '5000', 10),
    };
    clientInstance = new DynamoDBClientWrapper(config);
  }
  return clientInstance;
}

/**
 * Initialize DynamoDB client with custom configuration
 * 
 * Use this to override default configuration, typically for testing
 * or custom deployment scenarios.
 */
export function initializeDynamoDBClient(regionOrConfig: string | DynamoDBClientConfig, tablePrefix?: string): void {
  if (typeof regionOrConfig === 'string') {
    clientInstance = new DynamoDBClientWrapper({
      region: regionOrConfig,
      tablePrefix: tablePrefix || 'demo-',
    });
  } else {
    clientInstance = new DynamoDBClientWrapper(regionOrConfig);
  }
}

/**
 * Reset singleton instance (primarily for testing)
 */
export function resetDynamoDBClient(): void {
  if (clientInstance) {
    clientInstance.destroy();
    clientInstance = null;
  }
}
