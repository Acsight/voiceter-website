/**
 * Voice Activity Detector (VAD)
 * 
 * Detects speech activity in audio data using energy-based analysis.
 * Filters out silence and background noise, only passing through speech segments.
 */

/**
 * VAD configuration options
 */
export interface VADConfig {
  /** Energy threshold for speech detection (0-1, default: 0.01) */
  threshold?: number;
  /** Duration of silence (ms) before speech end is detected (default: 500) */
  silenceDuration?: number;
  /** Minimum speech duration (ms) to avoid false positives (default: 100) */
  minSpeechDuration?: number;
  /** Enable/disable VAD (default: true) */
  enabled?: boolean;
}

/**
 * VAD state
 */
export enum VADState {
  SILENCE = 'silence',
  SPEECH_START = 'speech_start',
  SPEAKING = 'speaking',
  SPEECH_END = 'speech_end',
}

/**
 * VAD event callback types
 */
export type VADStateCallback = (state: VADState) => void;
export type SpeechCallback = (audioData: string, sequenceNumber: number) => void;

/**
 * Voice Activity Detector Class
 * 
 * Analyzes audio energy/amplitude to detect speech activity.
 * Only passes through audio segments containing speech.
 */
export class VoiceActivityDetector {
  private config: Required<VADConfig>;
  private isSpeaking = false;
  private silenceStartTime: number | null = null;
  private speechStartTime: number | null = null;
  private currentState: VADState = VADState.SILENCE;
  
  // Callbacks
  private stateCallback: VADStateCallback | null = null;
  private speechCallback: SpeechCallback | null = null;
  
  // Audio buffer for delayed sending (to capture speech start)
  private audioBuffer: Array<{ data: string; seq: number }> = [];
  private maxBufferSize = 5; // Keep last 5 chunks (~160ms at 32ms/chunk)

  constructor(config: VADConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 0.01,
      silenceDuration: config.silenceDuration ?? 500,
      minSpeechDuration: config.minSpeechDuration ?? 100,
      enabled: config.enabled !== false,
    };
  }

  /**
   * Set VAD state change callback
   */
  public onStateChange(callback: VADStateCallback): void {
    this.stateCallback = callback;
  }

  /**
   * Set speech detected callback (only called when speech is detected)
   */
  public onSpeech(callback: SpeechCallback): void {
    this.speechCallback = callback;
  }

  /**
   * Process audio chunk and determine if it contains speech
   * @param audioData Base64 encoded PCM audio data
   * @param sequenceNumber Audio chunk sequence number
   * @returns true if speech detected, false otherwise
   */
  public process(audioData: string, sequenceNumber: number): boolean {
    if (!this.config.enabled) {
      // VAD disabled - pass through all audio
      this.emitSpeech(audioData, sequenceNumber);
      return true;
    }

    // Decode base64 to get raw PCM data for analysis
    const pcmData = this.decodeBase64ToPCM(audioData);
    const energy = this.calculateEnergy(pcmData);
    const now = Date.now();

    // Add to buffer (for capturing speech start)
    this.audioBuffer.push({ data: audioData, seq: sequenceNumber });
    if (this.audioBuffer.length > this.maxBufferSize) {
      this.audioBuffer.shift();
    }

    if (energy > this.config.threshold) {
      // Speech detected
      if (!this.isSpeaking) {
        // Speech just started
        this.speechStartTime = now;
        this.isSpeaking = true;
        this.silenceStartTime = null;
        this.updateState(VADState.SPEECH_START);
        
        // Flush buffer to capture speech start
        this.flushBuffer();
      } else {
        // Continuing speech
        this.updateState(VADState.SPEAKING);
        this.emitSpeech(audioData, sequenceNumber);
      }
      return true;
    } else {
      // Silence detected
      if (this.isSpeaking) {
        // Was speaking, now silence
        if (!this.silenceStartTime) {
          this.silenceStartTime = now;
        }
        
        const silenceDuration = now - this.silenceStartTime;
        
        if (silenceDuration >= this.config.silenceDuration) {
          // Silence long enough - speech ended
          const speechDuration = this.speechStartTime 
            ? now - this.speechStartTime 
            : 0;
          
          // Only count as valid speech if it was long enough
          if (speechDuration >= this.config.minSpeechDuration) {
            this.updateState(VADState.SPEECH_END);
          }
          
          this.isSpeaking = false;
          this.speechStartTime = null;
          this.silenceStartTime = null;
          this.updateState(VADState.SILENCE);
          return false;
        } else {
          // Still within silence tolerance - continue sending
          this.emitSpeech(audioData, sequenceNumber);
          return true;
        }
      }
      
      // Was already silent
      return false;
    }
  }

  /**
   * Calculate RMS energy of audio data
   */
  private calculateEnergy(pcmData: Int16Array): number {
    if (pcmData.length === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < pcmData.length; i++) {
      // Normalize to -1 to 1 range
      const normalized = pcmData[i] / 32768;
      sum += normalized * normalized;
    }
    
    return Math.sqrt(sum / pcmData.length);
  }

  /**
   * Decode base64 string to PCM Int16Array
   * Uses DataView to properly handle little-endian byte order
   */
  private decodeBase64ToPCM(base64Data: string): Int16Array {
    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Ensure we have an even number of bytes for 16-bit samples
      const validLength = bytes.length - (bytes.length % 2);
      if (validLength === 0) {
        return new Int16Array(0);
      }
      
      // Use DataView to properly read 16-bit little-endian PCM samples
      const dataView = new DataView(bytes.buffer);
      const numSamples = validLength / 2;
      const int16Array = new Int16Array(numSamples);
      
      for (let i = 0; i < numSamples; i++) {
        int16Array[i] = dataView.getInt16(i * 2, true); // true = little-endian
      }
      
      return int16Array;
    } catch (error) {
      console.error('Failed to decode audio data:', error);
      return new Int16Array(0);
    }
  }

  /**
   * Flush audio buffer (send all buffered chunks)
   */
  private flushBuffer(): void {
    for (const chunk of this.audioBuffer) {
      this.emitSpeech(chunk.data, chunk.seq);
    }
    this.audioBuffer = [];
  }

  /**
   * Emit speech audio to callback
   */
  private emitSpeech(audioData: string, sequenceNumber: number): void {
    if (this.speechCallback) {
      this.speechCallback(audioData, sequenceNumber);
    }
  }

  /**
   * Update VAD state and notify callback
   */
  private updateState(state: VADState): void {
    if (this.currentState !== state) {
      this.currentState = state;
      if (this.stateCallback) {
        this.stateCallback(state);
      }
    }
  }

  /**
   * Get current VAD state
   */
  public getState(): VADState {
    return this.currentState;
  }

  /**
   * Check if currently speaking
   */
  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Update VAD configuration
   */
  public updateConfig(config: Partial<VADConfig>): void {
    if (config.threshold !== undefined) {
      this.config.threshold = config.threshold;
    }
    if (config.silenceDuration !== undefined) {
      this.config.silenceDuration = config.silenceDuration;
    }
    if (config.minSpeechDuration !== undefined) {
      this.config.minSpeechDuration = config.minSpeechDuration;
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
  }

  /**
   * Enable VAD
   */
  public enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable VAD
   */
  public disable(): void {
    this.config.enabled = false;
  }

  /**
   * Check if VAD is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Reset VAD state
   */
  public reset(): void {
    this.isSpeaking = false;
    this.silenceStartTime = null;
    this.speechStartTime = null;
    this.currentState = VADState.SILENCE;
    this.audioBuffer = [];
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.reset();
    this.stateCallback = null;
    this.speechCallback = null;
  }
}

/**
 * Create VAD instance
 */
export function createVoiceActivityDetector(config?: VADConfig): VoiceActivityDetector {
  return new VoiceActivityDetector(config);
}
