#!/bin/bash

# Docker Build Script for Voiceter Backend
# This script builds the Docker image and optionally pushes it to ECR

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
ECR_REPOSITORY="${ECR_REPOSITORY:-voiceter-backend}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILD_NUMBER="${BUILD_NUMBER:-}"
PUSH_TO_ECR="${PUSH_TO_ECR:-false}"
NO_CACHE="${NO_CACHE:-false}"
PLATFORM="${PLATFORM:-linux/amd64}"

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

Build Docker image for Voiceter Backend

OPTIONS:
    -r, --region REGION         AWS region (default: us-east-1)
    -t, --tag TAG              Docker image tag (default: latest)
    -b, --build-number NUMBER  Build number to append to tag
    -p, --push                 Push image to ECR after building
    -n, --no-cache             Build without using cache
    --platform PLATFORM        Target platform (default: linux/amd64)
    -h, --help                 Display this help message

EXAMPLES:
    # Build image locally
    $0

    # Build and push to ECR
    $0 --push

    # Build with specific tag
    $0 --tag v1.2.3 --push

    # Build with build number
    $0 --build-number 42 --push

    # Build without cache
    $0 --no-cache --push

ENVIRONMENT VARIABLES:
    AWS_REGION                 AWS region (can also use --region)
    IMAGE_TAG                  Docker image tag (can also use --tag)
    ECR_REPOSITORY            ECR repository name (default: voiceter-backend)
    PUSH_TO_ECR               Push to ECR (can also use --push)
    NO_CACHE                  Build without cache (can also use --no-cache)

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
        -p|--push)
            PUSH_TO_ECR=true
            shift
            ;;
        -n|--no-cache)
            NO_CACHE=true
            shift
            ;;
        --platform)
            PLATFORM="$2"
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
    if [ "$PUSH_TO_ECR" = true ]; then
        print_step "Getting AWS account ID..."
        AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        if [ -z "$AWS_ACCOUNT_ID" ]; then
            print_error "Failed to get AWS account ID"
            exit 1
        fi
        print_info "AWS Account ID: $AWS_ACCOUNT_ID"
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_info "Docker is installed: $(docker --version)"
    
    # Check if AWS CLI is installed (if pushing to ECR)
    if [ "$PUSH_TO_ECR" = true ]; then
        if ! command -v aws &> /dev/null; then
            print_error "AWS CLI is not installed"
            exit 1
        fi
        print_info "AWS CLI is installed: $(aws --version)"
    fi
    
    # Check if project files exist
    if [ ! -f "$PROJECT_ROOT/Dockerfile" ]; then
        print_error "Dockerfile not found at $PROJECT_ROOT/Dockerfile"
        exit 1
    fi
    
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        print_error "package.json not found at $PROJECT_ROOT/package.json"
        exit 1
    fi
    
    print_info "All prerequisites met"
}

# Function to build TypeScript code
build_typescript() {
    print_step "Building TypeScript code..."
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_info "Installing dependencies..."
        npm ci
    fi
    
    # Build TypeScript
    print_info "Compiling TypeScript..."
    npm run build
    
    if [ ! -d "dist" ]; then
        print_error "Build failed: dist directory not created"
        exit 1
    fi
    
    print_info "TypeScript build completed"
}

# Function to create ECR repository if it doesn't exist
create_ecr_repository() {
    print_step "Checking ECR repository..."
    
    if aws ecr describe-repositories \
        --repository-names "$ECR_REPOSITORY" \
        --region "$AWS_REGION" \
        --output text > /dev/null 2>&1; then
        print_info "ECR repository exists: $ECR_REPOSITORY"
    else
        print_warn "ECR repository does not exist. Creating..."
        aws ecr create-repository \
            --repository-name "$ECR_REPOSITORY" \
            --region "$AWS_REGION" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256 \
            --output json > /dev/null
        
        if [ $? -eq 0 ]; then
            print_info "ECR repository created: $ECR_REPOSITORY"
        else
            print_error "Failed to create ECR repository"
            exit 1
        fi
    fi
}

# Function to login to ECR
ecr_login() {
    print_step "Logging in to ECR..."
    
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin \
        "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    
    if [ $? -eq 0 ]; then
        print_info "Successfully logged in to ECR"
    else
        print_error "Failed to login to ECR"
        exit 1
    fi
}

# Function to build Docker image
build_docker_image() {
    print_step "Building Docker image..."
    
    cd "$PROJECT_ROOT"
    
    # Determine image tags
    local local_tag="${ECR_REPOSITORY}:${IMAGE_TAG}"
    local tags=("$local_tag")
    
    # Add build number tag if provided
    if [ -n "$BUILD_NUMBER" ]; then
        local build_tag="${ECR_REPOSITORY}:${IMAGE_TAG}-build.${BUILD_NUMBER}"
        tags+=("$build_tag")
    fi
    
    # Add ECR tags if pushing
    if [ "$PUSH_TO_ECR" = true ]; then
        local ecr_uri="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        for tag in "${tags[@]}"; do
            tags+=("${ecr_uri}/${tag}")
        done
    fi
    
    # Build tag arguments
    local tag_args=""
    for tag in "${tags[@]}"; do
        tag_args="$tag_args -t $tag"
    done
    
    # Build cache argument
    local cache_arg=""
    if [ "$NO_CACHE" = true ]; then
        cache_arg="--no-cache"
    fi
    
    print_info "Building with tags: ${tags[*]}"
    print_info "Platform: $PLATFORM"
    
    # Build the image
    docker build \
        $cache_arg \
        --platform "$PLATFORM" \
        $tag_args \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg VERSION="$IMAGE_TAG" \
        --build-arg BUILD_NUMBER="$BUILD_NUMBER" \
        .
    
    if [ $? -eq 0 ]; then
        print_info "Docker image built successfully"
        
        # Display image info
        print_info "Image details:"
        docker images --filter "reference=${ECR_REPOSITORY}:${IMAGE_TAG}" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    else
        print_error "Docker build failed"
        exit 1
    fi
}

# Function to push image to ECR
push_to_ecr() {
    print_step "Pushing image to ECR..."
    
    local ecr_uri="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    local image_uri="${ecr_uri}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    
    print_info "Pushing: $image_uri"
    docker push "$image_uri"
    
    if [ $? -eq 0 ]; then
        print_info "Successfully pushed: $image_uri"
    else
        print_error "Failed to push image to ECR"
        exit 1
    fi
    
    # Push build number tag if exists
    if [ -n "$BUILD_NUMBER" ]; then
        local build_image_uri="${ecr_uri}/${ECR_REPOSITORY}:${IMAGE_TAG}-build.${BUILD_NUMBER}"
        print_info "Pushing: $build_image_uri"
        docker push "$build_image_uri"
        
        if [ $? -eq 0 ]; then
            print_info "Successfully pushed: $build_image_uri"
        else
            print_warn "Failed to push build number tag"
        fi
    fi
}

# Function to display summary
display_summary() {
    echo ""
    print_info "=========================================="
    print_info "Build Summary"
    print_info "=========================================="
    print_info "Image Tag: $IMAGE_TAG"
    if [ -n "$BUILD_NUMBER" ]; then
        print_info "Build Number: $BUILD_NUMBER"
    fi
    print_info "Platform: $PLATFORM"
    print_info "No Cache: $NO_CACHE"
    
    if [ "$PUSH_TO_ECR" = true ]; then
        print_info "Pushed to ECR: Yes"
        print_info "ECR Repository: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"
        print_info "Image URI: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"
    else
        print_info "Pushed to ECR: No"
        print_info "Local Image: ${ECR_REPOSITORY}:${IMAGE_TAG}"
    fi
    print_info "=========================================="
}

# Main execution
main() {
    print_info "Starting Docker build process"
    print_info "Region: $AWS_REGION"
    print_info "Image Tag: $IMAGE_TAG"
    if [ -n "$BUILD_NUMBER" ]; then
        print_info "Build Number: $BUILD_NUMBER"
    fi
    print_info "Push to ECR: $PUSH_TO_ECR"
    print_info "No Cache: $NO_CACHE"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Get AWS account ID if pushing to ECR
    get_account_id
    
    # Build TypeScript code
    build_typescript
    
    # Create ECR repository if pushing
    if [ "$PUSH_TO_ECR" = true ]; then
        create_ecr_repository
        ecr_login
    fi
    
    # Build Docker image
    build_docker_image
    
    # Push to ECR if requested
    if [ "$PUSH_TO_ECR" = true ]; then
        push_to_ecr
    fi
    
    # Display summary
    display_summary
    
    print_info "Build process completed successfully!"
}

# Run main function
main
