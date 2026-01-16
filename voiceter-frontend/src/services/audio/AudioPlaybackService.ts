/**
 * Audio Playback Service
 * 
 * Manages audio playback from the backend, including queuing, decoding,
 * and smooth playback of streaming audio chunks.
 * 
 * Updated to handle raw PCM audio from Nova Sonic (24kHz, 16-bit, mono).
 */

/**
 * Audio playback configuration
 */
export interface AudioPlaybackConfig {
  sampleRate?: number;
  channelCount?: number;
  bufferSize?: number;
}

/**
 * Audio playback state
 */
export enum PlaybackState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  PLAYING = 'playing',
  PAUSED = 'paused',
  ERROR = 'error',
}

/**
 * Audio chunk for queuing
 */
interface AudioChunk {
  audioData: Float32Array; // Decoded PCM samples
  sequenceNumber: number;
}

/**
 * Playback error callback type
 */
export type PlaybackErrorCallback = (error: Error) => void;

/**
 * State change callback type
 */
export type PlaybackStateChangeCallback = (state: PlaybackState) => void;

/**
 * Playback complete callback type
 */
export type PlaybackCompleteCallback = () => void;

/**
 * Audio Playback Service Class
 * 
 * Provides audio playback functionality for streaming PCM audio chunks from Nova Sonic.
 * Handles base64 decoding and PCM playback using Web Audio API.
 */
export class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioChunk[] = [];
  private state: PlaybackState = PlaybackState.IDLE;
  private config: Required<AudioPlaybackConfig>;
  private isProcessingQueue = false;
  private nextPlaybackTime = 0;
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  
  // Callbacks
  private errorCallback: PlaybackErrorCallback | null = null;
  private stateChangeCallback: PlaybackStateChangeCallback | null = null;
  private playbackCompleteCallback: PlaybackCompleteCallback | null = null;

  constructor(config: AudioPlaybackConfig = {}) {
    this.config = {
      // Nova Sonic outputs 24kHz audio
      sampleRate: config.sampleRate || 24000,
      channelCount: config.channelCount || 1,
      bufferSize: config.bufferSize || 4096,
    };
  }

  /**
   * Get current playback state
   */
  public getState(): PlaybackState {
    return this.state;
  }

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.audioQueue.length;
  }

  /**
   * Set error callback
   */
  public onError(callback: PlaybackErrorCallback): void {
    this.errorCallback = callback;
  }

  /**
   * Set state change callback
   */
  public onStateChange(callback: PlaybackStateChangeCallback): void {
    this.stateChangeCallback = callback;
  }

  /**
   * Set playback complete callback
   */
  public onPlaybackComplete(callback: PlaybackCompleteCallback): void {
    this.playbackCompleteCallback = callback;
  }

  /**
   * Initialize audio playback
   */
  public async initialize(): Promise<void> {
    try {
      this.updateState(PlaybackState.INITIALIZING);

      // Create audio context with Nova Sonic's output sample rate (24kHz)
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);

      // Resume audio context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.nextPlaybackTime = this.audioContext.currentTime;
      this.updateState(PlaybackState.IDLE);
      
      console.log('Audio playback initialized with sample rate:', this.config.sampleRate);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Convert base64 PCM to Float32Array
   * Gemini Live outputs 16-bit PCM audio encoded as base64, little-endian
   */
  private base64ToFloat32Array(base64String: string): Float32Array {
    try {
      // Decode base64 to binary
      const binaryString = atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Ensure we have an even number of bytes for 16-bit samples
      const validLength = bytes.length - (bytes.length % 2);
      if (validLength === 0) {
        return new Float32Array(0);
      }

      // Use DataView to properly read 16-bit little-endian PCM samples
      // This avoids byte alignment issues and ensures correct endianness
      const dataView = new DataView(bytes.buffer);
      const numSamples = validLength / 2;
      const float32Array = new Float32Array(numSamples);

      // Convert to Float32Array (normalized to -1.0 to 1.0)
      for (let i = 0; i < numSamples; i++) {
        // Read as little-endian signed 16-bit integer
        const sample = dataView.getInt16(i * 2, true); // true = little-endian
        float32Array[i] = sample / 32768.0;
      }

      return float32Array;
    } catch (error) {
      console.error('Error converting base64 to Float32Array:', error);
      throw new Error(`Failed to decode audio data: ${error}`);
    }
  }

  /**
   * Add audio chunk to playback queue
   * @param audioData - Base64 encoded PCM audio from Nova Sonic
   * @param sequenceNumber - Sequence number for ordering
   */
  public enqueueAudioChunk(audioData: string, sequenceNumber: number): void {
    if (!this.audioContext) {
      throw new Error('Audio playback not initialized. Call initialize() first.');
    }

    try {
      // Convert base64 PCM to Float32Array
      const samples = this.base64ToFloat32Array(audioData);
      
      // Add to queue
      this.audioQueue.push({ audioData: samples, sequenceNumber });

      console.log(`Enqueued audio chunk #${sequenceNumber}, ${samples.length} samples, queue size: ${this.audioQueue.length}`);

      // Start processing queue if not already processing
      if (!this.isProcessingQueue && this.state !== PlaybackState.PAUSED) {
        this.processQueue();
      }
    } catch (error) {
      console.error('Failed to enqueue audio chunk:', error);
      this.handleError(error as Error);
    }
  }

  /**
   * Process audio queue - schedule all chunks for seamless playback
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || !this.audioContext || !this.gainNode) {
      return;
    }

    this.isProcessingQueue = true;

    // Update state to playing
    if (this.state !== PlaybackState.PLAYING && this.audioQueue.length > 0) {
      this.updateState(PlaybackState.PLAYING);
    }

    while (this.audioQueue.length > 0 && this.state !== PlaybackState.PAUSED) {
      const chunk = this.audioQueue.shift();
      if (!chunk) continue;

      try {
        await this.scheduleAudioChunk(chunk);
      } catch (error) {
        console.error('Error scheduling audio chunk:', error);
        this.handleError(error as Error);
      }
    }

    this.isProcessingQueue = false;

    // If queue is empty and we're playing, we're done
    if (this.audioQueue.length === 0 && this.state === PlaybackState.PLAYING) {
      // Wait for the last scheduled audio to finish
      const remainingTime = this.nextPlaybackTime - this.audioContext.currentTime;
      if (remainingTime > 0) {
        setTimeout(() => {
          if (this.audioQueue.length === 0) {
            this.updateState(PlaybackState.IDLE);
            if (this.playbackCompleteCallback) {
              this.playbackCompleteCallback();
            }
          }
        }, remainingTime * 1000);
      } else {
        this.updateState(PlaybackState.IDLE);
        if (this.playbackCompleteCallback) {
          this.playbackCompleteCallback();
        }
      }
    }
  }

  /**
   * Schedule a single audio chunk for playback
   */
  private async scheduleAudioChunk(chunk: AudioChunk): Promise<void> {
    if (!this.audioContext || !this.gainNode) {
      throw new Error('Audio context not initialized');
    }

    const samples = chunk.audioData;
    
    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(
      this.config.channelCount,
      samples.length,
      this.config.sampleRate
    );

    // Copy samples to buffer
    audioBuffer.getChannelData(0).set(samples);

    // Create source node
    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(this.gainNode);

    // Schedule playback
    const currentTime = this.audioContext.currentTime;
    const startTime = Math.max(currentTime, this.nextPlaybackTime);
    
    sourceNode.start(startTime);
    this.currentSourceNode = sourceNode;

    // Update next playback time
    this.nextPlaybackTime = startTime + audioBuffer.duration;

    // Handle source node end
    sourceNode.onended = () => {
      if (this.currentSourceNode === sourceNode) {
        this.currentSourceNode = null;
      }
    };
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (this.state !== PlaybackState.PLAYING) {
      console.warn('Audio playback not active');
      return;
    }

    if (this.audioContext) {
      this.audioContext.suspend();
    }

    this.updateState(PlaybackState.PAUSED);
  }

  /**
   * Resume playback
   */
  public resume(): void {
    if (this.state !== PlaybackState.PAUSED) {
      console.warn('Audio playback not paused');
      return;
    }

    if (this.audioContext) {
      this.audioContext.resume();
    }

    this.updateState(PlaybackState.PLAYING);

    // Resume processing queue
    if (!this.isProcessingQueue && this.audioQueue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Stop playback and clear queue
   */
  public stop(): void {
    // Stop current playback
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch (error) {
        // Ignore errors if already stopped
      }
      this.currentSourceNode = null;
    }

    // Clear queue
    this.audioQueue = [];
    this.isProcessingQueue = false;

    // Reset playback time
    if (this.audioContext) {
      this.nextPlaybackTime = this.audioContext.currentTime;
    }

    this.updateState(PlaybackState.IDLE);
  }

  /**
   * Clear audio queue without stopping current playback
   */
  public clearQueue(): void {
    this.audioQueue = [];
  }

  /**
   * Set playback volume
   * @param volume - Volume level from 0.0 to 1.0
   */
  public setVolume(volume: number): void {
    if (this.gainNode) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      this.gainNode.gain.setValueAtTime(clampedVolume, this.audioContext?.currentTime || 0);
    }
  }

  /**
   * Get current volume
   */
  public getVolume(): number {
    return this.gainNode?.gain.value || 1;
  }

  /**
   * Stop playback immediately (for barge-in)
   */
  public stopImmediately(): void {
    // Stop current playback
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch (error) {
        // Ignore errors if already stopped
      }
      this.currentSourceNode = null;
    }

    // Clear queue
    this.audioQueue = [];
    this.isProcessingQueue = false;

    // Reset playback time
    if (this.audioContext) {
      this.nextPlaybackTime = this.audioContext.currentTime;
    }

    this.updateState(PlaybackState.IDLE);
  }

  /**
   * Update state and notify callback
   */
  private updateState(state: PlaybackState): void {
    this.state = state;

    if (this.stateChangeCallback) {
      this.stateChangeCallback(state);
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    console.error('Audio playback error:', error);
    this.updateState(PlaybackState.ERROR);

    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stop();

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.errorCallback = null;
    this.stateChangeCallback = null;
    this.playbackCompleteCallback = null;
  }
}

/**
 * Create a singleton instance of the audio playback service
 */
let audioPlaybackServiceInstance: AudioPlaybackService | null = null;

export function getAudioPlaybackService(config?: AudioPlaybackConfig): AudioPlaybackService {
  if (!audioPlaybackServiceInstance) {
    audioPlaybackServiceInstance = new AudioPlaybackService(config);
  }
  return audioPlaybackServiceInstance;
}

export function resetAudioPlaybackService(): void {
  if (audioPlaybackServiceInstance) {
    audioPlaybackServiceInstance.destroy();
    audioPlaybackServiceInstance = null;
  }
}
