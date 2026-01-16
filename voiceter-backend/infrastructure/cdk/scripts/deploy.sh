#!/bin/bash

# Voiceter Backend Deployment Script
# This script deploys the Voiceter backend infrastructure to AWS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Check if required tools are installed
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK CLI is not installed. Please install it with: npm install -g aws-cdk"
        exit 1
    fi
    
    print_info "All prerequisites are installed."
}

# Check AWS credentials
check_aws_credentials() {
    print_info "Checking AWS credentials..."
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured. Please run 'aws configure'."
        exit 1
    fi
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_info "Using AWS Account: $ACCOUNT_ID"
}

# Get configuration
get_configuration() {
    print_info "Getting configuration..."
    
    # Environment name
    if [ -z "$ENVIRONMENT_NAME" ]; then
        read -p "Enter environment name (dev/staging/prod) [dev]: " ENVIRONMENT_NAME
        ENVIRONMENT_NAME=${ENVIRONMENT_NAME:-dev}
    fi
    
    # AWS region
    if [ -z "$AWS_REGION" ]; then
        read -p "Enter AWS region [us-east-1]: " AWS_REGION
        AWS_REGION=${AWS_REGION:-us-east-1}
    fi
    
    # Certificate ARN (optional)
    if [ -z "$CERTIFICATE_ARN" ]; then
        read -p "Enter SSL certificate ARN (optional, press Enter to skip): " CERTIFICATE_ARN
    fi
    
    # Alarm email (optional)
    if [ -z "$ALARM_EMAIL" ]; then
        read -p "Enter email for CloudWatch alarms (optional, press Enter to skip): " ALARM_EMAIL
    fi
    
    # Image tag
    if [ -z "$IMAGE_TAG" ]; then
        read -p "Enter Docker image tag [latest]: " IMAGE_TAG
        IMAGE_TAG=${IMAGE_TAG:-latest}
    fi
    
    print_info "Configuration:"
    print_info "  Environment: $ENVIRONMENT_NAME"
    print_info "  Region: $AWS_REGION"
    print_info "  Certificate ARN: ${CERTIFICATE_ARN:-Not provided}"
    print_info "  Alarm Email: ${ALARM_EMAIL:-Not provided}"
    print_info "  Image Tag: $IMAGE_TAG"
}

# Bootstrap CDK
bootstrap_cdk() {
    print_info "Checking if CDK is bootstrapped..."
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    # Check if bootstrap stack exists
    if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &> /dev/null; then
        print_warn "CDK is not bootstrapped in this account/region."
        read -p "Do you want to bootstrap CDK now? (y/n) [y]: " BOOTSTRAP
        BOOTSTRAP=${BOOTSTRAP:-y}
        
        if [ "$BOOTSTRAP" = "y" ]; then
            print_info "Bootstrapping CDK..."
            cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION
        else
            print_error "CDK bootstrap is required. Exiting."
            exit 1
        fi
    else
        print_info "CDK is already bootstrapped."
    fi
}

# Install dependencies
install_dependencies() {
    print_info "Installing dependencies..."
    npm install
}

# Build CDK app
build_cdk() {
    print_info "Building CDK app..."
    npm run build
}

# Show diff
show_diff() {
    print_info "Showing changes to be deployed..."
    
    CDK_ARGS="--context environmentName=$ENVIRONMENT_NAME --context region=$AWS_REGION"
    
    if [ -n "$CERTIFICATE_ARN" ]; then
        CDK_ARGS="$CDK_ARGS --context certificateArn=$CERTIFICATE_ARN"
    fi
    
    if [ -n "$ALARM_EMAIL" ]; then
        CDK_ARGS="$CDK_ARGS --context alarmEmail=$ALARM_EMAIL"
    fi
    
    if [ -n "$IMAGE_TAG" ]; then
        CDK_ARGS="$CDK_ARGS --context imageTag=$IMAGE_TAG"
    fi
    
    cdk diff --all $CDK_ARGS || true
}

# Deploy stacks
deploy_stacks() {
    print_info "Deploying stacks..."
    
    CDK_ARGS="--context environmentName=$ENVIRONMENT_NAME --context region=$AWS_REGION"
    
    if [ -n "$CERTIFICATE_ARN" ]; then
        CDK_ARGS="$CDK_ARGS --context certificateArn=$CERTIFICATE_ARN"
    fi
    
    if [ -n "$ALARM_EMAIL" ]; then
        CDK_ARGS="$CDK_ARGS --context alarmEmail=$ALARM_EMAIL"
    fi
    
    if [ -n "$IMAGE_TAG" ]; then
        CDK_ARGS="$CDK_ARGS --context imageTag=$IMAGE_TAG"
    fi
    
    read -p "Do you want to proceed with deployment? (y/n) [y]: " PROCEED
    PROCEED=${PROCEED:-y}
    
    if [ "$PROCEED" != "y" ]; then
        print_warn "Deployment cancelled."
        exit 0
    fi
    
    print_info "Starting deployment..."
    cdk deploy --all --require-approval never $CDK_ARGS
}

# Get outputs
get_outputs() {
    print_info "Getting deployment outputs..."
    
    # Get load balancer DNS
    ALB_DNS=$(aws cloudformation describe-stacks \
        --stack-name ${ENVIRONMENT_NAME}-VoiceterAlbStack \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
        --output text 2>/dev/null || echo "Not available")
    
    # Get service URL
    SERVICE_URL=$(aws cloudformation describe-stacks \
        --stack-name ${ENVIRONMENT_NAME}-VoiceterAlbStack \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ServiceUrl`].OutputValue' \
        --output text 2>/dev/null || echo "Not available")
    
    # Get dashboard URL
    DASHBOARD_URL=$(aws cloudformation describe-stacks \
        --stack-name ${ENVIRONMENT_NAME}-VoiceterCloudWatchStack \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
        --output text 2>/dev/null || echo "Not available")
    
    print_info ""
    print_info "=========================================="
    print_info "Deployment Complete!"
    print_info "=========================================="
    print_info ""
    print_info "Service URL: $SERVICE_URL"
    print_info "Load Balancer DNS: $ALB_DNS"
    print_info "Dashboard URL: $DASHBOARD_URL"
    print_info ""
    print_info "To view all outputs, run:"
    print_info "  aws cloudformation describe-stacks --stack-name ${ENVIRONMENT_NAME}-VoiceterAlbStack --region $AWS_REGION --query 'Stacks[0].Outputs'"
    print_info ""
}

# Verify deployment
verify_deployment() {
    print_info "Verifying deployment..."
    
    # Check ECS service
    SERVICE_STATUS=$(aws ecs describe-services \
        --cluster ${ENVIRONMENT_NAME}-voiceter-cluster \
        --services ${ENVIRONMENT_NAME}-voiceter-backend \
        --region $AWS_REGION \
        --query 'services[0].status' \
        --output text 2>/dev/null || echo "UNKNOWN")
    
    if [ "$SERVICE_STATUS" = "ACTIVE" ]; then
        print_info "ECS service is ACTIVE"
    else
        print_warn "ECS service status: $SERVICE_STATUS"
    fi
    
    # Check running tasks
    RUNNING_COUNT=$(aws ecs describe-services \
        --cluster ${ENVIRONMENT_NAME}-voiceter-cluster \
        --services ${ENVIRONMENT_NAME}-voiceter-backend \
        --region $AWS_REGION \
        --query 'services[0].runningCount' \
        --output text 2>/dev/null || echo "0")
    
    print_info "Running tasks: $RUNNING_COUNT"
    
    # Test health endpoint
    if [ "$ALB_DNS" != "Not available" ]; then
        print_info "Testing health endpoint..."
        sleep 10 # Wait for service to be ready
        
        if curl -f -s "http://$ALB_DNS/health" > /dev/null; then
            print_info "Health check passed!"
        else
            print_warn "Health check failed. Service may still be starting up."
            print_info "You can check logs with: aws logs tail /ecs/${ENVIRONMENT_NAME}-voiceter-backend --follow"
        fi
    fi
}

# Main execution
main() {
    print_info "Starting Voiceter Backend Deployment"
    print_info ""
    
    check_prerequisites
    check_aws_credentials
    get_configuration
    bootstrap_cdk
    install_dependencies
    build_cdk
    show_diff
    deploy_stacks
    get_outputs
    verify_deployment
    
    print_info ""
    print_info "Deployment script completed successfully!"
}

# Run main function
main
