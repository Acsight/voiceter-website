# Load Testing for Voiceter Backend

This directory contains Artillery load test configurations for the Voiceter backend BiDirectional API integration.

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Ensure the backend server is running:
```bash
npm run dev
# or
npm start
```

3. Ensure AWS credentials are configured and Bedrock access is available.

## Load Test Scenarios

### 1. Concurrent Sessions Test (`concurrent-sessions.yml`)

**Purpose**: Test the system's ability to handle multiple concurrent demo sessions.

**Test Profile**:
- Warm-up: 5 users over 30 seconds
- Ramp-up: Gradually increase to 50 concurrent sessions over 2 minutes
- Peak load: Maintain 50 concurrent sessions for 3 minutes
- Ramp-down: Gradually decrease over 1 minute

**What it tests**:
- Session isolation
- Connection pooling
- HTTP/2 stream management
- Memory usage under load
- Concurrent Bedrock API calls

**Performance Targets**:
- Error rate: < 1%
- P95 latency: < 300ms
- P99 latency: < 500ms

**Run**:
```bash
npm run load:concurrent
```

### 2. Audio Streaming Test (`audio-streaming.yml`)

**Purpose**: Test continuous audio streaming for extended periods.

**Test Profile**:
- Duration: 5 minutes continuous streaming
- Arrival rate: 10 new sessions per second
- Audio chunks: Simulated 16kHz, 16-bit PCM audio
- Chunk rate: ~32ms per chunk (realistic audio streaming)

**What it tests**:
- Audio buffer management
- Audio queue size limits
- Sustained audio streaming
- Memory leaks in audio processing
- Bedrock audio streaming stability

**Performance Targets**:
- Error rate: < 1%
- P95 latency: < 300ms for audio chunks
- P99 latency: < 500ms

**Run**:
```bash
npm run load:audio
```

### 3. Tool Execution Test (`tool-execution.yml`)

**Purpose**: Test high-frequency tool execution (record_response, get_next_question, validate_answer).

**Test Profile**:
- Warm-up: 5 users over 30 seconds
- High-frequency: 20 new sessions per second for 3 minutes
- Tool calls: 10 question-answer cycles per session
- Total tool calls: ~6000 over 3 minutes

**What it tests**:
- Tool executor performance
- Database write throughput
- Questionnaire engine performance
- Tool result formatting
- Error handling in tool execution

**Performance Targets**:
- Error rate: < 1%
- P95 latency: < 500ms for tool execution
- P99 latency: < 1000ms

**Run**:
```bash
npm run load:tools
```

## Running All Tests

To run all load tests sequentially:

```bash
npm run load:all
```

## Interpreting Results

Artillery will output detailed metrics including:

### Key Metrics to Monitor

1. **Request Rate**: Requests per second
2. **Response Time**: 
   - min: Minimum response time
   - max: Maximum response time
   - median: 50th percentile
   - p95: 95th percentile (target: < 300ms)
   - p99: 99th percentile (target: < 500ms)
3. **Error Rate**: Percentage of failed requests (target: < 1%)
4. **Scenarios Completed**: Number of successful test scenarios
5. **Scenarios Failed**: Number of failed test scenarios

### Example Output

```
Summary report @ 14:30:00(+0000)
  Scenarios launched:  1000
  Scenarios completed: 985
  Requests completed:  15000
  Mean response/sec: 50
  Response time (msec):
    min: 45
    max: 890
    median: 180
    p95: 285
    p99: 450
  Scenario counts:
    Concurrent Session Load Test: 1000 (100%)
  Codes:
    200: 14850
    500: 150
  Errors:
    ECONNREFUSED: 15
```

## Monitoring During Load Tests

### CloudWatch Metrics

Monitor these CloudWatch metrics during load tests:

1. **ConcurrentSessions**: Should reach 50 during peak load
2. **WebSocketConnections**: Should match concurrent sessions
3. **BedrockLatency**: Should stay < 200ms
4. **DatabaseLatency**: Should stay < 100ms
5. **ErrorRate**: Should stay < 1%
6. **AudioChunksProcessed**: Should increase steadily

### Application Logs

Monitor application logs for:
- Error patterns
- Memory warnings
- Connection failures
- Timeout errors
- Database throttling

### System Metrics

Monitor system resources:
- CPU usage (should stay < 70%)
- Memory usage (should stay < 80%)
- Network throughput
- Open file descriptors
- Active connections

## Troubleshooting

### High Error Rate

If error rate exceeds 1%:
1. Check CloudWatch logs for error patterns
2. Verify Bedrock API quotas and limits
3. Check DynamoDB capacity and throttling
4. Verify network connectivity
5. Check for memory leaks

### High Latency

If P95 latency exceeds 300ms:
1. Check Bedrock API latency
2. Check database query performance
3. Check network latency
4. Enable X-Ray tracing for detailed analysis
5. Review audio buffer sizes

### Connection Failures

If connections fail:
1. Check WebSocket connection limits
2. Verify HTTP/2 configuration
3. Check load balancer settings
4. Verify firewall rules
5. Check for port exhaustion

### Memory Issues

If memory usage is high:
1. Check for unclosed connections
2. Review session cleanup logic
3. Check audio buffer sizes
4. Monitor for memory leaks
5. Review event queue sizes

## Customizing Tests

### Adjusting Load Levels

Edit the `phases` section in each YAML file:

```yaml
phases:
  - duration: 60        # Duration in seconds
    arrivalRate: 10     # New users per second
    rampTo: 50          # Ramp to this rate
    name: "Custom phase"
```

### Changing Target Server

Edit the `target` in the config section:

```yaml
config:
  target: "https://your-server.com"
```

### Adjusting Performance Thresholds

Edit the `ensure` section:

```yaml
ensure:
  maxErrorRate: 1   # Max error rate percentage
  p95: 300          # P95 latency in ms
  p99: 500          # P99 latency in ms
```

## Best Practices

1. **Start Small**: Begin with lower load and gradually increase
2. **Monitor Continuously**: Watch metrics during tests
3. **Test in Staging**: Run load tests in staging environment first
4. **Baseline First**: Establish baseline performance before optimization
5. **Isolate Variables**: Test one aspect at a time
6. **Document Results**: Keep records of test results and configurations
7. **Test Regularly**: Run load tests as part of CI/CD pipeline

## Requirements Validation

These load tests validate **Requirement 11.2**:
- WHEN 50 concurrent sessions are active THEN the system SHALL maintain sub-300ms latency for all sessions

## Additional Resources

- [Artillery Documentation](https://www.artillery.io/docs)
- [WebSocket Load Testing Guide](https://www.artillery.io/docs/guides/guides/socketio-reference)
- [Performance Testing Best Practices](https://www.artillery.io/docs/guides/guides/test-script-reference)
