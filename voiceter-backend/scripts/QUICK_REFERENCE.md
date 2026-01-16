# Deployment Scripts - Quick Reference

## Quick Commands

### Build Only
```bash
# Build locally
./scripts/build.sh

# Build and push to ECR
./scripts/build.sh --push

# Build with version tag
./scripts/build.sh --tag v1.2.3 --push
```

### Deploy
```bash
# Standard deployment (build + deploy)
./scripts/deploy.sh

# Deploy with version
./scripts/deploy.sh --tag v1.2.3

# Deploy existing image (skip build)
./scripts/deploy.sh --skip-build --tag v1.2.3

# Blue-green deployment
./scripts/deploy.sh --deployment-type blue-green
```

### Rollback
```bash
# Rollback to previous version
./scripts/rollback.sh --force

# Rollback to specific revision
./scripts/rollback.sh --target-revision 42 --force

# Rollback 2 versions back
./scripts/rollback.sh --steps 2 --force
```

### Blue-Green
```bash
# Blue-green deployment
./scripts/blue-green-deploy.sh

# With specific task definition
./scripts/blue-green-deploy.sh --task-def-arn <arn>
```

## Common Scenarios

### Scenario 1: Standard Release
```bash
# 1. Build and deploy
./scripts/deploy.sh --tag v1.2.3 --build-number 42

# 2. Verify health
curl http://your-alb-dns/health

# 3. Monitor logs
aws logs tail /ecs/voiceter-backend --follow
```

### Scenario 2: Hotfix
```bash
# 1. Build and push
./scripts/build.sh --tag v1.2.4-hotfix --push

# 2. Deploy immediately
./scripts/deploy.sh --skip-tests --tag v1.2.4-hotfix
```

### Scenario 3: Emergency Rollback
```bash
# 1. Rollback immediately
./scripts/rollback.sh --force

# 2. Verify service
aws ecs describe-services \
  --cluster voiceter-cluster \
  --services voiceter-backend
```

### Scenario 4: Major Release (Blue-Green)
```bash
# 1. Build and push
./scripts/build.sh --tag v2.0.0 --push

# 2. Blue-green deployment
./scripts/deploy.sh --tag v2.0.0 --deployment-type blue-green

# 3. Monitor for 1 hour
# 4. If issues, rollback is automatic
```

## Environment Setup

### One-Time Setup
```bash
# Set AWS credentials
aws configure

# Set default region
export AWS_REGION=us-east-1

# Verify access
aws sts get-caller-identity
```

### Per-Deployment Setup
```bash
# Set version
export IMAGE_TAG=v1.2.3

# Set build number (optional)
export BUILD_NUMBER=42

# Set deployment type (optional)
export DEPLOYMENT_TYPE=rolling
```

## Troubleshooting

### Build Fails
```bash
# Check Docker
docker info

# Check AWS credentials
aws sts get-caller-identity

# Build with no cache
./scripts/build.sh --no-cache --push
```

### Deploy Fails
```bash
# Check service status
aws ecs describe-services \
  --cluster voiceter-cluster \
  --services voiceter-backend

# Check task logs
aws logs tail /ecs/voiceter-backend --follow

# Rollback
./scripts/rollback.sh --force
```

### Service Unhealthy
```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn <arn>

# Check task status
aws ecs list-tasks \
  --cluster voiceter-cluster \
  --service-name voiceter-backend

# Describe task
aws ecs describe-tasks \
  --cluster voiceter-cluster \
  --tasks <task-arn>
```

## Monitoring

### Check Deployment Status
```bash
# Service status
aws ecs describe-services \
  --cluster voiceter-cluster \
  --services voiceter-backend \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Recent events
aws ecs describe-services \
  --cluster voiceter-cluster \
  --services voiceter-backend \
  --query 'services[0].events[0:5]'
```

### Check Logs
```bash
# Tail logs
aws logs tail /ecs/voiceter-backend --follow

# Filter errors
aws logs tail /ecs/voiceter-backend --filter-pattern "ERROR"

# Last 10 minutes
aws logs tail /ecs/voiceter-backend --since 10m
```

### Check Health
```bash
# Health endpoint
curl http://your-alb-dns/health

# With details
curl http://your-alb-dns/health | jq
```

## Script Options Summary

### build.sh
- `-t, --tag TAG` - Image tag
- `-b, --build-number NUM` - Build number
- `-p, --push` - Push to ECR
- `-n, --no-cache` - No cache build
- `--platform PLATFORM` - Target platform

### deploy.sh
- `-t, --tag TAG` - Image tag
- `-b, --build-number NUM` - Build number
- `-d, --deployment-type TYPE` - rolling or blue-green
- `--skip-build` - Skip build step
- `--skip-tests` - Skip tests
- `--no-wait` - Don't wait for stable

### rollback.sh
- `-t, --target-revision REV` - Target revision
- `-n, --steps NUM` - Rollback steps
- `-f, --force` - Force without confirm
- `--no-wait` - Don't wait for stable

### blue-green-deploy.sh
- `--task-def-arn ARN` - Task definition
- `--traffic-wait SEC` - Traffic shift wait
- `--no-rollback` - Disable auto rollback

## Best Practices

1. **Always tag releases:** Use semantic versioning
2. **Test in staging first:** Never deploy untested code
3. **Monitor after deployment:** Watch for 1 hour
4. **Keep rollback ready:** Know how to rollback
5. **Document changes:** Update changelog
6. **Use build numbers:** For traceability
7. **Blue-green for major releases:** Safer for big changes
8. **Rolling for minor updates:** Faster for small changes

## Support

- **Documentation:** See README.md for full details
- **Logs:** Check CloudWatch Logs `/ecs/voiceter-backend`
- **Status:** Check ECS console for service status
- **Help:** Run any script with `--help` flag

---

**Quick Reference Version:** 1.0  
**Last Updated:** December 16, 2025
