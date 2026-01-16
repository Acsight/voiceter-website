import { CloudWatchClient, PutMetricDataCommand, MetricDatum, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { getLogger } from './logger';

const logger = getLogger();

export interface MetricData {
  metricName: string;
  value: number;
  unit: StandardUnit;
  dimensions?: Record<string, string>;
  timestamp?: Date;
}

export class MetricsEmitter {
  private cloudWatchClient: CloudWatchClient;
  private namespace: string;
  private enabled: boolean;

  constructor(region: string, namespace: string = 'Voiceter/Backend', enabled: boolean = true) {
    this.cloudWatchClient = new CloudWatchClient({ region });
    this.namespace = namespace;
    this.enabled = enabled;
  }

  /**
   * Emit a single metric to CloudWatch
   */
  async emitMetric(metric: MetricData): Promise<void> {
    if (!this.enabled) {
      logger.debug('Metrics disabled, skipping metric emission', { metricName: metric.metricName });
      return;
    }

    try {
      const metricDatum: MetricDatum = {
        MetricName: metric.metricName,
        Value: metric.value,
        Unit: metric.unit,
        Timestamp: metric.timestamp || new Date(),
      };

      // Add dimensions if provided
      if (metric.dimensions) {
        metricDatum.Dimensions = Object.entries(metric.dimensions).map(([name, value]) => ({
          Name: name,
          Value: value,
        }));
      }

      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [metricDatum],
      });

      await this.cloudWatchClient.send(command);

      logger.debug('Metric emitted successfully', {
        event: 'metric_emitted',
        metricName: metric.metricName,
        value: metric.value,
        unit: metric.unit,
      });
    } catch (error) {
      logger.error('Failed to emit metric', {
        event: 'metric_emission_failed',
        metricName: metric.metricName,
      }, error as Error);
    }
  }

  /**
   * Emit multiple metrics to CloudWatch in a single request
   */
  async emitMetrics(metrics: MetricData[]): Promise<void> {
    if (!this.enabled) {
      logger.debug('Metrics disabled, skipping metrics emission');
      return;
    }

    if (metrics.length === 0) {
      return;
    }

    try {
      const metricData: MetricDatum[] = metrics.map((metric) => {
        const datum: MetricDatum = {
          MetricName: metric.metricName,
          Value: metric.value,
          Unit: metric.unit,
          Timestamp: metric.timestamp || new Date(),
        };

        if (metric.dimensions) {
          datum.Dimensions = Object.entries(metric.dimensions).map(([name, value]) => ({
            Name: name,
            Value: value,
          }));
        }

        return datum;
      });

      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: metricData,
      });

      await this.cloudWatchClient.send(command);

      logger.debug('Metrics emitted successfully', {
        event: 'metrics_emitted',
        count: metrics.length,
      });
    } catch (error) {
      logger.error('Failed to emit metrics', {
        event: 'metrics_emission_failed',
        count: metrics.length,
      }, error as Error);
    }
  }

  /**
   * Emit concurrent sessions metric
   */
  async emitConcurrentSessions(count: number): Promise<void> {
    await this.emitMetric({
      metricName: 'ConcurrentSessions',
      value: count,
      unit: 'Count',
    });
  }

  /**
   * Emit WebSocket connections metric
   */
  async emitWebSocketConnections(count: number): Promise<void> {
    await this.emitMetric({
      metricName: 'WebSocketConnections',
      value: count,
      unit: 'Count',
    });
  }

  /**
   * Emit Bedrock latency metric
   */
  async emitBedrockLatency(latencyMs: number, operation?: string): Promise<void> {
    const dimensions = operation ? { Operation: operation } : undefined;
    
    await this.emitMetric({
      metricName: 'BedrockLatency',
      value: latencyMs,
      unit: 'Milliseconds',
      dimensions,
    });
  }

  /**
   * Emit database latency metric
   */
  async emitDatabaseLatency(latencyMs: number, operation?: string, table?: string): Promise<void> {
    const dimensions: Record<string, string> = {};
    
    if (operation) {
      dimensions.Operation = operation;
    }
    
    if (table) {
      dimensions.Table = table;
    }
    
    await this.emitMetric({
      metricName: 'DatabaseLatency',
      value: latencyMs,
      unit: 'Milliseconds',
      dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined,
    });
  }

  /**
   * Emit error rate metric
   */
  async emitError(errorCode?: string): Promise<void> {
    const dimensions = errorCode ? { ErrorCode: errorCode } : undefined;
    
    await this.emitMetric({
      metricName: 'ErrorRate',
      value: 1,
      unit: 'Count',
      dimensions,
    });
  }

  /**
   * Emit audio chunks processed metric
   */
  async emitAudioChunksProcessed(count: number, direction?: 'inbound' | 'outbound'): Promise<void> {
    const dimensions = direction ? { Direction: direction } : undefined;
    
    await this.emitMetric({
      metricName: 'AudioChunksProcessed',
      value: count,
      unit: 'Count',
      dimensions,
    });
  }

  /**
   * Emit tool execution latency metric
   */
  async emitToolExecutionLatency(latencyMs: number, toolName?: string): Promise<void> {
    const dimensions = toolName ? { ToolName: toolName } : undefined;
    
    await this.emitMetric({
      metricName: 'ToolExecutionLatency',
      value: latencyMs,
      unit: 'Milliseconds',
      dimensions,
    });
  }

  /**
   * Emit session started metric
   */
  async emitSessionStarted(questionnaireId?: string): Promise<void> {
    const dimensions = questionnaireId ? { QuestionnaireId: questionnaireId } : undefined;
    
    await this.emitMetric({
      metricName: 'SessionsStarted',
      value: 1,
      unit: 'Count',
      dimensions,
    });
  }

  /**
   * Emit session completed metric
   */
  async emitSessionCompleted(questionnaireId?: string, completionStatus?: string): Promise<void> {
    const dimensions: Record<string, string> = {};
    
    if (questionnaireId) {
      dimensions.QuestionnaireId = questionnaireId;
    }
    
    if (completionStatus) {
      dimensions.CompletionStatus = completionStatus;
    }
    
    await this.emitMetric({
      metricName: 'SessionsCompleted',
      value: 1,
      unit: 'Count',
      dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined,
    });
  }

  /**
   * Emit session duration metric
   */
  async emitSessionDuration(durationMs: number, questionnaireId?: string): Promise<void> {
    const dimensions = questionnaireId ? { QuestionnaireId: questionnaireId } : undefined;
    
    await this.emitMetric({
      metricName: 'SessionDuration',
      value: durationMs,
      unit: 'Milliseconds',
      dimensions,
    });
  }

  /**
   * Emit questions answered metric
   */
  async emitQuestionsAnswered(count: number, questionnaireId?: string): Promise<void> {
    const dimensions = questionnaireId ? { QuestionnaireId: questionnaireId } : undefined;
    
    await this.emitMetric({
      metricName: 'QuestionsAnswered',
      value: count,
      unit: 'Count',
      dimensions,
    });
  }

  /**
   * Enable or disable metrics emission
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`Metrics emission ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if metrics emission is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ==========================================================================
  // Gemini Live-specific metrics
  // ==========================================================================

  /**
   * Emit Gemini Live connection count metric
   * 
   * _Requirements: 6.5, 11.1_
   */
  async emitGeminiConnectionCount(count: number): Promise<void> {
    await this.emitMetric({
      metricName: 'GeminiLiveConnections',
      value: count,
      unit: 'Count',
    });
  }

  /**
   * Emit Gemini Live API latency metric
   * 
   * _Requirements: 6.5, 11.2_
   */
  async emitGeminiLatency(latencyMs: number, operation?: string): Promise<void> {
    const dimensions = operation ? { Operation: operation } : undefined;
    
    await this.emitMetric({
      metricName: 'GeminiLiveLatency',
      value: latencyMs,
      unit: 'Milliseconds',
      dimensions,
    });
  }

  /**
   * Emit Gemini Live tool execution latency metric
   * 
   * _Requirements: 6.5, 11.3_
   */
  async emitGeminiToolLatency(latencyMs: number, toolName?: string): Promise<void> {
    const dimensions = toolName ? { ToolName: toolName } : undefined;
    
    await this.emitMetric({
      metricName: 'GeminiLiveToolLatency',
      value: latencyMs,
      unit: 'Milliseconds',
      dimensions,
    });
  }

  /**
   * Emit Gemini Live error metric
   * 
   * _Requirements: 6.5, 11.4_
   */
  async emitGeminiError(errorCode?: string): Promise<void> {
    const dimensions = errorCode ? { ErrorCode: errorCode } : undefined;
    
    await this.emitMetric({
      metricName: 'GeminiLiveErrors',
      value: 1,
      unit: 'Count',
      dimensions,
    });
  }

  /**
   * Emit Gemini Live audio chunks metric
   * 
   * _Requirements: 6.5_
   */
  async emitGeminiAudioChunks(count: number, direction: 'sent' | 'received'): Promise<void> {
    await this.emitMetric({
      metricName: 'GeminiLiveAudioChunks',
      value: count,
      unit: 'Count',
      dimensions: { Direction: direction },
    });
  }

  /**
   * Emit Gemini Live turn count metric
   * 
   * _Requirements: 6.5_
   */
  async emitGeminiTurnCount(count: number, questionnaireId?: string): Promise<void> {
    const dimensions = questionnaireId ? { QuestionnaireId: questionnaireId } : undefined;
    
    await this.emitMetric({
      metricName: 'GeminiLiveTurnCount',
      value: count,
      unit: 'Count',
      dimensions,
    });
  }

  /**
   * Emit Gemini Live session completed metric with detailed metrics
   * 
   * _Requirements: 6.5, 6.6_
   */
  async emitGeminiSessionCompleted(
    questionnaireId: string,
    status: string,
    metrics: {
      durationMs: number;
      turnCount: number;
      audioChunksSent: number;
      audioChunksReceived: number;
      toolCallsExecuted: number;
      averageToolLatencyMs: number;
    }
  ): Promise<void> {
    const baseDimensions = {
      QuestionnaireId: questionnaireId,
      CompletionStatus: status,
    };

    // Emit multiple metrics for the completed session
    await this.emitMetrics([
      {
        metricName: 'GeminiLiveSessionDuration',
        value: metrics.durationMs,
        unit: 'Milliseconds',
        dimensions: baseDimensions,
      },
      {
        metricName: 'GeminiLiveSessionTurns',
        value: metrics.turnCount,
        unit: 'Count',
        dimensions: baseDimensions,
      },
      {
        metricName: 'GeminiLiveSessionAudioChunksSent',
        value: metrics.audioChunksSent,
        unit: 'Count',
        dimensions: baseDimensions,
      },
      {
        metricName: 'GeminiLiveSessionAudioChunksReceived',
        value: metrics.audioChunksReceived,
        unit: 'Count',
        dimensions: baseDimensions,
      },
      {
        metricName: 'GeminiLiveSessionToolCalls',
        value: metrics.toolCallsExecuted,
        unit: 'Count',
        dimensions: baseDimensions,
      },
      {
        metricName: 'GeminiLiveSessionAvgToolLatency',
        value: metrics.averageToolLatencyMs,
        unit: 'Milliseconds',
        dimensions: baseDimensions,
      },
    ]);
  }

  /**
   * Emit Gemini Live reconnection metric
   * 
   * _Requirements: 6.5_
   */
  async emitGeminiReconnection(success: boolean): Promise<void> {
    await this.emitMetric({
      metricName: success ? 'GeminiLiveReconnectionSuccess' : 'GeminiLiveReconnectionFailed',
      value: 1,
      unit: 'Count',
    });
  }
}

// Singleton instance
let metricsEmitterInstance: MetricsEmitter | null = null;

/**
 * Create and configure the metrics emitter
 */
export function createMetricsEmitter(
  region: string,
  namespace?: string,
  enabled?: boolean
): MetricsEmitter {
  if (!metricsEmitterInstance) {
    metricsEmitterInstance = new MetricsEmitter(region, namespace, enabled);
  }
  return metricsEmitterInstance;
}

/**
 * Get the metrics emitter instance
 */
export function getMetricsEmitter(): MetricsEmitter {
  if (!metricsEmitterInstance) {
    throw new Error('MetricsEmitter not initialized. Call createMetricsEmitter first.');
  }
  return metricsEmitterInstance;
}

export default MetricsEmitter;
