#!/bin/bash

# Emergency Rollback Script for Voiceter Backend
# This script rolls back to a previous task definition revision

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
TASK_FAMILY="${TASK_FAMILY:-voiceter-backend}"
TARGET_REVISION="${TARGET_REVISION:-}"
ROLLBACK_STEPS="${ROLLBACK_STEPS:-1}"
FORCE="${FORCE:-false}"
WAIT_FOR_STABLE="${WAIT_FOR_STABLE:-true}"

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

Rollback Voiceter Backend ECS service to a previous task definition

OPTIONS:
    -r, --region REGION         AWS region (default: us-east-1)
    -c, --cluster CLUSTER      ECS cluster name (default: voiceter-cluster)
    -s, --service SERVICE      ECS service name (default: voiceter-backend)
    -t, --target-revision REV  Target task definition revision (default: previous)
    -n, --steps NUMBER         Number of revisions to rollback (default: 1)
    -f, --force                Force rollback without confirmation
    --no-wait                  Don't wait for service to stabilize
    -h, --help                 Display this help message

EXAMPLES:
    # Rollback to previous revision
    $0

    # Rollback to specific revision
    $0 --target-revision 42

    # Rollback 2 revisions back
    $0 --steps 2

    # Force rollback without confirmation
    $0 --force

    # Rollback in different region
    $0 --region us-west-2

ENVIRONMENT VARIABLES:
    AWS_REGION                 AWS region (can also use --region)
    CLUSTER_NAME              ECS cluster name (can also use --cluster)
    SERVICE_NAME              ECS service name (can also use --service)

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
        -t|--target-revision)
            TARGET_REVISION="$2"
            shift 2
            ;;
        -n|--steps)
            ROLLBACK_STEPS="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        --no-wait)
            WAIT_FOR_STABLE=false
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

# Function to get current task definition
get_current_task_definition() {
    print_step "Getting current task definition..."
    
    local current_task_def=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --query 'services[0].taskDefinition' \
        --output text)
    
    if [ -z "$current_task_def" ]; then
        print_error "Failed to get current task definition"
        exit 1
    fi
    
    # Extract revision number
    local current_revision=$(echo "$current_task_def" | grep -oP ':\K[0-9]+$')
    
    print_info "Current task definition: $TASK_FAMILY:$current_revision"
    echo "$current_revision"
}

# Function to list recent task definitions
list_recent_task_definitions() {
    print_step "Listing recent task definitions..."
    
    local task_defs=$(aws ecs list-task-definitions \
        --family-prefix "$TASK_FAMILY" \
        --sort DESC \
        --max-items 10 \
        --region "$AWS_REGION" \
        --query 'taskDefinitionArns' \
        --output json)
    
    if [ -z "$task_defs" ] || [ "$task_defs" = "[]" ]; then
        print_error "No task definitions found for family: $TASK_FAMILY"
        exit 1
    fi
    
    echo ""
    print_info "Recent task definitions:"
    echo "$task_defs" | jq -r '.[]' | while read -r arn; do
        local revision=$(echo "$arn" | grep -oP ':\K[0-9]+$')
        local created_at=$(aws ecs describe-task-definition \
            --task-definition "$arn" \
            --region "$AWS_REGION" \
            --query 'taskDefinition.registeredAt' \
            --output text)
        
        local image=$(aws ecs describe-task-definition \
            --task-definition "$arn" \
            --region "$AWS_REGION" \
            --query 'taskDefinition.containerDefinitions[0].image' \
            --output text)
        
        echo "  Revision $revision - Created: $created_at"
        echo "    Image: $image"
    done
    echo ""
}

# Function to determine target revision
determine_target_revision() {
    local current_revision="$1"
    
    if [ -n "$TARGET_REVISION" ]; then
        print_info "Using specified target revision: $TARGET_REVISION"
        echo "$TARGET_REVISION"
        return 0
    fi
    
    # Calculate target revision based on rollback steps
    local target=$((current_revision - ROLLBACK_STEPS))
    
    if [ $target -lt 1 ]; then
        print_error "Cannot rollback $ROLLBACK_STEPS steps from revision $current_revision"
        print_error "Target revision would be $target (must be >= 1)"
        exit 1
    fi
    
    print_info "Calculated target revision: $target (rollback $ROLLBACK_STEPS steps)"
    echo "$target"
}

# Function to verify target revision exists
verify_target_revision() {
    local target_revision="$1"
    
    print_step "Verifying target revision exists..."
    
    local task_def_arn="${TASK_FAMILY}:${target_revision}"
    
    if aws ecs describe-task-definition \
        --task-definition "$task_def_arn" \
        --region "$AWS_REGION" \
        --output text > /dev/null 2>&1; then
        print_info "Target revision exists: $task_def_arn"
        
        # Get image info
        local image=$(aws ecs describe-task-definition \
            --task-definition "$task_def_arn" \
            --region "$AWS_REGION" \
            --query 'taskDefinition.containerDefinitions[0].image' \
            --output text)
        
        print_info "Target image: $image"
        return 0
    else
        print_error "Target revision does not exist: $task_def_arn"
        exit 1
    fi
}

# Function to confirm rollback
confirm_rollback() {
    local current_revision="$1"
    local target_revision="$2"
    
    if [ "$FORCE" = true ]; then
        print_warn "Force flag set, skipping confirmation"
        return 0
    fi
    
    echo ""
    print_warn "=========================================="
    print_warn "ROLLBACK CONFIRMATION"
    print_warn "=========================================="
    print_warn "Cluster: $CLUSTER_NAME"
    print_warn "Service: $SERVICE_NAME"
    print_warn "Current Revision: $current_revision"
    print_warn "Target Revision: $target_revision"
    print_warn "=========================================="
    echo ""
    
    read -p "Are you sure you want to rollback? (yes/no): " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Rollback cancelled"
        exit 0
    fi
}

# Function to perform rollback
perform_rollback() {
    local target_revision="$1"
    
    print_step "Performing rollback..."
    
    local task_def_arn="${TASK_FAMILY}:${target_revision}"
    
    print_info "Updating service to revision $target_revision..."
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$SERVICE_NAME" \
        --task-definition "$task_def_arn" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --output json > /dev/null
    
    if [ $? -ne 0 ]; then
        print_error "Failed to update service"
        exit 1
    fi
    
    print_info "Rollback initiated"
    
    # Wait for service to stabilize if requested
    if [ "$WAIT_FOR_STABLE" = true ]; then
        print_info "Waiting for service to stabilize (this may take several minutes)..."
        
        aws ecs wait services-stable \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --region "$AWS_REGION"
        
        if [ $? -eq 0 ]; then
            print_info "Service is stable"
        else
            print_warn "Service stabilization timed out. Check ECS console for status."
        fi
    fi
}

# Function to verify rollback
verify_rollback() {
    local target_revision="$1"
    
    print_step "Verifying rollback..."
    
    # Get current task definition after rollback
    local new_task_def=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --query 'services[0].taskDefinition' \
        --output text)
    
    local new_revision=$(echo "$new_task_def" | grep -oP ':\K[0-9]+$')
    
    if [ "$new_revision" = "$target_revision" ]; then
        print_info "Rollback verified: Service is now using revision $new_revision"
    else
        print_warn "Rollback verification failed: Expected revision $target_revision, got $new_revision"
    fi
    
    # Get service status
    local service_info=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --output json)
    
    local running_count=$(echo "$service_info" | jq -r '.services[0].runningCount')
    local desired_count=$(echo "$service_info" | jq -r '.services[0].desiredCount')
    
    print_info "Service status:"
    print_info "  Running tasks: $running_count"
    print_info "  Desired tasks: $desired_count"
}

# Function to display rollback summary
display_summary() {
    local current_revision="$1"
    local target_revision="$2"
    
    echo ""
    print_info "=========================================="
    print_info "Rollback Summary"
    print_info "=========================================="
    print_info "Region: $AWS_REGION"
    print_info "Cluster: $CLUSTER_NAME"
    print_info "Service: $SERVICE_NAME"
    print_info "Previous Revision: $current_revision"
    print_info "Current Revision: $target_revision"
    print_info "=========================================="
    
    # Display service URL if available
    local alb_dns=$(aws elbv2 describe-load-balancers \
        --region "$AWS_REGION" \
        --query "LoadBalancers[?contains(LoadBalancerName, 'voiceter')].DNSName" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$alb_dns" ]; then
        print_info "Service URL: http://${alb_dns}"
        print_info "Health Check: http://${alb_dns}/health"
    fi
    
    print_info "=========================================="
}

# Main execution
main() {
    print_info "Starting rollback process"
    print_info "Region: $AWS_REGION"
    print_info "Cluster: $CLUSTER_NAME"
    print_info "Service: $SERVICE_NAME"
    echo ""
    
    # List recent task definitions
    list_recent_task_definitions
    
    # Get current task definition
    current_revision=$(get_current_task_definition)
    
    # Determine target revision
    target_revision=$(determine_target_revision "$current_revision")
    
    # Verify target revision exists
    verify_target_revision "$target_revision"
    
    # Confirm rollback
    confirm_rollback "$current_revision" "$target_revision"
    
    # Perform rollback
    perform_rollback "$target_revision"
    
    # Verify rollback
    verify_rollback "$target_revision"
    
    # Display summary
    display_summary "$current_revision" "$target_revision"
    
    print_info "Rollback completed successfully!"
    print_warn "Monitor the service to ensure it's functioning correctly"
}

# Run main function
main
