# Run All Load Tests Script (PowerShell)
# This script runs all Artillery load tests and generates a comprehensive report

$ErrorActionPreference = "Stop"

# Configuration
$RESULTS_DIR = "./results"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$REPORT_DIR = "$RESULTS_DIR/$TIMESTAMP"

# Create results directory
New-Item -ItemType Directory -Force -Path $REPORT_DIR | Out-Null

Write-Host "========================================" -ForegroundColor Green
Write-Host "Voiceter Backend Load Testing Suite" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Results will be saved to: $REPORT_DIR"
Write-Host ""

# Check if server is running
Write-Host "Checking if server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "✓ Server is running" -ForegroundColor Green
} catch {
    Write-Host "Error: Server is not running on http://localhost:8080" -ForegroundColor Red
    Write-Host "Please start the server with: npm start"
    exit 1
}
Write-Host ""

# Function to run a load test
function Run-Test {
    param(
        [string]$TestName,
        [string]$TestFile
    )
    
    $outputFile = "$REPORT_DIR/$TestName.json"
    $htmlFile = "$REPORT_DIR/$TestName.html"
    
    Write-Host "Running $TestName..." -ForegroundColor Yellow
    Write-Host "Test file: $TestFile"
    Write-Host "Output: $outputFile"
    Write-Host ""
    
    # Run Artillery test
    try {
        artillery run $TestFile --output $outputFile
        Write-Host "✓ $TestName completed successfully" -ForegroundColor Green
        
        # Generate HTML report
        artillery report $outputFile --output $htmlFile
        Write-Host "✓ HTML report generated: $htmlFile" -ForegroundColor Green
    } catch {
        Write-Host "✗ $TestName failed" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return $false
    }
    
    Write-Host ""
    return $true
}

# Run all tests
Write-Host "========================================" -ForegroundColor Green
Write-Host "Test 1: Concurrent Sessions" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Run-Test -TestName "concurrent-sessions" -TestFile "./concurrent-sessions.yml"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Test 2: Audio Streaming" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Run-Test -TestName "audio-streaming" -TestFile "./audio-streaming.yml"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Test 3: Tool Execution" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Run-Test -TestName "tool-execution" -TestFile "./tool-execution.yml"

# Generate summary report
Write-Host "========================================" -ForegroundColor Green
Write-Host "Generating Summary Report" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$summaryFile = "$REPORT_DIR/summary.txt"
$currentDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$summaryContent = @"
Voiceter Backend Load Test Summary
===================================
Date: $currentDate
Results Directory: $REPORT_DIR

Test Results:
-------------

1. Concurrent Sessions Test
   - File: concurrent-sessions.json
   - HTML Report: concurrent-sessions.html

2. Audio Streaming Test
   - File: audio-streaming.json
   - HTML Report: audio-streaming.html

3. Tool Execution Test
   - File: tool-execution.json
   - HTML Report: tool-execution.html

Performance Targets:
-------------------
- Error Rate: < 1%
- P95 Latency: < 300ms
- P99 Latency: < 500ms
- Concurrent Sessions: 50

Next Steps:
-----------
1. Review HTML reports in $REPORT_DIR
2. Check CloudWatch metrics for detailed analysis
3. Review application logs for errors
4. Compare results with baseline performance

"@

$summaryContent | Out-File -FilePath $summaryFile -Encoding UTF8

Write-Host "✓ Summary report generated: $summaryFile" -ForegroundColor Green
Write-Host ""

# Display summary
Get-Content $summaryFile

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "All Load Tests Completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Results saved to: $REPORT_DIR"
Write-Host ""
Write-Host "To view HTML reports, open:"
Write-Host "  - $REPORT_DIR/concurrent-sessions.html"
Write-Host "  - $REPORT_DIR/audio-streaming.html"
Write-Host "  - $REPORT_DIR/tool-execution.html"
Write-Host ""
