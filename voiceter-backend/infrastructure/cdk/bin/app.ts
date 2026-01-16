#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { S3Stack } from '../lib/s3-stack';
import { IamStack } from '../lib/iam-stack';
import { EcsStack } from '../lib/ecs-stack';
import { AlbStack } from '../lib/alb-stack';
import { CloudWatchStack } from '../lib/cloudwatch-stack';

/**
 * Voiceter Backend Infrastructure
 * 
 * This CDK app creates all the infrastructure needed for the Voiceter backend:
 * - VPC with 2 AZs
 * - ECS Cluster with Fargate
 * - Application Load Balancer
 * - DynamoDB tables
 * - S3 bucket for recordings
 * - IAM roles
 * - CloudWatch monitoring
 * 
 * Usage:
 *   npm run cdk deploy -- --all
 *   npm run cdk destroy -- --all
 * 
 * Environment Variables:
 *   ENVIRONMENT_NAME: Environment name (dev, staging, prod)
 *   AWS_REGION: AWS region to deploy to
 *   CERTIFICATE_ARN: SSL certificate ARN for HTTPS (optional)
 *   ALARM_EMAIL: Email address for CloudWatch alarms (optional)
 *   IMAGE_TAG: Docker image tag to deploy (default: latest)
 */

const app = new cdk.App();

// Get configuration from context or environment variables
const environmentName = app.node.tryGetContext('environmentName') || process.env.ENVIRONMENT_NAME || 'dev';
const awsRegion = app.node.tryGetContext('region') || process.env.AWS_REGION || 'us-east-1';
const certificateArn = app.node.tryGetContext('certificateArn') || process.env.CERTIFICATE_ARN;
const alarmEmail = app.node.tryGetContext('alarmEmail') || process.env.ALARM_EMAIL;
const imageTag = app.node.tryGetContext('imageTag') || process.env.IMAGE_TAG || 'latest';

// Stack properties
const stackProps: cdk.StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: awsRegion,
  },
  description: `Voiceter Backend Infrastructure - ${environmentName}`,
};

// Create VPC and ECS Cluster Stack
const vpcStack = new VpcStack(app, `${environmentName}-VoiceterVpcStack`, {
  ...stackProps,
  environmentName,
});

// Create DynamoDB Tables Stack
const dynamoDbStack = new DynamoDbStack(app, `${environmentName}-VoiceterDynamoDbStack`, {
  ...stackProps,
  environmentName,
});

// Create S3 Bucket Stack
const s3Stack = new S3Stack(app, `${environmentName}-VoiceterS3Stack`, {
  ...stackProps,
  environmentName,
});

// Create Application Load Balancer Stack first (without service attachment)
const albStack = new AlbStack(app, `${environmentName}-VoiceterAlbStack`, {
  ...stackProps,
  environmentName,
  vpc: vpcStack.vpc,
  certificateArn,
});

// Create ECS Task and Service Stack (includes IAM roles to avoid circular dependencies)
const ecsStack = new EcsStack(app, `${environmentName}-VoiceterEcsStack`, {
  ...stackProps,
  environmentName,
  vpc: vpcStack.vpc,
  cluster: vpcStack.cluster,
  targetGroup: albStack.targetGroup,
  imageTag,
});

// Create CloudWatch Monitoring Stack
const cloudWatchStack = new CloudWatchStack(app, `${environmentName}-VoiceterCloudWatchStack`, {
  ...stackProps,
  environmentName,
  service: ecsStack.service,
  targetGroup: albStack.targetGroup,
  alarmEmail,
});

// Dependencies are automatically managed by CDK based on resource references
// No need to add explicit dependencies - CDK will infer them from the props passed between stacks

// Add tags to all stacks
cdk.Tags.of(app).add('Environment', environmentName);
cdk.Tags.of(app).add('Project', 'Voiceter');
cdk.Tags.of(app).add('ManagedBy', 'CDK');

// Synthesize the app
app.synth();
