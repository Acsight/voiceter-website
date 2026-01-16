# ECS Task Definition

This directory contains the ECS Fargate task definition for the Voiceter Backend service.

## Task Definition Overview

- **Family**: voiceter-backend
- **Launch Type**: Fargate
- **CPU**: 1 vCPU (1024 CPU units)
- **Memory**: 2 GB (2048 MB)
- **Network Mode**: awsvpc (required for Fargate)

## Configuration

### Container Specifications

- **Image**: Stored in Amazon ECR
- **Port**: 8080 (HTTP/WebSocket)
- **Health Check**: GET /health endpoint every 30 seconds
- **Logging**: CloudWatch Logs with automatic log group creation

### Environment Variables

The task definition includes all required environment variables:

- **AWS Configuration**: Region, Bedrock model ID
- **DynamoDB Tables**: Sessions, responses, transcripts
- **S3 Configuration**: Bucket name and prefix for audio recordings
- **Server Configuration**: Port, log level, timeouts
- **Feature Flags**: Auth, audio recording, sentiment analysis, quota management
- **Rate Limiting**: Message limits and chunk size limits
- **Monitoring**: CloudWatch namespace, X-Ray tracing

### IAM Roles

Two IAM roles are required:

1. **Execution Role** (`voiceter-backend-execution-role`):
   - Allows ECS to pull container images from ECR
   - Allows ECS to write logs to CloudWatch
   - Allows ECS to retrieve secrets from Secrets Manager (if used)

2. **Task Role** (`voiceter-backend-task-role`):
   - Allows the application to invoke Bedrock models
   - Allows the application to read/write to DynamoDB tables
   - Allows the application to read/write to S3 buckets
   - Allows the application to write metrics to CloudWatch

### Health Check

The health check configuration:
- **Endpoint**: `GET /health`
- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Retries**: 3 attempts
- **Start Period**: 60 seconds (grace period for startup)

### Resource Limits

- **File Descriptors**: 65536 (soft and hard limit) for handling many concurrent WebSocket connections
- **Stop Timeout**: 30 seconds for graceful shutdown

## Deployment

### Prerequisites

1. **ECR Repository**: Create an ECR repository for the container image
   ```bash
   aws ecr create-repository --repository-name voiceter-backend --region us-east-1
   ```

2. **IAM Roles**: Create the execution and task roles (see `../iam/` directory)

3. **CloudWatch Log Group**: Automatically created by the task definition

4. **DynamoDB Tables**: Create the required tables:
   - demo-sessions
   - demo-responses
   - demo-transcripts

5. **S3 Bucket**: Create the S3 bucket for audio recordings (optional)

### Register Task Definition

Replace placeholders in the task definition:
- `ACCOUNT_ID`: Your AWS account ID
- `REGION`: Your AWS region (e.g., us-east-1)

Register the task definition:
```bash
# Update placeholders
sed -i 's/ACCOUNT_ID/123456789012/g' task-definition.json
sed -i 's/REGION/us-east-1/g' task-definition.json

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json \
  --region us-east-1
```

### Create ECS Service

Create an ECS service using this task definition:
```bash
aws ecs create-service \
  --cluster voiceter-cluster \
  --service-name voiceter-backend \
  --task-definition voiceter-backend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/voiceter-backend/xxx,containerName=voiceter-backend,containerPort=8080" \
  --health-check-grace-period-seconds 60 \
  --region us-east-1
```

### Update Service

To deploy a new version:
```bash
# Register new task definition revision
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json \
  --region us-east-1

# Update service to use new revision
aws ecs update-service \
  --cluster voiceter-cluster \
  --service voiceter-backend \
  --task-definition voiceter-backend \
  --force-new-deployment \
  --region us-east-1
```

## Customization

### Environment-Specific Configuration

For different environments (dev, staging, production), create separate task definition files:
- `task-definition-dev.json`
- `task-definition-staging.json`
- `task-definition-prod.json`

Modify environment variables as needed for each environment.

### Secrets Management

To use AWS Secrets Manager for sensitive configuration:

1. Create secrets in Secrets Manager
2. Update the `secrets` array in the task definition:
   ```json
   "secrets": [
     {
       "name": "COGNITO_USER_POOL_ID",
       "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:voiceter/cognito-xxx"
     }
   ]
   ```
3. Grant the execution role permission to read the secrets

### Multi-Region Deployment

To deploy in multiple regions:
1. Create ECR repositories in each region
2. Push container images to each regional ECR
3. Update the task definition with the regional ECR URL
4. Register the task definition in each region

### Redis for Multi-Instance Sessions

To enable Redis for session state (multi-instance support):

1. Create an ElastiCache Redis cluster
2. Add the Redis URL as an environment variable or secret:
   ```json
   {
     "name": "REDIS_URL",
     "value": "redis://your-redis-endpoint:6379"
   }
   ```
3. Update security groups to allow ECS tasks to connect to Redis

## Monitoring

### CloudWatch Logs

View logs in CloudWatch:
```bash
aws logs tail /ecs/voiceter-backend --follow --region us-east-1
```

### CloudWatch Metrics

The application emits custom metrics to CloudWatch under the `Voiceter/Backend` namespace:
- ConcurrentSessions
- WebSocketConnections
- BedrockLatency
- DatabaseLatency
- AudioChunksProcessed
- ErrorRate

### Container Insights

Enable Container Insights for detailed metrics:
```bash
aws ecs update-cluster-settings \
  --cluster voiceter-cluster \
  --settings name=containerInsights,value=enabled \
  --region us-east-1
```

## Troubleshooting

### Task Fails to Start

1. Check CloudWatch Logs for startup errors
2. Verify IAM roles have correct permissions
3. Verify ECR image exists and is accessible
4. Check security group allows outbound traffic to AWS services

### Health Check Failures

1. Verify the `/health` endpoint is responding
2. Check application logs for errors
3. Increase `startPeriod` if the application takes longer to start
4. Verify port 8080 is exposed and listening

### High Memory Usage

1. Monitor memory metrics in CloudWatch
2. Check for memory leaks in application logs
3. Increase memory allocation if needed (2048 → 4096)
4. Review session cleanup logic

### Connection Issues

1. Verify security groups allow inbound traffic on port 8080
2. Check ALB target group health checks
3. Verify WebSocket connections are properly configured
4. Check for rate limiting or throttling

## Best Practices

1. **Use Secrets Manager**: Store sensitive configuration in AWS Secrets Manager
2. **Enable Container Insights**: Get detailed metrics and logs
3. **Set Up Alarms**: Create CloudWatch alarms for critical metrics
4. **Use Blue/Green Deployment**: Minimize downtime during updates
5. **Monitor Costs**: Track ECS Fargate costs and optimize resource allocation
6. **Regular Updates**: Keep the base image and dependencies up to date
7. **Test Locally**: Use Docker Compose to test the task definition locally
8. **Version Control**: Tag task definition revisions for easy rollback

## Related Documentation

- [IAM Roles](../iam/README.md)
- [Auto-Scaling Configuration](../ecs/auto-scaling.json)
- [CloudWatch Alarms](../cloudwatch/alarms.json)
- [Deployment Scripts](../../scripts/deploy.sh)
