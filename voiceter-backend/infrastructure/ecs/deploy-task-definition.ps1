# Deploy ECS Task Definition Script (PowerShell)
# This script registers a new task definition revision and optionally updates the ECS service

param(
    [string]$Region = $env:AWS_REGION ?? "us-east-1",
    [string]$ImageTag = $env:IMAGE_TAG ?? "latest",
    [string]$ClusterName = $env:CLUSTER_NAME ?? "voiceter-cluster",
    [string]$ServiceName = $env:SERVICE_NAME ?? "voiceter-backend",
    [switch]$UpdateService,
    [switch]$Help
)

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskDefFile = Join-Path $ScriptDir "task-definition.json"
$EcrRepository = "voiceter-backend"

# Function to print colored output
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to display usage
function Show-Usage {
    Write-Host @"
Usage: .\deploy-task-definition.ps1 [OPTIONS]

Deploy ECS Task Definition for Voiceter Backend

OPTIONS:
    -Region REGION             AWS region (default: us-east-1)
    -ImageTag TAG             Docker image tag (default: latest)
    -ClusterName CLUSTER      ECS cluster name (default: voiceter-cluster)
    -ServiceName SERVICE      ECS service name (default: voiceter-backend)
    -UpdateService            Update ECS service after registering task definition
    -Help                     Display this help message

EXAMPLES:
    # Register task definition only
    .\deploy-task-definition.ps1

    # Register and update service
    .\deploy-task-definition.ps1 -UpdateService

    # Use specific image tag
    .\deploy-task-definition.ps1 -ImageTag v1.2.3 -UpdateService

    # Deploy to different region
    .\deploy-task-definition.ps1 -Region us-west-2 -UpdateService

ENVIRONMENT VARIABLES:
    AWS_REGION                 AWS region (can also use -Region)
    IMAGE_TAG                  Docker image tag (can also use -ImageTag)
    CLUSTER_NAME              ECS cluster name (can also use -ClusterName)
    SERVICE_NAME              ECS service name (can also use -ServiceName)

"@
}

# Show help if requested
if ($Help) {
    Show-Usage
    exit 0
}

# Function to get AWS account ID
function Get-AwsAccountId {
    try {
        $accountId = aws sts get-caller-identity --query Account --output text
        if ([string]::IsNullOrEmpty($accountId)) {
            Write-Error "Failed to get AWS account ID"
            exit 1
        }
        Write-Info "AWS Account ID: $accountId"
        return $accountId
    }
    catch {
        Write-Error "Failed to get AWS account ID: $_"
        exit 1
    }
}

# Function to check if ECR image exists
function Test-EcrImage {
    param(
        [string]$Repository,
        [string]$Tag,
        [string]$Region
    )
    
    Write-Info "Checking if ECR image exists: ${Repository}:${Tag}"
    
    try {
        $result = aws ecr describe-images `
            --repository-name $Repository `
            --image-ids imageTag=$Tag `
            --region $Region `
            --output text 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Info "ECR image found"
            return $true
        }
        else {
            Write-Warn "ECR image not found: ${Repository}:${Tag}"
            return $false
        }
    }
    catch {
        Write-Warn "ECR image not found: ${Repository}:${Tag}"
        return $false
    }
}

# Function to prepare task definition
function Update-TaskDefinition {
    param(
        [string]$FilePath,
        [string]$AccountId,
        [string]$Region,
        [string]$Repository,
        [string]$Tag
    )
    
    Write-Info "Preparing task definition..."
    
    # Read the task definition
    $taskDef = Get-Content $FilePath -Raw | ConvertFrom-Json
    
    # Update image URI
    $imageUri = "${AccountId}.dkr.ecr.${Region}.amazonaws.com/${Repository}:${Tag}"
    $taskDef.containerDefinitions[0].image = $imageUri
    
    # Update IAM role ARNs
    $executionRole = "arn:aws:iam::${AccountId}:role/voiceter-backend-execution-role"
    $taskRole = "arn:aws:iam::${AccountId}:role/voiceter-backend-task-role"
    $taskDef.executionRoleArn = $executionRole
    $taskDef.taskRoleArn = $taskRole
    
    # Update CloudWatch log group region
    $taskDef.containerDefinitions[0].logConfiguration.options.'awslogs-region' = $Region
    
    # Update environment variable for AWS_REGION
    $regionEnv = $taskDef.containerDefinitions[0].environment | Where-Object { $_.name -eq "AWS_REGION" }
    if ($regionEnv) {
        $regionEnv.value = $Region
    }
    
    Write-Info "Task definition prepared with:"
    Write-Info "  Image: $imageUri"
    Write-Info "  Execution Role: $executionRole"
    Write-Info "  Task Role: $taskRole"
    
    # Save to temporary file
    $tempFile = [System.IO.Path]::GetTempFileName()
    $taskDef | ConvertTo-Json -Depth 10 | Set-Content $tempFile
    
    return $tempFile
}

# Function to register task definition
function Register-TaskDefinition {
    param([string]$FilePath)
    
    Write-Info "Registering task definition..."
    
    try {
        $result = aws ecs register-task-definition `
            --cli-input-json "file://$FilePath" `
            --region $Region `
            --output json | ConvertFrom-Json
        
        $revision = $result.taskDefinition.revision
        Write-Info "Task definition registered successfully: voiceter-backend:${revision}"
        return $revision
    }
    catch {
        Write-Error "Failed to register task definition: $_"
        exit 1
    }
}

# Function to update ECS service
function Update-EcsService {
    param(
        [string]$Cluster,
        [string]$Service,
        [int]$Revision,
        [string]$Region
    )
    
    Write-Info "Updating ECS service: $Service"
    
    try {
        aws ecs update-service `
            --cluster $Cluster `
            --service $Service `
            --task-definition "voiceter-backend:${Revision}" `
            --force-new-deployment `
            --region $Region `
            --output json | Out-Null
        
        Write-Info "Service update initiated successfully"
        Write-Info "Waiting for service to stabilize..."
        
        aws ecs wait services-stable `
            --cluster $Cluster `
            --services $Service `
            --region $Region
        
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Service is stable"
        }
        else {
            Write-Warn "Service stabilization timed out. Check ECS console for status."
        }
    }
    catch {
        Write-Error "Failed to update service: $_"
        exit 1
    }
}

# Main execution
function Main {
    Write-Info "Starting ECS task definition deployment"
    Write-Info "Region: $Region"
    Write-Info "Image Tag: $ImageTag"
    Write-Info "Cluster: $ClusterName"
    Write-Info "Service: $ServiceName"
    Write-Info "Update Service: $UpdateService"
    Write-Host ""
    
    # Get AWS account ID
    $accountId = Get-AwsAccountId
    
    # Check if ECR image exists
    $imageExists = Test-EcrImage -Repository $EcrRepository -Tag $ImageTag -Region $Region
    if (-not $imageExists) {
        Write-Warn "ECR image not found. Make sure to build and push the image first."
        $response = Read-Host "Continue anyway? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Info "Deployment cancelled"
            exit 0
        }
    }
    
    # Prepare task definition
    $tempTaskDef = Update-TaskDefinition `
        -FilePath $TaskDefFile `
        -AccountId $accountId `
        -Region $Region `
        -Repository $EcrRepository `
        -Tag $ImageTag
    
    # Register task definition
    $revision = Register-TaskDefinition -FilePath $tempTaskDef
    
    # Clean up temporary file
    Remove-Item $tempTaskDef -Force
    
    # Update service if requested
    if ($UpdateService) {
        Update-EcsService `
            -Cluster $ClusterName `
            -Service $ServiceName `
            -Revision $revision `
            -Region $Region
    }
    else {
        Write-Info "Task definition registered but service not updated"
        Write-Info "To update the service, run:"
        Write-Info "  aws ecs update-service --cluster $ClusterName --service $ServiceName --task-definition voiceter-backend:${revision} --force-new-deployment --region $Region"
    }
    
    Write-Info "Deployment completed successfully!"
}

# Run main function
Main
