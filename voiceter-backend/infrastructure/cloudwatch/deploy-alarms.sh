#!/bin/bash

# Voiceter Backend - CloudWatch Alarms Deployment Script
# This script deploys CloudWatch alarms for monitoring the Voiceter Backend system

set -e

# Configuration
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID}"
CLUSTER_NAME="${ECS_CLUSTER_NAME:-voiceter-cluster}"
SERVICE_NAME="${ECS_SERVICE_NAME:-voiceter-backend-service}"
SNS_TOPIC_NAME="voiceter-backend-alerts"
ALERT_EMAIL="${ALERT_EMAIL:-alerts@voiceter.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials are not configured. Please configure them first."
        exit 1
    fi
    
    # Get account ID if not provided
    if [ -z "$ACCOUNT_ID" ]; then
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        log_info "Detected AWS Account ID: $ACCOUNT_ID"
    fi
    
    log_info "Prerequisites check passed!"
}

create_sns_topic() {
    log_info "Creating SNS topic: $SNS_TOPIC_NAME"
    
    # Create SNS topic
    SNS_TOPIC_ARN=$(aws sns create-topic \
        --name "$SNS_TOPIC_NAME" \
        --region "$REGION" \
        --query 'TopicArn' \
        --output text 2>/dev/null || \
        aws sns list-topics \
        --region "$REGION" \
        --query "Topics[?contains(TopicArn, '$SNS_TOPIC_NAME')].TopicArn" \
        --output text)
    
    log_info "SNS Topic ARN: $SNS_TOPIC_ARN"
    
    # Subscribe email to topic
    log_info "Subscribing email: $ALERT_EMAIL"
    aws sns subscribe \
        --topic-arn "$SNS_TOPIC_ARN" \
        --protocol email \
        --notification-endpoint "$ALERT_EMAIL" \
        --region "$REGION" &> /dev/null || true
    
    log_warn "Please check your email and confirm the SNS subscription!"
}

deploy_alarm() {
    local alarm_name=$1
    local alarm_description=$2
    local metric_name=$3
    local namespace=$4
    local statistic=$5
    local period=$6
    local evaluation_periods=$7
    local threshold=$8
    local comparison_operator=$9
    local dimensions="${10}"
    local extended_statistic="${11}"
    
    log_info "Deploying alarm: $alarm_name"
    
    local cmd="aws cloudwatch put-metric-alarm \
        --alarm-name \"$alarm_name\" \
        --alarm-description \"$alarm_description\" \
        --metric-name \"$metric_name\" \
        --namespace \"$namespace\" \
        --period $period \
        --evaluation-periods $evaluation_periods \
        --threshold $threshold \
        --comparison-operator $comparison_operator \
        --treat-missing-data notBreaching \
        --alarm-actions \"$SNS_TOPIC_ARN\" \
        --ok-actions \"$SNS_TOPIC_ARN\" \
        --region \"$REGION\""
    
    if [ -n "$extended_statistic" ]; then
        cmd="$cmd --extended-statistic \"$extended_statistic\""
    else
        cmd="$cmd --statistic \"$statistic\""
    fi
    
    if [ -n "$dimensions" ]; then
        cmd="$cmd --dimensions $dimensions"
    fi
    
    eval $cmd
    
    log_info "✓ Alarm deployed: $alarm_name"
}

deploy_alarms() {
    log_info "Deploying CloudWatch alarms..."
    
    # 1. High Error Rate Alarm (Critical)
    deploy_alarm \
        "voiceter-backend-high-error-rate" \
        "Triggers when error rate exceeds 5% over 5 minutes" \
        "ErrorRate" \
        "Voiceter/Backend" \
        "Average" \
        300 \
        1 \
        5.0 \
        "GreaterThanThreshold" \
        "" \
        ""
    
    # 2. High Latency Warning
    deploy_alarm \
        "voiceter-backend-high-latency-warning" \
        "Triggers when P95 latency exceeds 500ms over 5 minutes" \
        "BedrockLatency" \
        "Voiceter/Backend" \
        "" \
        300 \
        2 \
        500.0 \
        "GreaterThanThreshold" \
        "" \
        "p95"
    
    # 3. High Latency Critical
    deploy_alarm \
        "voiceter-backend-high-latency-critical" \
        "Triggers when P95 latency exceeds 1000ms over 5 minutes" \
        "BedrockLatency" \
        "Voiceter/Backend" \
        "" \
        300 \
        1 \
        1000.0 \
        "GreaterThanThreshold" \
        "" \
        "p95"
    
    # 4. High CPU
    deploy_alarm \
        "voiceter-backend-high-cpu" \
        "Triggers when CPU utilization exceeds 80% over 5 minutes" \
        "CPUUtilization" \
        "AWS/ECS" \
        "Average" \
        300 \
        2 \
        80.0 \
        "GreaterThanThreshold" \
        "Name=ServiceName,Value=$SERVICE_NAME Name=ClusterName,Value=$CLUSTER_NAME" \
        ""
    
    # 5. High Memory
    deploy_alarm \
        "voiceter-backend-high-memory" \
        "Triggers when memory utilization exceeds 85% over 5 minutes" \
        "MemoryUtilization" \
        "AWS/ECS" \
        "Average" \
        300 \
        2 \
        85.0 \
        "GreaterThanThreshold" \
        "Name=ServiceName,Value=$SERVICE_NAME Name=ClusterName,Value=$CLUSTER_NAME" \
        ""
    
    # 6. Database Latency High
    deploy_alarm \
        "voiceter-backend-database-latency-high" \
        "Triggers when database latency exceeds 200ms over 5 minutes" \
        "DatabaseLatency" \
        "Voiceter/Backend" \
        "" \
        300 \
        2 \
        200.0 \
        "GreaterThanThreshold" \
        "" \
        "p95"
    
    # 7. Concurrent Sessions High
    deploy_alarm \
        "voiceter-backend-concurrent-sessions-high" \
        "Triggers when concurrent sessions exceed 45 (90% of capacity)" \
        "ConcurrentSessions" \
        "Voiceter/Backend" \
        "Maximum" \
        60 \
        3 \
        45.0 \
        "GreaterThanThreshold" \
        "" \
        ""
    
    # 8. WebSocket Connection Failures
    deploy_alarm \
        "voiceter-backend-websocket-connection-failures" \
        "Triggers when WebSocket connection error rate exceeds 10%" \
        "WebSocketConnectionErrors" \
        "Voiceter/Backend" \
        "Average" \
        300 \
        1 \
        10.0 \
        "GreaterThanThreshold" \
        "" \
        ""
    
    log_info "All alarms deployed successfully!"
}

list_alarms() {
    log_info "Listing deployed alarms..."
    aws cloudwatch describe-alarms \
        --alarm-name-prefix "voiceter-backend" \
        --region "$REGION" \
        --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Threshold:Threshold}' \
        --output table
}

test_alarm() {
    local alarm_name=$1
    
    log_info "Testing alarm: $alarm_name"
    
    # Set alarm to ALARM state
    aws cloudwatch set-alarm-state \
        --alarm-name "$alarm_name" \
        --state-value ALARM \
        --state-reason "Testing alarm notification" \
        --region "$REGION"
    
    log_info "Alarm set to ALARM state. Check your email for notification."
    log_info "Waiting 10 seconds before resetting..."
    sleep 10
    
    # Set alarm back to OK
    aws cloudwatch set-alarm-state \
        --alarm-name "$alarm_name" \
        --state-value OK \
        --state-reason "Test complete" \
        --region "$REGION"
    
    log_info "Alarm reset to OK state."
}

delete_alarms() {
    log_warn "Deleting all Voiceter Backend alarms..."
    
    read -p "Are you sure you want to delete all alarms? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Deletion cancelled."
        return
    fi
    
    local alarm_names=$(aws cloudwatch describe-alarms \
        --alarm-name-prefix "voiceter-backend" \
        --region "$REGION" \
        --query 'MetricAlarms[].AlarmName' \
        --output text)
    
    if [ -z "$alarm_names" ]; then
        log_info "No alarms found to delete."
        return
    fi
    
    aws cloudwatch delete-alarms \
        --alarm-names $alarm_names \
        --region "$REGION"
    
    log_info "All alarms deleted successfully!"
}

show_usage() {
    cat << EOF
Usage: $0 [COMMAND]

Commands:
    deploy      Deploy all CloudWatch alarms
    list        List all deployed alarms
    test        Test an alarm by triggering it
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
    ./deploy-alarms.sh deploy

    # List deployed alarms
    ./deploy-alarms.sh list

    # Test an alarm
    ./deploy-alarms.sh test voiceter-backend-high-error-rate

    # Delete all alarms
    ./deploy-alarms.sh delete

EOF
}

# Main script
main() {
    local command=${1:-deploy}
    
    case $command in
        deploy)
            check_prerequisites
            create_sns_topic
            deploy_alarms
            list_alarms
            log_info "Deployment complete! Don't forget to confirm your SNS email subscription."
            ;;
        list)
            check_prerequisites
            list_alarms
            ;;
        test)
            check_prerequisites
            if [ -z "$2" ]; then
                log_error "Please specify an alarm name to test."
                exit 1
            fi
            test_alarm "$2"
            ;;
        delete)
            check_prerequisites
            delete_alarms
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
