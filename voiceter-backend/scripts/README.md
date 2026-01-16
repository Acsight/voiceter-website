# Deployment Scripts

This directory contains deployment scripts for the Voiceter Backend application.

## Scripts Overview

### 1. build.sh
Builds the Docker image and optionally pushes it to Amazon ECR.

**Features:**
- Compiles TypeScript code
- Builds Docker image with proper tagging
- Supports build numbers for versioning
- Pushes to ECR with automatic repository creation
- Supports multi-platform builds
- No-cache option for clean builds

**Usage:**
```bash
# Build image locally
./scripts/build.sh

# Build and push to ECR
./scripts/build.sh --push

# Build with specific tag
./scripts/build.sh --tag v1.2.3 --push

# Build with build number
./scripts/build.sh --build-number 42 --push

# Build without cache
./scripts/build.sh --no-cache --push

# Build for specific platform
./scripts/build.sh --platform linux/arm64 --push
```

**Options:**
- `-r, --region REGION` - AWS region (default: us-east-1)
- `-t, --tag TAG` - Docker image tag (default: latest)
- `-b, --build-number NUMBER` - Build number to append to tag
- `-p, --push` - Push image to ECR after building
- `-n, --no-cache` - Build without using cache
- `--platform PLATFORM` - Target platform (default: linux/amd64)
- `-h, --help` - Display help message

**Environment Variables:**
- `AWS_REGION` - AWS region
- `IMAGE_TAG` - Docker image tag
- `ECR_REPOSITORY` - ECR repository name (default: voiceter-backend)
- `PUSH_TO_ECR` - Push to ECR (true/false)
- `NO_CACHE` - Build without cache (true/false)

---

### 2. deploy.sh
Performs complete deployment including build, push, and ECS service update.

**Features:**
- Runs tests before deployment
- Builds and pushes Docker image
- Registers new ECS task definition
- Updates ECS service
- Supports rolling and blue-green deployments
- Waits for service stabilization
- Health check verification

**Usage:**
```bash
# Standard deployment
./scripts/deploy.sh

# Deploy with specific tag
./scripts/deploy.sh --tag v1.2.3

# Deploy with build number
./scripts/deploy.sh --build-number 42

# Blue-green deployment
./scripts/deploy.sh --deployment-type blue-green

# Skip build (use existing image)
./scripts/deploy.sh --skip-build --tag v1.2.3

# Skip tests
./scripts/deploy.sh --skip-tests

# Deploy without waiting
./scripts/deploy.sh --no-wait

# Deploy to different region
./scripts/deploy.sh --region us-west-2
```

**Options:**
- `-r, --region REGION` - AWS region (default: us-east-1)
- `-t, --tag TAG` - Docker image tag (default: latest)
- `-b, --build-number NUMBER` - Build number to append to tag
- `-c, --cluster CLUSTER` - ECS cluster name (default: voiceter-cluster)
- `-s, --service SERVICE` - ECS service name (default: voiceter-backend)
- `-d, --deployment-type TYPE` - Deployment type: rolling or blue-green (default: rolling)
- `--skip-build` - Skip Docker build step
- `--skip-tests` - Skip test execution
- `--no-wait` - Don't wait for service to stabilize
- `--health-check-url URL` - Health check URL for verification
- `-h, --help` - Display help message

**Environment Variables:**
- `AWS_REGION` - AWS region
- `IMAGE_TAG` - Docker image tag
- `CLUSTER_NAME` - ECS cluster name
- `SERVICE_NAME` - ECS service name
- `DEPLOYMENT_TYPE` - Deployment type (rolling/blue-green)

---

### 3. rollback.sh
Emergency rollback to a previous task definition revision.

**Features:**
- Lists recent task definitions
- Rolls back to previous or specific revision
- Supports multi-step rollback
- Confirmation prompt (can be forced)
- Waits for service stabilization
- Verifies rollback success

**Usage:**
```bash
# Rollback to previous revision
./scripts/rollback.sh

# Rollback to specific revision
./scripts/rollback.sh --target-revision 42

# Rollback 2 revisions back
./scripts/rollback.sh --steps 2

# Force rollback without confirmation
./scripts/rollback.sh --force

# Rollback without waiting
./scripts/rollback.sh --no-wait

# Rollback in different region
./scripts/rollback.sh --region us-west-2
```

**Options:**
- `-r, --region REGION` - AWS region (default: us-east-1)
- `-c, --cluster CLUSTER` - ECS cluster name (default: voiceter-cluster)
- `-s, --service SERVICE` - ECS service name (default: voiceter-backend)
- `-t, --target-revision REV` - Target task definition revision
- `-n, --steps NUMBER` - Number of revisions to rollback (default: 1)
- `-f, --force` - Force rollback without confirmation
- `--no-wait` - Don't wait for service to stabilize
- `-h, --help` - Display help message

**Environment Variables:**
- `AWS_REGION` - AWS region
- `CLUSTER_NAME` - ECS cluster name
- `SERVICE_NAME` - ECS service name

---

### 4. blue-green-deploy.sh
Advanced blue-green deployment using ECS and ALB target groups.

**Features:**
- Deploys to inactive environment
- Runs health checks before traffic shift
- Shifts traffic using ALB listener rules
- Verifies deployment success
- Automatic rollback on failure
- Keeps old environment for manual rollback

**Usage:**
```bash
# Deploy with automatic detection
./scripts/blue-green-deploy.sh

# Deploy specific task definition
./scripts/blue-green-deploy.sh --task-def-arn arn:aws:ecs:us-east-1:123456789012:task-definition/voiceter-backend:42

# Custom traffic shift wait time
./scripts/blue-green-deploy.sh --traffic-wait 600

# Disable automatic rollback
./scripts/blue-green-deploy.sh --no-rollback
```

**Options:**
- `-r, --region REGION` - AWS region (default: us-east-1)
- `-c, --cluster CLUSTER` - ECS cluster name (default: voiceter-cluster)
- `--blue-service SERVICE` - Blue service name (default: voiceter-backend-blue)
- `--green-service SERVICE` - Green service name (default: voiceter-backend-green)
- `--alb-name NAME` - ALB name (default: voiceter-alb)
- `--task-def-arn ARN` - Task definition ARN to deploy
- `--traffic-wait SECONDS` - Wait time for traffic shift (default: 300)
- `--no-rollback` - Don't rollback on failure
- `-h, --help` - Display help message

**Environment Variables:**
- `AWS_REGION` - AWS region
- `CLUSTER_NAME` - ECS cluster name

---

## Deployment Workflows

### Standard Rolling Deployment
```bash
# 1. Build and push image
./scripts/build.sh --tag v1.2.3 --push

# 2. Deploy to ECS
./scripts/deploy.sh --tag v1.2.3
```

### Complete Deployment (Build + Deploy)
```bash
# Single command for complete deployment
./scripts/deploy.sh --tag v1.2.3 --build-number 42
```

### Blue-Green Deployment
```bash
# 1. Build and push image
./scripts/build.sh --tag v1.2.3 --push

# 2. Deploy using blue-green strategy
./scripts/deploy.sh --tag v1.2.3 --deployment-type blue-green
```

### Emergency Rollback
```bash
# Rollback to previous version
./scripts/rollback.sh --force
```

### CI/CD Pipeline Example
```bash
#!/bin/bash
set -e

# Get version from git tag
VERSION=$(git describe --tags --always)
BUILD_NUMBER=${CI_BUILD_NUMBER:-0}

# Run deployment
./scripts/deploy.sh \
  --tag "$VERSION" \
  --build-number "$BUILD_NUMBER" \
  --region us-east-1

# Verify deployment
curl -f http://your-alb-dns/health || {
  echo "Health check failed, rolling back..."
  ./scripts/rollback.sh --force
  exit 1
}
```

---

## Prerequisites

### Required Tools
- **Docker** - For building container images
- **AWS CLI** - For AWS operations (v2 recommended)
- **jq** - For JSON parsing
- **curl** - For health checks

### AWS Permissions
The IAM user/role running these scripts needs the following permissions:
- `ecr:*` - ECR operations
- `ecs:*` - ECS operations
- `elbv2:*` - ALB operations (for blue-green)
- `iam:PassRole` - For task execution role
- `logs:*` - CloudWatch Logs access
- `sts:GetCallerIdentity` - Get account ID

### AWS Resources
These scripts assume the following resources exist:
- ECS Cluster (default: voiceter-cluster)
- ECS Service (default: voiceter-backend)
- ECR Repository (created automatically if missing)
- IAM Roles:
  - voiceter-backend-execution-role
  - voiceter-backend-task-role
- For blue-green:
  - Application Load Balancer
  - Two target groups (blue and green)
  - Two ECS services (blue and green)

---

## Configuration

### Environment Variables
Create a `.env` file in the project root or export these variables:

```bash
# AWS Configuration
export AWS_REGION=us-east-1
export AWS_PROFILE=default

# Image Configuration
export ECR_REPOSITORY=voiceter-backend
export IMAGE_TAG=latest

# ECS Configuration
export CLUSTER_NAME=voiceter-cluster
export SERVICE_NAME=voiceter-backend

# Deployment Configuration
export DEPLOYMENT_TYPE=rolling
```

### Script Configuration
Edit the default values at the top of each script to match your environment.

---

## Troubleshooting

### Build Failures
```bash
# Check Docker daemon
docker info

# Check AWS credentials
aws sts get-caller-identity

# Build with verbose output
./scripts/build.sh --no-cache --push
```

### Deployment Failures
```bash
# Check ECS service events
aws ecs describe-services \
  --cluster voiceter-cluster \
  --services voiceter-backend \
  --query 'services[0].events[0:5]'

# Check task logs
aws logs tail /ecs/voiceter-backend --follow

# Check task definition
aws ecs describe-task-definition \
  --task-definition voiceter-backend
```

### Rollback Issues
```bash
# List available revisions
aws ecs list-task-definitions \
  --family-prefix voiceter-backend \
  --sort DESC

# Force rollback to specific revision
./scripts/rollback.sh --target-revision 42 --force
```

### Blue-Green Issues
```bash
# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>

# Check ALB listener rules
aws elbv2 describe-rules \
  --listener-arn <listener-arn>

# Manual traffic shift
aws elbv2 modify-rule \
  --rule-arn <rule-arn> \
  --actions Type=forward,TargetGroupArn=<target-group-arn>
```

---

## Best Practices

### Version Tagging
- Use semantic versioning (v1.2.3)
- Include build numbers for traceability
- Tag production releases with `prod-` prefix
- Use `latest` only for development

### Deployment Strategy
- Use rolling deployment for minor updates
- Use blue-green for major releases
- Always run tests before deployment
- Monitor for 1 hour after deployment
- Keep previous version for 24 hours

### Rollback Strategy
- Document rollback procedures
- Test rollback in staging first
- Have rollback plan before deployment
- Monitor metrics after rollback

### Security
- Never commit AWS credentials
- Use IAM roles for ECS tasks
- Rotate credentials regularly
- Enable ECR image scanning
- Use least privilege IAM policies

---

## Support

For issues or questions:
1. Check CloudWatch Logs: `/ecs/voiceter-backend`
2. Check ECS service events
3. Review task definition configuration
4. Contact DevOps team

---

## License

MIT License - See LICENSE file for details
