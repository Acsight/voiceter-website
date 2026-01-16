/**
 * Audio Processor Worklet
 * 
 * Processes audio in real-time using AudioWorkletProcessor for efficient PCM capture.
 * Captures audio at the browser's native sample rate (typically 44.1kHz or 48kHz).
 * The AudioCaptureService handles resampling to 16kHz for Gemini Live.
 * 
 * IMPORTANT: This worklet runs at the browser's native sample rate, NOT 16kHz.
 * Resampling to 16kHz happens in AudioCaptureService.ts
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer size in samples - we'll collect ~32ms worth of audio
    // At 48kHz: 48000 * 0.032 = 1536 samples
    // At 44.1kHz: 44100 * 0.032 = 1411 samples
    // Using 1536 to handle both common rates
    this.bufferSize = 1536;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // VAD parameters (currently disabled - all audio is sent)
    this.silenceThreshold = 0.005;
    this.minSpeechDuration = 2;
    this.maxSilenceDuration = 15;
    
    // VAD state
    this.consecutiveSpeechChunks = 0;
    this.consecutiveSilenceChunks = 0;
    this.isSpeaking = false;
    
    // Log initialization
    console.log('[AudioProcessor] Initialized with buffer size:', this.bufferSize, 
                '(~32ms @ 48kHz, resampling to 16kHz happens in AudioCaptureService)');
  }

  /**
   * Check if audio buffer contains speech (not silence)
   * @param {Float32Array} buffer - Audio buffer to check
   * @returns {boolean} - true if buffer contains speech
   */
  isSpeechDetected(buffer) {
    // Calculate RMS (Root Mean Square) energy
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    
    // Check if RMS exceeds silence threshold
    return rms > this.silenceThreshold;
  }

  /**
   * Process audio samples
   * @param {Float32Array[][]} inputs - Input audio data
   * @param {Float32Array[][]} outputs - Output audio data (unused)
   * @param {Object} parameters - Parameters (unused)
   * @returns {boolean} - true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // If no input or no channels, return
    if (!input || input.length === 0) {
      return true;
    }

    // Get the first channel (mono)
    const inputChannel = input[0];

    // Process each sample
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];

      // When buffer is full, process and potentially send
      if (this.bufferIndex >= this.bufferSize) {
        // Check if buffer contains speech
        const hasSpeech = this.isSpeechDetected(this.buffer);
        
        if (hasSpeech) {
          this.consecutiveSpeechChunks++;
          this.consecutiveSilenceChunks = 0;
          
          // Start sending after minimum speech duration
          if (this.consecutiveSpeechChunks >= this.minSpeechDuration) {
            this.isSpeaking = true;
          }
        } else {
          this.consecutiveSilenceChunks++;
          this.consecutiveSpeechChunks = 0;
          
          // Stop sending after maximum silence duration
          if (this.consecutiveSilenceChunks >= this.maxSilenceDuration) {
            this.isSpeaking = false;
          }
        }
        
        // TEMPORARY: Disable VAD filtering to test system
        // Always send audio chunks when recording is active
        // TODO: Re-enable VAD after confirming system works
        
        // Create a copy of the buffer to send
        const bufferCopy = new Float32Array(this.buffer);
        
        // Send to main thread
        this.port.postMessage({
          type: 'audio',
          buffer: bufferCopy,
        });

        // Reset buffer
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor);
