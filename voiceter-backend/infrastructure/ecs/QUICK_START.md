
# ECS Task Definition - Quick Start

## Prerequisites
- AWS CLI configured
- Docker installed
- ECR repository created
- IAM roles created
- ECS cluster created

## Quick Deploy

### 1. Build & Push Image
```bash
cd voiceter-backend
npm run build
docker build -t voiceter-backend:latest .
docker tag voiceter-backend:latest ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/voiceter-backend:latest
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com
docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/voiceter-backend:latest
```

### 2. Deploy Task Definition
```bash
cd infrastructure/ecs
./deploy-task-definition.sh --update-service
```

### 3. Verify
```bash
aws ecs describe-services --cluster voiceter-cluster --services voiceter-backend --region us-east-1
aws logs tail /ecs/voiceter-backend --follow --region us-east-1
```

## Common Commands

**Rollback**: `aws ecs update-service --cluster voiceter-cluster --service voiceter-backend --task-definition voiceter-backend:PREV_REV --region us-east-1`

**Scale**: `aws ecs update-service --cluster voiceter-cluster --service voiceter-backend --desired-count 4 --region us-east-1`

**Logs**: `aws logs tail /ecs/voiceter-backend --since 10m --region us-east-1`

See README.md for detailed documentation.
