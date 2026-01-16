#!/usr/bin/env node

/**
 * Load Test Setup Verification Script
 * 
 * This script verifies that the environment is ready for load testing
 * and provides guidance on what needs to be done.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkMark(passed) {
  return passed ? '✅' : '❌';
}

async function checkServerHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8080/health', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          resolve({ success: true, data: health });
        } catch (e) {
          resolve({ success: false, error: 'Invalid response' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });
  });
}

function checkFileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (e) {
    return false;
  }
}

function checkArtilleryInstalled() {
  try {
    const packageJson = require('../package.json');
    return packageJson.devDependencies && packageJson.devDependencies.artillery;
  } catch (e) {
    return false;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  Load Test Setup Verification                             ║', 'cyan');
  log('║  Task 27: Run load tests and verify performance           ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  const checks = [];

  // Check 1: Artillery installed
  log('Checking Artillery installation...', 'blue');
  const artilleryInstalled = checkArtilleryInstalled();
  checks.push({ name: 'Artillery installed', passed: artilleryInstalled });
  log(`${checkMark(artilleryInstalled)} Artillery: ${artilleryInstalled ? 'Installed' : 'Not installed'}`, artilleryInstalled ? 'green' : 'red');

  // Check 2: Test configuration files
  log('\nChecking test configuration files...', 'blue');
  const testFiles = [
    'concurrent-sessions.yml',
    'audio-streaming.yml',
    'tool-execution.yml',
    'artillery.config.yml',
    'load-test-processor.js',
  ];

  let allFilesExist = true;
  for (const file of testFiles) {
    const exists = checkFileExists(path.join(__dirname, file));
    allFilesExist = allFilesExist && exists;
    log(`${checkMark(exists)} ${file}`, exists ? 'green' : 'red');
  }
  checks.push({ name: 'Test configuration files', passed: allFilesExist });

  // Check 3: Backend server running
  log('\nChecking backend server...', 'blue');
  const serverHealth = await checkServerHealth();
  checks.push({ name: 'Backend server running', passed: serverHealth.success });
  
  if (serverHealth.success) {
    log(`${checkMark(true)} Server is running`, 'green');
    log(`   Status: ${serverHealth.data.status}`, 'green');
    log(`   Active Sessions: ${serverHealth.data.activeSessions}`, 'green');
    log(`   Socket Connections: ${serverHealth.data.socketConnections}`, 'green');
  } else {
    log(`${checkMark(false)} Server is not running`, 'red');
    log(`   Error: ${serverHealth.error}`, 'red');
  }

  // Check 4: Environment variables
  log('\nChecking environment configuration...', 'blue');
  const envFile = path.join(__dirname, '..', '.env');
  const envExists = checkFileExists(envFile);
  checks.push({ name: 'Environment file exists', passed: envExists });
  log(`${checkMark(envExists)} .env file: ${envExists ? 'Found' : 'Not found'}`, envExists ? 'green' : 'red');

  // Check 5: Documentation
  log('\nChecking documentation...', 'blue');
  const docFiles = [
    'README.md',
    'QUICK_START.md',
    'LOAD_TEST_EXECUTION_GUIDE.md',
  ];

  let allDocsExist = true;
  for (const file of docFiles) {
    const exists = checkFileExists(path.join(__dirname, file));
    allDocsExist = allDocsExist && exists;
    log(`${checkMark(exists)} ${file}`, exists ? 'green' : 'red');
  }
  checks.push({ name: 'Documentation files', passed: allDocsExist });

  // Summary
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  Verification Summary                                      ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  const passedChecks = checks.filter(c => c.passed).length;
  const totalChecks = checks.length;

  for (const check of checks) {
    log(`${checkMark(check.passed)} ${check.name}`, check.passed ? 'green' : 'red');
  }

  log(`\nPassed: ${passedChecks}/${totalChecks}`, passedChecks === totalChecks ? 'green' : 'yellow');

  // Recommendations
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  Recommendations                                           ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  if (!artilleryInstalled) {
    log('⚠️  Install Artillery:', 'yellow');
    log('   npm install', 'yellow');
  }

  if (!serverHealth.success) {
    log('⚠️  Start the backend server:', 'yellow');
    log('   cd voiceter-backend', 'yellow');
    log('   npm start', 'yellow');
    log('', 'yellow');
    log('   Or for development:', 'yellow');
    log('   npm run dev', 'yellow');
  }

  if (!envExists) {
    log('⚠️  Create .env file:', 'yellow');
    log('   cp .env.example .env', 'yellow');
    log('   # Edit .env with your configuration', 'yellow');
  }

  // Next steps
  if (passedChecks === totalChecks) {
    log('\n✅ All checks passed! Ready to run load tests.', 'green');
    log('\nTo run load tests:', 'cyan');
    log('   npm run load:all          # Run all tests', 'cyan');
    log('   npm run load:concurrent   # Test concurrent sessions', 'cyan');
    log('   npm run load:audio        # Test audio streaming', 'cyan');
    log('   npm run load:tools        # Test tool execution', 'cyan');
    log('\nFor detailed instructions, see:', 'cyan');
    log('   load-tests/LOAD_TEST_EXECUTION_GUIDE.md', 'cyan');
  } else {
    log('\n⚠️  Some checks failed. Please address the issues above.', 'yellow');
    log('\nFor help, see:', 'cyan');
    log('   load-tests/QUICK_START.md', 'cyan');
    log('   load-tests/LOAD_TEST_EXECUTION_GUIDE.md', 'cyan');
  }

  // Performance targets reminder
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  Performance Targets (Requirement 11.2)                    ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');
  log('  • P95 Latency: < 300ms', 'cyan');
  log('  • Error Rate: < 1%', 'cyan');
  log('  • Memory Leaks: None', 'cyan');
  log('  • Session Completion: 100%', 'cyan');
  log('  • Concurrent Sessions: 50', 'cyan');
  log('');

  process.exit(passedChecks === totalChecks ? 0 : 1);
}

main().catch((error) => {
  log(`\n❌ Error: ${error.message}`, 'red');
  process.exit(1);
});
