#!/bin/bash

# ECS Deployment Script for Voiceter Backend
# This script handles the complete deployment process including build, push, and service update

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=""
ECR_REPOSITORY="${ECR_REPOSITORY:-website-backend}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILD_NUMBER="${BUILD_NUMBER:-}"
CLUSTER_NAME="${CLUSTER_NAME:-website-backend-cluster}"
SERVICE_NAME="${SERVICE_NAME:-website-backend-service}"
DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE:-rolling}"  # rolling or blue-green
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_TESTS="${SKIP_TESTS:-false}"
WAIT_FOR_STABLE="${WAIT_FOR_STABLE:-true}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-}"

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

Deploy Voiceter Backend to ECS

OPTIONS:
    -r, --region REGION         AWS region (default: us-east-1)
    -t, --tag TAG              Docker image tag (default: latest)
    -b, --build-number NUMBER  Build number to append to tag
    -c, --cluster CLUSTER      ECS cluster name (default: voiceter-cluster)
    -s, --service SERVICE      ECS service name (default: voiceter-backend)
    -d, --deployment-type TYPE Deployment type: rolling or blue-green (default: rolling)
    --skip-build               Skip Docker build step
    --skip-tests               Skip test execution
    --no-wait                  Don't wait for service to stabilize
    --health-check-url URL     Health check URL for verification
    -h, --help                 Display this help message

EXAMPLES:
    # Standard deployment
    $0

    # Deploy with specific tag
    $0 --tag v1.2.3

    # Deploy with build number
    $0 --build-number 42

    # Blue-green deployment
    $0 --deployment-type blue-green

    # Skip build (use existing image)
    $0 --skip-build --tag v1.2.3

    # Deploy to different region
    $0 --region us-west-2

ENVIRONMENT VARIABLES:
    AWS_REGION                 AWS region (can also use --region)
    IMAGE_TAG                  Docker image tag (can also use --tag)
    CLUSTER_NAME              ECS cluster name (can also use --cluster)
    SERVICE_NAME              ECS service name (can also use --service)
    DEPLOYMENT_TYPE           Deployment type (can also use --deployment-type)

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
        -b|--build-number)
            BUILD_NUMBER="$2"
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
        -d|--deployment-type)
            DEPLOYMENT_TYPE="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --no-wait)
            WAIT_FOR_STABLE=false
            shift
            ;;
        --health-check-url)
            HEALTH_CHECK_URL="$2"
            shift 2
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

# Function to get AWS account ID
get_account_id() {
    print_step "Getting AWS account ID..."
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    if [ -z "$AWS_ACCOUNT_ID" ]; then
        print_error "Failed to get AWS account ID"
        exit 1
    fi
    print_info "AWS Account ID: $AWS_ACCOUNT_ID"
}

# Function to run tests
run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        print_warn "Skipping tests"
        return 0
    fi
    
    print_step "Running tests..."
    cd "$PROJECT_ROOT"
    
    # Run unit tests
    print_info "Running unit tests..."
    npm test -- --passWithNoTests
    
    if [ $? -ne 0 ]; then
        print_error "Tests failed"
        exit 1
    fi
    
    print_info "All tests passed"
}

# Function to build and push Docker image
build_and_push() {
    if [ "$SKIP_BUILD" = true ]; then
        print_warn "Skipping Docker build"
        return 0
    fi
    
    print_step "Building and pushing Docker image..."
    
    # Build script arguments
    local build_args="--region $AWS_REGION --tag $IMAGE_TAG --push"
    
    if [ -n "$BUILD_NUMBER" ]; then
        build_args="$build_args --build-number $BUILD_NUMBER"
    fi
    
    # Run build script
    bash "$SCRIPT_DIR/build.sh" $build_args
    
    if [ $? -ne 0 ]; then
        print_error "Build failed"
        exit 1
    fi
}

# Function to register new task definition
register_task_definition() {
    print_step "Registering new task definition..."
    
    # Run task definition deployment script
    bash "$PROJECT_ROOT/infrastructure/ecs/deploy-task-definition.sh" \
        --region "$AWS_REGION" \
        --tag "$IMAGE_TAG"
    
    if [ $? -ne 0 ]; then
        print_error "Failed to register task definition"
        exit 1
    fi
    
    # Get the latest task definition revision
    local task_def_arn=$(aws ecs describe-task-definition \
        --task-definition voiceter-backend \
        --region "$AWS_REGION" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    print_info "Task definition registered: $task_def_arn"
    echo "$task_def_arn"
}

# Function to perform rolling deployment
rolling_deployment() {
    local task_def_arn="$1"
    
    print_step "Performing rolling deployment..."
    
    # Update service with new task definition
    print_info "Updating ECS service..."
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
    
    print_info "Service update initiated"
    
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

# Function to perform blue-green deployment
blue_green_deployment() {
    local task_def_arn="$1"
    
    print_step "Performing blue-green deployment..."
    
    # Check if CodeDeploy application exists
    local app_name="voiceter-backend-deploy"
    local deployment_group="voiceter-backend-dg"
    
    print_info "Checking CodeDeploy configuration..."
    if ! aws deploy get-application \
        --application-name "$app_name" \
        --region "$AWS_REGION" \
        --output text > /dev/null 2>&1; then
        print_error "CodeDeploy application not found: $app_name"
        print_error "Blue-green deployment requires CodeDeploy setup"
        print_info "Falling back to rolling deployment..."
        rolling_deployment "$task_def_arn"
        return 0
    fi
    
    # Create deployment
    print_info "Creating blue-green deployment..."
    local deployment_id=$(aws deploy create-deployment \
        --application-name "$app_name" \
        --deployment-group-name "$deployment_group" \
        --revision "{\"revisionType\":\"String\",\"string\":{\"content\":\"{\\\"taskDefinitionArn\\\":\\\"$task_def_arn\\\"}\"}}" \
        --region "$AWS_REGION" \
        --query 'deploymentId' \
        --output text)
    
    if [ -z "$deployment_id" ]; then
        print_error "Failed to create deployment"
        exit 1
    fi
    
    print_info "Deployment created: $deployment_id"
    
    # Wait for deployment to complete if requested
    if [ "$WAIT_FOR_STABLE" = true ]; then
        print_info "Waiting for deployment to complete..."
        
        aws deploy wait deployment-successful \
            --deployment-id "$deployment_id" \
            --region "$AWS_REGION"
        
        if [ $? -eq 0 ]; then
            print_info "Deployment completed successfully"
        else
            print_error "Deployment failed or timed out"
            exit 1
        fi
    fi
}

# Function to verify deployment
verify_deployment() {
    print_step "Verifying deployment..."
    
    # Get service details
    local service_info=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --output json)
    
    local running_count=$(echo "$service_info" | jq -r '.services[0].runningCount')
    local desired_count=$(echo "$service_info" | jq -r '.services[0].desiredCount')
    local deployment_count=$(echo "$service_info" | jq -r '.services[0].deployments | length')
    
    print_info "Service status:"
    print_info "  Running tasks: $running_count"
    print_info "  Desired tasks: $desired_count"
    print_info "  Active deployments: $deployment_count"
    
    # Check if health check URL is provided
    if [ -n "$HEALTH_CHECK_URL" ]; then
        print_info "Checking health endpoint: $HEALTH_CHECK_URL"
        
        local max_attempts=10
        local attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            print_info "Health check attempt $attempt/$max_attempts..."
            
            if curl -f -s -o /dev/null "$HEALTH_CHECK_URL"; then
                print_info "Health check passed"
                return 0
            fi
            
            sleep 10
            attempt=$((attempt + 1))
        done
        
        print_warn "Health check failed after $max_attempts attempts"
        return 1
    fi
    
    return 0
}

# Function to display deployment summary
display_summary() {
    echo ""
    print_info "=========================================="
    print_info "Deployment Summary"
    print_info "=========================================="
    print_info "Region: $AWS_REGION"
    print_info "Cluster: $CLUSTER_NAME"
    print_info "Service: $SERVICE_NAME"
    print_info "Image Tag: $IMAGE_TAG"
    if [ -n "$BUILD_NUMBER" ]; then
        print_info "Build Number: $BUILD_NUMBER"
    fi
    print_info "Deployment Type: $DEPLOYMENT_TYPE"
    print_info "Image URI: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"
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
    print_info "Starting deployment process"
    print_info "Region: $AWS_REGION"
    print_info "Cluster: $CLUSTER_NAME"
    print_info "Service: $SERVICE_NAME"
    print_info "Image Tag: $IMAGE_TAG"
    print_info "Deployment Type: $DEPLOYMENT_TYPE"
    echo ""
    
    # Get AWS account ID
    get_account_id
    
    # Run tests
    run_tests
    
    # Build and push Docker image
    build_and_push
    
    # Register new task definition
    task_def_arn=$(register_task_definition)
    
    # Perform deployment based on type
    if [ "$DEPLOYMENT_TYPE" = "blue-green" ]; then
        blue_green_deployment "$task_def_arn"
    else
        rolling_deployment "$task_def_arn"
    fi
    
    # Verify deployment
    verify_deployment
    
    # Display summary
    display_summary
    
    print_info "Deployment completed successfully!"
}

# Run main function
main
