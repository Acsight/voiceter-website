import express from 'express';
import { createServer } from 'http';
import { loadConfig } from './config';
import { createLogger } from '../monitoring/logger';
import { createMetricsEmitter } from '../monitoring/metrics';
import { WebSocketServer } from '../websocket/server';
import { ShutdownHandler } from './shutdown';
import { createHealthCheck } from '../monitoring/health';
import { initializeDynamoDBClient } from '../data/dynamodb';
import { initializeSessionManager } from '../session/manager';
import { corsMiddleware, getSocketIOCorsConfig } from '../security/cors-config';
import { initializeInputSanitizer } from '../security/input-sanitizer';

let httpServer: any;
let wsServer: WebSocketServer;
let shutdownHandler: ShutdownHandler;
let healthCheck: ReturnType<typeof createHealthCheck>;

async function main() {
  try {
    // Load configuration
    const config = loadConfig();
    
    // Create logger with configured log level
    const logger = createLogger(config.server.logLevel as any);
    
    logger.info('Voiceter Backend starting...', {
      event: 'server_starting',
    });
    
    logger.info('Configuration validated successfully', {
      event: 'config_loaded',
      data: {
        region: config.aws.region,
        port: config.server.port,
      },
    });
    
    // Initialize AWS clients
    initializeDynamoDBClient(config.aws.region, config.aws.dynamodbTablePrefix);
    
    logger.info('AWS clients initialized', {
      event: 'aws_clients_initialized',
    });
    
    // Initialize questionnaire loader
    const { initializeQuestionnaireLoader } = await import('../questionnaire/loader');
    initializeQuestionnaireLoader();
    
    logger.info('Questionnaires loaded', {
      event: 'questionnaires_loaded',
    });

    // Preload system prompts for Gemini Live
    const { preloadSystemPrompts } = await import('../questionnaire/system-prompt-loader');
    preloadSystemPrompts();
    
    logger.info('System prompts preloaded', {
      event: 'system_prompts_preloaded',
    });
    
    // Initialize SessionManager
    const sessionManager = initializeSessionManager(undefined, logger);
    await sessionManager.initialize();
    
    logger.info('SessionManager initialized', {
      event: 'session_manager_initialized',
    });
    
    // Initialize metrics emitter
    const metricsEnabled = process.env.METRICS_ENABLED !== 'false';
    createMetricsEmitter(
      config.aws.region,
      'Voiceter/Backend',
      metricsEnabled
    );
    
    logger.info('Metrics emitter initialized', {
      event: 'metrics_emitter_initialized',
      data: { enabled: metricsEnabled },
    });
    
    // Initialize Express app
    const app = express();
    
    // Basic middleware
    app.use(express.json());
    
    // Initialize input sanitizer for security (REQ-SEC-004)
    initializeInputSanitizer(logger);
    
    // CORS middleware for REST API endpoints (REQ-SEC-003)
    // Uses environment-aware CORS configuration
    app.use(corsMiddleware);
    
    // Create HTTP server
    httpServer = createServer(app);
    
    // Get Socket.IO CORS configuration (REQ-SEC-003)
    const socketIOCors = getSocketIOCorsConfig();
    
    // Initialize WebSocket server with authentication
    wsServer = new WebSocketServer(
      httpServer,
      {
        cors: socketIOCors,
        pingTimeout: 30000,
        pingInterval: 10000,
        config, // Pass config for authentication middleware
      },
      logger
    );
    
    // Initialize shutdown handler
    shutdownHandler = new ShutdownHandler(wsServer, logger);
    
    // Initialize health check with session and connection count functions
    healthCheck = createHealthCheck(
      () => sessionManager.getSessionCount(),
      () => wsServer.getActiveConnectionCount()
    );
    
    // Register AWS service health checks
    healthCheck.registerAWSHealthChecks();
    
    logger.info('Health checks configured', {
      event: 'health_checks_configured',
    });
    
    // Health check endpoint
    // Returns 200 when healthy, 503 when unhealthy or during shutdown
    // Checks DynamoDB connectivity
    app.get('/health', async (req, res) => {
      await healthCheck.handleHealthCheck(req, res);
    });

    // Waitlist endpoint
    const { handleWaitlistSubmission } = await import('../waitlist/handler');
    app.post('/api/waitlist', handleWaitlistSubmission);

    // Direct WebSocket mode REST API endpoints
    const sessionRoutes = (await import('./routes/session')).default;
    app.use('/api/session', sessionRoutes);
    app.use('/api', sessionRoutes); // Also mount at /api for /api/tool/execute and /api/transcript
    
    logger.info('REST API routes registered', {
      event: 'routes_registered',
      data: {
        endpoints: [
          'POST /api/session/start',
          'POST /api/session/end',
          'POST /api/tool/execute',
          'POST /api/transcript',
          'POST /api/audio/chunk',
        ],
      },
    });
    
    // Start HTTP server
    httpServer.listen(config.server.port, () => {
      logger.info('Voiceter Backend started successfully', {
        event: 'server_started',
        data: {
          port: config.server.port,
          activeConnections: wsServer.getActiveConnectionCount(),
        },
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function shutdown(signal: string) {
  const logger = createLogger();
  logger.info(`${signal} received, shutting down gracefully...`, {
    event: 'shutdown_initiated',
    data: {
      signal,
    },
  });
  
  try {
    // Mark health check as shutting down
    if (healthCheck) {
      healthCheck.markShuttingDown();
    }
    
    // Execute graceful shutdown
    if (shutdownHandler) {
      await shutdownHandler.shutdown();
    }
    
    // Close HTTP server
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          logger.info('HTTP server closed', {
            event: 'http_server_closed',
          });
          resolve();
        });
      });
    }
    
    logger.info('Graceful shutdown complete', {
      event: 'shutdown_complete',
    });
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      event: 'shutdown_error',
      error,
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
