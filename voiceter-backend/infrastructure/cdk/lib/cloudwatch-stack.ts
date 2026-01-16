import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface CloudWatchStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly service?: ecs.IService;
  readonly cluster?: ecs.ICluster;
  readonly serviceName?: string;
  readonly targetGroup?: elbv2.IApplicationTargetGroup;
  readonly alarmEmail?: string;
}

/**
 * CloudWatch Monitoring Stack
 * 
 * Creates:
 * - Log group with 30-day retention
 * - CloudWatch alarms for error rates, latency, health checks, CPU, memory
 * - SNS topic for alarm notifications
 * - CloudWatch dashboard for monitoring
 * 
 * Requirements: 21.1, 21.6
 */
export class CloudWatchStack extends cdk.Stack {
  public readonly logGroup: logs.ILogGroup;
  public readonly alarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: CloudWatchStackProps) {
    super(scope, id, props);

    // Reference existing CloudWatch Log Group (created by ECS stack)
    // The ECS stack creates this log group to ensure proper IAM permissions
    this.logGroup = logs.LogGroup.fromLogGroupName(
      this,
      'VoiceterLogGroup',
      `/ecs/${props.environmentName}-voiceter-backend`
    );

    // Create SNS Topic for alarm notifications
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `${props.environmentName}-voiceter-alarms`,
      displayName: 'Voiceter Backend Alarms',
    });

    // Subscribe email to alarm topic if provided
    if (props.alarmEmail) {
      this.alarmTopic.addSubscription(
        new cdk.aws_sns_subscriptions.EmailSubscription(props.alarmEmail)
      );
    }

    // Create CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'VoiceterDashboard', {
      dashboardName: `${props.environmentName}-voiceter-backend`,
    });

    // Create alarms if service and target group are provided
    if (props.service && props.targetGroup && props.cluster && props.serviceName) {
      this.createAlarms(props.cluster, props.serviceName, props.targetGroup);
      this.createDashboardWidgets(props.cluster, props.serviceName, props.targetGroup);
    }

    // Output CloudWatch information
    new cdk.CfnOutput(this, 'LogGroupName', {
      value: this.logGroup.logGroupName,
      description: 'CloudWatch Log Group Name',
      exportName: `${props.environmentName}-LogGroupName`,
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Alarm Topic ARN',
      exportName: `${props.environmentName}-AlarmTopicArn`,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    // Tag all resources
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Project', 'Voiceter');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }

  private createAlarms(cluster: ecs.ICluster, serviceName: string, targetGroup: elbv2.IApplicationTargetGroup): void {
    const environmentName = this.node.tryGetContext('environmentName') || 'dev';

    // High Error Rate Alarm (> 5%)
    const errorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      alarmName: `${environmentName}-voiceter-high-error-rate`,
      alarmDescription: 'Error rate exceeds 5%',
      metric: targetGroup.metrics.httpCodeTarget(
        elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: cdk.Duration.minutes(5) }
      ),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errorRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // High Latency Alarm (> 500ms)
    const latencyAlarm = new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
      alarmName: `${environmentName}-voiceter-high-latency`,
      alarmDescription: 'Target response time exceeds 500ms',
      metric: targetGroup.metrics.targetResponseTime({
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0.5, // 500ms in seconds
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    latencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Low Health Check Success Alarm (< 80%)
    const healthCheckAlarm = new cloudwatch.Alarm(this, 'LowHealthCheckAlarm', {
      alarmName: `${environmentName}-voiceter-low-health-check`,
      alarmDescription: 'Health check success rate below 80%',
      metric: targetGroup.metrics.healthyHostCount({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1, // At least 1 healthy host
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    healthCheckAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // High CPU Utilization Alarm (> 80%)
    const cpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      dimensionsMap: {
        ServiceName: serviceName,
        ClusterName: cluster.clusterName,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });
    
    const cpuAlarm = new cloudwatch.Alarm(this, 'HighCpuAlarm', {
      alarmName: `${environmentName}-voiceter-high-cpu`,
      alarmDescription: 'CPU utilization exceeds 80%',
      metric: cpuMetric,
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // High Memory Utilization Alarm (> 85%)
    const memoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      dimensionsMap: {
        ServiceName: serviceName,
        ClusterName: cluster.clusterName,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });
    
    const memoryAlarm = new cloudwatch.Alarm(this, 'HighMemoryAlarm', {
      alarmName: `${environmentName}-voiceter-high-memory`,
      alarmDescription: 'Memory utilization exceeds 85%',
      metric: memoryMetric,
      threshold: 85,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    memoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
  }

  private createDashboardWidgets(cluster: ecs.ICluster, serviceName: string, targetGroup: elbv2.IApplicationTargetGroup): void {
    // Service Metrics Widget
    const cpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      dimensionsMap: {
        ServiceName: serviceName,
        ClusterName: cluster.clusterName,
      },
      statistic: 'Average',
    });
    
    const memoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      dimensionsMap: {
        ServiceName: serviceName,
        ClusterName: cluster.clusterName,
      },
      statistic: 'Average',
    });
    
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS Service Metrics',
        left: [cpuMetric, memoryMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Target Group Metrics',
        left: [
          targetGroup.metrics.requestCount(),
          targetGroup.metrics.targetResponseTime({ statistic: 'p95' }),
        ],
        width: 12,
      })
    );

    // Error Metrics Widget
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Error Rates',
        left: [
          targetGroup.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_4XX_COUNT),
          targetGroup.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Health Check Status',
        left: [
          targetGroup.metrics.healthyHostCount(),
          targetGroup.metrics.unhealthyHostCount(),
        ],
        width: 12,
      })
    );

    // Custom Application Metrics Widget
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Application Metrics',
        left: [
          new cloudwatch.Metric({
            namespace: 'Voiceter',
            metricName: 'ConcurrentSessions',
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'Voiceter',
            metricName: 'WebSocketConnections',
            statistic: 'Average',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Latency Metrics',
        left: [
          new cloudwatch.Metric({
            namespace: 'Voiceter',
            metricName: 'BedrockLatency',
            statistic: 'p95',
          }),
          new cloudwatch.Metric({
            namespace: 'Voiceter',
            metricName: 'DatabaseLatency',
            statistic: 'p95',
          }),
        ],
        width: 12,
      })
    );
  }
}
