# Voiceter Backend Deployment Script (PowerShell)
# This script deploys the Voiceter backend infrastructure to AWS

$ErrorActionPreference = "Stop"

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

# Check if required tools are installed
function Check-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        Write-Error "AWS CLI is not installed. Please install it first."
        exit 1
    }
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js is not installed. Please install it first."
        exit 1
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "npm is not installed. Please install it first."
        exit 1
    }
    
    if (-not (Get-Command cdk -ErrorAction SilentlyContinue)) {
        Write-Error "AWS CDK CLI is not installed. Please install it with: npm install -g aws-cdk"
        exit 1
    }
    
    Write-Info "All prerequisites are installed."
}

# Check AWS credentials
function Check-AwsCredentials {
    Write-Info "Checking AWS credentials..."
    
    try {
        $accountId = aws sts get-caller-identity --query Account --output text
        Write-Info "Using AWS Account: $accountId"
    }
    catch {
        Write-Error "AWS credentials are not configured. Please run 'aws configure'."
        exit 1
    }
}

# Get configuration
function Get-Configuration {
    Write-Info "Getting configuration..."
    
    # Environment name
    if (-not $env:ENVIRONMENT_NAME) {
        $env:ENVIRONMENT_NAME = Read-Host "Enter environment name (dev/staging/prod) [dev]"
        if ([string]::IsNullOrEmpty($env:ENVIRONMENT_NAME)) {
            $env:ENVIRONMENT_NAME = "dev"
        }
    }
    
    # AWS region
    if (-not $env:AWS_REGION) {
        $env:AWS_REGION = Read-Host "Enter AWS region [us-east-1]"
        if ([string]::IsNullOrEmpty($env:AWS_REGION)) {
            $env:AWS_REGION = "us-east-1"
        }
    }
    
    # Certificate ARN (optional)
    if (-not $env:CERTIFICATE_ARN) {
        $env:CERTIFICATE_ARN = Read-Host "Enter SSL certificate ARN (optional, press Enter to skip)"
    }
    
    # Alarm email (optional)
    if (-not $env:ALARM_EMAIL) {
        $env:ALARM_EMAIL = Read-Host "Enter email for CloudWatch alarms (optional, press Enter to skip)"
    }
    
    # Image tag
    if (-not $env:IMAGE_TAG) {
        $env:IMAGE_TAG = Read-Host "Enter Docker image tag [latest]"
        if ([string]::IsNullOrEmpty($env:IMAGE_TAG)) {
            $env:IMAGE_TAG = "latest"
        }
    }
    
    Write-Info "Configuration:"
    Write-Info "  Environment: $env:ENVIRONMENT_NAME"
    Write-Info "  Region: $env:AWS_REGION"
    Write-Info "  Certificate ARN: $(if ($env:CERTIFICATE_ARN) { $env:CERTIFICATE_ARN } else { 'Not provided' })"
    Write-Info "  Alarm Email: $(if ($env:ALARM_EMAIL) { $env:ALARM_EMAIL } else { 'Not provided' })"
    Write-Info "  Image Tag: $env:IMAGE_TAG"
}

# Bootstrap CDK
function Bootstrap-Cdk {
    Write-Info "Checking if CDK is bootstrapped..."
    
    $accountId = aws sts get-caller-identity --query Account --output text
    
    # Check if bootstrap stack exists
    try {
        aws cloudformation describe-stacks --stack-name CDKToolkit --region $env:AWS_REGION 2>&1 | Out-Null
        Write-Info "CDK is already bootstrapped."
    }
    catch {
        Write-Warn "CDK is not bootstrapped in this account/region."
        $bootstrap = Read-Host "Do you want to bootstrap CDK now? (y/n) [y]"
        if ([string]::IsNullOrEmpty($bootstrap)) {
            $bootstrap = "y"
        }
        
        if ($bootstrap -eq "y") {
            Write-Info "Bootstrapping CDK..."
            cdk bootstrap "aws://$accountId/$env:AWS_REGION"
        }
        else {
            Write-Error "CDK bootstrap is required. Exiting."
            exit 1
        }
    }
}

# Install dependencies
function Install-Dependencies {
    Write-Info "Installing dependencies..."
    npm install
}

# Build CDK app
function Build-Cdk {
    Write-Info "Building CDK app..."
    npm run build
}

# Show diff
function Show-Diff {
    Write-Info "Showing changes to be deployed..."
    
    $cdkArgs = @(
        "--context", "environmentName=$env:ENVIRONMENT_NAME",
        "--context", "region=$env:AWS_REGION"
    )
    
    if ($env:CERTIFICATE_ARN) {
        $cdkArgs += "--context", "certificateArn=$env:CERTIFICATE_ARN"
    }
    
    if ($env:ALARM_EMAIL) {
        $cdkArgs += "--context", "alarmEmail=$env:ALARM_EMAIL"
    }
    
    if ($env:IMAGE_TAG) {
        $cdkArgs += "--context", "imageTag=$env:IMAGE_TAG"
    }
    
    cdk diff --all @cdkArgs
}

# Deploy stacks
function Deploy-Stacks {
    Write-Info "Deploying stacks..."
    
    $cdkArgs = @(
        "--context", "environmentName=$env:ENVIRONMENT_NAME",
        "--context", "region=$env:AWS_REGION"
    )
    
    if ($env:CERTIFICATE_ARN) {
        $cdkArgs += "--context", "certificateArn=$env:CERTIFICATE_ARN"
    }
    
    if ($env:ALARM_EMAIL) {
        $cdkArgs += "--context", "alarmEmail=$env:ALARM_EMAIL"
    }
    
    if ($env:IMAGE_TAG) {
        $cdkArgs += "--context", "imageTag=$env:IMAGE_TAG"
    }
    
    $proceed = Read-Host "Do you want to proceed with deployment? (y/n) [y]"
    if ([string]::IsNullOrEmpty($proceed)) {
        $proceed = "y"
    }
    
    if ($proceed -ne "y") {
        Write-Warn "Deployment cancelled."
        exit 0
    }
    
    Write-Info "Starting deployment..."
    cdk deploy --all --require-approval never @cdkArgs
}

# Get outputs
function Get-Outputs {
    Write-Info "Getting deployment outputs..."
    
    try {
        $albDns = aws cloudformation describe-stacks `
            --stack-name "$env:ENVIRONMENT_NAME-VoiceterAlbStack" `
            --region $env:AWS_REGION `
            --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' `
            --output text 2>$null
    }
    catch {
        $albDns = "Not available"
    }
    
    try {
        $serviceUrl = aws cloudformation describe-stacks `
            --stack-name "$env:ENVIRONMENT_NAME-VoiceterAlbStack" `
            --region $env:AWS_REGION `
            --query 'Stacks[0].Outputs[?OutputKey==`ServiceUrl`].OutputValue' `
            --output text 2>$null
    }
    catch {
        $serviceUrl = "Not available"
    }
    
    try {
        $dashboardUrl = aws cloudformation describe-stacks `
            --stack-name "$env:ENVIRONMENT_NAME-VoiceterCloudWatchStack" `
            --region $env:AWS_REGION `
            --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' `
            --output text 2>$null
    }
    catch {
        $dashboardUrl = "Not available"
    }
    
    Write-Info ""
    Write-Info "=========================================="
    Write-Info "Deployment Complete!"
    Write-Info "=========================================="
    Write-Info ""
    Write-Info "Service URL: $serviceUrl"
    Write-Info "Load Balancer DNS: $albDns"
    Write-Info "Dashboard URL: $dashboardUrl"
    Write-Info ""
}

# Main execution
Write-Info "Starting Voiceter Backend Deployment"
Write-Info ""

Check-Prerequisites
Check-AwsCredentials
Get-Configuration
Bootstrap-Cdk
Install-Dependencies
Build-Cdk
Show-Diff
Deploy-Stacks
Get-Outputs

Write-Info ""
Write-Info "Deployment script completed successfully!"
