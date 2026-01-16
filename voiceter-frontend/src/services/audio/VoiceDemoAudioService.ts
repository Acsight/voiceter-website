/**
 * Voice Demo Audio Service
 * 
 * Comprehensive audio service that integrates capture, playback, streaming,
 * and barge-in functionality for the voice demo interface.
 * Includes optional VAD (Voice Activity Detection) to filter silence.
 */

import { AudioCaptureService, CaptureState } from './AudioCaptureService';
import { AudioPlaybackService, PlaybackState } from './AudioPlaybackService';
import { AudioStreamingIntegration } from './AudioStreamingIntegration';
import { AudioBargeInService } from './AudioBargeInService';
import { WebSocketService } from '../websocket/WebSocketService';
import { VADConfig, VADState } from './VoiceActivityDetector';

/**
 * Voice demo audio configuration
 */
export interface VoiceDemoAudioConfig {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  bargeInEnabled?: boolean;
  /** VAD configuration (optional) */
  vad?: VADConfig;
}

/**
 * Voice Demo Audio Service Class
 * 
 * Provides a unified interface for all audio functionality needed
 * for the voice demo, including capture, playback, streaming, and barge-in.
 */
export class VoiceDemoAudioService {
  private captureService: AudioCaptureService;
  private playbackService: AudioPlaybackService;
  private streamingIntegration: AudioStreamingIntegration;
  private bargeInService: AudioBargeInService;
  private wsService: WebSocketService;
  private isInitialized = false;
  private vadStateCallback: ((state: VADState, isSpeaking: boolean) => void) | null = null;

  constructor(wsService: WebSocketService, config: VoiceDemoAudioConfig = {}) {
    this.wsService = wsService;

    // Create audio services
    // Capture uses 16kHz (input to Nova Sonic)
    this.captureService = new AudioCaptureService({
      sampleRate: config.sampleRate || 16000,
      channelCount: config.channelCount || 1,
      echoCancellation: config.echoCancellation !== false,
      noiseSuppression: config.noiseSuppression !== false,
      autoGainControl: config.autoGainControl !== false,
    });

    // Playback uses 24kHz (output from Nova Sonic)
    this.playbackService = new AudioPlaybackService({
      sampleRate: 24000, // Nova Sonic outputs 24kHz audio
      channelCount: config.channelCount || 1,
    });

    // Create streaming integration with optional VAD
    this.streamingIntegration = new AudioStreamingIntegration(
      this.captureService,
      this.wsService,
      {
        vad: config.vad,
      }
    );

    // Create barge-in service
    this.bargeInService = new AudioBargeInService(
      this.captureService,
      this.playbackService,
      {
        enabled: config.bargeInEnabled !== false,
      }
    );

    this.setupWebSocketListeners();
  }

  /**
   * Initialize audio services
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Voice demo audio service already initialized');
      return;
    }

    try {
      // Initialize capture
      await this.captureService.initialize();
      console.log('Audio capture initialized');

      // Initialize playback
      await this.playbackService.initialize();
      console.log('Audio playback initialized');

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize voice demo audio service:', error);
      throw error;
    }
  }

  /**
   * Setup WebSocket listeners for audio events
   */
  private setupWebSocketListeners(): void {
    // Listen for audio chunks from backend
    this.wsService.on('audio:chunk', (data) => {
      console.log('🔊 Received audio:chunk event:', {
        hasAudioData: !!data?.audioData,
        audioDataLength: data?.audioData?.length || 0,
        sequenceNumber: data?.sequenceNumber,
      });
      try {
        if (data?.audioData) {
          this.playbackService.enqueueAudioChunk(data.audioData, data.sequenceNumber || 0);
        } else {
          console.warn('⚠️ audio:chunk event missing audioData');
        }
      } catch (error) {
        console.error('Failed to enqueue audio chunk:', error);
      }
    });

    // Listen for session complete to stop audio
    this.wsService.on('session:complete', () => {
      this.stopAll();
    });

    // Listen for errors to stop audio
    this.wsService.on('error', (data) => {
      if (!data.recoverable) {
        this.stopAll();
      }
    });
  }

  /**
   * Start audio capture and streaming
   */
  public startCapture(): void {
    if (!this.isInitialized) {
      throw new Error('Voice demo audio service not initialized. Call initialize() first.');
    }

    this.streamingIntegration.start();
    console.log('Audio capture and streaming started');
  }

  /**
   * Stop audio capture and streaming
   */
  public stopCapture(): void {
    this.streamingIntegration.stop();
    console.log('Audio capture and streaming stopped');
  }

  /**
   * Pause audio capture
   */
  public pauseCapture(): void {
    this.streamingIntegration.pause();
    console.log('Audio capture paused');
  }

  /**
   * Resume audio capture
   */
  public resumeCapture(): void {
    this.streamingIntegration.resume();
    console.log('Audio capture resumed');
  }

  /**
   * Stop playback
   */
  public stopPlayback(): void {
    this.playbackService.stop();
    console.log('Audio playback stopped');
  }

  /**
   * Pause playback
   */
  public pausePlayback(): void {
    this.playbackService.pause();
    console.log('Audio playback paused');
  }

  /**
   * Resume playback
   */
  public resumePlayback(): void {
    this.playbackService.resume();
    console.log('Audio playback resumed');
  }

  /**
   * Stop all audio (capture and playback)
   */
  public stopAll(): void {
    this.stopCapture();
    this.stopPlayback();
    console.log('All audio stopped');
  }

  /**
   * Enable barge-in
   */
  public enableBargeIn(): void {
    this.bargeInService.enable();
    console.log('Barge-in enabled');
  }

  /**
   * Disable barge-in
   */
  public disableBargeIn(): void {
    this.bargeInService.disable();
    console.log('Barge-in disabled');
  }

  /**
   * Set barge-in callback
   */
  public onBargeIn(callback: () => void): void {
    this.bargeInService.onBargeIn(callback);
  }

  /**
   * Get capture state
   */
  public getCaptureState(): CaptureState {
    return this.captureService.getState();
  }

  /**
   * Get playback state
   */
  public getPlaybackState(): PlaybackState {
    return this.playbackService.getState();
  }

  /**
   * Get playback queue length
   */
  public getPlaybackQueueLength(): number {
    return this.playbackService.getQueueLength();
  }

  /**
   * Check if initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Set capture error callback
   */
  public onCaptureError(callback: (error: Error) => void): void {
    this.captureService.onError(callback);
  }

  /**
   * Set playback error callback
   */
  public onPlaybackError(callback: (error: Error) => void): void {
    this.playbackService.onError(callback);
  }

  /**
   * Set capture state change callback
   */
  public onCaptureStateChange(callback: (state: CaptureState) => void): void {
    this.captureService.onStateChange(callback);
  }

  /**
   * Set playback state change callback
   */
  public onPlaybackStateChange(callback: (state: PlaybackState) => void): void {
    this.playbackService.onStateChange(callback);
  }

  /**
   * Set playback complete callback
   */
  public onPlaybackComplete(callback: () => void): void {
    this.playbackService.onPlaybackComplete(callback);
  }

  /**
   * Enable VAD (Voice Activity Detection)
   * Only sends audio when speech is detected, filtering out silence
   */
  public enableVAD(config?: VADConfig): void {
    this.streamingIntegration.enableVAD(config);
    console.log('VAD enabled');
  }

  /**
   * Disable VAD (send all audio without filtering)
   */
  public disableVAD(): void {
    this.streamingIntegration.disableVAD();
    console.log('VAD disabled');
  }

  /**
   * Check if VAD is enabled
   */
  public isVADEnabled(): boolean {
    return this.streamingIntegration.isVADEnabled();
  }

  /**
   * Get current VAD state
   */
  public getVADState(): VADState | null {
    return this.streamingIntegration.getVADState();
  }

  /**
   * Check if user is currently speaking (via VAD)
   */
  public isSpeaking(): boolean {
    return this.streamingIntegration.isSpeaking();
  }

  /**
   * Update VAD configuration
   */
  public updateVADConfig(config: Partial<VADConfig>): void {
    this.streamingIntegration.updateVADConfig(config);
  }

  /**
   * Set VAD state change callback
   */
  public onVADStateChange(callback: (state: VADState, isSpeaking: boolean) => void): void {
    this.vadStateCallback = callback;
    this.streamingIntegration.onVADStateChange(callback);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopAll();
    this.captureService.destroy();
    this.playbackService.destroy();
    this.streamingIntegration.destroy();
    this.bargeInService.destroy();
    this.isInitialized = false;
    console.log('Voice demo audio service destroyed');
  }
}

/**
 * Create voice demo audio service
 */
export function createVoiceDemoAudioService(
  wsService: WebSocketService,
  config?: VoiceDemoAudioConfig
): VoiceDemoAudioService {
  return new VoiceDemoAudioService(wsService, config);
}
