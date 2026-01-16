/**
 * Audio Input Processor Worklet
 * 
 * Processes microphone input in real-time using AudioWorkletProcessor for 
 * efficient, jitter-free PCM capture. This runs on the audio thread, 
 * eliminating UI lag issues that cause Turkish phoneme detection problems.
 * 
 * CRITICAL: This worklet ensures steady audio chunks for Gemini Live API.
 * Turkish transcription is sensitive to audio gaps/jitter, especially for
 * characters like ç, ş, ğ, ı, ö, ü.
 * 
 * Output: 16kHz, 16-bit PCM, mono (Int16Array)
 */

class AudioInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Buffer size - collect ~256ms of audio at 16kHz (4096 samples)
    // This matches Gemini's expected chunk size for optimal transcription
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // Track if we should send audio (controlled by main thread)
    this.isCapturing = true;
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'pause') {
        this.isCapturing = false;
      } else if (event.data.type === 'resume') {
        this.isCapturing = true;
      } else if (event.data.type === 'set-buffer-size') {
        // Allow dynamic buffer size adjustment
        this.bufferSize = event.data.size || 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    };
    
    console.log('[AudioInputProcessor] Initialized with buffer size:', this.bufferSize);
  }

  /**
   * Process audio samples from microphone
   * 
   * @param {Float32Array[][]} inputs - Input audio data from microphone
   * @param {Float32Array[][]} outputs - Output audio data (unused - we don't play back)
   * @param {Object} parameters - AudioParam values (unused)
   * @returns {boolean} - true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // If no input or no channels, keep processor alive but don't process
    if (!input || input.length === 0) {
      return true;
    }

    // Get the first channel (mono)
    const inputChannel = input[0];
    
    // If not capturing, still process but send silent chunks to maintain
    // temporal context for Gemini's VAD (Voice Activity Detection)
    // This is critical for Turkish transcription accuracy
    const shouldSendSilence = !this.isCapturing;

    // Process each sample
    for (let i = 0; i < inputChannel.length; i++) {
      // If paused, store zeros (comfort noise) instead of actual audio
      this.buffer[this.bufferIndex++] = shouldSendSilence ? 0 : inputChannel[i];

      // When buffer is full, convert to PCM16 and send
      if (this.bufferIndex >= this.bufferSize) {
        // Convert Float32 [-1, 1] to Int16 PCM [-32768, 32767]
        const pcmData = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const sample = Math.max(-1, Math.min(1, this.buffer[j]));
          pcmData[j] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        
        // Send to main thread using Transferable Objects for zero-copy transfer
        // This eliminates the overhead of copying large audio buffers
        this.port.postMessage(
          { 
            type: 'audio', 
            pcmBuffer: pcmData.buffer,
            isSilent: shouldSendSilence 
          }, 
          [pcmData.buffer]
        );
        
        // Reset buffer for next chunk
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

// Register the processor
registerProcessor('audio-input-processor', AudioInputProcessor);
