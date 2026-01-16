/**
 * Artillery Load Test Processor
 * 
 * This file contains custom functions for load testing scenarios.
 * It provides utilities for generating test data, tracking metrics,
 * and implementing custom logic.
 */

const crypto = require('crypto');

/**
 * Generate a random base64-encoded audio chunk
 * Simulates PCM audio data at 16kHz, 16-bit, mono
 * 
 * @param {number} size - Size in bytes (default: 512 for ~32ms of audio)
 * @returns {string} Base64-encoded audio data
 */
function generateAudioChunk(size = 512) {
  const buffer = crypto.randomBytes(size);
  return buffer.toString('base64');
}

/**
 * Generate a random session ID
 * 
 * @returns {string} UUID v4 session ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Generate random survey response based on question type
 * 
 * @param {string} questionType - Type of question (rating, open_ended, multiple_choice, yes_no, nps)
 * @returns {string} Simulated response
 */
function generateResponse(questionType) {
  switch (questionType) {
    case 'rating':
      return String(Math.floor(Math.random() * 5) + 1); // 1-5
    case 'nps':
      return String(Math.floor(Math.random() * 11)); // 0-10
    case 'yes_no':
      return Math.random() > 0.5 ? 'Yes' : 'No';
    case 'multiple_choice':
      const options = ['Option A', 'Option B', 'Option C', 'Option D'];
      return options[Math.floor(Math.random() * options.length)];
    case 'open_ended':
      const responses = [
        'The product is excellent',
        'I had a great experience',
        'Could be better',
        'Very satisfied with the service',
        'The interface is intuitive'
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    default:
      return 'Test response';
  }
}

/**
 * Before request hook - called before each request
 * Used to set up context and generate test data
 */
function beforeRequest(requestParams, context, ee, next) {
  // Generate session ID if not exists
  if (!context.vars.sessionId) {
    context.vars.sessionId = generateSessionId();
  }
  
  // Generate audio chunk
  context.vars.audioChunk = generateAudioChunk();
  
  // Generate random response
  context.vars.randomResponse = generateResponse('open_ended');
  
  // Track start time for custom metrics
  context.vars.requestStartTime = Date.now();
  
  return next();
}

/**
 * After response hook - called after each response
 * Used to track custom metrics and validate responses
 */
function afterResponse(requestParams, response, context, ee, next) {
  // Calculate request duration
  const duration = Date.now() - context.vars.requestStartTime;
  
  // Emit custom metric for session duration
  ee.emit('customStat', {
    stat: 'session_duration',
    value: duration
  });
  
  // Track audio chunks sent
  if (requestParams.channel === 'audioInput') {
    ee.emit('counter', 'audio_chunks_sent', 1);
  }
  
  // Track tool executions
  if (requestParams.channel === 'toolUse') {
    ee.emit('counter', 'tool_executions', 1);
  }
  
  // Track errors by type
  if (response.error) {
    const errorType = response.error.code || 'UNKNOWN_ERROR';
    ee.emit('counter', `errors_by_type.${errorType}`, 1);
  }
  
  return next();
}

/**
 * Custom function to simulate realistic audio streaming
 * Generates audio chunks with realistic timing
 */
function streamAudio(context, events, done) {
  const chunkCount = context.vars.chunkCount || 100;
  const chunkInterval = context.vars.chunkInterval || 32; // 32ms
  
  let sentChunks = 0;
  
  const interval = setInterval(() => {
    if (sentChunks >= chunkCount) {
      clearInterval(interval);
      return done();
    }
    
    // Emit audio chunk
    events.emit('counter', 'audio_chunks_sent', 1);
    sentChunks++;
  }, chunkInterval);
}

/**
 * Custom function to simulate tool execution flow
 * Simulates the complete tool execution cycle
 */
function simulateToolExecution(context, events, done) {
  const tools = [
    'get_next_question',
    'validate_answer',
    'record_response',
    'get_demo_context'
  ];
  
  const randomTool = tools[Math.floor(Math.random() * tools.length)];
  
  // Track tool execution
  events.emit('counter', 'tool_executions', 1);
  events.emit('counter', `tool_executions.${randomTool}`, 1);
  
  // Simulate tool execution time (50-500ms)
  const executionTime = Math.floor(Math.random() * 450) + 50;
  
  setTimeout(() => {
    events.emit('histogram', 'tool_execution_time', executionTime);
    done();
  }, executionTime);
}

/**
 * Custom function to validate session state
 * Ensures session is in expected state
 */
function validateSessionState(context, events, done) {
  const expectedStates = ['active', 'ready', 'initializing'];
  const currentState = context.vars.sessionState || 'unknown';
  
  if (!expectedStates.includes(currentState)) {
    events.emit('counter', 'invalid_session_state', 1);
  }
  
  done();
}

/**
 * Custom function to simulate barge-in scenario
 * Tests interruption handling
 */
function simulateBargeIn(context, events, done) {
  // Send audio chunks
  const chunkCount = Math.floor(Math.random() * 20) + 10;
  
  for (let i = 0; i < chunkCount; i++) {
    events.emit('counter', 'audio_chunks_sent', 1);
  }
  
  // Simulate barge-in (interrupt)
  events.emit('counter', 'barge_in_events', 1);
  
  done();
}

/**
 * Custom function to track session lifecycle
 * Monitors session from start to completion
 */
function trackSessionLifecycle(context, events, done) {
  const sessionStart = context.vars.sessionStartTime || Date.now();
  const sessionDuration = Date.now() - sessionStart;
  
  events.emit('histogram', 'session_lifecycle_duration', sessionDuration);
  
  // Track session completion
  if (context.vars.sessionCompleted) {
    events.emit('counter', 'sessions_completed', 1);
  } else {
    events.emit('counter', 'sessions_incomplete', 1);
  }
  
  done();
}

// Export functions for Artillery
module.exports = {
  beforeRequest,
  afterResponse,
  streamAudio,
  simulateToolExecution,
  validateSessionState,
  simulateBargeIn,
  trackSessionLifecycle,
  generateAudioChunk,
  generateSessionId,
  generateResponse
};
