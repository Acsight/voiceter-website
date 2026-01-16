/**
 * CloudWatch Alarms Configuration
 * 
 * This module defines the alarm configurations for the Voiceter Backend.
 * These configurations are used by the CDK infrastructure code to create
 * CloudWatch alarms for monitoring system health and performance.
 */

export interface AlarmConfiguration {
  alarmName: string;
  alarmDescription: string;
  metricName: string;
  namespace: string;
  statistic: 'Average' | 'Sum' | 'Minimum' | 'Maximum' | 'SampleCount';
  period: number; // in seconds
  evaluationPeriods: number;
  threshold: number;
  comparisonOperator: 'GreaterThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanThreshold' | 'LessThanOrEqualToThreshold';
  treatMissingData?: 'breaching' | 'notBreaching' | 'ignore' | 'missing';
  dimensions?: Record<string, string>;
}

/**
 * High Error Rate Alarm (> 5%)
 * 
 * Triggers when error rate exceeds 5% over a 5-minute period.
 * This indicates a critical issue affecting user experience.
 */
export const HIGH_ERROR_RATE_ALARM: AlarmConfiguration = {
  alarmName: 'Voiceter-Backend-High-Error-Rate',
  alarmDescription: 'Error rate exceeds 5% - Critical issue affecting users',
  metricName: 'ErrorRate',
  namespace: 'Voiceter/Backend',
  statistic: 'Sum',
  period: 300, // 5 minutes
  evaluationPeriods: 1,
  threshold: 5, // 5% error rate
  comparisonOperator: 'GreaterThanThreshold',
  treatMissingData: 'notBreaching',
};

/**
 * High Latency Alarm (> 500ms)
 * 
 * Triggers when average latency exceeds 500ms over a 5-minute period.
 * This indicates performance degradation affecting user experience.
 */
export const HIGH_LATENCY_ALARM: AlarmConfiguration = {
  alarmName: 'Voiceter-Backend-High-Latency',
  alarmDescription: 'Average latency exceeds 500ms - Performance degradation',
  metricName: 'BedrockLatency',
  namespace: 'Voiceter/Backend',
  statistic: 'Average',
  period: 300, // 5 minutes
  evaluationPeriods: 2,
  threshold: 500, // 500ms
  comparisonOperator: 'GreaterThanThreshold',
  treatMissingData: 'notBreaching',
};

/**
 * Low Health Check Success Alarm (< 80%)
 * 
 * Triggers when health check success rate falls below 80% over a 5-minute period.
 * This indicates service availability issues.
 */
export const LOW_HEALTH_CHECK_SUCCESS_ALARM: AlarmConfiguration = {
  alarmName: 'Voiceter-Backend-Low-Health-Check-Success',
  alarmDescription: 'Health check success rate below 80% - Service availability issue',
  metricName: 'HealthCheckSuccess',
  namespace: 'AWS/ApplicationELB',
  statistic: 'Average',
  period: 300, // 5 minutes
  evaluationPeriods: 2,
  threshold: 0.8, // 80%
  comparisonOperator: 'LessThanThreshold',
  treatMissingData: 'breaching',
};

/**
 * High CPU Utilization Alarm (> 80%)
 * 
 * Triggers when CPU utilization exceeds 80% over a 5-minute period.
 * This indicates the service may need to scale out.
 */
export const HIGH_CPU_UTILIZATION_ALARM: AlarmConfiguration = {
  alarmName: 'Voiceter-Backend-High-CPU-Utilization',
  alarmDescription: 'CPU utilization exceeds 80% - Consider scaling out',
  metricName: 'CPUUtilization',
  namespace: 'AWS/ECS',
  statistic: 'Average',
  period: 300, // 5 minutes
  evaluationPeriods: 2,
  threshold: 80, // 80%
  comparisonOperator: 'GreaterThanThreshold',
  treatMissingData: 'notBreaching',
};

/**
 * High Memory Utilization Alarm (> 85%)
 * 
 * Triggers when memory utilization exceeds 85% over a 5-minute period.
 * This indicates potential memory pressure or leaks.
 */
export const HIGH_MEMORY_UTILIZATION_ALARM: AlarmConfiguration = {
  alarmName: 'Voiceter-Backend-High-Memory-Utilization',
  alarmDescription: 'Memory utilization exceeds 85% - Potential memory pressure',
  metricName: 'MemoryUtilization',
  namespace: 'AWS/ECS',
  statistic: 'Average',
  period: 300, // 5 minutes
  evaluationPeriods: 2,
  threshold: 85, // 85%
  comparisonOperator: 'GreaterThanThreshold',
  treatMissingData: 'notBreaching',
};

/**
 * Database High Latency Alarm (> 100ms)
 * 
 * Triggers when database latency exceeds 100ms over a 5-minute period.
 * This indicates database performance issues.
 */
export const DATABASE_HIGH_LATENCY_ALARM: AlarmConfiguration = {
  alarmName: 'Voiceter-Backend-Database-High-Latency',
  alarmDescription: 'Database latency exceeds 100ms - Database performance issue',
  metricName: 'DatabaseLatency',
  namespace: 'Voiceter/Backend',
  statistic: 'Average',
  period: 300, // 5 minutes
  evaluationPeriods: 2,
  threshold: 100, // 100ms
  comparisonOperator: 'GreaterThanThreshold',
  treatMissingData: 'notBreaching',
};

/**
 * Bedrock High Latency Alarm (> 1000ms)
 * 
 * Triggers when Bedrock API latency exceeds 1000ms over a 5-minute period.
 * This indicates issues with the Bedrock service or network.
 */
export const BEDROCK_HIGH_LATENCY_ALARM: AlarmConfiguration = {
  alarmName: 'Voiceter-Backend-Bedrock-High-Latency',
  alarmDescription: 'Bedrock latency exceeds 1000ms - Bedrock service issue',
  metricName: 'BedrockLatency',
  namespace: 'Voiceter/Backend',
  statistic: 'Average',
  period: 300, // 5 minutes
  evaluationPeriods: 2,
  threshold: 1000, // 1000ms
  comparisonOperator: 'GreaterThanThreshold',
  treatMissingData: 'notBreaching',
};

/**
 * All alarm configurations
 */
export const ALL_ALARMS: AlarmConfiguration[] = [
  HIGH_ERROR_RATE_ALARM,
  HIGH_LATENCY_ALARM,
  LOW_HEALTH_CHECK_SUCCESS_ALARM,
  HIGH_CPU_UTILIZATION_ALARM,
  HIGH_MEMORY_UTILIZATION_ALARM,
  DATABASE_HIGH_LATENCY_ALARM,
  BEDROCK_HIGH_LATENCY_ALARM,
];

/**
 * Get alarm configuration by name
 */
export function getAlarmConfiguration(alarmName: string): AlarmConfiguration | undefined {
  return ALL_ALARMS.find((alarm) => alarm.alarmName === alarmName);
}

/**
 * Get all critical alarms (error rate, health check, service availability)
 */
export function getCriticalAlarms(): AlarmConfiguration[] {
  return [
    HIGH_ERROR_RATE_ALARM,
    LOW_HEALTH_CHECK_SUCCESS_ALARM,
  ];
}

/**
 * Get all performance alarms (latency, CPU, memory)
 */
export function getPerformanceAlarms(): AlarmConfiguration[] {
  return [
    HIGH_LATENCY_ALARM,
    HIGH_CPU_UTILIZATION_ALARM,
    HIGH_MEMORY_UTILIZATION_ALARM,
    DATABASE_HIGH_LATENCY_ALARM,
    BEDROCK_HIGH_LATENCY_ALARM,
  ];
}

export default {
  HIGH_ERROR_RATE_ALARM,
  HIGH_LATENCY_ALARM,
  LOW_HEALTH_CHECK_SUCCESS_ALARM,
  HIGH_CPU_UTILIZATION_ALARM,
  HIGH_MEMORY_UTILIZATION_ALARM,
  DATABASE_HIGH_LATENCY_ALARM,
  BEDROCK_HIGH_LATENCY_ALARM,
  ALL_ALARMS,
  getAlarmConfiguration,
  getCriticalAlarms,
  getPerformanceAlarms,
};
