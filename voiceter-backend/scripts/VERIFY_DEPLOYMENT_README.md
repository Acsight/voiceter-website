# Deployment Verification Script

## Overview

The `verify-deployment.sh` script performs comprehensive verification of the Voiceter Backend deployment to ensure all components are healthy and functioning correctly.

## Features

### 8 Comprehensive Verification Checks

1. **ECS Cluster Verification**
   - Verifies cluster exists and is ACTIVE
   - Checks cluster status

2. **ECS Service Verification**
   - Verifies service exists and is ACTIVE
   - Checks running vs desired task count
   - Verifies deployment stability (single active deployment)

3. **ECS Task Health Verification**
   - Lists all tasks for the service
   - Checks task health status (HEALTHY)
   - Verifies task running status (RUNNING)

4. **Health Check Endpoint Verification**
   - Tests /health endpoint with configurable retries
   - Auto-detects ALB DNS if not provided
   - Validates HTTP 200 response
   - Shows response body in verbose mode

5. **CloudWatch Logs Verification**
   - Verifies log group exists
   - Checks for recent log streams
   - Lists recent log streams in verbose mode

6. **CloudWatch Metrics Verification**
   - Checks for custom metrics in Voiceter/Backend namespace
   - Lists available metrics in verbose mode

7. **CloudWatch Alarms Verification**
   - Lists all voiceter-backend alarms
   - Shows alarm states (OK, ALARM, INSUFFICIENT_DATA)
   - Warns if any alarms are in ALARM state

8. **Auto-Scaling Verification**
   - Verifies scalable target configuration
   - Shows min/max capacity
   - Lists scaling policies

## Usage

### Basic Usage

```bash
cd voiceter-backend/scripts
./verify-deployment.sh
```

### With Custom Parameters

```bash
# Specify region and cluster
./verify-deployment.sh --region us-west-2 --cluster my-cluster --service my-service

# With specific health check URL
./verify-deployment.sh --url http://my-alb.amazonaws.com/health

# With custom retry settings
./verify-deployment.sh --max-retries 20 --delay 5

# Verbose output
./verify-deployment.sh --verbose
```

### Environment Variables

```bash
# Set via environment variables
export AWS_REGION=us-east-1
export CLUSTER_NAME=voiceter-cluster
export SERVICE_NAME=voiceter-backend
export HEALTH_CHECK_URL=http://my-alb.amazonaws.com/health
export MAX_RETRIES=10
export RETRY_DELAY=10
export VERBOSE=true

./verify-deployment.sh
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --region` | AWS region | us-east-1 |
| `-c, --cluster` | ECS cluster name | voiceter-cluster |
| `-s, --service` | ECS service name | voiceter-backend |
| `-u, --url` | Health check URL | Auto-detected |
| `-m, --max-retries` | Maximum health check retries | 10 |
| `-d, --delay` | Delay between retries (seconds) | 10 |
| `-v, --verbose` | Verbose output | false |
| `-h, --help` | Display help message | - |

## Output

### Success Output

```
[INFO] Starting deployment verification
[INFO] Region: us-east-1
[INFO] Cluster: voiceter-cluster
[INFO] Service: voiceter-backend

[STEP] Checking prerequisites...
[INFO] All prerequisites met
[STEP] Verifying ECS cluster...
[PASS] ECS cluster 'voiceter-cluster' is ACTIVE
[STEP] Verifying ECS service...
[PASS] ECS service 'voiceter-backend' is ACTIVE
[PASS] All desired tasks are running (2/2)
[PASS] Service has stable deployment (1 active deployment)
[STEP] Verifying ECS tasks...
[INFO] Found 2 task(s)
[PASS] All tasks are healthy (2/2)
[PASS] All tasks are running (2/2)
[STEP] Verifying health check endpoint...
[INFO] Health check URL: http://my-alb.amazonaws.com/health
[PASS] Health check endpoint is responding (HTTP 200)
[STEP] Verifying CloudWatch logs...
[PASS] CloudWatch log group exists: /ecs/voiceter-backend
[PASS] Recent log streams found
[STEP] Verifying CloudWatch metrics...
[PASS] CloudWatch metrics found in namespace 'Voiceter/Backend' (7 metrics)
[STEP] Verifying CloudWatch alarms...
[PASS] CloudWatch alarms found (9 alarms)
[STEP] Verifying auto-scaling configuration...
[PASS] Auto-scaling configured (min: 2, max: 10)
[PASS] Scaling policies configured (2 policies)

==========================================
Deployment Verification Summary
==========================================
Region: us-east-1
Cluster: voiceter-cluster
Service: voiceter-backend

Tests Passed: 15
Tests Failed: 0
Total Tests: 15

✓ All verification checks passed!
==========================================
```

### Failure Output

```
[STEP] Verifying ECS service...
[FAIL] Not all tasks are running (1/2)

[STEP] Verifying health check endpoint...
[FAIL] Health check endpoint failed after 10 attempts

==========================================
Deployment Verification Summary
==========================================
Region: us-east-1
Cluster: voiceter-cluster
Service: voiceter-backend

Tests Passed: 10
Tests Failed: 2
Total Tests: 12

✗ Some verification checks failed
==========================================
```

## Exit Codes

- **0**: All verification checks passed
- **1**: One or more verification checks failed

## Prerequisites

### Required Tools

- **AWS CLI**: For AWS API calls
- **curl**: For health check endpoint testing
- **bash**: Shell interpreter

### Optional Tools

- **jq**: For JSON parsing (provides more detailed output)

### Installation

```bash
# Install AWS CLI
# See: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

# Install jq (optional but recommended)
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq

# Windows (via Chocolatey)
choco install jq
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Verify Deployment
  run: |
    cd voiceter-backend/scripts
    ./verify-deployment.sh --region us-east-1 --cluster voiceter-cluster --service voiceter-backend
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Jenkins Example

```groovy
stage('Verify Deployment') {
    steps {
        sh '''
            cd voiceter-backend/scripts
            ./verify-deployment.sh --region us-east-1 --cluster voiceter-cluster --service voiceter-backend
        '''
    }
}
```

## Troubleshooting

### Health Check Fails

**Problem**: Health check endpoint returns non-200 status

**Solutions**:
1. Check if ALB is properly configured
2. Verify security groups allow traffic
3. Check if tasks are actually healthy in ECS console
4. Review application logs for errors
5. Increase retry count: `--max-retries 20`

### Tasks Not Healthy

**Problem**: Tasks show as UNHEALTHY

**Solutions**:
1. Check task logs in CloudWatch
2. Verify health check configuration in task definition
3. Ensure application starts within health check start period
4. Check if application is listening on correct port

### Auto-Scaling Not Configured

**Problem**: Auto-scaling verification shows warning

**Solutions**:
1. Run auto-scaling deployment script:
   ```bash
   cd infrastructure/ecs
   ./deploy-auto-scaling.sh --region us-east-1
   ```
2. Verify IAM permissions for Application Auto Scaling

### No CloudWatch Metrics

**Problem**: No metrics found in Voiceter/Backend namespace

**Solutions**:
1. Wait a few minutes - metrics may not be available immediately
2. Verify application is emitting metrics
3. Check IAM permissions for CloudWatch PutMetricData
4. Review application logs for metric emission errors

## Best Practices

1. **Run After Every Deployment**: Always verify deployment after updates
2. **Use Verbose Mode for Debugging**: Add `-v` flag when troubleshooting
3. **Integrate with CI/CD**: Automate verification in deployment pipeline
4. **Monitor Exit Codes**: Use exit codes to fail CI/CD pipeline on errors
5. **Set Appropriate Timeouts**: Adjust retry count and delay based on environment
6. **Check Alarms**: Pay attention to alarm states in output

## Related Scripts

- `build.sh` - Build and push Docker image
- `deploy.sh` - Deploy to ECS
- `rollback.sh` - Rollback to previous version (to be created)

## Support

For issues or questions:
1. Check CloudWatch logs: `/ecs/voiceter-backend`
2. Review ECS service events in AWS Console
3. Check task definition configuration
4. Verify IAM permissions

---

**Last Updated**: December 16, 2025  
**Version**: 1.0  
**Status**: Production Ready
