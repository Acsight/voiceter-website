/**
 * Audio Capture Service
 * 
 * Manages microphone access, audio capture, and PCM audio streaming
 * for real-time voice communication with the backend.
 * 
 * IMPORTANT: Gemini Live API requires 16kHz, 16-bit PCM, mono audio input.
 * Most browsers capture at 44.1kHz or 48kHz, so we must resample to 16kHz.
 */

/**
 * Audio capture configuration
 */
export interface AudioCaptureConfig {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

// Target sample rate for Gemini Live API
const GEMINI_TARGET_SAMPLE_RATE = 16000;

/**
 * Audio capture state
 */
export enum CaptureState {
  IDLE = 'idle',
  REQUESTING_PERMISSION = 'requesting_permission',
  INITIALIZING = 'initializing',
  CAPTURING = 'capturing',
  PAUSED = 'paused',
  ERROR = 'error',
}

/**
 * Audio chunk callback type
 */
export type AudioChunkCallback = (audioData: string, sequenceNumber: number) => void;

/**
 * Error callback type
 */
export type ErrorCallback = (error: Error) => void;

/**
 * State change callback type
 */
export type StateChangeCallback = (state: CaptureState) => void;

/**
 * Audio Capture Service Class
 * 
 * Provides microphone access, audio capture using Web Audio API and AudioWorklet,
 * and PCM to base64 conversion for streaming to the backend.
 */
export class AudioCaptureService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private state: CaptureState = CaptureState.IDLE;
  private sequenceNumber = 0;
  private config: Required<AudioCaptureConfig>;
  
  // Resampling state
  private actualSampleRate: number = 0;
  private needsResampling: boolean = false;
  private resampleRatio: number = 1;
  
  // Callbacks
  private audioChunkCallback: AudioChunkCallback | null = null;
  private errorCallback: ErrorCallback | null = null;
  private stateChangeCallback: StateChangeCallback | null = null;

  constructor(config: AudioCaptureConfig = {}) {
    this.config = {
      // Gemini Live expects 16kHz input audio
      sampleRate: config.sampleRate || GEMINI_TARGET_SAMPLE_RATE,
      channelCount: config.channelCount || 1,
      echoCancellation: config.echoCancellation !== false,
      noiseSuppression: config.noiseSuppression !== false,
      autoGainControl: config.autoGainControl !== false,
    };
  }

  /**
   * Get current capture state
   */
  public getState(): CaptureState {
    return this.state;
  }

  /**
   * Get current sequence number
   */
  public getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  /**
   * Set audio chunk callback
   */
  public onAudioChunk(callback: AudioChunkCallback): void {
    this.audioChunkCallback = callback;
  }

  /**
   * Set error callback
   */
  public onError(callback: ErrorCallback): void {
    this.errorCallback = callback;
  }

  /**
   * Set state change callback
   */
  public onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallback = callback;
  }

  /**
   * Initialize audio capture
   * Requests microphone permission and sets up audio processing pipeline
   * 
   * IMPORTANT: Most browsers don't support 16kHz AudioContext natively.
   * We capture at the browser's native rate and resample to 16kHz for Gemini.
   */
  public async initialize(): Promise<void> {
    try {
      this.updateState(CaptureState.REQUESTING_PERMISSION);

      // Request microphone access
      // Note: sampleRate constraint is often ignored by browsers
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
        },
        video: false,
      });

      this.updateState(CaptureState.INITIALIZING);

      // Create audio context - let browser choose optimal sample rate
      // We'll resample to 16kHz ourselves for Gemini Live
      this.audioContext = new AudioContext();
      this.actualSampleRate = this.audioContext.sampleRate;
      
      // Check if we need to resample (almost always yes)
      if (this.actualSampleRate !== GEMINI_TARGET_SAMPLE_RATE) {
        this.needsResampling = true;
        this.resampleRatio = this.actualSampleRate / GEMINI_TARGET_SAMPLE_RATE;
        console.log(`[AudioCapture] Will resample from ${this.actualSampleRate}Hz to ${GEMINI_TARGET_SAMPLE_RATE}Hz (ratio: ${this.resampleRatio.toFixed(4)})`);
      } else {
        this.needsResampling = false;
        this.resampleRatio = 1;
        console.log(`[AudioCapture] No resampling needed - native ${GEMINI_TARGET_SAMPLE_RATE}Hz support`);
      }

      // Load audio processor worklet
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');

      // Create source node from media stream
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      // Set up message handler for audio data
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          this.handleAudioBuffer(event.data.buffer);
        }
      };

      // Connect nodes
      this.sourceNode.connect(this.workletNode);
      // Note: We don't connect to destination to avoid feedback

      console.log(`[AudioCapture] Initialized: actualRate=${this.actualSampleRate}Hz, targetRate=${GEMINI_TARGET_SAMPLE_RATE}Hz, resampling=${this.needsResampling}`);
      
      this.updateState(CaptureState.IDLE);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Start capturing audio
   */
  public start(): void {
    if (this.state === CaptureState.CAPTURING) {
      console.warn('Audio capture already started');
      return;
    }

    if (!this.audioContext || !this.workletNode) {
      throw new Error('Audio capture not initialized. Call initialize() first.');
    }

    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.sequenceNumber = 0;
    this.updateState(CaptureState.CAPTURING);
  }

  /**
   * Pause capturing audio
   */
  public pause(): void {
    if (this.state !== CaptureState.CAPTURING) {
      console.warn('Audio capture not active');
      return;
    }

    if (this.audioContext) {
      this.audioContext.suspend();
    }

    this.updateState(CaptureState.PAUSED);
  }

  /**
   * Resume capturing audio
   */
  public resume(): void {
    if (this.state !== CaptureState.PAUSED) {
      console.warn('Audio capture not paused');
      return;
    }

    if (this.audioContext) {
      this.audioContext.resume();
    }

    this.updateState(CaptureState.CAPTURING);
  }

  /**
   * Stop capturing audio and clean up resources
   */
  public stop(): void {
    // Disconnect nodes
    if (this.sourceNode && this.workletNode) {
      this.sourceNode.disconnect(this.workletNode);
    }

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.sourceNode = null;
    this.workletNode = null;
    this.sequenceNumber = 0;

    this.updateState(CaptureState.IDLE);
  }

  /**
   * Handle audio buffer from worklet
   * Resamples to 16kHz if needed before sending to Gemini
   */
  private handleAudioBuffer(buffer: Float32Array): void {
    if (this.state !== CaptureState.CAPTURING) {
      return;
    }

    try {
      // Skip empty buffers
      if (!buffer || buffer.length === 0) {
        console.warn('Empty audio buffer received');
        return;
      }

      // Resample to 16kHz if needed (most browsers capture at 44.1kHz or 48kHz)
      let processedBuffer = buffer;
      if (this.needsResampling) {
        processedBuffer = this.resampleTo16kHz(buffer);
      }

      // Convert Float32Array to 16-bit PCM
      const pcmData = this.floatToPCM(processedBuffer);

      // Convert PCM to base64
      const base64Data = this.pcmToBase64(pcmData);

      // Validate base64 before sending
      if (!base64Data || base64Data.length === 0 || base64Data.length % 4 !== 0) {
        console.warn('Invalid base64 data generated', { 
          length: base64Data?.length, 
          bufferLength: buffer.length 
        });
        return;
      }

      // Increment sequence number
      this.sequenceNumber++;

      // Call callback with audio data
      if (this.audioChunkCallback) {
        this.audioChunkCallback(base64Data, this.sequenceNumber);
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Resample audio from browser's native sample rate to 16kHz for Gemini Live
   * Uses linear interpolation for simplicity and low latency
   */
  private resampleTo16kHz(inputBuffer: Float32Array): Float32Array {
    // Calculate output length based on ratio
    const outputLength = Math.floor(inputBuffer.length / this.resampleRatio);
    const outputBuffer = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      // Calculate the position in the input buffer
      const inputIndex = i * this.resampleRatio;
      const inputIndexFloor = Math.floor(inputIndex);
      const inputIndexCeil = Math.min(inputIndexFloor + 1, inputBuffer.length - 1);
      const fraction = inputIndex - inputIndexFloor;
      
      // Linear interpolation between two samples
      outputBuffer[i] = inputBuffer[inputIndexFloor] * (1 - fraction) + 
                        inputBuffer[inputIndexCeil] * fraction;
    }
    
    return outputBuffer;
  }

  /**
   * Convert Float32Array to 16-bit PCM
   */
  private floatToPCM(float32Array: Float32Array): Int16Array {
    const pcm = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1]
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      
      // Convert to 16-bit integer
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    
    return pcm;
  }

  /**
   * Convert PCM data to base64 string
   */
  private pcmToBase64(pcmData: Int16Array): string {
    // Convert Int16Array to Uint8Array (byte array)
    const bytes = new Uint8Array(pcmData.buffer);
    
    // Use a more robust base64 encoding approach
    // that handles all byte values correctly
    const chunkSize = 0x8000; // 32KB chunks to avoid call stack issues
    const chunks: string[] = [];
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
    }
    
    return btoa(chunks.join(''));
  }

  /**
   * Update state and notify callback
   */
  private updateState(state: CaptureState): void {
    this.state = state;
    
    if (this.stateChangeCallback) {
      this.stateChangeCallback(state);
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    console.error('Audio capture error:', error);
    this.updateState(CaptureState.ERROR);
    
    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }

  /**
   * Check if microphone permission is granted
   */
  public static async checkMicrophonePermission(): Promise<PermissionState> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch (error) {
      // Fallback for browsers that don't support permissions API
      console.warn('Permissions API not supported:', error);
      return 'prompt';
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stop();
    this.audioChunkCallback = null;
    this.errorCallback = null;
    this.stateChangeCallback = null;
  }
}

/**
 * Create a singleton instance of the audio capture service
 */
let audioCaptureServiceInstance: AudioCaptureService | null = null;

export function getAudioCaptureService(config?: AudioCaptureConfig): AudioCaptureService {
  if (!audioCaptureServiceInstance) {
    audioCaptureServiceInstance = new AudioCaptureService(config);
  }
  return audioCaptureServiceInstance;
}

export function resetAudioCaptureService(): void {
  if (audioCaptureServiceInstance) {
    audioCaptureServiceInstance.destroy();
    audioCaptureServiceInstance = null;
  }
}
