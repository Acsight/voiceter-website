/**
 * Audio Player Processor Worklet
 * 
 * Handles audio buffering and smooth playback for streaming audio.
 * Optimized for Gemini Live 24kHz PCM output with low-latency playback.
 * 
 * SIMPLIFIED VERSION - removes complex fade logic that may cause audio loss.
 * Focus on reliable audio delivery without gaps.
 */

// Ring buffer implementation for efficient audio buffering
class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
    this.readPtr = 0;
    this.writePtr = 0;
    this.availableSamples = 0;
    this.totalWritten = 0;
    this.totalRead = 0;
    this.droppedSamples = 0;
  }

  write(samples) {
    if (!samples || samples.length === 0) return 0;
    
    const availableSpace = this.capacity - this.availableSamples;
    const samplesToWrite = Math.min(samples.length, availableSpace);
    
    if (samplesToWrite < samples.length) {
      this.droppedSamples += (samples.length - samplesToWrite);
    }
    
    for (let i = 0; i < samplesToWrite; i++) {
      this.buffer[this.writePtr] = samples[i];
      this.writePtr = (this.writePtr + 1) % this.capacity;
    }
    
    this.availableSamples += samplesToWrite;
    this.totalWritten += samplesToWrite;
    return samplesToWrite;
  }

  read(destination) {
    const samplesToRead = Math.min(destination.length, this.availableSamples);
    
    for (let i = 0; i < samplesToRead; i++) {
      destination[i] = this.buffer[this.readPtr];
      this.readPtr = (this.readPtr + 1) % this.capacity;
    }
    
    this.availableSamples -= samplesToRead;
    this.totalRead += samplesToRead;
    return samplesToRead;
  }

  clear() {
    this.readPtr = 0;
    this.writePtr = 0;
    this.availableSamples = 0;
  }

  getAvailable() {
    return this.availableSamples;
  }
  
  getDroppedSamples() {
    return this.droppedSamples;
  }
}

// Simple audio buffer - just stores and plays audio without complex logic
class SimpleAudioBuffer {
  constructor(sampleRate = 48000) {
    // Default to 48kHz since most browsers use this
    this.sampleRate = sampleRate;
    // 30 seconds capacity at 48kHz = 1,440,000 samples
    // This handles both 24kHz and 48kHz audio with plenty of headroom
    this.ringBuffer = new RingBuffer(48000 * 30);
    this.underflowedSamples = 0;
    this.chunksReceived = 0;
    this.totalSamplesWritten = 0;
    this.totalSamplesRead = 0;
  }

  setSampleRate(newSampleRate) {
    if (newSampleRate === this.sampleRate) return;
    
    console.log(`[AudioWorklet] Changing sample rate from ${this.sampleRate} to ${newSampleRate}`);
    
    // Save existing audio
    const existingAudio = this.ringBuffer.getAvailable();
    let savedAudio = null;
    if (existingAudio > 0) {
      savedAudio = new Float32Array(existingAudio);
      this.ringBuffer.read(savedAudio);
    }
    
    this.sampleRate = newSampleRate;
    // Keep buffer at 30 seconds capacity at 48kHz for consistency
    // This ensures we have enough space regardless of sample rate
    this.ringBuffer = new RingBuffer(48000 * 30);
    
    // Restore saved audio
    if (savedAudio && savedAudio.length > 0) {
      this.ringBuffer.write(savedAudio);
    }
  }

  write(samples) {
    if (!samples || samples.length === 0) return;
    
    this.chunksReceived++;
    const written = this.ringBuffer.write(samples);
    this.totalSamplesWritten += written;
    
    if (written < samples.length) {
      console.warn(`[AudioWorklet] Buffer overflow! Dropped ${samples.length - written} samples`);
    }
    
    // Log every 50th chunk
    if (this.chunksReceived % 50 === 1) {
      const bufferedMs = (this.ringBuffer.getAvailable() / this.sampleRate) * 1000;
      console.log(`[AudioWorklet] Chunk #${this.chunksReceived}: wrote ${written} samples, buffered=${bufferedMs.toFixed(0)}ms`);
    }
  }

  read(destination) {
    const copyLength = this.ringBuffer.read(destination);
    this.totalSamplesRead += copyLength;
    
    // Fill remaining with silence if buffer underflow
    if (copyLength < destination.length) {
      destination.fill(0, copyLength);
      this.underflowedSamples += destination.length - copyLength;
    }
    
    return copyLength;
  }

  clearBuffer() {
    this.ringBuffer.clear();
  }
  
  getBufferedSamples() {
    return this.ringBuffer.getAvailable();
  }
}

class AudioPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Initialize with 48kHz since most browsers use this sample rate
    // The frontend will send the actual sample rate via 'set-sample-rate' message
    this.playbackBuffer = new SimpleAudioBuffer(48000);
    this.isPlaying = false;
    this.statusReportInterval = 48000; // Report every second at 48kHz
    this.samplesSinceLastReport = 0;
    this.processCallCount = 0;
    
    console.log('[AudioWorklet] Processor created with 48kHz default, 30s buffer capacity');
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        const audioData = event.data.audioData;
        if (audioData && audioData.length > 0) {
          this.playbackBuffer.write(audioData);
          this.isPlaying = true;
        }
      } else if (event.data.type === 'set-sample-rate') {
        const newSampleRate = event.data.sampleRate;
        console.log(`[AudioWorklet] Received sample rate: ${newSampleRate}`);
        if (newSampleRate && newSampleRate > 0) {
          this.playbackBuffer.setSampleRate(newSampleRate);
          this.statusReportInterval = newSampleRate; // Report every second
        }
      } else if (event.data.type === 'barge-in') {
        this.playbackBuffer.clearBuffer();
        this.isPlaying = false;
        console.log('[AudioWorklet] Barge-in: buffer cleared');
      } else if (event.data.type === 'get-status') {
        this.port.postMessage({
          type: 'status',
          bufferedSamples: this.playbackBuffer.getBufferedSamples(),
          isPlaying: this.isPlaying,
          underflowedSamples: this.playbackBuffer.underflowedSamples,
          sampleRate: this.playbackBuffer.sampleRate,
          processCallCount: this.processCallCount,
        });
      }
    };
  }

  process(inputs, outputs, parameters) {
    this.processCallCount++;
    
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    
    const channel = output[0];
    if (!channel) return true;
    
    // Log first few process calls to verify it's running
    if (this.processCallCount <= 3) {
      console.log(`[AudioWorklet] process() called #${this.processCallCount}, output channels=${output.length}, frameSize=${channel.length}`);
    }
    
    this.playbackBuffer.read(channel);
    
    // Copy to other channels for stereo
    for (let i = 1; i < output.length; i++) {
      if (output[i]) {
        output[i].set(channel);
      }
    }
    
    // Periodic status reporting
    this.samplesSinceLastReport += channel.length;
    if (this.samplesSinceLastReport >= this.statusReportInterval) {
      this.samplesSinceLastReport = 0;
      const bufferedMs = (this.playbackBuffer.getBufferedSamples() / this.playbackBuffer.sampleRate) * 1000;
      console.log(`[AudioWorklet] Status: buffered=${bufferedMs.toFixed(0)}ms, read=${this.playbackBuffer.totalSamplesRead}, written=${this.playbackBuffer.totalSamplesWritten}, processCalls=${this.processCallCount}`);
      this.port.postMessage({
        type: 'status',
        bufferedSamples: this.playbackBuffer.getBufferedSamples(),
        bufferedMs: bufferedMs,
        isPlaying: this.isPlaying,
        underflowedSamples: this.playbackBuffer.underflowedSamples,
        sampleRate: this.playbackBuffer.sampleRate,
        chunksReceived: this.playbackBuffer.chunksReceived,
        droppedSamples: this.playbackBuffer.ringBuffer.getDroppedSamples(),
        totalWritten: this.playbackBuffer.totalSamplesWritten,
        totalRead: this.playbackBuffer.totalSamplesRead,
        processCallCount: this.processCallCount,
      });
    }
    
    return true;
  }
}

registerProcessor('audio-player-processor', AudioPlayerProcessor);
