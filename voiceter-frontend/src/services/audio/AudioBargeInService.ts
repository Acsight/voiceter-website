/**
 * Audio Barge-In Service
 * 
 * Manages barge-in functionality - detecting when user starts speaking
 * during AI playback and stopping playback immediately.
 * Uses energy-based speech detection for accurate barge-in triggering.
 */

import { AudioCaptureService, CaptureState } from './AudioCaptureService';
import { AudioPlaybackService, PlaybackState } from './AudioPlaybackService';

/**
 * Barge-in configuration
 */
export interface BargeInConfig {
  enabled?: boolean;
  audioThreshold?: number; // Audio level threshold to detect speech (0-1, default: 0.01)
  debounceMs?: number; // Debounce time to avoid false positives
  minSpeechDuration?: number; // Minimum speech duration (ms) before triggering barge-in
}

/**
 * Barge-in event callback type
 */
export type BargeInCallback = () => void;

/**
 * Audio Barge-In Service Class
 * 
 * Detects when user starts speaking during AI playback and stops
 * playback immediately to allow natural conversation flow.
 */
export class AudioBargeInService {
  private captureService: AudioCaptureService;
  private playbackService: AudioPlaybackService;
  private config: Required<BargeInConfig>;
  private isEnabled = true;
  private bargeInCallback: BargeInCallback | null = null;
  private lastBargeInTime = 0;
  private speechStartTime: number | null = null;

  constructor(
    captureService: AudioCaptureService,
    playbackService: AudioPlaybackService,
    config: BargeInConfig = {}
  ) {
    this.captureService = captureService;
    this.playbackService = playbackService;
    this.config = {
      enabled: config.enabled !== false,
      audioThreshold: config.audioThreshold || 0.01, // Low threshold for sensitivity
      debounceMs: config.debounceMs || 200, // 200ms debounce
      minSpeechDuration: config.minSpeechDuration || 50, // 50ms minimum speech
    };

    this.setupBargeInDetection();
  }

  /**
   * Set barge-in callback
   */
  public onBargeIn(callback: BargeInCallback): void {
    this.bargeInCallback = callback;
  }

  /**
   * Enable barge-in detection
   */
  public enable(): void {
    this.isEnabled = true;
  }

  /**
   * Disable barge-in detection
   */
  public disable(): void {
    this.isEnabled = false;
  }

  /**
   * Check if barge-in is enabled
   */
  public isBargeInEnabled(): boolean {
    return this.isEnabled && this.config.enabled;
  }

  /**
   * Setup barge-in detection
   */
  private setupBargeInDetection(): void {
    // Monitor capture state changes
    this.captureService.onStateChange((state) => {
      if (!this.isBargeInEnabled()) {
        return;
      }

      // Reset speech tracking when capture state changes
      if (state !== CaptureState.CAPTURING) {
        this.speechStartTime = null;
      }
    });

    // Monitor audio chunks for speech detection using energy analysis
    this.captureService.onAudioChunk((audioData, sequenceNumber) => {
      if (!this.isBargeInEnabled()) {
        return;
      }

      // Only check for barge-in if AI is playing
      if (this.playbackService.getState() !== PlaybackState.PLAYING) {
        this.speechStartTime = null;
        return;
      }

      // Analyze audio energy to detect speech
      const energy = this.calculateAudioEnergy(audioData);
      const now = Date.now();

      if (energy > this.config.audioThreshold) {
        // Speech detected
        if (!this.speechStartTime) {
          this.speechStartTime = now;
        }

        // Check if speech has been sustained long enough
        const speechDuration = now - this.speechStartTime;
        if (speechDuration >= this.config.minSpeechDuration) {
          // Check debounce
          if (now - this.lastBargeInTime > this.config.debounceMs) {
            this.handleBargeIn();
          }
        }
      } else {
        // Silence - reset speech tracking
        this.speechStartTime = null;
      }
    });
  }

  /**
   * Calculate RMS energy of audio data
   * Uses DataView to properly handle little-endian byte order
   */
  private calculateAudioEnergy(base64Audio: string): number {
    try {
      // Decode base64 to PCM
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Ensure we have an even number of bytes for 16-bit samples
      const validLength = bytes.length - (bytes.length % 2);
      if (validLength === 0) return 0;
      
      // Use DataView to properly read 16-bit little-endian PCM samples
      const dataView = new DataView(bytes.buffer);
      const numSamples = validLength / 2;

      if (numSamples === 0) return 0;

      // Calculate RMS energy
      let sum = 0;
      for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(i * 2, true); // true = little-endian
        const normalized = sample / 32768;
        sum += normalized * normalized;
      }

      return Math.sqrt(sum / numSamples);
    } catch (error) {
      console.error('Failed to calculate audio energy:', error);
      return 0;
    }
  }

  /**
   * Handle barge-in event
   */
  private handleBargeIn(): void {
    console.log('Barge-in detected - stopping AI playback');

    // Stop playback immediately
    this.playbackService.stopImmediately();

    // Clear audio queue to prevent residual audio
    this.playbackService.clearQueue();

    // Update last barge-in time
    this.lastBargeInTime = Date.now();

    // Notify callback
    if (this.bargeInCallback) {
      this.bargeInCallback();
    }
  }

  /**
   * Manually trigger barge-in
   */
  public triggerBargeIn(): void {
    if (this.isBargeInEnabled()) {
      this.handleBargeIn();
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.bargeInCallback = null;
  }
}

/**
 * Create audio barge-in service
 */
export function createAudioBargeInService(
  captureService: AudioCaptureService,
  playbackService: AudioPlaybackService,
  config?: BargeInConfig
): AudioBargeInService {
  return new AudioBargeInService(captureService, playbackService, config);
}
