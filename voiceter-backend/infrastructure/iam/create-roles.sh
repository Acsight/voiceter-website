#!/bin/bash

# Script to create IAM roles for Voiceter Backend ECS tasks
# Usage: ./create-roles.sh [AWS_ACCOUNT_ID]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get AWS account ID
if [ -z "$1" ]; then
  echo -e "${YELLOW}No account ID provided, fetching from AWS...${NC}"
  AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
else
  AWS_ACCOUNT_ID=$1
fi

echo -e "${GREEN}Using AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Role names
TASK_ROLE_NAME="voiceterBackendTaskRole"
EXECUTION_ROLE_NAME="voiceterBackendTaskExecutionRole"

echo ""
echo "=========================================="
echo "Creating IAM Roles for Voiceter Backend"
echo "=========================================="
echo ""

# Function to check if role exists
role_exists() {
  aws iam get-role --role-name "$1" &>/dev/null
}

# Create Task Role
echo -e "${YELLOW}Creating Task Role: ${TASK_ROLE_NAME}${NC}"

if role_exists "$TASK_ROLE_NAME"; then
  echo -e "${YELLOW}Role ${TASK_ROLE_NAME} already exists, updating policy...${NC}"
  
  # Update the policy
  aws iam put-role-policy \
    --role-name "$TASK_ROLE_NAME" \
    --policy-name voiceterBackendTaskPolicy \
    --policy-document "file://${SCRIPT_DIR}/task-role.json"
  
  echo -e "${GREEN}✓ Task role policy updated${NC}"
else
  # Create the role
  aws iam create-role \
    --role-name "$TASK_ROLE_NAME" \
    --assume-role-policy-document "file://${SCRIPT_DIR}/task-role-trust-policy.json" \
    --description "Task role for Voiceter Backend ECS tasks" \
    --tags Key=Project,Value=Voiceter Key=Component,Value=Backend Key=Environment,Value=Production
  
  echo -e "${GREEN}✓ Task role created${NC}"
  
  # Attach the policy
  aws iam put-role-policy \
    --role-name "$TASK_ROLE_NAME" \
    --policy-name voiceterBackendTaskPolicy \
    --policy-document "file://${SCRIPT_DIR}/task-role.json"
  
  echo -e "${GREEN}✓ Task role policy attached${NC}"
fi

# Get task role ARN
TASK_ROLE_ARN=$(aws iam get-role --role-name "$TASK_ROLE_NAME" --query 'Role.Arn' --output text)
echo -e "${GREEN}Task Role ARN: ${TASK_ROLE_ARN}${NC}"

echo ""

# Create Task Execution Role
echo -e "${YELLOW}Creating Task Execution Role: ${EXECUTION_ROLE_NAME}${NC}"

if role_exists "$EXECUTION_ROLE_NAME"; then
  echo -e "${YELLOW}Role ${EXECUTION_ROLE_NAME} already exists, updating policy...${NC}"
  
  # Update the policy
  aws iam put-role-policy \
    --role-name "$EXECUTION_ROLE_NAME" \
    --policy-name voiceterBackendTaskExecutionPolicy \
    --policy-document "file://${SCRIPT_DIR}/task-execution-role.json"
  
  echo -e "${GREEN}✓ Task execution role policy updated${NC}"
else
  # Create the role
  aws iam create-role \
    --role-name "$EXECUTION_ROLE_NAME" \
    --assume-role-policy-document "file://${SCRIPT_DIR}/task-execution-role-trust-policy.json" \
    --description "Task execution role for Voiceter Backend ECS tasks" \
    --tags Key=Project,Value=Voiceter Key=Component,Value=Backend Key=Environment,Value=Production
  
  echo -e "${GREEN}✓ Task execution role created${NC}"
  
  # Attach the policy
  aws iam put-role-policy \
    --role-name "$EXECUTION_ROLE_NAME" \
    --policy-name voiceterBackendTaskExecutionPolicy \
    --policy-document "file://${SCRIPT_DIR}/task-execution-role.json"
  
  echo -e "${GREEN}✓ Task execution role policy attached${NC}"
fi

# Get execution role ARN
EXECUTION_ROLE_ARN=$(aws iam get-role --role-name "$EXECUTION_ROLE_NAME" --query 'Role.Arn' --output text)
echo -e "${GREEN}Task Execution Role ARN: ${EXECUTION_ROLE_ARN}${NC}"

echo ""
echo "=========================================="
echo "IAM Roles Created Successfully!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Update your ECS task definition with these ARNs:"
echo "   - taskRoleArn: ${TASK_ROLE_ARN}"
echo "   - executionRoleArn: ${EXECUTION_ROLE_ARN}"
echo ""
echo "2. Update infrastructure/ecs/task-definition.json:"
echo "   sed -i 's|\"taskRoleArn\": \".*\"|\"taskRoleArn\": \"${TASK_ROLE_ARN}\"|' ../ecs/task-definition.json"
echo "   sed -i 's|\"executionRoleArn\": \".*\"|\"executionRoleArn\": \"${EXECUTION_ROLE_ARN}\"|' ../ecs/task-definition.json"
echo ""
echo "3. Deploy your ECS task definition:"
echo "   cd ../ecs && ./deploy-task-definition.sh"
echo ""
