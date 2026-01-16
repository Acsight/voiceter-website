# Voiceter Backend - CloudWatch Alarms Deployment Script (PowerShell)
# This script deploys CloudWatch alarms for monitoring the Voiceter Backend system

param(
    [Parameter(Position=0)]
    [ValidateSet('deploy', 'list', 'test', 'delete', 'help')]
    [string]$Command = 'deploy',
    
    [Parameter(Position=1)]
    [string]$AlarmName = ''
)

# Configuration
$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }
$AccountId = $env:AWS_ACCOUNT_ID
$ClusterName = if ($env:ECS_CLUSTER_NAME) { $env:ECS_CLUSTER_NAME } else { 'voiceter-cluster' }
$ServiceName = if ($env:ECS_SERVICE_NAME) { $env:ECS_SERVICE_NAME } else { 'voiceter-backend-service' }
$SnsTopicName = 'voiceter-backend-alerts'
$AlertEmail = if ($env:ALERT_EMAIL) { $env:ALERT_EMAIL } else { 'alerts@voiceter.com' }

# Functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check AWS CLI
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        Write-Error "AWS CLI is not installed. Please install it first."
        exit 1
    }
    
    # Check AWS credentials
    try {
        $null = aws sts get-caller-identity 2>&1
    } catch {
        Write-Error "AWS credentials are not configured. Please configure them first."
        exit 1
    }
    
    # Get account ID if not provided
    if (-not $script:AccountId) {
        $script:AccountId = (aws sts get-caller-identity --query Account --output text)
        Write-Info "Detected AWS Account ID: $script:AccountId"
    }
    
    Write-Info "Prerequisites check passed!"
}

function New-SnsTopicIfNotExists {
    Write-Info "Creating SNS topic: $SnsTopicName"
    
    # Create SNS topic
    try {
        $script:SnsTopicArn = aws sns create-topic `
            --name $SnsTopicName `
            --region $Region `
            --query 'TopicArn' `
            --output text 2>&1
    } catch {
        $script:SnsTopicArn = aws sns list-topics `
            --region $Region `
            --query "Topics[?contains(TopicArn, '$SnsTopicName')].TopicArn" `
            --output text
    }
    
    Write-Info "SNS Topic ARN: $script:SnsTopicArn"
    
    # Subscribe email to topic
    Write-Info "Subscribing email: $AlertEmail"
    try {
        aws sns subscribe `
            --topic-arn $script:SnsTopicArn `
            --protocol email `
            --notification-endpoint $AlertEmail `
            --region $Region 2>&1 | Out-Null
    } catch {
        # Subscription might already exist
    }
    
    Write-Warn "Please check your email and confirm the SNS subscription!"
}

function Deploy-Alarm {
    param(
        [string]$AlarmName,
        [string]$AlarmDescription,
        [string]$MetricName,
        [string]$Namespace,
        [string]$Statistic,
        [int]$Period,
        [int]$EvaluationPeriods,
        [double]$Threshold,
        [string]$ComparisonOperator,
        [string]$Dimensions = '',
        [string]$ExtendedStatistic = ''
    )
    
    Write-Info "Deploying alarm: $AlarmName"
    
    $cmd = "aws cloudwatch put-metric-alarm " +
           "--alarm-name `"$AlarmName`" " +
           "--alarm-description `"$AlarmDescription`" " +
           "--metric-name `"$MetricName`" " +
           "--namespace `"$Namespace`" " +
           "--period $Period " +
           "--evaluation-periods $EvaluationPeriods " +
           "--threshold $Threshold " +
           "--comparison-operator $ComparisonOperator " +
           "--treat-missing-data notBreaching " +
           "--alarm-actions `"$script:SnsTopicArn`" " +
           "--ok-actions `"$script:SnsTopicArn`" " +
           "--region `"$Region`""
    
    if ($ExtendedStatistic) {
        $cmd += " --extended-statistic `"$ExtendedStatistic`""
    } else {
        $cmd += " --statistic `"$Statistic`""
    }
    
    if ($Dimensions) {
        $cmd += " --dimensions $Dimensions"
    }
    
    Invoke-Expression $cmd | Out-Null
    
    Write-Info "✓ Alarm deployed: $AlarmName"
}

function Deploy-AllAlarms {
    Write-Info "Deploying CloudWatch alarms..."
    
    # 1. High Error Rate Alarm (Critical)
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-high-error-rate' `
        -AlarmDescription 'Triggers when error rate exceeds 5% over 5 minutes' `
        -MetricName 'ErrorRate' `
        -Namespace 'Voiceter/Backend' `
        -Statistic 'Average' `
        -Period 300 `
        -EvaluationPeriods 1 `
        -Threshold 5.0 `
        -ComparisonOperator 'GreaterThanThreshold'
    
    # 2. High Latency Warning
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-high-latency-warning' `
        -AlarmDescription 'Triggers when P95 latency exceeds 500ms over 5 minutes' `
        -MetricName 'BedrockLatency' `
        -Namespace 'Voiceter/Backend' `
        -Period 300 `
        -EvaluationPeriods 2 `
        -Threshold 500.0 `
        -ComparisonOperator 'GreaterThanThreshold' `
        -ExtendedStatistic 'p95'
    
    # 3. High Latency Critical
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-high-latency-critical' `
        -AlarmDescription 'Triggers when P95 latency exceeds 1000ms over 5 minutes' `
        -MetricName 'BedrockLatency' `
        -Namespace 'Voiceter/Backend' `
        -Period 300 `
        -EvaluationPeriods 1 `
        -Threshold 1000.0 `
        -ComparisonOperator 'GreaterThanThreshold' `
        -ExtendedStatistic 'p95'
    
    # 4. High CPU
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-high-cpu' `
        -AlarmDescription 'Triggers when CPU utilization exceeds 80% over 5 minutes' `
        -MetricName 'CPUUtilization' `
        -Namespace 'AWS/ECS' `
        -Statistic 'Average' `
        -Period 300 `
        -EvaluationPeriods 2 `
        -Threshold 80.0 `
        -ComparisonOperator 'GreaterThanThreshold' `
        -Dimensions "Name=ServiceName,Value=$ServiceName Name=ClusterName,Value=$ClusterName"
    
    # 5. High Memory
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-high-memory' `
        -AlarmDescription 'Triggers when memory utilization exceeds 85% over 5 minutes' `
        -MetricName 'MemoryUtilization' `
        -Namespace 'AWS/ECS' `
        -Statistic 'Average' `
        -Period 300 `
        -EvaluationPeriods 2 `
        -Threshold 85.0 `
        -ComparisonOperator 'GreaterThanThreshold' `
        -Dimensions "Name=ServiceName,Value=$ServiceName Name=ClusterName,Value=$ClusterName"
    
    # 6. Database Latency High
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-database-latency-high' `
        -AlarmDescription 'Triggers when database latency exceeds 200ms over 5 minutes' `
        -MetricName 'DatabaseLatency' `
        -Namespace 'Voiceter/Backend' `
        -Period 300 `
        -EvaluationPeriods 2 `
        -Threshold 200.0 `
        -ComparisonOperator 'GreaterThanThreshold' `
        -ExtendedStatistic 'p95'
    
    # 7. Concurrent Sessions High
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-concurrent-sessions-high' `
        -AlarmDescription 'Triggers when concurrent sessions exceed 45 (90% of capacity)' `
        -MetricName 'ConcurrentSessions' `
        -Namespace 'Voiceter/Backend' `
        -Statistic 'Maximum' `
        -Period 60 `
        -EvaluationPeriods 3 `
        -Threshold 45.0 `
        -ComparisonOperator 'GreaterThanThreshold'
    
    # 8. WebSocket Connection Failures
    Deploy-Alarm `
        -AlarmName 'voiceter-backend-websocket-connection-failures' `
        -AlarmDescription 'Triggers when WebSocket connection error rate exceeds 10%' `
        -MetricName 'WebSocketConnectionErrors' `
        -Namespace 'Voiceter/Backend' `
        -Statistic 'Average' `
        -Period 300 `
        -EvaluationPeriods 1 `
        -Threshold 10.0 `
        -ComparisonOperator 'GreaterThanThreshold'
    
    Write-Info "All alarms deployed successfully!"
}

function Get-DeployedAlarms {
    Write-Info "Listing deployed alarms..."
    aws cloudwatch describe-alarms `
        --alarm-name-prefix 'voiceter-backend' `
        --region $Region `
        --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Threshold:Threshold}' `
        --output table
}

function Test-Alarm {
    param([string]$AlarmName)
    
    Write-Info "Testing alarm: $AlarmName"
    
    # Set alarm to ALARM state
    aws cloudwatch set-alarm-state `
        --alarm-name $AlarmName `
        --state-value ALARM `
        --state-reason 'Testing alarm notification' `
        --region $Region
    
    Write-Info "Alarm set to ALARM state. Check your email for notification."
    Write-Info "Waiting 10 seconds before resetting..."
    Start-Sleep -Seconds 10
    
    # Set alarm back to OK
    aws cloudwatch set-alarm-state `
        --alarm-name $AlarmName `
        --state-value OK `
        --state-reason 'Test complete' `
        --region $Region
    
    Write-Info "Alarm reset to OK state."
}

function Remove-AllAlarms {
    Write-Warn "Deleting all Voiceter Backend alarms..."
    
    $confirm = Read-Host "Are you sure you want to delete all alarms? (yes/no)"
    if ($confirm -ne 'yes') {
        Write-Info "Deletion cancelled."
        return
    }
    
    $alarmNames = aws cloudwatch describe-alarms `
        --alarm-name-prefix 'voiceter-backend' `
        --region $Region `
        --query 'MetricAlarms[].AlarmName' `
        --output text
    
    if (-not $alarmNames) {
        Write-Info "No alarms found to delete."
        return
    }
    
    aws cloudwatch delete-alarms `
        --alarm-names $alarmNames.Split() `
        --region $Region
    
    Write-Info "All alarms deleted successfully!"
}

function Show-Usage {
    @"
Usage: .\deploy-alarms.ps1 [COMMAND] [ALARM_NAME]

Commands:
    deploy      Deploy all CloudWatch alarms
    list        List all deployed alarms
    test        Test an alarm by triggering it (requires ALARM_NAME)
    delete      Delete all alarms
    help        Show this help message

Environment Variables:
    AWS_REGION              AWS region (default: us-east-1)
    AWS_ACCOUNT_ID          AWS account ID (auto-detected if not set)
    ECS_CLUSTER_NAME        ECS cluster name (default: voiceter-cluster)
    ECS_SERVICE_NAME        ECS service name (default: voiceter-backend-service)
    ALERT_EMAIL             Email for alarm notifications (default: alerts@voiceter.com)

Examples:
    # Deploy all alarms
    .\deploy-alarms.ps1 deploy

    # List deployed alarms
    .\deploy-alarms.ps1 list

    # Test an alarm
    .\deploy-alarms.ps1 test voiceter-backend-high-error-rate

    # Delete all alarms
    .\deploy-alarms.ps1 delete

"@
}

# Main script
switch ($Command) {
    'deploy' {
        Test-Prerequisites
        New-SnsTopicIfNotExists
        Deploy-AllAlarms
        Get-DeployedAlarms
        Write-Info "Deployment complete! Don't forget to confirm your SNS email subscription."
    }
    'list' {
        Test-Prerequisites
        Get-DeployedAlarms
    }
    'test' {
        Test-Prerequisites
        if (-not $AlarmName) {
            Write-Error "Please specify an alarm name to test."
            exit 1
        }
        Test-Alarm -AlarmName $AlarmName
    }
    'delete' {
        Test-Prerequisites
        Remove-AllAlarms
    }
    'help' {
        Show-Usage
    }
    default {
        Write-Error "Unknown command: $Command"
        Show-Usage
        exit 1
    }
}
