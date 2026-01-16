# IAM Roles and Policies for Voiceter Backend

This directory contains IAM role policies for the Voiceter Backend ECS tasks.

## Overview

Two IAM roles are required for ECS Fargate tasks:

1. **Task Role** (`voiceterBackendTaskRole`): Permissions for the application to access AWS services
2. **Task Execution Role** (`voiceterBackendTaskExecutionRole`): Permissions for ECS to manage the task

## Files

- `task-role.json` - Policy document for the task role (application permissions)
- `task-role-trust-policy.json` - Trust relationship for the task role
- `task-execution-role.json` - Policy document for the task execution role (ECS permissions)
- `task-execution-role-trust-policy.json` - Trust relationship for the task execution role

## Task Role Permissions

The task role (`task-role.json`) grants the application access to:

### Amazon Bedrock
- `bedrock:InvokeModel` - Invoke Nova 2 Sonic model
- `bedrock:InvokeModelWithResponseStream` - Stream responses from Nova 2 Sonic

**Resources**: 
- `arn:aws:bedrock:*:*:inference-profile/us.amazon.nova-2-sonic-v1:0`
- `arn:aws:bedrock:*:*:model/amazon.nova-2-sonic-v1:0`

### DynamoDB
- `dynamodb:PutItem` - Write session, response, and transcript records
- `dynamodb:GetItem` - Read session and response data
- `dynamodb:UpdateItem` - Update session state
- `dynamodb:DeleteItem` - Clean up expired sessions
- `dynamodb:Query` - Query sessions and responses
- `dynamodb:Scan` - Scan for cleanup operations
- `dynamodb:BatchWriteItem` - Batch write operations
- `dynamodb:BatchGetItem` - Batch read operations

**Resources**:
- `demo-sessions` table and indexes
- `demo-responses` table and indexes
- `demo-transcripts` table and indexes

### S3 (Optional)
- `s3:PutObject` - Upload audio recordings
- `s3:GetObject` - Retrieve audio recordings
- `s3:DeleteObject` - Delete expired recordings
- `s3:ListBucket` - List recordings

**Resources**:
- `voiceter-demo-recordings` bucket

### CloudWatch Logs
- `logs:CreateLogGroup` - Create log groups
- `logs:CreateLogStream` - Create log streams
- `logs:PutLogEvents` - Write log events
- `logs:DescribeLogStreams` - Describe log streams

**Resources**:
- `/ecs/voiceter-backend` log group

### CloudWatch Metrics
- `cloudwatch:PutMetricData` - Publish custom metrics

**Condition**: Only for `Voiceter/Backend` namespace

### AWS X-Ray (Optional)
- `xray:PutTraceSegments` - Send trace data
- `xray:PutTelemetryRecords` - Send telemetry data

## Task Execution Role Permissions

The task execution role (`task-execution-role.json`) grants ECS permissions to:

### ECR (Elastic Container Registry)
- `ecr:GetAuthorizationToken` - Authenticate to ECR
- `ecr:BatchCheckLayerAvailability` - Check image layers
- `ecr:GetDownloadUrlForLayer` - Download image layers
- `ecr:BatchGetImage` - Pull container images

### CloudWatch Logs
- `logs:CreateLogGroup` - Create log groups
- `logs:CreateLogStream` - Create log streams
- `logs:PutLogEvents` - Write container logs

### Secrets Manager (Optional)
- `secretsmanager:GetSecretValue` - Retrieve secrets

**Resources**: `voiceter/*` secrets

### Systems Manager Parameter Store (Optional)
- `ssm:GetParameters` - Retrieve parameters
- `ssm:GetParameter` - Retrieve single parameter

**Resources**: `voiceter/*` parameters

## Deployment Instructions

### Using AWS CLI

#### 1. Create Task Role

```bash
# Create the role
aws iam create-role \
  --role-name voiceterBackendTaskRole \
  --assume-role-policy-document file://task-role-trust-policy.json \
  --description "Task role for Voiceter Backend ECS tasks"

# Attach the policy
aws iam put-role-policy \
  --role-name voiceterBackendTaskRole \
  --policy-name voiceterBackendTaskPolicy \
  --policy-document file://task-role.json
```

#### 2. Create Task Execution Role

```bash
# Create the role
aws iam create-role \
  --role-name voiceterBackendTaskExecutionRole \
  --assume-role-policy-document file://task-execution-role-trust-policy.json \
  --description "Task execution role for Voiceter Backend ECS tasks"

# Attach the policy
aws iam put-role-policy \
  --role-name voiceterBackendTaskExecutionRole \
  --policy-name voiceterBackendTaskExecutionPolicy \
  --policy-document file://task-execution-role.json
```

#### 3. Get Role ARNs

```bash
# Get task role ARN
aws iam get-role --role-name voiceterBackendTaskRole --query 'Role.Arn' --output text

# Get task execution role ARN
aws iam get-role --role-name voiceterBackendTaskExecutionRole --query 'Role.Arn' --output text
```

#### 4. Update ECS Task Definition

Update the `infrastructure/ecs/task-definition.json` file with the role ARNs:

```json
{
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/voiceterBackendTaskRole",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/voiceterBackendTaskExecutionRole"
}
```

### Using AWS CDK

If using AWS CDK (in `infrastructure/cdk/`), create roles programmatically:

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';

// Task Role
const taskRole = new iam.Role(this, 'TaskRole', {
  assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
  description: 'Task role for Voiceter Backend ECS tasks',
});

const taskPolicy = JSON.parse(
  fs.readFileSync('infrastructure/iam/task-role.json', 'utf8')
);

taskRole.attachInlinePolicy(
  new iam.Policy(this, 'TaskPolicy', {
    document: iam.PolicyDocument.fromJson(taskPolicy),
  })
);

// Task Execution Role
const executionRole = new iam.Role(this, 'ExecutionRole', {
  assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
  description: 'Task execution role for Voiceter Backend ECS tasks',
});

const executionPolicy = JSON.parse(
  fs.readFileSync('infrastructure/iam/task-execution-role.json', 'utf8')
);

executionRole.attachInlinePolicy(
  new iam.Policy(this, 'ExecutionPolicy', {
    document: iam.PolicyDocument.fromJson(executionPolicy),
  })
);
```

### Using Terraform

```hcl
# Task Role
resource "aws_iam_role" "task_role" {
  name               = "voiceterBackendTaskRole"
  assume_role_policy = file("${path.module}/task-role-trust-policy.json")
  description        = "Task role for Voiceter Backend ECS tasks"
}

resource "aws_iam_role_policy" "task_policy" {
  name   = "voiceterBackendTaskPolicy"
  role   = aws_iam_role.task_role.id
  policy = file("${path.module}/task-role.json")
}

# Task Execution Role
resource "aws_iam_role" "execution_role" {
  name               = "voiceterBackendTaskExecutionRole"
  assume_role_policy = file("${path.module}/task-execution-role-trust-policy.json")
  description        = "Task execution role for Voiceter Backend ECS tasks"
}

resource "aws_iam_role_policy" "execution_policy" {
  name   = "voiceterBackendTaskExecutionPolicy"
  role   = aws_iam_role.execution_role.id
  policy = file("${path.module}/task-execution-role.json")
}

# Outputs
output "task_role_arn" {
  value = aws_iam_role.task_role.arn
}

output "execution_role_arn" {
  value = aws_iam_role.execution_role.arn
}
```

## Security Best Practices

### Least Privilege
- Policies follow the principle of least privilege
- Resources are scoped to specific tables, buckets, and log groups
- CloudWatch metrics are restricted to the `Voiceter/Backend` namespace

### Resource Restrictions
- DynamoDB: Limited to `demo-*` tables
- S3: Limited to `voiceter-demo-recordings` bucket
- CloudWatch Logs: Limited to `/ecs/voiceter-backend` log group
- Secrets Manager: Limited to `voiceter/*` secrets
- SSM Parameters: Limited to `voiceter/*` parameters

### Optional Permissions
Some permissions are optional and can be removed if not needed:

- **S3 Access**: Remove if not recording audio to S3
- **X-Ray Access**: Remove if not using distributed tracing
- **Secrets Manager/SSM**: Remove if using environment variables only

### Customization

To customize for your environment:

1. **Replace Account ID**: Update `ACCOUNT_ID` in ARNs
2. **Update Region**: Change region in ARNs if needed (or use `*` for all regions)
3. **Update Resource Names**: Modify table names, bucket names, etc. to match your naming convention
4. **Add/Remove Permissions**: Adjust based on your specific requirements

## Validation

After creating the roles, validate permissions:

```bash
# Validate task role policy
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT_ID:role/voiceterBackendTaskRole \
  --action-names bedrock:InvokeModel dynamodb:PutItem s3:PutObject \
  --resource-arns \
    "arn:aws:bedrock:us-east-1:ACCOUNT_ID:model/amazon.nova-2-sonic-v1:0" \
    "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/demo-sessions" \
    "arn:aws:s3:::voiceter-demo-recordings/test.wav"

# Validate execution role policy
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT_ID:role/voiceterBackendTaskExecutionRole \
  --action-names ecr:GetAuthorizationToken logs:CreateLogStream \
  --resource-arns "*"
```

## Troubleshooting

### Common Issues

1. **Access Denied to Bedrock**
   - Verify the model ARN is correct
   - Check if Bedrock is available in your region
   - Ensure the role has `bedrock:InvokeModel` permission

2. **Access Denied to DynamoDB**
   - Verify table names match the policy
   - Check if tables exist in the correct region
   - Ensure the role has required DynamoDB permissions

3. **Cannot Pull Container Image**
   - Verify execution role has ECR permissions
   - Check if ECR repository exists
   - Ensure image tag is correct

4. **Logs Not Appearing**
   - Verify log group exists or role can create it
   - Check execution role has CloudWatch Logs permissions
   - Ensure log configuration in task definition is correct

## References

- [ECS Task IAM Roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)
- [ECS Task Execution IAM Role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)
- [Amazon Bedrock Permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html)
- [DynamoDB IAM Policies](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/iam-policy-specific-table-indexes.html)
