#!/bin/bash

# Run All Load Tests Script
# This script runs all Artillery load tests and generates a comprehensive report

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RESULTS_DIR="./results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_DIR="${RESULTS_DIR}/${TIMESTAMP}"

# Create results directory
mkdir -p "${REPORT_DIR}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Voiceter Backend Load Testing Suite${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Results will be saved to: ${REPORT_DIR}"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if ! curl -s http://localhost:8080/health > /dev/null; then
    echo -e "${RED}Error: Server is not running on http://localhost:8080${NC}"
    echo "Please start the server with: npm start"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Function to run a load test
run_test() {
    local test_name=$1
    local test_file=$2
    local output_file="${REPORT_DIR}/${test_name}.json"
    local html_file="${REPORT_DIR}/${test_name}.html"
    
    echo -e "${YELLOW}Running ${test_name}...${NC}"
    echo "Test file: ${test_file}"
    echo "Output: ${output_file}"
    echo ""
    
    # Run Artillery test
    if artillery run "${test_file}" --output "${output_file}"; then
        echo -e "${GREEN}✓ ${test_name} completed successfully${NC}"
        
        # Generate HTML report
        artillery report "${output_file}" --output "${html_file}"
        echo -e "${GREEN}✓ HTML report generated: ${html_file}${NC}"
    else
        echo -e "${RED}✗ ${test_name} failed${NC}"
        return 1
    fi
    
    echo ""
}

# Run all tests
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test 1: Concurrent Sessions${NC}"
echo -e "${GREEN}========================================${NC}"
run_test "concurrent-sessions" "./concurrent-sessions.yml"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test 2: Audio Streaming${NC}"
echo -e "${GREEN}========================================${NC}"
run_test "audio-streaming" "./audio-streaming.yml"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test 3: Tool Execution${NC}"
echo -e "${GREEN}========================================${NC}"
run_test "tool-execution" "./tool-execution.yml"

# Generate summary report
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Generating Summary Report${NC}"
echo -e "${GREEN}========================================${NC}"

SUMMARY_FILE="${REPORT_DIR}/summary.txt"

cat > "${SUMMARY_FILE}" << EOF
Voiceter Backend Load Test Summary
===================================
Date: $(date)
Results Directory: ${REPORT_DIR}

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
1. Review HTML reports in ${REPORT_DIR}
2. Check CloudWatch metrics for detailed analysis
3. Review application logs for errors
4. Compare results with baseline performance

EOF

echo -e "${GREEN}✓ Summary report generated: ${SUMMARY_FILE}${NC}"
echo ""

# Display summary
cat "${SUMMARY_FILE}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All Load Tests Completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Results saved to: ${REPORT_DIR}"
echo ""
echo "To view HTML reports, open:"
echo "  - ${REPORT_DIR}/concurrent-sessions.html"
echo "  - ${REPORT_DIR}/audio-streaming.html"
echo "  - ${REPORT_DIR}/tool-execution.html"
echo ""
