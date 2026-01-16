#!/bin/bash

# Validate ECS Task Definition Script
# This script validates the task definition JSON file

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_DEF_FILE="${SCRIPT_DIR}/task-definition.json"

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

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Function to check if jq is installed
check_jq() {
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed. Please install jq to validate the task definition."
        print_info "Install jq: https://stedolan.github.io/jq/download/"
        exit 1
    fi
}

# Function to validate JSON syntax
validate_json_syntax() {
    print_info "Validating JSON syntax..."
    
    if jq empty "$TASK_DEF_FILE" 2>/dev/null; then
        print_success "JSON syntax is valid"
        return 0
    else
        print_error "JSON syntax is invalid"
        jq empty "$TASK_DEF_FILE"
        return 1
    fi
}

# Function to validate required fields
validate_required_fields() {
    print_info "Validating required fields..."
    
    local errors=0
    
    # Check family
    local family=$(jq -r '.family' "$TASK_DEF_FILE")
    if [ "$family" = "null" ] || [ -z "$family" ]; then
        print_error "Missing required field: family"
        errors=$((errors + 1))
    else
        print_info "  ✓ family: $family"
    fi
    
    # Check networkMode
    local networkMode=$(jq -r '.networkMode' "$TASK_DEF_FILE")
    if [ "$networkMode" != "awsvpc" ]; then
        print_error "networkMode must be 'awsvpc' for Fargate"
        errors=$((errors + 1))
    else
        print_info "  ✓ networkMode: $networkMode"
    fi
    
    # Check requiresCompatibilities
    local compat=$(jq -r '.requiresCompatibilities[]' "$TASK_DEF_FILE")
    if [ "$compat" != "FARGATE" ]; then
        print_error "requiresCompatibilities must include 'FARGATE'"
        errors=$((errors + 1))
    else
        print_info "  ✓ requiresCompatibilities: $compat"
    fi
    
    # Check CPU
    local cpu=$(jq -r '.cpu' "$TASK_DEF_FILE")
    if [ "$cpu" != "1024" ]; then
        print_warn "CPU is set to $cpu (expected 1024 for 1 vCPU)"
    else
        print_info "  ✓ cpu: $cpu"
    fi
    
    # Check memory
    local memory=$(jq -r '.memory' "$TASK_DEF_FILE")
    if [ "$memory" != "2048" ]; then
        print_warn "Memory is set to $memory (expected 2048 for 2 GB)"
    else
        print_info "  ✓ memory: $memory"
    fi
    
    # Check executionRoleArn
    local execRole=$(jq -r '.executionRoleArn' "$TASK_DEF_FILE")
    if [ "$execRole" = "null" ] || [ -z "$execRole" ]; then
        print_error "Missing required field: executionRoleArn"
        errors=$((errors + 1))
    else
        print_info "  ✓ executionRoleArn: $execRole"
    fi
    
    # Check taskRoleArn
    local taskRole=$(jq -r '.taskRoleArn' "$TASK_DEF_FILE")
    if [ "$taskRole" = "null" ] || [ -z "$taskRole" ]; then
        print_error "Missing required field: taskRoleArn"
        errors=$((errors + 1))
    else
        print_info "  ✓ taskRoleArn: $taskRole"
    fi
    
    # Check containerDefinitions
    local containerCount=$(jq '.containerDefinitions | length' "$TASK_DEF_FILE")
    if [ "$containerCount" -eq 0 ]; then
        print_error "No container definitions found"
        errors=$((errors + 1))
    else
        print_info "  ✓ containerDefinitions: $containerCount container(s)"
    fi
    
    if [ $errors -gt 0 ]; then
        print_error "Found $errors error(s) in required fields"
        return 1
    else
        print_success "All required fields are valid"
        return 0
    fi
}

# Function to validate container definition
validate_container_definition() {
    print_info "Validating container definition..."
    
    local errors=0
    
    # Check container name
    local containerName=$(jq -r '.containerDefinitions[0].name' "$TASK_DEF_FILE")
    if [ "$containerName" = "null" ] || [ -z "$containerName" ]; then
        print_error "Missing container name"
        errors=$((errors + 1))
    else
        print_info "  ✓ container name: $containerName"
    fi
    
    # Check image
    local image=$(jq -r '.containerDefinitions[0].image' "$TASK_DEF_FILE")
    if [ "$image" = "null" ] || [ -z "$image" ]; then
        print_error "Missing container image"
        errors=$((errors + 1))
    else
        print_info "  ✓ image: $image"
    fi
    
    # Check port mappings
    local portCount=$(jq '.containerDefinitions[0].portMappings | length' "$TASK_DEF_FILE")
    if [ "$portCount" -eq 0 ]; then
        print_warn "No port mappings defined"
    else
        local port=$(jq -r '.containerDefinitions[0].portMappings[0].containerPort' "$TASK_DEF_FILE")
        print_info "  ✓ port mappings: $portCount (port $port)"
    fi
    
    # Check environment variables
    local envCount=$(jq '.containerDefinitions[0].environment | length' "$TASK_DEF_FILE")
    print_info "  ✓ environment variables: $envCount"
    
    # Check log configuration
    local logDriver=$(jq -r '.containerDefinitions[0].logConfiguration.logDriver' "$TASK_DEF_FILE")
    if [ "$logDriver" != "awslogs" ]; then
        print_warn "Log driver is not 'awslogs': $logDriver"
    else
        print_info "  ✓ log driver: $logDriver"
    fi
    
    # Check health check
    local healthCheck=$(jq -r '.containerDefinitions[0].healthCheck' "$TASK_DEF_FILE")
    if [ "$healthCheck" = "null" ]; then
        print_warn "No health check defined"
    else
        print_info "  ✓ health check: configured"
    fi
    
    if [ $errors -gt 0 ]; then
        print_error "Found $errors error(s) in container definition"
        return 1
    else
        print_success "Container definition is valid"
        return 0
    fi
}

# Function to validate environment variables
validate_environment_variables() {
    print_info "Validating environment variables..."
    
    local required_vars=(
        "NODE_ENV"
        "PORT"
        "AWS_REGION"
        "BEDROCK_MODEL_ID"
        "DYNAMODB_TABLE_PREFIX"
        "LOG_LEVEL"
    )
    
    local missing=0
    
    for var in "${required_vars[@]}"; do
        local value=$(jq -r ".containerDefinitions[0].environment[] | select(.name==\"$var\") | .value" "$TASK_DEF_FILE")
        if [ -z "$value" ] || [ "$value" = "null" ]; then
            print_error "Missing required environment variable: $var"
            missing=$((missing + 1))
        else
            print_info "  ✓ $var: $value"
        fi
    done
    
    if [ $missing -gt 0 ]; then
        print_error "Missing $missing required environment variable(s)"
        return 1
    else
        print_success "All required environment variables are present"
        return 0
    fi
}

# Function to check for placeholders
check_placeholders() {
    print_info "Checking for placeholders..."
    
    local placeholders=$(grep -o "ACCOUNT_ID\|REGION" "$TASK_DEF_FILE" || true)
    
    if [ -n "$placeholders" ]; then
        print_warn "Found placeholders in task definition:"
        echo "$placeholders" | sort | uniq | while read -r placeholder; do
            print_warn "  - $placeholder"
        done
        print_info "These will be replaced during deployment"
        return 0
    else
        print_success "No placeholders found"
        return 0
    fi
}

# Function to display summary
display_summary() {
    echo ""
    echo "=========================================="
    echo "Task Definition Summary"
    echo "=========================================="
    
    local family=$(jq -r '.family' "$TASK_DEF_FILE")
    local cpu=$(jq -r '.cpu' "$TASK_DEF_FILE")
    local memory=$(jq -r '.memory' "$TASK_DEF_FILE")
    local containerName=$(jq -r '.containerDefinitions[0].name' "$TASK_DEF_FILE")
    local image=$(jq -r '.containerDefinitions[0].image' "$TASK_DEF_FILE")
    local port=$(jq -r '.containerDefinitions[0].portMappings[0].containerPort' "$TASK_DEF_FILE")
    local envCount=$(jq '.containerDefinitions[0].environment | length' "$TASK_DEF_FILE")
    
    echo "Family: $family"
    echo "CPU: $cpu ($(($cpu / 1024)) vCPU)"
    echo "Memory: $memory MB ($(($memory / 1024)) GB)"
    echo "Container: $containerName"
    echo "Image: $image"
    echo "Port: $port"
    echo "Environment Variables: $envCount"
    echo "=========================================="
}

# Main execution
main() {
    print_info "Validating ECS task definition: $TASK_DEF_FILE"
    echo ""
    
    # Check if jq is installed
    check_jq
    
    # Validate JSON syntax
    if ! validate_json_syntax; then
        exit 1
    fi
    echo ""
    
    # Validate required fields
    if ! validate_required_fields; then
        exit 1
    fi
    echo ""
    
    # Validate container definition
    if ! validate_container_definition; then
        exit 1
    fi
    echo ""
    
    # Validate environment variables
    if ! validate_environment_variables; then
        exit 1
    fi
    echo ""
    
    # Check for placeholders
    check_placeholders
    echo ""
    
    # Display summary
    display_summary
    echo ""
    
    print_success "Task definition validation completed successfully!"
}

# Run main function
main
