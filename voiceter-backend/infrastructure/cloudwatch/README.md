# CloudWatch Alarms Configuration

This directory contains CloudWatch alarm configurations for monitoring the Voiceter Backend system.

## Overview

The `alarms.json` file defines comprehensive monitoring alarms that track:
- Error rates
- Latency metrics
- Resource utilization (CPU, Memory)
- Health check status
- Session capacity
- WebSocket connection health

## Alarm Definitions

### Critical Alarms

1. **voiceter-backend-high-error-rate**
   - Threshold: > 5% error rate
   - Period: 5 minutes
   - Action: Immediate notification
   - Severity: Critical

2. **voiceter-backend-high-latency-critical**
   - Threshold: > 1000ms (P95)
   - Period: 5 minutes
   - Action: Immediate notification
   - Severity: Critical

3. **voiceter-backend-health-check-failures**
   - Threshold: < 1 healthy host
   - Period: 2 minutes
   - Action: Immediate notification
   - Severity: Critical

### Warning Alarms

4. **voiceter-backend-high-latency-warning**
   - Threshold: > 500ms (P95)
   - Period: 10 minutes (2 evaluation periods)
   - Action: Notification
   - Severity: Warning

5. **voiceter-backend-high-cpu**
   - Threshold: > 80% CPU utilization
   - Period: 10 minutes (2 evaluation periods)
   - Action: Notification + Auto-scaling trigger
   - Severity: Warning

6. **voiceter-backend-high-memory**
   - Threshold: > 85% memory utilization
   - Period: 10 minutes (2 evaluation periods)
   - Action: Notification + Auto-scaling trigger
   - Severity: Warning

7. **voiceter-backend-database-latency-high**
   - Threshold: > 200ms (P95)
   - Period: 10 minutes (2 evaluation periods)
   - Action: Notification
   - Severity: Warning

8. **voiceter-backend-concurrent-sessions-high**
   - Threshold: > 45 concurrent sessions (90% of capacity)
   - Period: 3 minutes (3 evaluation periods)
   - Action: Notification
   - Severity: Warning

9. **voiceter-backend-websocket-connection-failures**
   - Threshold: > 10% connection error rate
   - Period: 5 minutes
   - Action: Notification
   - Severity: Warning

## Prerequisites

Before deploying alarms, ensure you have:

1. **AWS CLI** installed and configured
2. **IAM permissions** for CloudWatch and SNS
3. **SNS Topic** created for alerts (or use the provided configuration)
4. **ECS Service** deployed with the correct service and cluster names
5. **Application Load Balancer** configured with target groups

## Configuration

### Update Placeholders

Before deploying, replace the following placeholders in `alarms.json`:

- `REGION`: Your AWS region (e.g., `us-east-1`)
- `ACCOUNT_ID`: Your AWS account ID
- `POLICY_ID`: Auto-scaling policy ID (if using auto-scaling)
- `TARGET_GROUP_ID`: ALB target group ID
- `LOAD_BALANCER_ID`: ALB load balancer ID

### Update SNS Subscriptions

Update the SNS topic subscriptions in the `snsTopics` section:

```json
{
  "protocol": "email",
  "endpoint": "your-email@example.com"
}
```

## Deployment

### Option 1: Using AWS CLI (Manual)

#### Step 1: Create SNS Topic

```bash
# Create SNS topic
aws sns create-topic \
  --name voiceter-backend-alerts \
  --region us-east-1

# Subscribe to topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:voiceter-backend-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region us-east-1

# Confirm subscription via email
```

#### Step 2: Create Alarms

```bash
# Create each alarm using the AWS CLI
aws cloudwatch put-metric-alarm \
  --alarm-name voiceter-backend-high-error-rate \
  --alarm-description "Triggers when error rate exceeds 5% over 5 minutes" \
  --metric-name ErrorRate \
  --namespace Voiceter/Backend \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5.0 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:voiceter-backend-alerts \
  --ok-actions arn:aws:sns:us-east-1:ACCOUNT_ID:voiceter-backend-alerts \
  --region us-east-1

# Repeat for each alarm in alarms.json
```

### Option 2: Using Deployment Script

Create a deployment script `deploy-alarms.sh`:

```bash
#!/bin/bash

# Configuration
REGION="us-east-1"
ACCOUNT_ID="123456789012"
SNS_TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:voiceter-backend-alerts"

# Create SNS topic if it doesn't exist
aws sns create-topic \
  --name voiceter-backend-alerts \
  --region ${REGION} || true

# Deploy alarms
echo "Deploying CloudWatch alarms..."

# High Error Rate Alarm
aws cloudwatch put-metric-alarm \
  --alarm-name voiceter-backend-high-error-rate \
  --alarm-description "Triggers when error rate exceeds 5% over 5 minutes" \
  --metric-name ErrorRate \
  --namespace Voiceter/Backend \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5.0 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions ${SNS_TOPIC_ARN} \
  --ok-actions ${SNS_TOPIC_ARN} \
  --region ${REGION}

# Add remaining alarms...

echo "Alarms deployed successfully!"
```

### Option 3: Using AWS CDK

The alarms can also be deployed using AWS CDK. See `infrastructure/cdk/lib/cloudwatch-stack.ts` for the CDK implementation.

```bash
cd infrastructure/cdk
npm install
cdk deploy CloudWatchStack
```

### Option 4: Using PowerShell (Windows)

Create a deployment script `deploy-alarms.ps1`:

```powershell
# Configuration
$Region = "us-east-1"
$AccountId = "123456789012"
$SnsTopicArn = "arn:aws:sns:${Region}:${AccountId}:voiceter-backend-alerts"

# Create SNS topic if it doesn't exist
aws sns create-topic `
  --name voiceter-backend-alerts `
  --region $Region

# Deploy alarms
Write-Host "Deploying CloudWatch alarms..."

# High Error Rate Alarm
aws cloudwatch put-metric-alarm `
  --alarm-name voiceter-backend-high-error-rate `
  --alarm-description "Triggers when error rate exceeds 5% over 5 minutes" `
  --metric-name ErrorRate `
  --namespace Voiceter/Backend `
  --statistic Average `
  --period 300 `
  --evaluation-periods 1 `
  --threshold 5.0 `
  --comparison-operator GreaterThanThreshold `
  --treat-missing-data notBreaching `
  --alarm-actions $SnsTopicArn `
  --ok-actions $SnsTopicArn `
  --region $Region

# Add remaining alarms...

Write-Host "Alarms deployed successfully!"
```

## Monitoring

### View Alarm Status

```bash
# List all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix voiceter-backend \
  --region us-east-1

# View specific alarm
aws cloudwatch describe-alarms \
  --alarm-names voiceter-backend-high-error-rate \
  --region us-east-1

# View alarm history
aws cloudwatch describe-alarm-history \
  --alarm-name voiceter-backend-high-error-rate \
  --max-records 10 \
  --region us-east-1
```

### Test Alarms

```bash
# Set alarm state to ALARM for testing
aws cloudwatch set-alarm-state \
  --alarm-name voiceter-backend-high-error-rate \
  --state-value ALARM \
  --state-reason "Testing alarm notification" \
  --region us-east-1

# Set alarm state back to OK
aws cloudwatch set-alarm-state \
  --alarm-name voiceter-backend-high-error-rate \
  --state-value OK \
  --state-reason "Test complete" \
  --region us-east-1
```

## Alarm Actions

### Auto-Scaling Integration

The CPU and Memory alarms are configured to trigger auto-scaling policies:

- **High CPU**: Triggers scale-up policy when CPU > 80%
- **High Memory**: Triggers scale-up policy when Memory > 85%

Ensure auto-scaling policies are configured in your ECS service:

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/voiceter-cluster/voiceter-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10 \
  --region us-east-1

# Create CPU-based scaling policy
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/voiceter-cluster/voiceter-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scale-up \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://cpu-scaling-policy.json \
  --region us-east-1
```

## Troubleshooting

### Alarm Not Triggering

1. **Check metric data**: Ensure metrics are being published to CloudWatch
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace Voiceter/Backend \
     --metric-name ErrorRate \
     --start-time 2025-12-16T00:00:00Z \
     --end-time 2025-12-16T23:59:59Z \
     --period 300 \
     --statistics Average \
     --region us-east-1
   ```

2. **Verify alarm configuration**: Check threshold and comparison operator
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-names voiceter-backend-high-error-rate \
     --region us-east-1
   ```

3. **Check SNS topic**: Verify SNS topic exists and has subscriptions
   ```bash
   aws sns list-subscriptions-by-topic \
     --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:voiceter-backend-alerts \
     --region us-east-1
   ```

### Missing Metrics

If metrics are not appearing in CloudWatch:

1. **Check IAM permissions**: Ensure task role has `cloudwatch:PutMetricData` permission
2. **Verify namespace**: Ensure application is publishing to correct namespace (`Voiceter/Backend`)
3. **Check logs**: Review application logs for metric publishing errors

### False Positives

If alarms are triggering too frequently:

1. **Adjust threshold**: Increase threshold value
2. **Increase evaluation periods**: Require multiple consecutive breaches
3. **Change statistic**: Use different statistic (e.g., p99 instead of p95)

## Maintenance

### Update Alarms

To update an alarm, modify `alarms.json` and redeploy:

```bash
aws cloudwatch put-metric-alarm \
  --cli-input-json file://alarms.json \
  --region us-east-1
```

### Delete Alarms

```bash
# Delete specific alarm
aws cloudwatch delete-alarms \
  --alarm-names voiceter-backend-high-error-rate \
  --region us-east-1

# Delete all Voiceter alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix voiceter-backend \
  --query 'MetricAlarms[].AlarmName' \
  --output text \
  --region us-east-1 | \
  xargs aws cloudwatch delete-alarms \
    --alarm-names \
    --region us-east-1
```

## Best Practices

1. **Test alarms regularly**: Use `set-alarm-state` to test notification flow
2. **Review alarm history**: Analyze false positives and adjust thresholds
3. **Monitor alarm costs**: CloudWatch alarms have associated costs
4. **Use composite alarms**: Combine multiple alarms for complex conditions
5. **Document alarm responses**: Create runbooks for each alarm type
6. **Set up escalation**: Configure multiple notification channels (email, SMS, PagerDuty)

## Related Documentation

- [AWS CloudWatch Alarms Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [ECS Auto-Scaling Documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
- [SNS Documentation](https://docs.aws.amazon.com/sns/latest/dg/welcome.html)

## Support

For issues or questions:
- Check CloudWatch Logs: `/ecs/voiceter-backend`
- Review alarm history in CloudWatch console
- Contact DevOps team: devops@voiceter.com
