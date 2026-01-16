#!/bin/bash

# Voiceter Backend Destruction Script
# This script destroys the Voiceter backend infrastructure from AWS

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

# Get configuration
get_configuration() {
    print_info "Getting configuration..."
    
    # Environment name
    if [ -z "$ENVIRONMENT_NAME" ]; then
        read -p "Enter environment name to destroy (dev/staging/prod): " ENVIRONMENT_NAME
    fi
    
    if [ -z "$ENVIRONMENT_NAME" ]; then
        print_error "Environment name is required."
        exit 1
    fi
    
    # AWS region
    if [ -z "$AWS_REGION" ]; then
        read -p "Enter AWS region [us-east-1]: " AWS_REGION
        AWS_REGION=${AWS_REGION:-us-east-1}
    fi
    
    print_warn ""
    print_warn "=========================================="
    print_warn "WARNING: This will destroy all resources!"
    print_warn "=========================================="
    print_warn ""
    print_warn "Environment: $ENVIRONMENT_NAME"
    print_warn "Region: $AWS_REGION"
    print_warn ""
    print_warn "This includes:"
    print_warn "  - ECS Cluster and Services"
    print_warn "  - Application Load Balancer"
    print_warn "  - DynamoDB Tables (with data)"
    print_warn "  - S3 Bucket (with recordings)"
    print_warn "  - VPC and Networking"
    print_warn "  - IAM Roles"
    print_warn "  - CloudWatch Logs and Alarms"
    print_warn ""
}

# Confirm destruction
confirm_destruction() {
    read -p "Are you absolutely sure you want to destroy these resources? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        print_info "Destruction cancelled."
        exit 0
    fi
    
    read -p "Type the environment name '$ENVIRONMENT_NAME' to confirm: " CONFIRM_ENV
    
    if [ "$CONFIRM_ENV" != "$ENVIRONMENT_NAME" ]; then
        print_error "Environment name does not match. Destruction cancelled."
        exit 1
    fi
}

# Empty S3 bucket
empty_s3_bucket() {
    print_info "Checking S3 bucket..."
    
    BUCKET_NAME="${ENVIRONMENT_NAME}-voiceter-demo-recordings"
    
    if aws s3 ls "s3://$BUCKET_NAME" --region $AWS_REGION &> /dev/null; then
        print_warn "S3 bucket exists and may contain data."
        read -p "Do you want to empty the S3 bucket before deletion? (y/n) [y]: " EMPTY_BUCKET
        EMPTY_BUCKET=${EMPTY_BUCKET:-y}
        
        if [ "$EMPTY_BUCKET" = "y" ]; then
            print_info "Emptying S3 bucket..."
            aws s3 rm "s3://$BUCKET_NAME" --recursive --region $AWS_REGION
            
            # Delete all versions if versioning is enabled
            aws s3api delete-objects \
                --bucket $BUCKET_NAME \
                --delete "$(aws s3api list-object-versions \
                    --bucket $BUCKET_NAME \
                    --region $AWS_REGION \
                    --output json \
                    --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}')" \
                --region $AWS_REGION 2>/dev/null || true
            
            print_info "S3 bucket emptied."
        fi
    fi
}

# Destroy stacks
destroy_stacks() {
    print_info "Destroying stacks..."
    
    CDK_ARGS="--context environmentName=$ENVIRONMENT_NAME --context region=$AWS_REGION"
    
    print_info "Starting destruction..."
    cdk destroy --all --force $CDK_ARGS
}

# Verify destruction
verify_destruction() {
    print_info "Verifying destruction..."
    
    # Check if stacks still exist
    STACKS=$(aws cloudformation list-stacks \
        --region $AWS_REGION \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query "StackSummaries[?contains(StackName, '${ENVIRONMENT_NAME}-Voiceter')].StackName" \
        --output text)
    
    if [ -z "$STACKS" ]; then
        print_info "All stacks have been destroyed."
    else
        print_warn "Some stacks may still exist:"
        echo "$STACKS"
    fi
}

# Main execution
main() {
    print_info "Starting Voiceter Backend Destruction"
    print_info ""
    
    get_configuration
    confirm_destruction
    empty_s3_bucket
    destroy_stacks
    verify_destruction
    
    print_info ""
    print_info "Destruction script completed!"
}

# Run main function
main
