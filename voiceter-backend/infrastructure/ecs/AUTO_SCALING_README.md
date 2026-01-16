# ECS Auto-Scaling Configuration

This directory contains the auto-scaling configuration for the Voiceter Backend ECS service.

## Overview

The auto-scaling configuration enables the ECS service to automatically adjust the number of running tasks based on CPU and memory utilization metrics. This ensures the service can handle varying load while maintaining performance and cost efficiency.

## Configuration

### Capacity Limits
- **Minimum Tasks**: 2 (for high availability)
- **Maximum Tasks**: 10 (for cost control)

### Scaling Policies

#### 1. CPU-Based Scaling
- **Target**: 70% CPU utilization
- **Scale-Out Cooldown**: 60 seconds (fast response to increased load)
- **Scale-In Cooldown**: 300 seconds (5 minutes, prevents flapping)

When average CPU utilization across all tasks exceeds 70%, the service will scale out by adding more tasks. When CPU drops below 70%, the service will scale in after the cooldown period.

#### 2. Memory-Based Scaling
- **Target**: 80% memory utilization
- **Scale-Out Cooldown**: 60 seconds (fast response to increased load)
- **Scale-In Cooldown**: 300 seconds (5 minutes, prevents flapping)

When average memory utilization across all tasks exceeds 80%, the service will scale out by adding more tasks. When memory drops below 80%, the service will scale in after the cooldown period.

## Files

- **auto-scaling.json**: Configuration file defining scalable target and scaling policies
- **deploy-auto-scaling.sh**: Bash script to deploy auto-scaling configuration (Linux/Mac)
- **deploy-auto-scaling.ps1**: PowerShell script to deploy auto-scaling configuration (Windows)

## Prerequisites

1. **AWS CLI**: Installed and configured with appropriate credentials
2. **ECS Service**: The target ECS service must exist before applying auto-scaling
3. **IAM Permissions**: The AWS credentials must have permissions to:
   - `application-autoscaling:RegisterScalableTarget`
   - `application-autoscaling:PutScalingPolicy`
   - `application-autoscaling:DescribeScalableTargets`
   - `application-autoscaling:DescribeScalingPolicies`
   - `ecs:DescribeServices`

## Deployment

### Linux/Mac

```bash
cd infrastructure/ecs
chmod +x deploy-auto-scaling.sh
./deploy-auto-scaling.sh
```

### Windows (PowerShell)

```powershell
cd infrastructure\ecs
.\deploy-auto-scaling.ps1
```

## Verification

After deployment, verify the configuration:

### Check Scalable Target

```bash
aws application-autoscaling describe-scalable-targets \
    --service-namespace ecs \
    --resource-ids "service/voiceter-backend-cluster/voiceter-backend-service" \
    --region us-east-1
```

### Check Scaling Policies

```bash
aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id "service/voiceter-backend-cluster/voiceter-backend-service" \
    --region us-east-1
```

### Monitor Scaling Activity

```bash
aws application-autoscaling describe-scaling-activities \
    --service-namespace ecs \
    --resource-id "service/voiceter-backend-cluster/voiceter-backend-service" \
    --region us-east-1
```

## Monitoring

### CloudWatch Metrics

Monitor the following metrics in CloudWatch:

1. **ECS Service Metrics**:
   - `CPUUtilization`: Average CPU usage across all tasks
   - `MemoryUtilization`: Average memory usage across all tasks
   - `DesiredTaskCount`: Target number of tasks
   - `RunningTaskCount`: Actual number of running tasks

2. **Application Auto Scaling Metrics**:
   - `TargetTracking-service/voiceter-backend-cluster/voiceter-backend-service-AlarmHigh-*`: Scale-out alarms
   - `TargetTracking-service/voiceter-backend-cluster/voiceter-backend-service-AlarmLow-*`: Scale-in alarms

### CloudWatch Alarms

Auto-scaling automatically creates CloudWatch alarms for target tracking:

- **High CPU/Memory Alarm**: Triggers scale-out when target is exceeded
- **Low CPU/Memory Alarm**: Triggers scale-in when target is not met

## Scaling Behavior

### Scale-Out Scenario

1. Load increases, CPU or memory utilization rises above target
2. CloudWatch alarm triggers after evaluation period
3. Auto-scaling adds tasks (up to max capacity)
4. New tasks start and begin handling traffic
5. Utilization decreases as load is distributed

### Scale-In Scenario

1. Load decreases, CPU and memory utilization drops below target
2. CloudWatch alarm triggers after evaluation period
3. Cooldown period (5 minutes) prevents premature scale-in
4. Auto-scaling removes tasks (down to min capacity)
5. Remaining tasks handle the reduced load

## Tuning Recommendations

### Adjust Target Utilization

If you observe:
- **Frequent scaling**: Increase cooldown periods or adjust targets
- **Poor performance**: Lower target utilization (e.g., 60% CPU, 70% memory)
- **Underutilization**: Raise target utilization (e.g., 80% CPU, 85% memory)

### Adjust Capacity Limits

If you observe:
- **Insufficient capacity**: Increase max capacity
- **Excessive costs**: Decrease max capacity or increase targets
- **Availability issues**: Increase min capacity

### Adjust Cooldown Periods

If you observe:
- **Scaling flapping**: Increase cooldown periods
- **Slow response**: Decrease scale-out cooldown (keep scale-in longer)

## Updating Configuration

To update the auto-scaling configuration:

1. Edit `auto-scaling.json` with new values
2. Run the deployment script again
3. Verify the changes with AWS CLI commands

The script will update existing policies rather than creating duplicates.

## Removing Auto-Scaling

To remove auto-scaling configuration:

```bash
# Delete scaling policies
aws application-autoscaling delete-scaling-policy \
    --service-namespace ecs \
    --resource-id "service/voiceter-backend-cluster/voiceter-backend-service" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name voiceter-backend-cpu-scaling-policy \
    --region us-east-1

aws application-autoscaling delete-scaling-policy \
    --service-namespace ecs \
    --resource-id "service/voiceter-backend-cluster/voiceter-backend-service" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name voiceter-backend-memory-scaling-policy \
    --region us-east-1

# Deregister scalable target
aws application-autoscaling deregister-scalable-target \
    --service-namespace ecs \
    --resource-id "service/voiceter-backend-cluster/voiceter-backend-service" \
    --scalable-dimension ecs:service:DesiredCount \
    --region us-east-1
```

## Troubleshooting

### Auto-Scaling Not Working

1. **Check IAM Permissions**: Ensure the service-linked role exists
2. **Check Service Status**: Ensure the ECS service is running
3. **Check CloudWatch Alarms**: Verify alarms are in OK state
4. **Check Metrics**: Ensure CPU/memory metrics are being reported

### Unexpected Scaling Behavior

1. **Review Scaling Activities**: Check recent scaling events
2. **Review CloudWatch Alarms**: Check alarm history
3. **Review Metrics**: Analyze CPU/memory trends
4. **Adjust Targets**: Fine-tune based on observed behavior

### Service Not Scaling Up

1. **Check Max Capacity**: Ensure not at maximum
2. **Check Cluster Capacity**: Ensure cluster has available resources
3. **Check Task Definition**: Ensure tasks can be scheduled
4. **Check Alarms**: Ensure scale-out alarms are triggering

### Service Not Scaling Down

1. **Check Min Capacity**: Ensure not at minimum
2. **Check Cooldown Period**: Wait for scale-in cooldown to expire
3. **Check Utilization**: Ensure metrics are below target
4. **Check Alarms**: Ensure scale-in alarms are triggering

## Best Practices

1. **Start Conservative**: Begin with higher targets and adjust down
2. **Monitor Closely**: Watch scaling behavior for first few days
3. **Set Appropriate Limits**: Balance availability and cost
4. **Use Longer Scale-In Cooldowns**: Prevent flapping
5. **Test Under Load**: Verify scaling works as expected
6. **Document Changes**: Keep track of configuration adjustments
7. **Review Regularly**: Adjust based on usage patterns

## Requirements Validation

This configuration satisfies the following requirements:

- **Requirement 11.4**: Min 2 tasks for high availability ✓
- **Requirement 11.5**: CPU-based scaling at 70% target ✓
- **Requirement 11.6**: Memory-based scaling at 80% target ✓

## Related Documentation

- [ECS Task Definition](./task-definition.json)
- [ECS Deployment Guide](./README.md)
- [CloudWatch Alarms](../cloudwatch/README.md)
- [AWS Application Auto Scaling Documentation](https://docs.aws.amazon.com/autoscaling/application/userguide/what-is-application-auto-scaling.html)
