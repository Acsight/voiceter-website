#!/bin/bash

# Deployment Verification Script for Voiceter Backend
# This script verifies that the deployment is healthy and functioning correctly

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
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-}"
MAX_RETRIES="${MAX_RETRIES:-10}"
RETRY_DELAY="${RETRY_DELAY:-10}"
VERBOSE="${VERBOSE:-false}"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

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

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Verify Voiceter Backend deployment health and functionality

OPTIONS:
    -r, --region REGION         AWS region (default: us-east-1)
    -c, --cluster CLUSTER      ECS cluster name (default: voiceter-cluster)
    -s, --service SERVICE      ECS service name (default: voiceter-backend)
    -u, --url URL              Health check URL (auto-detected if not provided)
    -m, --max-retries NUMBER   Maximum health check retries (default: 10)
    -d, --delay SECONDS        Delay between retries (default: 10)
    -v, --verbose              Verbose output
    -h, --help                 Display this help message

EXAMPLES:
    # Verify deployment with auto-detected URL
    $0

    # Verify with specific health check URL
    $0 --url http://example.com/health

    # Verify with custom retry settings
    $0 --max-retries 20 --delay 5

    # Verbose output
    $0 --verbose

ENVIRONMENT VARIABLES:
    AWS_REGION                 AWS region (can also use --region)
    CLUSTER_NAME              ECS cluster name (can also use --cluster)
    SERVICE_NAME              ECS service name (can also use --service)
    HEALTH_CHECK_URL          Health check URL (can also use --url)
    MAX_RETRIES               Maximum retries (can also use --max-retries)
    RETRY_DELAY               Delay between retries (can also use --delay)

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
        -s|--service)
            SERVICE_NAME="$2"
            shift 2
            ;;
        -u|--url)
            HEALTH_CHECK_URL="$2"
            shift 2
            ;;
        -m|--max-retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        -d|--delay)
            RETRY_DELAY="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
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

# Function to check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        print_warn "jq is not installed - some checks will be limited"
    fi
    
    # Check if curl is installed
    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed"
        exit 1
    fi
    
    print_info "All prerequisites met"
}

# Function to get ALB DNS name
get_alb_dns() {
    print_step "Detecting ALB DNS name..."
    
    local alb_dns=$(aws elbv2 describe-load-balancers \
        --region "$AWS_REGION" \
        --query "LoadBalancers[?contains(LoadBalancerName, 'voiceter')].DNSName" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$alb_dns" ]; then
        print_info "ALB DNS: $alb_dns"
        echo "$alb_dns"
    else
        print_warn "Could not auto-detect ALB DNS"
        echo ""
    fi
}

# Function to verify ECS cluster exists
verify_cluster() {
    print_step "Verifying ECS cluster..."
    
    local cluster_status=$(aws ecs describe-clusters \
        --clusters "$CLUSTER_NAME" \
        --region "$AWS_REGION" \
        --query 'clusters[0].status' \
        --output text 2>/dev/null || echo "")
    
    if [ "$cluster_status" = "ACTIVE" ]; then
        print_pass "ECS cluster '$CLUSTER_NAME' is ACTIVE"
        return 0
    else
        print_fail "ECS cluster '$CLUSTER_NAME' is not ACTIVE (status: $cluster_status)"
        return 1
    fi
}

# Function to verify ECS service exists and is stable
verify_service() {
    print_step "Verifying ECS service..."
    
    local service_info=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --output json 2>/dev/null)
    
    if [ -z "$service_info" ]; then
        print_fail "Could not retrieve service information"
        return 1
    fi
    
    # Check if jq is available
    if command -v jq &> /dev/null; then
        local status=$(echo "$service_info" | jq -r '.services[0].status')
        local running_count=$(echo "$service_info" | jq -r '.services[0].runningCount')
        local desired_count=$(echo "$service_info" | jq -r '.services[0].desiredCount')
        local deployment_count=$(echo "$service_info" | jq -r '.services[0].deployments | length')
        
        if [ "$VERBOSE" = true ]; then
            print_info "Service status: $status"
            print_info "Running tasks: $running_count"
            print_info "Desired tasks: $desired_count"
            print_info "Active deployments: $deployment_count"
        fi
        
        if [ "$status" = "ACTIVE" ]; then
            print_pass "ECS service '$SERVICE_NAME' is ACTIVE"
        else
            print_fail "ECS service '$SERVICE_NAME' is not ACTIVE (status: $status)"
            return 1
        fi
        
        if [ "$running_count" -eq "$desired_count" ]; then
            print_pass "All desired tasks are running ($running_count/$desired_count)"
        else
            print_fail "Not all tasks are running ($running_count/$desired_count)"
            return 1
        fi
        
        if [ "$deployment_count" -eq 1 ]; then
            print_pass "Service has stable deployment (1 active deployment)"
        else
            print_warn "Service has multiple deployments ($deployment_count) - may be updating"
        fi
    else
        print_warn "jq not available - skipping detailed service checks"
    fi
    
    return 0
}

# Function to verify tasks are healthy
verify_tasks() {
    print_step "Verifying ECS tasks..."
    
    local task_arns=$(aws ecs list-tasks \
        --cluster "$CLUSTER_NAME" \
        --service-name "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --query 'taskArns' \
        --output text 2>/dev/null)
    
    if [ -z "$task_arns" ]; then
        print_fail "No tasks found for service"
        return 1
    fi
    
    local task_count=$(echo "$task_arns" | wc -w)
    print_info "Found $task_count task(s)"
    
    # Get task details
    local tasks_info=$(aws ecs describe-tasks \
        --cluster "$CLUSTER_NAME" \
        --tasks $task_arns \
        --region "$AWS_REGION" \
        --output json 2>/dev/null)
    
    if command -v jq &> /dev/null; then
        local healthy_count=$(echo "$tasks_info" | jq '[.tasks[] | select(.healthStatus=="HEALTHY")] | length')
        local running_count=$(echo "$tasks_info" | jq '[.tasks[] | select(.lastStatus=="RUNNING")] | length')
        
        if [ "$VERBOSE" = true ]; then
            print_info "Healthy tasks: $healthy_count"
            print_info "Running tasks: $running_count"
        fi
        
        if [ "$healthy_count" -eq "$task_count" ]; then
            print_pass "All tasks are healthy ($healthy_count/$task_count)"
        else
            print_warn "Not all tasks are healthy ($healthy_count/$task_count)"
        fi
        
        if [ "$running_count" -eq "$task_count" ]; then
            print_pass "All tasks are running ($running_count/$task_count)"
        else
            print_fail "Not all tasks are running ($running_count/$task_count)"
            return 1
        fi
    else
        print_warn "jq not available - skipping detailed task checks"
    fi
    
    return 0
}

# Function to verify health check endpoint
verify_health_endpoint() {
    print_step "Verifying health check endpoint..."
    
    # If no URL provided, try to auto-detect
    if [ -z "$HEALTH_CHECK_URL" ]; then
        local alb_dns=$(get_alb_dns)
        if [ -n "$alb_dns" ]; then
            HEALTH_CHECK_URL="http://${alb_dns}/health"
        else
            print_warn "No health check URL provided and could not auto-detect"
            return 0
        fi
    fi
    
    print_info "Health check URL: $HEALTH_CHECK_URL"
    
    local attempt=1
    while [ $attempt -le $MAX_RETRIES ]; do
        if [ "$VERBOSE" = true ]; then
            print_info "Health check attempt $attempt/$MAX_RETRIES..."
        fi
        
        local response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" 2>/dev/null || echo "000")
        
        if [ "$response" = "200" ]; then
            print_pass "Health check endpoint is responding (HTTP 200)"
            
            # Get health check response body if verbose
            if [ "$VERBOSE" = true ]; then
                local body=$(curl -s "$HEALTH_CHECK_URL" 2>/dev/null || echo "")
                if [ -n "$body" ]; then
                    print_info "Health check response:"
                    echo "$body" | jq '.' 2>/dev/null || echo "$body"
                fi
            fi
            
            return 0
        else
            if [ "$VERBOSE" = true ]; then
                print_warn "Health check failed (HTTP $response)"
            fi
            
            if [ $attempt -lt $MAX_RETRIES ]; then
                sleep $RETRY_DELAY
            fi
        fi
        
        attempt=$((attempt + 1))
    done
    
    print_fail "Health check endpoint failed after $MAX_RETRIES attempts"
    return 1
}

# Function to verify CloudWatch logs
verify_logs() {
    print_step "Verifying CloudWatch logs..."
    
    local log_group="/ecs/voiceter-backend"
    
    # Check if log group exists
    local log_group_exists=$(aws logs describe-log-groups \
        --log-group-name-prefix "$log_group" \
        --region "$AWS_REGION" \
        --query 'logGroups[0].logGroupName' \
        --output text 2>/dev/null || echo "")
    
    if [ "$log_group_exists" = "$log_group" ]; then
        print_pass "CloudWatch log group exists: $log_group"
        
        # Check for recent log streams
        local recent_streams=$(aws logs describe-log-streams \
            --log-group-name "$log_group" \
            --region "$AWS_REGION" \
            --order-by LastEventTime \
            --descending \
            --max-items 5 \
            --query 'logStreams[*].logStreamName' \
            --output text 2>/dev/null || echo "")
        
        if [ -n "$recent_streams" ]; then
            print_pass "Recent log streams found"
            if [ "$VERBOSE" = true ]; then
                print_info "Recent log streams:"
                echo "$recent_streams" | tr '\t' '\n' | head -3
            fi
        else
            print_warn "No recent log streams found"
        fi
    else
        print_fail "CloudWatch log group not found: $log_group"
        return 1
    fi
    
    return 0
}

# Function to verify CloudWatch metrics
verify_metrics() {
    print_step "Verifying CloudWatch metrics..."
    
    local namespace="Voiceter/Backend"
    
    # Check if metrics exist
    local metrics=$(aws cloudwatch list-metrics \
        --namespace "$namespace" \
        --region "$AWS_REGION" \
        --query 'Metrics[*].MetricName' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$metrics" ]; then
        local metric_count=$(echo "$metrics" | wc -w)
        print_pass "CloudWatch metrics found in namespace '$namespace' ($metric_count metrics)"
        
        if [ "$VERBOSE" = true ]; then
            print_info "Available metrics:"
            echo "$metrics" | tr '\t' '\n' | sort | head -10
        fi
    else
        print_warn "No CloudWatch metrics found in namespace '$namespace'"
        print_info "Metrics may not be available yet if deployment is recent"
    fi
    
    return 0
}

# Function to verify CloudWatch alarms
verify_alarms() {
    print_step "Verifying CloudWatch alarms..."
    
    local alarms=$(aws cloudwatch describe-alarms \
        --alarm-name-prefix "voiceter-backend" \
        --region "$AWS_REGION" \
        --query 'MetricAlarms[*].[AlarmName,StateValue]' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$alarms" ]; then
        local alarm_count=$(echo "$alarms" | wc -l)
        print_pass "CloudWatch alarms found ($alarm_count alarms)"
        
        if [ "$VERBOSE" = true ]; then
            print_info "Alarm status:"
            echo "$alarms" | while read -r name state; do
                if [ "$state" = "OK" ]; then
                    echo -e "  ${GREEN}✓${NC} $name: $state"
                elif [ "$state" = "ALARM" ]; then
                    echo -e "  ${RED}✗${NC} $name: $state"
                else
                    echo -e "  ${YELLOW}?${NC} $name: $state"
                fi
            done
        fi
        
        # Check for any alarms in ALARM state
        local alarm_state_count=$(echo "$alarms" | grep -c "ALARM" || echo "0")
        if [ "$alarm_state_count" -gt 0 ]; then
            print_warn "$alarm_state_count alarm(s) in ALARM state"
        fi
    else
        print_warn "No CloudWatch alarms found with prefix 'voiceter-backend'"
    fi
    
    return 0
}

# Function to verify auto-scaling configuration
verify_autoscaling() {
    print_step "Verifying auto-scaling configuration..."
    
    local resource_id="service/${CLUSTER_NAME}/${SERVICE_NAME}"
    
    # Check scalable target
    local scalable_target=$(aws application-autoscaling describe-scalable-targets \
        --service-namespace ecs \
        --resource-ids "$resource_id" \
        --region "$AWS_REGION" \
        --output json 2>/dev/null || echo "")
    
    if [ -n "$scalable_target" ] && command -v jq &> /dev/null; then
        local min_capacity=$(echo "$scalable_target" | jq -r '.ScalableTargets[0].MinCapacity')
        local max_capacity=$(echo "$scalable_target" | jq -r '.ScalableTargets[0].MaxCapacity')
        
        if [ "$min_capacity" != "null" ] && [ "$max_capacity" != "null" ]; then
            print_pass "Auto-scaling configured (min: $min_capacity, max: $max_capacity)"
            
            # Check scaling policies
            local policies=$(aws application-autoscaling describe-scaling-policies \
                --service-namespace ecs \
                --resource-id "$resource_id" \
                --region "$AWS_REGION" \
                --query 'ScalingPolicies[*].PolicyName' \
                --output text 2>/dev/null || echo "")
            
            if [ -n "$policies" ]; then
                local policy_count=$(echo "$policies" | wc -w)
                print_pass "Scaling policies configured ($policy_count policies)"
                
                if [ "$VERBOSE" = true ]; then
                    print_info "Scaling policies:"
                    echo "$policies" | tr '\t' '\n'
                fi
            else
                print_warn "No scaling policies found"
            fi
        else
            print_warn "Auto-scaling target exists but configuration incomplete"
        fi
    else
        print_warn "Auto-scaling not configured for service"
    fi
    
    return 0
}

# Function to display summary
display_summary() {
    echo ""
    echo "=========================================="
    echo "Deployment Verification Summary"
    echo "=========================================="
    echo -e "Region: ${BLUE}$AWS_REGION${NC}"
    echo -e "Cluster: ${BLUE}$CLUSTER_NAME${NC}"
    echo -e "Service: ${BLUE}$SERVICE_NAME${NC}"
    echo ""
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "Total Tests: $TESTS_TOTAL"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All verification checks passed!${NC}"
        echo "=========================================="
        return 0
    else
        echo -e "${RED}✗ Some verification checks failed${NC}"
        echo "=========================================="
        return 1
    fi
}

# Main execution
main() {
    print_info "Starting deployment verification"
    print_info "Region: $AWS_REGION"
    print_info "Cluster: $CLUSTER_NAME"
    print_info "Service: $SERVICE_NAME"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Run verification checks
    verify_cluster
    verify_service
    verify_tasks
    verify_health_endpoint
    verify_logs
    verify_metrics
    verify_alarms
    verify_autoscaling
    
    # Display summary
    display_summary
    
    # Exit with appropriate code
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main