# Deploy Auto-Scaling Configuration for Voiceter Backend ECS Service
# This script registers the scalable target and applies scaling policies

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir "auto-scaling.json"

# Check if AWS CLI is installed
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "Error: AWS CLI is not installed" -ForegroundColor Red
    exit 1
}

# Check if config file exists
if (-not (Test-Path $ConfigFile)) {
    Write-Host "Error: Configuration file not found: $ConfigFile" -ForegroundColor Red
    exit 1
}

# Get AWS account ID
Write-Host "Getting AWS account ID..." -ForegroundColor Yellow
$AccountId = aws sts get-caller-identity --query Account --output text
if (-not $AccountId) {
    Write-Host "Error: Failed to get AWS account ID" -ForegroundColor Red
    exit 1
}
Write-Host "Account ID: $AccountId" -ForegroundColor Green

# Get AWS region
$AwsRegion = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }
Write-Host "Region: $AwsRegion" -ForegroundColor Green

# Replace placeholders in config
Write-Host "Preparing configuration..." -ForegroundColor Yellow
$ConfigContent = (Get-Content $ConfigFile -Raw) -replace "ACCOUNT_ID", $AccountId -replace "REGION", $AwsRegion
$Config = $ConfigContent | ConvertFrom-Json

# Extract configuration values
$ServiceName = $Config.serviceName
$ClusterName = $Config.clusterName
$ResourceId = $Config.scalableTarget.resourceId
$MinCapacity = $Config.scalableTarget.minCapacity
$MaxCapacity = $Config.scalableTarget.maxCapacity

Write-Host "Service: $ServiceName" -ForegroundColor Green
Write-Host "Cluster: $ClusterName" -ForegroundColor Green
Write-Host "Min Capacity: $MinCapacity" -ForegroundColor Green
Write-Host "Max Capacity: $MaxCapacity" -ForegroundColor Green

# Check if service exists
Write-Host "Checking if ECS service exists..." -ForegroundColor Yellow
try {
    $ServiceCheck = aws ecs describe-services `
        --cluster $ClusterName `
        --services $ServiceName `
        --region $AwsRegion `
        --query 'services[0].serviceName' `
        --output text 2>$null
    
    if ($ServiceCheck -ne $ServiceName) {
        throw "Service not found"
    }
    Write-Host "Service exists" -ForegroundColor Green
}
catch {
    Write-Host "Error: ECS service '$ServiceName' not found in cluster '$ClusterName'" -ForegroundColor Red
    Write-Host "Please create the ECS service first before configuring auto-scaling" -ForegroundColor Yellow
    exit 1
}

# Register scalable target
Write-Host "Registering scalable target..." -ForegroundColor Yellow
try {
    aws application-autoscaling register-scalable-target `
        --service-namespace ecs `
        --resource-id $ResourceId `
        --scalable-dimension ecs:service:DesiredCount `
        --min-capacity $MinCapacity `
        --max-capacity $MaxCapacity `
        --region $AwsRegion
    
    Write-Host "✓ Scalable target registered successfully" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to register scalable target" -ForegroundColor Red
    exit 1
}

# Apply CPU-based scaling policy
Write-Host "Applying CPU-based scaling policy..." -ForegroundColor Yellow
$CpuPolicy = $Config.scalingPolicies[0]
$CpuPolicyName = $CpuPolicy.policyName
$CpuTarget = $CpuPolicy.targetTrackingScalingPolicyConfiguration.targetValue
$CpuScaleInCooldown = $CpuPolicy.targetTrackingScalingPolicyConfiguration.scaleInCooldown
$CpuScaleOutCooldown = $CpuPolicy.targetTrackingScalingPolicyConfiguration.scaleOutCooldown

$CpuPolicyConfig = @{
    TargetValue = $CpuTarget
    PredefinedMetricSpecification = @{
        PredefinedMetricType = "ECSServiceAverageCPUUtilization"
    }
    ScaleInCooldown = $CpuScaleInCooldown
    ScaleOutCooldown = $CpuScaleOutCooldown
} | ConvertTo-Json -Compress -Depth 10

try {
    aws application-autoscaling put-scaling-policy `
        --service-namespace ecs `
        --resource-id $ResourceId `
        --scalable-dimension ecs:service:DesiredCount `
        --policy-name $CpuPolicyName `
        --policy-type TargetTrackingScaling `
        --target-tracking-scaling-policy-configuration $CpuPolicyConfig `
        --region $AwsRegion
    
    Write-Host "✓ CPU scaling policy applied (target: $CpuTarget%)" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to apply CPU scaling policy" -ForegroundColor Red
    exit 1
}

# Apply Memory-based scaling policy
Write-Host "Applying Memory-based scaling policy..." -ForegroundColor Yellow
$MemoryPolicy = $Config.scalingPolicies[1]
$MemoryPolicyName = $MemoryPolicy.policyName
$MemoryTarget = $MemoryPolicy.targetTrackingScalingPolicyConfiguration.targetValue
$MemoryScaleInCooldown = $MemoryPolicy.targetTrackingScalingPolicyConfiguration.scaleInCooldown
$MemoryScaleOutCooldown = $MemoryPolicy.targetTrackingScalingPolicyConfiguration.scaleOutCooldown

$MemoryPolicyConfig = @{
    TargetValue = $MemoryTarget
    PredefinedMetricSpecification = @{
        PredefinedMetricType = "ECSServiceAverageMemoryUtilization"
    }
    ScaleInCooldown = $MemoryScaleInCooldown
    ScaleOutCooldown = $MemoryScaleOutCooldown
} | ConvertTo-Json -Compress -Depth 10

try {
    aws application-autoscaling put-scaling-policy `
        --service-namespace ecs `
        --resource-id $ResourceId `
        --scalable-dimension ecs:service:DesiredCount `
        --policy-name $MemoryPolicyName `
        --policy-type TargetTrackingScaling `
        --target-tracking-scaling-policy-configuration $MemoryPolicyConfig `
        --region $AwsRegion
    
    Write-Host "✓ Memory scaling policy applied (target: $MemoryTarget%)" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to apply Memory scaling policy" -ForegroundColor Red
    exit 1
}

# Verify configuration
Write-Host "Verifying auto-scaling configuration..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Scalable Target:" -ForegroundColor Green
aws application-autoscaling describe-scalable-targets `
    --service-namespace ecs `
    --resource-ids $ResourceId `
    --region $AwsRegion `
    --query 'ScalableTargets[0].[ResourceId,MinCapacity,MaxCapacity]' `
    --output table

Write-Host ""
Write-Host "Scaling Policies:" -ForegroundColor Green
aws application-autoscaling describe-scaling-policies `
    --service-namespace ecs `
    --resource-id $ResourceId `
    --region $AwsRegion `
    --query 'ScalingPolicies[].[PolicyName,PolicyType,TargetTrackingScalingPolicyConfiguration.TargetValue]' `
    --output table

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Auto-scaling configuration deployed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Configuration Summary:" -ForegroundColor Yellow
Write-Host "  Service: $ServiceName"
Write-Host "  Cluster: $ClusterName"
Write-Host "  Min Tasks: $MinCapacity"
Write-Host "  Max Tasks: $MaxCapacity"
Write-Host "  CPU Target: $CpuTarget%"
Write-Host "  Memory Target: $MemoryTarget%"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Monitor CloudWatch metrics for CPU and Memory utilization"
Write-Host "  2. Observe auto-scaling behavior under load"
Write-Host "  3. Adjust targets if needed based on performance"
Write-Host ""
