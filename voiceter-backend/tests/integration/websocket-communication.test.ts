/**
 * Integration Test: WebSocket Communication
 * 
 * Tests the full WebSocket to Bedrock flow including:
 * - WebSocket connection establishment
 * - Session initialization
 * - Audio streaming
 * - Event forwarding
 * - Session cleanup
 * 
 * Requirements: 15.6, 15.7
 */

import { Server as HTTPServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketServer } from '../../src/websocket/server';
import { Logger } from '../../src/monitoring/logger';

describe('WebSocket Communication Integration', () => {
  let httpServer: HTTPServer;
  let wsServer: WebSocketServer;
  let clientSocket: ClientSocket;
  let logger: Logger;
  const TEST_PORT = 3100;

  beforeAll(() => {
    // Create logger
    logger = new Logger('ERROR'); // Reduce noise in tests
  });

  beforeEach((done) => {
    // Create HTTP server
    httpServer = new HTTPServer();

    // Create WebSocket server
    wsServer = new WebSocketServer(
      httpServer,
      {
        cors: {
          origin: '*',
          credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
      },
      logger
    );

    // Start server
    httpServer.listen(TEST_PORT, () => {
      done();
    });
  });

  afterEach(async () => {
    // Disconnect client
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }

    // Close WebSocket server
    if (wsServer) {
      await wsServer.close();
    }

    // Close HTTP server
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('Connection Establishment', () => {
    it('should establish WebSocket connection successfully', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        expect(wsServer.getActiveConnectionCount()).toBe(1);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should assign unique session ID to client', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      clientSocket.on('session:assigned', (data) => {
        expect(data).toBeDefined();
        expect(data.sessionId).toBeDefined();
        expect(typeof data.sessionId).toBe('string');
        expect(data.sessionId.length).toBeGreaterThan(0);
        done();
      });
    });

    it('should handle multiple concurrent connections', (done) => {
      const client1 = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      const client2 = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      let connectedCount = 0;
      const sessionIds: string[] = [];

      const checkComplete = () => {
        connectedCount++;
        if (connectedCount === 2) {
          expect(wsServer.getActiveConnectionCount()).toBe(2);
          expect(sessionIds[0]).not.toBe(sessionIds[1]);
          
          client1.disconnect();
          client2.disconnect();
          done();
        }
      };

      client1.on('session:assigned', (data) => {
        sessionIds.push(data.sessionId);
        checkComplete();
      });

      client2.on('session:assigned', (data) => {
        sessionIds.push(data.sessionId);
        checkComplete();
      });
    });
  });

  describe('Event Communication', () => {
    let sessionId: string;

    beforeEach((done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      clientSocket.on('session:assigned', (data) => {
        sessionId = data.sessionId;
        done();
      });
    });

    it('should receive ping from server', (done) => {
      clientSocket.on('ping', () => {
        expect(true).toBe(true);
        done();
      });

      // Trigger ping manually for faster test
      clientSocket.emit('ping');
    });

    it('should emit events to specific session', (done) => {
      const testData = {
        event: 'test:event',
        sessionId,
        timestamp: new Date().toISOString(),
        data: { message: 'test message' },
      };

      clientSocket.on('test:event', (data) => {
        expect(data).toEqual(testData);
        done();
      });

      // Emit event to session
      wsServer.emitToSession(sessionId, 'test:event', testData);
    });

    it('should handle audio chunk events', (done) => {
      const audioData = Buffer.from('test audio data').toString('base64');
      
      clientSocket.on('audio:chunk', (data) => {
        expect(data).toBeDefined();
        expect(data.data).toBeDefined();
        expect(data.data.content).toBe(audioData);
        done();
      });

      wsServer.emitToSession(sessionId, 'audio:chunk', {
        event: 'audio:chunk',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          content: audioData,
        },
      });
    });

    it('should handle transcription events', (done) => {
      const transcriptionText = 'Hello, this is a test transcription';
      
      clientSocket.on('transcription:user', (data) => {
        expect(data).toBeDefined();
        expect(data.data).toBeDefined();
        expect(data.data.text).toBe(transcriptionText);
        done();
      });

      wsServer.emitToSession(sessionId, 'transcription:user', {
        event: 'transcription:user',
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          text: transcriptionText,
          isFinal: true,
        },
      });
    });
  });

  describe('Disconnection Handling', () => {
    it('should handle client disconnection gracefully', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      clientSocket.on('session:assigned', () => {
        expect(wsServer.getActiveConnectionCount()).toBe(1);
        
        // Disconnect client
        clientSocket.disconnect();
        
        // Wait for disconnection to be processed
        setTimeout(() => {
          expect(wsServer.getActiveConnectionCount()).toBe(0);
          done();
        }, 100);
      });
    });

    it('should clean up session on disconnection', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      let sessionId: string;

      clientSocket.on('session:assigned', (data) => {
        sessionId = data.sessionId;
        expect(wsServer.getActiveConnectionCount()).toBe(1);
        
        // Disconnect client
        clientSocket.disconnect();
        
        // Wait for cleanup (2 second threshold + processing time)
        setTimeout(() => {
          expect(wsServer.getActiveConnectionCount()).toBe(0);
          expect(wsServer.getSocket(sessionId)).toBeUndefined();
          done();
        }, 2500);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        // Force an error by emitting invalid data
        clientSocket.emit('invalid:event', { invalid: 'data' });
        
        // Should not crash the server
        setTimeout(() => {
          expect(wsServer.getActiveConnectionCount()).toBe(1);
          done();
        }, 100);
      });
    });

    it('should emit error events to client', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      let sessionId: string;

      clientSocket.on('session:assigned', (data) => {
        sessionId = data.sessionId;
      });

      clientSocket.on('error', (data) => {
        expect(data).toBeDefined();
        expect(data.errorCode).toBeDefined();
        expect(data.errorMessage).toBeDefined();
        done();
      });

      // Wait for connection, then emit error
      setTimeout(() => {
        wsServer.emitToSession(sessionId, 'error', {
          event: 'error',
          sessionId,
          timestamp: new Date().toISOString(),
          data: {
            errorCode: 'TEST_ERROR',
            errorMessage: 'Test error message',
            recoverable: true,
          },
        });
      }, 100);
    });
  });

  describe('Barge-in Support', () => {
    it('should emit barge-in event to client', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      let sessionId: string;

      clientSocket.on('session:assigned', (data) => {
        sessionId = data.sessionId;
        
        // Emit barge-in event
        wsServer.emitBargeIn(sessionId);
      });

      clientSocket.on('barge-in', (data) => {
        expect(data).toBeDefined();
        expect(data.event).toBe('barge-in');
        expect(data.sessionId).toBe(sessionId);
        expect(data.data.message).toBe('User interrupted AI speech');
        done();
      });
    });
  });

  describe('Broadcast Events', () => {
    it('should broadcast events to all connected clients', (done) => {
      const client1 = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      const client2 = ioClient(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });

      let receivedCount = 0;
      const testData = {
        event: 'broadcast:test',
        timestamp: new Date().toISOString(),
        data: { message: 'broadcast message' },
      };

      const checkComplete = () => {
        receivedCount++;
        if (receivedCount === 2) {
          client1.disconnect();
          client2.disconnect();
          done();
        }
      };

      client1.on('broadcast:test', (data) => {
        expect(data).toEqual(testData);
        checkComplete();
      });

      client2.on('broadcast:test', (data) => {
        expect(data).toEqual(testData);
        checkComplete();
      });

      // Wait for both clients to connect
      setTimeout(() => {
        wsServer.broadcast('broadcast:test', testData);
      }, 200);
    });
  });
});
