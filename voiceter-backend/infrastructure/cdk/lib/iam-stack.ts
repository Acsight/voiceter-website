import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface IamStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly sessionsTable?: dynamodb.ITable;
  readonly responsesTable?: dynamodb.ITable;
  readonly transcriptsTable?: dynamodb.ITable;
  readonly recordingsBucket?: s3.IBucket;
}

/**
 * IAM Roles Stack
 * 
 * Creates:
 * - Task execution role for ECS to pull images and write logs
 * - Task role with permissions for Bedrock, DynamoDB, S3, CloudWatch
 * - Follows least privilege principle
 * 
 * Requirements: 1.3
 */
export class IamStack extends cdk.Stack {
  public readonly taskExecutionRole: iam.Role;
  public readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    // Create Task Execution Role
    // Used by ECS to pull container images and write logs
    this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${props.environmentName}-voiceter-task-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Execution Role for Voiceter Backend',
      managedPolicies: [
        // Standard ECS task execution policy
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // Add permissions to read secrets from Secrets Manager (if needed)
    this.taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'secretsmanager:GetSecretValue',
          'kms:Decrypt',
        ],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:${props.environmentName}/voiceter/*`,
        ],
      })
    );

    // Create Task Role
    // Used by the application container to access AWS services
    this.taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${props.environmentName}-voiceter-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Role for Voiceter Backend Application',
    });

    // Add Bedrock permissions
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:InvokeModelWithBidirectionalStream',
          'bedrock:RenderPrompt', // Required for Prompt Management
        ],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.nova-2-sonic-v1:0`,
          `arn:aws:bedrock:*::foundation-model/*`, // Allow other models for future use
          `arn:aws:bedrock:*:${cdk.Stack.of(this).account}:prompt/*`, // Allow Prompt Management prompts
        ],
      })
    );

    // Add DynamoDB permissions
    if (props.sessionsTable && props.responsesTable && props.transcriptsTable) {
      // Grant read/write access to all tables
      props.sessionsTable.grantReadWriteData(this.taskRole);
      props.responsesTable.grantReadWriteData(this.taskRole);
      props.transcriptsTable.grantReadWriteData(this.taskRole);
    } else {
      // Grant permissions to all demo tables (if tables not provided)
      this.taskRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'DynamoDBAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
          ],
          resources: [
            `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.environmentName}-demo-*`,
            `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.environmentName}-demo-*/index/*`,
          ],
        })
      );
    }

    // Add S3 permissions
    if (props.recordingsBucket) {
      // Grant read/write access to recordings bucket
      props.recordingsBucket.grantReadWrite(this.taskRole);
    } else {
      // Grant permissions to recordings bucket (if bucket not provided)
      this.taskRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'S3Access',
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
          ],
          resources: [
            `arn:aws:s3:::${props.environmentName}-voiceter-demo-recordings`,
            `arn:aws:s3:::${props.environmentName}-voiceter-demo-recordings/*`,
          ],
        })
      );
    }

    // Add CloudWatch Logs permissions
    // Note: Using wildcard to avoid circular dependency with ECS log group
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
        ],
        resources: [
          `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/ecs/${props.environmentName}-voiceter-*`,
          `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/ecs/${props.environmentName}-voiceter-*:log-stream:*`,
        ],
      })
    );

    // Add CloudWatch Metrics permissions
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchMetricsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudwatch:PutMetricData',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'Voiceter',
          },
        },
      })
    );

    // Add X-Ray permissions for distributed tracing (optional)
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'XRayAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
        ],
        resources: ['*'],
      })
    );

    // Add ECS Exec permissions for debugging (optional)
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECSExecAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
      })
    );

    // Output role information
    new cdk.CfnOutput(this, 'TaskExecutionRoleArn', {
      value: this.taskExecutionRole.roleArn,
      description: 'Task Execution Role ARN',
      exportName: `${props.environmentName}-TaskExecutionRoleArn`,
    });

    new cdk.CfnOutput(this, 'TaskRoleArn', {
      value: this.taskRole.roleArn,
      description: 'Task Role ARN',
      exportName: `${props.environmentName}-TaskRoleArn`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Project', 'Voiceter');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
