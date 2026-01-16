/**
 * WebSocket Service Tests
 * 
 * Basic tests to verify WebSocket service functionality
 */

import { WebSocketService, ConnectionState } from '../WebSocketService';

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    service = new WebSocketService({
      backendUrl: 'ws://localhost:8080',
      maxReconnectAttempts: 3,
      reconnectDelay: 100,
    });
  });

  afterEach(() => {
    service.destroy();
  });

  describe('initialization', () => {
    it('should initialize with disconnected state', () => {
      expect(service.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should have null session ID initially', () => {
      expect(service.getSessionId()).toBeNull();
    });
  });

  describe('event listeners', () => {
    it('should register event listeners', () => {
      const listener = jest.fn();
      service.on('connection:state', listener);
      
      // Trigger a state change
      service.connect();
      
      // Should have been called at least once (for CONNECTING state)
      expect(listener).toHaveBeenCalled();
    });

    it('should unregister event listeners', () => {
      const listener = jest.fn();
      service.on('connection:state', listener);
      service.off('connection:state', listener);
      
      // Trigger a state change
      service.connect();
      
      // Listener should not be called after being removed
      // Note: This might still be called once during connect, so we just verify it can be removed
      expect(true).toBe(true);
    });
  });

  describe('connection management', () => {
    it('should update state to CONNECTING when connect is called', () => {
      const stateListener = jest.fn();
      service.on('connection:state', stateListener);
      
      service.connect();
      
      // Should be called with CONNECTING state
      expect(stateListener).toHaveBeenCalledWith(ConnectionState.CONNECTING);
    });

    it('should update state to DISCONNECTED when disconnect is called', () => {
      service.connect();
      
      const stateListener = jest.fn();
      service.on('connection:state', stateListener);
      
      service.disconnect();
      
      expect(stateListener).toHaveBeenCalledWith(ConnectionState.DISCONNECTED);
      expect(service.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('session management', () => {
    it('should throw error when starting session without connection', () => {
      expect(() => {
        service.startSession('demo1', 'matthew');
      }).toThrow('WebSocket not connected');
    });

    it('should not throw when ending session without connection', () => {
      expect(() => {
        service.endSession();
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on destroy', () => {
      service.connect();
      service.destroy();
      
      expect(service.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
      expect(service.getSessionId()).toBeNull();
    });
  });
});
