#!/bin/bash

# Blue-Green Deployment Script for Voiceter Backend
# This script manages blue-green deployments using ECS and ALB target groups

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER_NAME="${CLUSTER_NAME:-voiceter-cluster}"
SERVICE_NAME="${SERVICE_NAME:-voiceter-backend}"
BLUE_SERVICE="${BLUE_SERVICE:-voiceter-backend-blue}"
GREEN_SERVICE="${GREEN_SERVICE:-voiceter-backend-green}"
ALB_NAME="${ALB_NAME:-voiceter-alb}"
BLUE_TG_NAME="${BLUE_TG_NAME:-voiceter-backend-blue-tg}"
GREEN_TG_NAME="${GREEN_TG_NAME:-voiceter-backend-green-tg}"
LISTENER_PORT="${LISTENER_PORT:-80}"
TASK_DEF_ARN="${TASK_DEF_ARN:-}"
TRAFFIC_SHIFT_WAIT="${TRAFFIC_SHIFT_WAIT:-300}"  # 5 minutes
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-30}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Perform blue-green deployment for Voiceter Backend

OPTIONS:
    -r, --region REGION         AWS region (default: us-east-1)
    -c, --cluster CLUSTER      ECS cluster name (default: voiceter-cluster)
    --blue-service SERVICE     Blue service name (default: voiceter-backend-blue)
    --green-service SERVICE    Green service name (default: voiceter-backend-green)
    --alb-name NAME           ALB name (default: voiceter-alb)
    --task-def-arn ARN        Task definition ARN to deploy
    --traffic-wait SECONDS    Wait time for traffic shift (default: 300)
    --no-rollback             Don't rollback on failure
    -h, --help                Display this help message

EXAMPLES:
    # Deploy with automatic detection
    $0

    # Deploy specific task definition
    $0 --task-def-arn arn:aws:ecs:us-east-1:123456789012:task-definition/voiceter-backend:42

    # Custom traffic shift wait time
    $0 --traffic-wait 600

ENVIRONMENT VARIABLES:
    AWS_REGION                 AWS region (can also use --region)
    CLUSTER_NAME              ECS cluster name (can also use --cluster)

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -c|--cluster)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        --blue-service)
            BLUE_SERVICE="$2"
            shift 2
            ;;
        --green-service)
            GREEN_SERVICE="$2"
            shift 2
            ;;
        --alb-name)
            ALB_NAME="$2"
            shift 2
            ;;
        --task-def-arn)
            TASK_DEF_ARN="$2"
            shift 2
            ;;
        --traffic-wait)
            TRAFFIC_SHIFT_WAIT="$2"
            shift 2
            ;;
        --no-rollback)
            ROLLBACK_ON_FAILURE=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Function to get ALB listener ARN
get_listener_arn() {
    print_step "Getting ALB listener ARN..."
    
    local alb_arn=$(aws elbv2 describe-load-balancers \
        --names "$ALB_NAME" \
        --region "$AWS_REGION" \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text 2>/dev/null)
    
    if [ -z "$alb_arn" ] || [ "$alb_arn" = "None" ]; then
        print_error "ALB not found: $ALB_NAME"
        exit 1
    fi
    
    local listener_arn=$(aws elbv2 describe-listeners \
        --load-balancer-arn "$alb_arn" \
        --region "$AWS_REGION" \
        --query "Listeners[?Port==\`$LISTENER_PORT\`].ListenerArn" \
        --output text)
    
    if [ -z "$listener_arn" ]; then
        print_error "Listener not found on port $LISTENER_PORT"
        exit 1
    fi
    
    print_info "Listener ARN: $listener_arn"
    echo "$listener_arn"
}

# Function to get target group ARN
get_target_group_arn() {
    local tg_name="$1"
    
    local tg_arn=$(aws elbv2 describe-target-groups \
        --names "$tg_name" \
        --region "$AWS_REGION" \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text 2>/dev/null)
    
    if [ -z "$tg_arn" ] || [ "$tg_arn" = "None" ]; then
        print_error "Target group not found: $tg_name"
        exit 1
    fi
    
    echo "$tg_arn"
}

# Function to get current active environment
get_active_environment() {
    local listener_arn="$1"
    
    print_step "Determining active environment..."
    
    local blue_tg_arn=$(get_target_group_arn "$BLUE_TG_NAME")
    
    local current_tg_arn=$(aws elbv2 describe-rules \
        --listener-arn "$listener_arn" \
        --region "$AWS_REGION" \
        --query 'Rules[?IsDefault==`true`].Actions[0].TargetGroupArn' \
        --output text)
    
    if [ "$current_tg_arn" = "$blue_tg_arn" ]; then
        print_info "Active environment: BLUE"
        echo "blue"
    else
        print_info "Active environment: GREEN"
        echo "green"
    fi
}

# Function to deploy to inactive environment
deploy_to_inactive() {
    local active_env="$1"
    local task_def_arn="$2"
    
    print_step "Deploying to inactive environment..."
    
    local target_service=""
    if [ "$active_env" = "blue" ]; then
        target_service="$GREEN_SERVICE"
        print_info "Deploying to GREEN environment"
    else
        target_service="$BLUE_SERVICE"
        print_info "Deploying to BLUE environment"
    fi
    
    # Update service with new task definition
    print_info "Updating service: $target_service"
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$target_service" \
        --task-definition "$task_def_arn" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --output json > /dev/null
    
    if [ $? -ne 0 ]; then
        print_error "Failed to update service"
        exit 1
    fi
    
    print_info "Waiting for service to stabilize..."
    aws ecs wait services-stable \
        --cluster "$CLUSTER_NAME" \
        --services "$target_service" \
        --region "$AWS_REGION"
    
    if [ $? -eq 0 ]; then
        print_info "Service is stable"
    else
        print_error "Service failed to stabilize"
        exit 1
    fi
}

# Function to run health checks
run_health_checks() {
    local target_tg_arn="$1"
    
    print_step "Running health checks..."
    
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        print_info "Health check attempt $attempt/$max_attempts..."
        
        local health_status=$(aws elbv2 describe-target-health \
            --target-group-arn "$target_tg_arn" \
            --region "$AWS_REGION" \
            --query 'TargetHealthDescriptions[*].TargetHealth.State' \
            --output text)
        
        local unhealthy_count=$(echo "$health_status" | grep -v "healthy" | wc -l)
        
        if [ $unhealthy_count -eq 0 ]; then
            print_info "All targets are healthy"
            return 0
        fi
        
        print_warn "Some targets are unhealthy: $health_status"
        sleep "$HEALTH_CHECK_INTERVAL"
        attempt=$((attempt + 1))
    done
    
    print_error "Health checks failed after $max_attempts attempts"
    return 1
}

# Function to shift traffic
shift_traffic() {
    local listener_arn="$1"
    local target_tg_arn="$2"
    
    print_step "Shifting traffic to new environment..."
    
    # Get default rule ARN
    local rule_arn=$(aws elbv2 describe-rules \
        --listener-arn "$listener_arn" \
        --region "$AWS_REGION" \
        --query 'Rules[?IsDefault==`true`].RuleArn' \
        --output text)
    
    # Modify rule to point to new target group
    print_info "Updating listener rule..."
    aws elbv2 modify-rule \
        --rule-arn "$rule_arn" \
        --actions Type=forward,TargetGroupArn="$target_tg_arn" \
        --region "$AWS_REGION" \
        --output json > /dev/null
    
    if [ $? -eq 0 ]; then
        print_info "Traffic shifted successfully"
    else
        print_error "Failed to shift traffic"
        exit 1
    fi
    
    # Wait for traffic shift to complete
    print_info "Waiting ${TRAFFIC_SHIFT_WAIT}s for traffic shift to complete..."
    sleep "$TRAFFIC_SHIFT_WAIT"
}

# Function to verify deployment
verify_deployment() {
    local target_tg_arn="$1"
    
    print_step "Verifying deployment..."
    
    # Check target health again
    if ! run_health_checks "$target_tg_arn"; then
        print_error "Deployment verification failed"
        return 1
    fi
    
    # Check for errors in CloudWatch Logs
    print_info "Checking CloudWatch Logs for errors..."
    local log_group="/ecs/voiceter-backend"
    local end_time=$(date +%s)000
    local start_time=$((end_time - 300000))  # Last 5 minutes
    
    local error_count=$(aws logs filter-log-events \
        --log-group-name "$log_group" \
        --start-time "$start_time" \
        --end-time "$end_time" \
        --filter-pattern "ERROR" \
        --region "$AWS_REGION" \
        --query 'length(events)' \
        --output text 2>/dev/null || echo "0")
    
    print_info "Error count in last 5 minutes: $error_count"
    
    if [ "$error_count" -gt 10 ]; then
        print_warn "High error count detected: $error_count"
        return 1
    fi
    
    print_info "Deployment verification passed"
    return 0
}

# Function to rollback
rollback() {
    local listener_arn="$1"
    local original_tg_arn="$2"
    
    print_warn "=========================================="
    print_warn "ROLLING BACK DEPLOYMENT"
    print_warn "=========================================="
    
    print_step "Shifting traffic back to original environment..."
    
    local rule_arn=$(aws elbv2 describe-rules \
        --listener-arn "$listener_arn" \
        --region "$AWS_REGION" \
        --query 'Rules[?IsDefault==`true`].RuleArn' \
        --output text)
    
    aws elbv2 modify-rule \
        --rule-arn "$rule_arn" \
        --actions Type=forward,TargetGroupArn="$original_tg_arn" \
        --region "$AWS_REGION" \
        --output json > /dev/null
    
    if [ $? -eq 0 ]; then
        print_info "Rollback completed"
    else
        print_error "Rollback failed - manual intervention required!"
        exit 1
    fi
}

# Function to display summary
display_summary() {
    local active_env="$1"
    
    echo ""
    print_info "=========================================="
    print_info "Blue-Green Deployment Summary"
    print_info "=========================================="
    print_info "Region: $AWS_REGION"
    print_info "Cluster: $CLUSTER_NAME"
    print_info "Active Environment: $active_env"
    print_info "=========================================="
    
    # Display service URL
    local alb_dns=$(aws elbv2 describe-load-balancers \
        --names "$ALB_NAME" \
        --region "$AWS_REGION" \
        --query 'LoadBalancers[0].DNSName' \
        --output text 2>/dev/null)
    
    if [ -n "$alb_dns" ]; then
        print_info "Service URL: http://${alb_dns}"
        print_info "Health Check: http://${alb_dns}/health"
    fi
    
    print_info "=========================================="
}

# Main execution
main() {
    print_info "Starting blue-green deployment"
    print_info "Region: $AWS_REGION"
    print_info "Cluster: $CLUSTER_NAME"
    echo ""
    
    # Get listener ARN
    listener_arn=$(get_listener_arn)
    
    # Get active environment
    active_env=$(get_active_environment "$listener_arn")
    
    # Determine target environment and target group
    local target_env=""
    local target_tg_name=""
    local original_tg_name=""
    
    if [ "$active_env" = "blue" ]; then
        target_env="green"
        target_tg_name="$GREEN_TG_NAME"
        original_tg_name="$BLUE_TG_NAME"
    else
        target_env="blue"
        target_tg_name="$BLUE_TG_NAME"
        original_tg_name="$GREEN_TG_NAME"
    fi
    
    print_info "Target environment: ${target_env^^}"
    
    # Get target group ARNs
    target_tg_arn=$(get_target_group_arn "$target_tg_name")
    original_tg_arn=$(get_target_group_arn "$original_tg_name")
    
    # Get task definition ARN if not provided
    if [ -z "$TASK_DEF_ARN" ]; then
        print_info "Getting latest task definition..."
        TASK_DEF_ARN=$(aws ecs describe-task-definition \
            --task-definition voiceter-backend \
            --region "$AWS_REGION" \
            --query 'taskDefinition.taskDefinitionArn' \
            --output text)
    fi
    
    print_info "Task definition: $TASK_DEF_ARN"
    
    # Deploy to inactive environment
    deploy_to_inactive "$active_env" "$TASK_DEF_ARN"
    
    # Run health checks on new environment
    if ! run_health_checks "$target_tg_arn"; then
        if [ "$ROLLBACK_ON_FAILURE" = true ]; then
            print_error "Health checks failed, rolling back..."
            rollback "$listener_arn" "$original_tg_arn"
            exit 1
        else
            print_error "Health checks failed, but rollback is disabled"
            exit 1
        fi
    fi
    
    # Shift traffic
    shift_traffic "$listener_arn" "$target_tg_arn"
    
    # Verify deployment
    if ! verify_deployment "$target_tg_arn"; then
        if [ "$ROLLBACK_ON_FAILURE" = true ]; then
            print_error "Deployment verification failed, rolling back..."
            rollback "$listener_arn" "$original_tg_arn"
            exit 1
        else
            print_error "Deployment verification failed, but rollback is disabled"
            exit 1
        fi
    fi
    
    # Display summary
    display_summary "${target_env^^}"
    
    print_info "Blue-green deployment completed successfully!"
    print_warn "Monitor the service for the next hour to ensure stability"
    print_info "Old environment (${active_env^^}) is still running and can be used for rollback if needed"
}

# Run main function
main
