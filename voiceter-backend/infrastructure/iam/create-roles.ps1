# Script to create IAM roles for Voiceter Backend ECS tasks
# Usage: .\create-roles.ps1 [AWS_ACCOUNT_ID]

param(
    [string]$AccountId
)

$ErrorActionPreference = "Stop"

# Get AWS account ID
if ([string]::IsNullOrEmpty($AccountId)) {
    Write-Host "No account ID provided, fetching from AWS..." -ForegroundColor Yellow
    $AccountId = (aws sts get-caller-identity --query Account --output text)
}

Write-Host "Using AWS Account ID: $AccountId" -ForegroundColor Green

# Get current directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Role names
$TaskRoleName = "voiceterBackendTaskRole"
$ExecutionRoleName = "voiceterBackendTaskExecutionRole"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Creating IAM Roles for Voiceter Backend" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if role exists
function Test-RoleExists {
    param([string]$RoleName)
    try {
        aws iam get-role --role-name $RoleName 2>$null | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Create Task Role
Write-Host "Creating Task Role: $TaskRoleName" -ForegroundColor Yellow

if (Test-RoleExists -RoleName $TaskRoleName) {
    Write-Host "Role $TaskRoleName already exists, updating policy..." -ForegroundColor Yellow
    
    # Update the policy
    aws iam put-role-policy `
        --role-name $TaskRoleName `
        --policy-name voiceterBackendTaskPolicy `
        --policy-document "file://$ScriptDir/task-role.json"
    
    Write-Host "✓ Task role policy updated" -ForegroundColor Green
} else {
    # Create the role
    aws iam create-role `
        --role-name $TaskRoleName `
        --assume-role-policy-document "file://$ScriptDir/task-role-trust-policy.json" `
        --description "Task role for Voiceter Backend ECS tasks" `
        --tags Key=Project,Value=Voiceter Key=Component,Value=Backend Key=Environment,Value=Production
    
    Write-Host "✓ Task role created" -ForegroundColor Green
    
    # Attach the policy
    aws iam put-role-policy `
        --role-name $TaskRoleName `
        --policy-name voiceterBackendTaskPolicy `
        --policy-document "file://$ScriptDir/task-role.json"
    
    Write-Host "✓ Task role policy attached" -ForegroundColor Green
}

# Get task role ARN
$TaskRoleArn = (aws iam get-role --role-name $TaskRoleName --query 'Role.Arn' --output text)
Write-Host "Task Role ARN: $TaskRoleArn" -ForegroundColor Green

Write-Host ""

# Create Task Execution Role
Write-Host "Creating Task Execution Role: $ExecutionRoleName" -ForegroundColor Yellow

if (Test-RoleExists -RoleName $ExecutionRoleName) {
    Write-Host "Role $ExecutionRoleName already exists, updating policy..." -ForegroundColor Yellow
    
    # Update the policy
    aws iam put-role-policy `
        --role-name $ExecutionRoleName `
        --policy-name voiceterBackendTaskExecutionPolicy `
        --policy-document "file://$ScriptDir/task-execution-role.json"
    
    Write-Host "✓ Task execution role policy updated" -ForegroundColor Green
} else {
    # Create the role
    aws iam create-role `
        --role-name $ExecutionRoleName `
        --assume-role-policy-document "file://$ScriptDir/task-execution-role-trust-policy.json" `
        --description "Task execution role for Voiceter Backend ECS tasks" `
        --tags Key=Project,Value=Voiceter Key=Component,Value=Backend Key=Environment,Value=Production
    
    Write-Host "✓ Task execution role created" -ForegroundColor Green
    
    # Attach the policy
    aws iam put-role-policy `
        --role-name $ExecutionRoleName `
        --policy-name voiceterBackendTaskExecutionPolicy `
        --policy-document "file://$ScriptDir/task-execution-role.json"
    
    Write-Host "✓ Task execution role policy attached" -ForegroundColor Green
}

# Get execution role ARN
$ExecutionRoleArn = (aws iam get-role --role-name $ExecutionRoleName --query 'Role.Arn' --output text)
Write-Host "Task Execution Role ARN: $ExecutionRoleArn" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "IAM Roles Created Successfully!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Update your ECS task definition with these ARNs:"
Write-Host "   - taskRoleArn: $TaskRoleArn"
Write-Host "   - executionRoleArn: $ExecutionRoleArn"
Write-Host ""
Write-Host "2. Update infrastructure/ecs/task-definition.json manually or run:"
Write-Host "   (Get-Content ../ecs/task-definition.json) -replace '\"taskRoleArn\": \".*\"', '\"taskRoleArn\": \"$TaskRoleArn\"' | Set-Content ../ecs/task-definition.json"
Write-Host "   (Get-Content ../ecs/task-definition.json) -replace '\"executionRoleArn\": \".*\"', '\"executionRoleArn\": \"$ExecutionRoleArn\"' | Set-Content ../ecs/task-definition.json"
Write-Host ""
Write-Host "3. Deploy your ECS task definition:"
Write-Host "   cd ../ecs; .\deploy-task-definition.ps1"
Write-Host ""
