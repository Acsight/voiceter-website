#!/bin/bash

# Deploy ECS Task Definition Script
# This script registers a new task definition revision and optionally updates the ECS service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_DEF_FILE="${SCRIPT_DIR}/task-definition.json"
TASK_DEF_TEMPLATE="${SCRIPT_DIR}/task-definition.template.json"

# Default values
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=""
ECR_REPOSITORY="voiceter-backend"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CLUSTER_NAME="${CLUSTER_NAME:-voiceter-cluster}"
SERVICE_NAME="${SERVICE_NAME:-voiceter-backend}"
UPDATE_SERVICE="${UPDATE_SERVICE:-false}"

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

# Function to get AWS account ID
get_account_id() {
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    if [ -z "$AWS_ACCOUNT_ID" ]; then
        print_error "Failed to get AWS account ID"
        exit 1
    fi
    print_info "AWS Account ID: $AWS_ACCOUNT_ID"
}

# Function to check if ECR image exists
check_ecr_image() {
    local image_uri="$1"
    print_info "Checking if ECR image exists: $image_uri"
    
    if aws ecr describe-images \
        --repository-name "$ECR_REPOSITORY" \
        --image-ids imageTag="$IMAGE_TAG" \
        --region "$AWS_REGION" \
        --output text > /dev/null 2>&1; then
        print_info "ECR image found"
        return 0
    else
        print_warn "ECR image not found: $image_uri"
        return 1
    fi
}

# Function to prepare task definition
prepare_task_definition() {
    print_info "Preparing task definition..."
    
    # Create a temporary file with substitutions
    local temp_file=$(mktemp)
    
    # Read the template or original file
    if [ -f "$TASK_DEF_TEMPLATE" ]; then
        cp "$TASK_DEF_TEMPLATE" "$temp_file"
    else
        cp "$TASK_DEF_FILE" "$temp_file"
    fi
    
    # Substitute placeholders
    local image_uri="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"
    local execution_role="arn:aws:iam::${AWS_ACCOUNT_ID}:role/voiceter-backend-execution-role"
    local task_role="arn:aws:iam::${AWS_ACCOUNT_ID}:role/voiceter-backend-task-role"
    
    sed -i.bak \
        -e "s|ACCOUNT_ID|${AWS_ACCOUNT_ID}|g" \
        -e "s|REGION|${AWS_REGION}|g" \
        -e "s|${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:latest|${image_uri}|g" \
        "$temp_file"
    
    rm -f "${temp_file}.bak"
    
    print_info "Task definition prepared with:"
    print_info "  Image: $image_uri"
    print_info "  Execution Role: $execution_role"
    print_info "  Task Role: $task_role"
    
    echo "$temp_file"
}

# Function to register task definition
register_task_definition() {
    local task_def_file="$1"
    
    print_info "Registering task definition..."
    
    local result=$(aws ecs register-task-definition \
        --cli-input-json "file://${task_def_file}" \
        --region "$AWS_REGION" \
        --output json)
    
    if [ $? -eq 0 ]; then
        local revision=$(echo "$result" | jq -r '.taskDefinition.revision')
        print_info "Task definition registered successfully: voiceter-backend:${revision}"
        echo "$revision"
    else
        print_error "Failed to register task definition"
        exit 1
    fi
}

# Function to update ECS service
update_ecs_service() {
    local revision="$1"
    
    print_info "Updating ECS service: $SERVICE_NAME"
    
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$SERVICE_NAME" \
        --task-definition "voiceter-backend:${revision}" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --output json > /dev/null
    
    if [ $? -eq 0 ]; then
        print_info "Service update initiated successfully"
        print_info "Waiting for service to stabilize..."
        
        aws ecs wait services-stable \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --region "$AWS_REGION"
        
        if [ $? -eq 0 ]; then
            print_info "Service is stable"
        else
            print_warn "Service stabilization timed out. Check ECS console for status."
        fi
    else
        print_error "Failed to update service"
        exit 1
    fi
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy ECS Task Definition for Voiceter Backend

OPTIONS:
    -r, --region REGION         AWS region (default: us-east-1)
    -t, --tag TAG              Docker image tag (default: latest)
    -c, --cluster CLUSTER      ECS cluster name (default: voiceter-cluster)
    -s, --service SERVICE      ECS service name (default: voiceter-backend)
    -u, --update-service       Update ECS service after registering task definition
    -h, --help                 Display this help message

EXAMPLES:
    # Register task definition only
    $0

    # Register and update service
    $0 --update-service

    # Use specific image tag
    $0 --tag v1.2.3 --update-service

    # Deploy to different region
    $0 --region us-west-2 --update-service

ENVIRONMENT VARIABLES:
    AWS_REGION                 AWS region (can also use --region)
    IMAGE_TAG                  Docker image tag (can also use --tag)
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
        -t|--tag)
            IMAGE_TAG="$2"
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
        -u|--update-service)
            UPDATE_SERVICE=true
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

# Main execution
main() {
    print_info "Starting ECS task definition deployment"
    print_info "Region: $AWS_REGION"
    print_info "Image Tag: $IMAGE_TAG"
    print_info "Cluster: $CLUSTER_NAME"
    print_info "Service: $SERVICE_NAME"
    print_info "Update Service: $UPDATE_SERVICE"
    echo ""
    
    # Get AWS account ID
    get_account_id
    
    # Check if ECR image exists
    image_uri="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"
    if ! check_ecr_image "$image_uri"; then
        print_warn "ECR image not found. Make sure to build and push the image first."
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Prepare task definition
    temp_task_def=$(prepare_task_definition)
    
    # Register task definition
    revision=$(register_task_definition "$temp_task_def")
    
    # Clean up temporary file
    rm -f "$temp_task_def"
    
    # Update service if requested
    if [ "$UPDATE_SERVICE" = true ]; then
        update_ecs_service "$revision"
    else
        print_info "Task definition registered but service not updated"
        print_info "To update the service, run:"
        print_info "  aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --task-definition voiceter-backend:${revision} --force-new-deployment --region $AWS_REGION"
    fi
    
    print_info "Deployment completed successfully!"
}

# Run main function
main
