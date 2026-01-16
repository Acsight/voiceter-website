#!/bin/bash

# Deploy Auto-Scaling Configuration for Voiceter Backend ECS Service
# This script registers the scalable target and applies scaling policies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/auto-scaling.json"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed${NC}"
    exit 1
fi

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
fi

# Get AWS account ID
echo -e "${YELLOW}Getting AWS account ID...${NC}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$ACCOUNT_ID" ]; then
    echo -e "${RED}Error: Failed to get AWS account ID${NC}"
    exit 1
fi
echo -e "${GREEN}Account ID: $ACCOUNT_ID${NC}"

# Get AWS region
AWS_REGION=${AWS_REGION:-us-east-1}
echo -e "${GREEN}Region: $AWS_REGION${NC}"

# Replace placeholders in config
echo -e "${YELLOW}Preparing configuration...${NC}"
CONFIG_CONTENT=$(cat "$CONFIG_FILE" | sed "s/ACCOUNT_ID/$ACCOUNT_ID/g" | sed "s/REGION/$AWS_REGION/g")

# Extract configuration values
SERVICE_NAME=$(echo "$CONFIG_CONTENT" | jq -r '.serviceName')
CLUSTER_NAME=$(echo "$CONFIG_CONTENT" | jq -r '.clusterName')
RESOURCE_ID=$(echo "$CONFIG_CONTENT" | jq -r '.scalableTarget.resourceId')
MIN_CAPACITY=$(echo "$CONFIG_CONTENT" | jq -r '.scalableTarget.minCapacity')
MAX_CAPACITY=$(echo "$CONFIG_CONTENT" | jq -r '.scalableTarget.maxCapacity')

echo -e "${GREEN}Service: $SERVICE_NAME${NC}"
echo -e "${GREEN}Cluster: $CLUSTER_NAME${NC}"
echo -e "${GREEN}Min Capacity: $MIN_CAPACITY${NC}"
echo -e "${GREEN}Max Capacity: $MAX_CAPACITY${NC}"

# Check if service exists
echo -e "${YELLOW}Checking if ECS service exists...${NC}"
if ! aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --region "$AWS_REGION" \
    --query 'services[0].serviceName' \
    --output text 2>/dev/null | grep -q "$SERVICE_NAME"; then
    echo -e "${RED}Error: ECS service '$SERVICE_NAME' not found in cluster '$CLUSTER_NAME'${NC}"
    echo -e "${YELLOW}Please create the ECS service first before configuring auto-scaling${NC}"
    exit 1
fi
echo -e "${GREEN}Service exists${NC}"

# Register scalable target
echo -e "${YELLOW}Registering scalable target...${NC}"
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id "$RESOURCE_ID" \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity "$MIN_CAPACITY" \
    --max-capacity "$MAX_CAPACITY" \
    --region "$AWS_REGION"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Scalable target registered successfully${NC}"
else
    echo -e "${RED}✗ Failed to register scalable target${NC}"
    exit 1
fi

# Apply CPU-based scaling policy
echo -e "${YELLOW}Applying CPU-based scaling policy...${NC}"
CPU_POLICY=$(echo "$CONFIG_CONTENT" | jq '.scalingPolicies[0]')
CPU_POLICY_NAME=$(echo "$CPU_POLICY" | jq -r '.policyName')
CPU_TARGET=$(echo "$CPU_POLICY" | jq -r '.targetTrackingScalingPolicyConfiguration.targetValue')
CPU_SCALE_IN_COOLDOWN=$(echo "$CPU_POLICY" | jq -r '.targetTrackingScalingPolicyConfiguration.scaleInCooldown')
CPU_SCALE_OUT_COOLDOWN=$(echo "$CPU_POLICY" | jq -r '.targetTrackingScalingPolicyConfiguration.scaleOutCooldown')

aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id "$RESOURCE_ID" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name "$CPU_POLICY_NAME" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration "{
        \"TargetValue\": $CPU_TARGET,
        \"PredefinedMetricSpecification\": {
            \"PredefinedMetricType\": \"ECSServiceAverageCPUUtilization\"
        },
        \"ScaleInCooldown\": $CPU_SCALE_IN_COOLDOWN,
        \"ScaleOutCooldown\": $CPU_SCALE_OUT_COOLDOWN
    }" \
    --region "$AWS_REGION"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ CPU scaling policy applied (target: ${CPU_TARGET}%)${NC}"
else
    echo -e "${RED}✗ Failed to apply CPU scaling policy${NC}"
    exit 1
fi

# Apply Memory-based scaling policy
echo -e "${YELLOW}Applying Memory-based scaling policy...${NC}"
MEMORY_POLICY=$(echo "$CONFIG_CONTENT" | jq '.scalingPolicies[1]')
MEMORY_POLICY_NAME=$(echo "$MEMORY_POLICY" | jq -r '.policyName')
MEMORY_TARGET=$(echo "$MEMORY_POLICY" | jq -r '.targetTrackingScalingPolicyConfiguration.targetValue')
MEMORY_SCALE_IN_COOLDOWN=$(echo "$MEMORY_POLICY" | jq -r '.targetTrackingScalingPolicyConfiguration.scaleInCooldown')
MEMORY_SCALE_OUT_COOLDOWN=$(echo "$MEMORY_POLICY" | jq -r '.targetTrackingScalingPolicyConfiguration.scaleOutCooldown')

aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id "$RESOURCE_ID" \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name "$MEMORY_POLICY_NAME" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration "{
        \"TargetValue\": $MEMORY_TARGET,
        \"PredefinedMetricSpecification\": {
            \"PredefinedMetricType\": \"ECSServiceAverageMemoryUtilization\"
        },
        \"ScaleInCooldown\": $MEMORY_SCALE_IN_COOLDOWN,
        \"ScaleOutCooldown\": $MEMORY_SCALE_OUT_COOLDOWN
    }" \
    --region "$AWS_REGION"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Memory scaling policy applied (target: ${MEMORY_TARGET}%)${NC}"
else
    echo -e "${RED}✗ Failed to apply Memory scaling policy${NC}"
    exit 1
fi

# Verify configuration
echo -e "${YELLOW}Verifying auto-scaling configuration...${NC}"
echo ""
echo -e "${GREEN}Scalable Target:${NC}"
aws application-autoscaling describe-scalable-targets \
    --service-namespace ecs \
    --resource-ids "$RESOURCE_ID" \
    --region "$AWS_REGION" \
    --query 'ScalableTargets[0].[ResourceId,MinCapacity,MaxCapacity]' \
    --output table

echo ""
echo -e "${GREEN}Scaling Policies:${NC}"
aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id "$RESOURCE_ID" \
    --region "$AWS_REGION" \
    --query 'ScalingPolicies[].[PolicyName,PolicyType,TargetTrackingScalingPolicyConfiguration.TargetValue]' \
    --output table

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Auto-scaling configuration deployed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Configuration Summary:${NC}"
echo -e "  Service: $SERVICE_NAME"
echo -e "  Cluster: $CLUSTER_NAME"
echo -e "  Min Tasks: $MIN_CAPACITY"
echo -e "  Max Tasks: $MAX_CAPACITY"
echo -e "  CPU Target: ${CPU_TARGET}%"
echo -e "  Memory Target: ${MEMORY_TARGET}%"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Monitor CloudWatch metrics for CPU and Memory utilization"
echo -e "  2. Observe auto-scaling behavior under load"
echo -e "  3. Adjust targets if needed based on performance"
echo ""
