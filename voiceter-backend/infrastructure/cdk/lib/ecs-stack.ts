import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface EcsStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly vpc: ec2.IVpc;
  readonly cluster: ecs.ICluster;
  readonly imageTag?: string;
  readonly targetGroup?: elbv2.IApplicationTargetGroup;
}

/**
 * ECS Task Definition and Service Stack
 * 
 * Creates:
 * - Fargate task definition (1 vCPU, 2GB memory)
 * - Container definition with environment variables
 * - Fargate service with desired count 2
 * - Auto-scaling configuration (min 2, max 10, target CPU 70%)
 * 
 * Requirements: 20.2, 20.5, 20.7
 */
export class EcsStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly taskRole: iam.Role;
  public readonly taskExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    // Create Task Execution Role (for ECS to pull images and write logs)
    this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${props.environmentName}-voiceter-task-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Add ECR permissions for pulling images
    this.taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: ['*'],
      })
    );

    // Create Task Role (for application to access AWS services)
    this.taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${props.environmentName}-voiceter-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add Bedrock permissions
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:InvokeModelWithBidirectionalStream',
        ],
        resources: [`arn:aws:bedrock:*::foundation-model/*`],
      })
    );

    // Add DynamoDB permissions
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [
          `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.environmentName}-demo-*`,
        ],
      })
    );

    // Add S3 permissions
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [`arn:aws:s3:::${props.environmentName}-voiceter-demo-recordings/*`],
      })
    );

    // Add CloudWatch permissions
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // Create CloudWatch Log Group for container logs
    const logGroup = new logs.LogGroup(this, 'VoiceterLogGroup', {
      logGroupName: `/ecs/${props.environmentName}-voiceter-backend`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Fargate Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${props.environmentName}-voiceter-backend`,
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskRole: this.taskRole,
      executionRole: this.taskExecutionRole,
    });

    // Get ECR image URI
    const imageTag = props.imageTag || 'latest';
    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;
    const repoName = `${props.environmentName}-voiceter-backend`;
    const imageUri = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repoName}:${imageTag}`;
    
    // Use the image URI directly (image must exist in ECR before deployment)
    const containerImage = ecs.ContainerImage.fromRegistry(imageUri);

    // Add container to task definition
    const container = this.taskDefinition.addContainer('backend', {
      containerName: 'voiceter-backend',
      image: containerImage,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'voiceter',
        logGroup: logGroup,
      }),
      environment: {
        // AWS Configuration
        AWS_REGION: cdk.Stack.of(this).region,
        BEDROCK_MODEL_ID: 'amazon.nova-2-sonic-v1:0',
        DYNAMODB_TABLE_PREFIX: 'demo-',
        S3_BUCKET_NAME: `${props.environmentName}-voiceter-demo-recordings`,
        
        // Server Configuration
        PORT: '8080',
        LOG_LEVEL: 'INFO',
        NODE_ENV: 'production',
        
        // Feature Flags
        ENABLE_AUTH: 'false', // Set to 'true' to enable Cognito authentication
      },
      portMappings: [
        {
          containerPort: 8080,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Create Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: `${props.environmentName}-voiceter-backend`,
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 2, // Start with 2 tasks for high availability
      minHealthyPercent: 50, // Allow 50% of tasks to be replaced during deployment
      maxHealthyPercent: 200, // Allow up to 200% during deployment (rolling update)
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, // Run in private subnets
      },
      assignPublicIp: false, // No public IP needed, use NAT gateway
      circuitBreaker: {
        rollback: true, // Automatically rollback on deployment failure
      },
      enableExecuteCommand: true, // Enable ECS Exec for debugging
    });

    // Configure Auto-scaling
    // Scale based on CPU utilization (target 70%)
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 2, // Minimum 2 tasks for high availability
      maxCapacity: 10, // Maximum 10 tasks
    });

    // CPU-based auto-scaling
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300), // 5 minutes cooldown for scale-in
      scaleOutCooldown: cdk.Duration.seconds(60), // 1 minute cooldown for scale-out
    });

    // Memory-based auto-scaling
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Attach service to target group if provided
    if (props.targetGroup) {
      this.service.attachToApplicationTargetGroup(props.targetGroup);
    }

    // Output service information
    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS Service Name',
      exportName: `${props.environmentName}-ServiceName`,
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      description: 'ECS Service ARN',
      exportName: `${props.environmentName}-ServiceArn`,
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      description: 'Task Definition ARN',
      exportName: `${props.environmentName}-TaskDefinitionArn`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Project', 'Voiceter');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
