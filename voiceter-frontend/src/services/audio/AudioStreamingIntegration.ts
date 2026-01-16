/**
 * Audio Streaming Integration
 * 
 * Integrates AudioCaptureService with WebSocketService for seamless
 * audio streaming to the backend. Includes optional VAD (Voice Activity Detection)
 * to filter out silence and only send speech segments.
 */

import { AudioCaptureService, CaptureState } from './AudioCaptureService';
import { WebSocketService, ConnectionState } from '../websocket/WebSocketService';
import { VoiceActivityDetector, VADState, VADConfig } from './VoiceActivityDetector';

/**
 * Audio streaming integration configuration
 */
export interface AudioStreamingConfig {
  audioConfig?: {
    sampleRate?: number;
    channelCount?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  };
  autoStart?: boolean;
  /** VAD configuration (optional) */
  vad?: VADConfig;
}

/**
 * VAD state change callback
 */
export type VADStateChangeCallback = (state: VADState, isSpeaking: boolean) => void;

/**
 * Audio Streaming Integration Class
 * 
 * Manages the integration between audio capture and WebSocket services,
 * handling the complete audio streaming pipeline with optional VAD filtering.
 */
export class AudioStreamingIntegration {
  private audioService: AudioCaptureService;
  private wsService: WebSocketService;
  private vad: VoiceActivityDetector | null = null;
  private isStreaming = false;
  private autoStart: boolean;
  private vadStateCallback: VADStateChangeCallback | null = null;

  constructor(
    audioService: AudioCaptureService,
    wsService: WebSocketService,
    config: AudioStreamingConfig = {}
  ) {
    this.audioService = audioService;
    this.wsService = wsService;
    this.autoStart = config.autoStart !== false;

    // Initialize VAD if config provided
    if (config.vad) {
      this.vad = new VoiceActivityDetector(config.vad);
    }

    this.setupIntegration();
  }

  /**
   * Set up integration between audio and WebSocket services
   */
  private setupIntegration(): void {
    // Set up VAD state change callback if VAD is enabled
    if (this.vad) {
      this.vad.onStateChange((state) => {
        if (this.vadStateCallback) {
          this.vadStateCallback(state, this.vad!.getIsSpeaking());
        }
      });

      // VAD will call this when speech is detected
      this.vad.onSpeech((audioData, sequenceNumber) => {
        this.sendAudioToBackend(audioData, sequenceNumber);
      });
    }

    // Connect audio chunks to WebSocket (with or without VAD)
    this.audioService.onAudioChunk((audioData, sequenceNumber) => {
      if (!this.isStreaming || this.wsService.getConnectionState() !== ConnectionState.CONNECTED) {
        return;
      }

      if (this.vad) {
        // Process through VAD - it will call onSpeech callback if speech detected
        this.vad.process(audioData, sequenceNumber);
      } else {
        // No VAD - send all audio directly
        this.sendAudioToBackend(audioData, sequenceNumber);
      }
    });

    // Handle audio capture errors
    this.audioService.onError((error) => {
      console.error('Audio capture error:', error);
      this.handleAudioError(error);
    });

    // Handle audio state changes
    this.audioService.onStateChange((state) => {
      console.log('Audio capture state:', state);
      
      if (state === CaptureState.CAPTURING) {
        this.isStreaming = true;
      } else if (state === CaptureState.IDLE || state === CaptureState.ERROR) {
        this.isStreaming = false;
        // Reset VAD state when capture stops
        if (this.vad) {
          this.vad.reset();
        }
      }
    });
  }

  /**
   * Send audio data to backend via WebSocket
   */
  private sendAudioToBackend(audioData: string, sequenceNumber: number): void {
    try {
      this.wsService.sendAudioChunk(audioData, sequenceNumber);
    } catch (error) {
      console.error('Failed to send audio chunk:', error);
    }
  }

  /**
   * Set VAD state change callback
   */
  public onVADStateChange(callback: VADStateChangeCallback): void {
    this.vadStateCallback = callback;
  }

  /**
   * Initialize audio capture
   */
  public async initialize(): Promise<void> {
    try {
      await this.audioService.initialize();
      console.log('Audio capture initialized');
    } catch (error) {
      console.error('Failed to initialize audio capture:', error);
      throw error;
    }
  }

  /**
   * Start audio streaming
   */
  public start(): void {
    if (this.wsService.getConnectionState() !== ConnectionState.CONNECTED) {
      throw new Error('WebSocket not connected. Connect to WebSocket before starting audio streaming.');
    }

    this.audioService.start();
    this.isStreaming = true;
    console.log('Audio streaming started');
  }

  /**
   * Pause audio streaming
   */
  public pause(): void {
    this.audioService.pause();
    this.isStreaming = false;
    console.log('Audio streaming paused');
  }

  /**
   * Resume audio streaming
   */
  public resume(): void {
    if (this.wsService.getConnectionState() !== ConnectionState.CONNECTED) {
      throw new Error('WebSocket not connected. Cannot resume audio streaming.');
    }

    this.audioService.resume();
    this.isStreaming = true;
    console.log('Audio streaming resumed');
  }

  /**
   * Stop audio streaming
   */
  public stop(): void {
    this.audioService.stop();
    this.isStreaming = false;
    console.log('Audio streaming stopped');
  }

  /**
   * Check if currently streaming
   */
  public isActive(): boolean {
    return this.isStreaming;
  }

  /**
   * Get audio capture state
   */
  public getCaptureState(): CaptureState {
    return this.audioService.getState();
  }

  /**
   * Get current sequence number
   */
  public getSequenceNumber(): number {
    return this.audioService.getSequenceNumber();
  }

  /**
   * Handle audio capture errors
   */
  private handleAudioError(error: Error): void {
    this.isStreaming = false;

    // Check for specific error types
    if (error.name === 'NotAllowedError') {
      console.error('Microphone permission denied');
      // Emit custom event or callback for UI to handle
    } else if (error.name === 'NotFoundError') {
      console.error('No microphone found');
    } else if (error.name === 'NotReadableError') {
      console.error('Microphone is already in use');
    } else {
      console.error('Unknown audio error:', error);
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stop();
    this.isStreaming = false;
    if (this.vad) {
      this.vad.destroy();
      this.vad = null;
    }
    this.vadStateCallback = null;
  }

  /**
   * Enable VAD (Voice Activity Detection)
   */
  public enableVAD(config?: VADConfig): void {
    if (!this.vad) {
      this.vad = new VoiceActivityDetector(config);
      this.vad.onStateChange((state) => {
        if (this.vadStateCallback) {
          this.vadStateCallback(state, this.vad!.getIsSpeaking());
        }
      });
      this.vad.onSpeech((audioData, sequenceNumber) => {
        this.sendAudioToBackend(audioData, sequenceNumber);
      });
    } else {
      this.vad.enable();
      if (config) {
        this.vad.updateConfig(config);
      }
    }
  }

  /**
   * Disable VAD (send all audio without filtering)
   */
  public disableVAD(): void {
    if (this.vad) {
      this.vad.disable();
    }
  }

  /**
   * Check if VAD is enabled
   */
  public isVADEnabled(): boolean {
    return this.vad?.isEnabled() ?? false;
  }

  /**
   * Get current VAD state
   */
  public getVADState(): VADState | null {
    return this.vad?.getState() ?? null;
  }

  /**
   * Check if user is currently speaking (via VAD)
   */
  public isSpeaking(): boolean {
    return this.vad?.getIsSpeaking() ?? false;
  }

  /**
   * Update VAD configuration
   */
  public updateVADConfig(config: Partial<VADConfig>): void {
    if (this.vad) {
      this.vad.updateConfig(config);
    }
  }
}

/**
 * Create audio streaming integration
 */
export function createAudioStreamingIntegration(
  audioService: AudioCaptureService,
  wsService: WebSocketService,
  config?: AudioStreamingConfig
): AudioStreamingIntegration {
  return new AudioStreamingIntegration(audioService, wsService, config);
}
