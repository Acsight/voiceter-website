/**
 * Recording Repository
 * 
 * Handles audio recording storage in S3.
 * Creates mono WAV files with proper conversation order.
 * 
 * Strategy: Group consecutive chunks into segments, then place each segment
 * at its start timestamp while keeping audio within segments continuous.
 */

import { uploadToS3 } from './s3';
import { getConfig } from '../server/config';
import { getLogger } from '../monitoring/logger';
import type { RecordingMetadata } from './types';

const logger = getLogger();

// Audio sample rates
const USER_SAMPLE_RATE = 16000;    // User audio from frontend
const OUTPUT_SAMPLE_RATE = 24000;  // Output (matches assistant's native 24kHz)

/**
 * Audio chunk with timestamp
 */
interface TimestampedChunk {
  timestamp: number;
  data: Buffer;
  source: 'user' | 'assistant';
}

/**
 * Audio segment (continuous audio from one source)
 */
interface AudioSegment {
  startMs: number;
  source: 'user' | 'assistant';
  data: Buffer;
}

/**
 * Audio buffer for accumulating chunks during a session
 */
interface AudioBuffer {
  chunks: TimestampedChunk[];
  startTime: number;
  userChunkCount: number;
  assistantChunkCount: number;
  userTotalBytes: number;
  assistantTotalBytes: number;
}

// In-memory audio buffers per session
const audioBuffers = new Map<string, AudioBuffer>();

/**
 * Recording Repository class
 */
export class RecordingRepository {
  private bucket: string;
  private prefix: string;

  constructor() {
    const config = getConfig();
    this.bucket = config.aws.s3BucketName;
    this.prefix = config.aws.s3AudioPrefix;
  }

  /**
   * Initialize audio buffer for a session
   */
  initializeBuffer(sessionId: string): void {
    audioBuffers.set(sessionId, {
      chunks: [],
      startTime: Date.now(),
      userChunkCount: 0,
      assistantChunkCount: 0,
      userTotalBytes: 0,
      assistantTotalBytes: 0,
    });
    logger.info('Audio buffer initialized', { sessionId });
  }

  /**
   * Add user audio chunk to buffer
   */
  addUserAudioChunk(sessionId: string, audioData: Buffer): void {
    const buffer = audioBuffers.get(sessionId);
    if (buffer) {
      buffer.userChunkCount++;
      buffer.userTotalBytes += audioData.length;
      buffer.chunks.push({
        timestamp: Date.now() - buffer.startTime,
        data: audioData,
        source: 'user',
      });
      
      // Log every 100 chunks
      if (buffer.userChunkCount % 100 === 0) {
        logger.debug('User audio chunk stats', {
          sessionId,
          userChunks: buffer.userChunkCount,
          userBytes: buffer.userTotalBytes,
          totalChunks: buffer.chunks.length,
        });
      }
    } else {
      logger.warn('No buffer found for user audio chunk', { sessionId });
    }
  }

  /**
   * Add assistant audio chunk to buffer
   */
  addAssistantAudioChunk(sessionId: string, audioData: Buffer): void {
    const buffer = audioBuffers.get(sessionId);
    if (buffer) {
      buffer.assistantChunkCount++;
      buffer.assistantTotalBytes += audioData.length;
      buffer.chunks.push({
        timestamp: Date.now() - buffer.startTime,
        data: audioData,
        source: 'assistant',
      });
      
      // Log every 50 chunks (assistant sends more frequently)
      if (buffer.assistantChunkCount % 50 === 0) {
        logger.debug('Assistant audio chunk stats', {
          sessionId,
          assistantChunks: buffer.assistantChunkCount,
          assistantBytes: buffer.assistantTotalBytes,
          totalChunks: buffer.chunks.length,
        });
      }
    } else {
      logger.warn('No buffer found for assistant audio chunk', { sessionId });
    }
  }

  /**
   * Save the complete recording to S3
   */
  async saveRecording(
    sessionId: string,
    questionnaireId: string
  ): Promise<RecordingMetadata | null> {
    const config = getConfig();
    
    if (!config.features.enableAudioRecording) {
      logger.debug('Audio recording disabled, skipping save', { sessionId });
      return null;
    }

    const buffer = audioBuffers.get(sessionId);
    if (!buffer) {
      logger.warn('No audio buffer found for session', { sessionId });
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const duration = Math.floor((Date.now() - buffer.startTime) / 1000);

      // Calculate input bytes before processing
      const inputUserBytes = buffer.userTotalBytes;
      const inputAssistantBytes = buffer.assistantTotalBytes;
      const inputTotalBytes = buffer.chunks.reduce((sum, c) => sum + c.data.length, 0);
      
      logger.info('Processing audio for recording', {
        sessionId,
        totalChunks: buffer.chunks.length,
        userChunks: buffer.userChunkCount,
        assistantChunks: buffer.assistantChunkCount,
        userBytes: inputUserBytes,
        assistantBytes: inputAssistantBytes,
        totalInputBytes: inputTotalBytes,
        duration,
      });

      // Build segments from chunks
      const segments = this.buildSegments(buffer.chunks);
      
      // Calculate output bytes after processing
      const outputTotalBytes = segments.reduce((sum, s) => sum + s.data.length, 0);
      const userSegments = segments.filter(s => s.source === 'user');
      const assistantSegments = segments.filter(s => s.source === 'assistant');
      const outputUserBytes = userSegments.reduce((sum, s) => sum + s.data.length, 0);
      const outputAssistantBytes = assistantSegments.reduce((sum, s) => sum + s.data.length, 0);
      
      logger.info('Built audio segments', {
        sessionId,
        segmentCount: segments.length,
        userSegments: userSegments.length,
        assistantSegments: assistantSegments.length,
        outputUserBytes,
        outputAssistantBytes,
        outputTotalBytes,
        // User audio is resampled 16kHz->24kHz (1.5x), so expected output = input * 1.5
        expectedUserBytes: Math.floor(inputUserBytes * 1.5),
        segments: segments.map(s => ({ source: s.source, startMs: s.startMs, bytes: s.data.length })),
      });

      // Create mono WAV with segments placed at correct positions
      const combinedWav = this.createSegmentedMonoWav(segments);

      // Upload
      const combinedKey = `${this.prefix}${sessionId}/${timestamp}_combined.wav`;
      await uploadToS3(this.bucket, combinedKey, combinedWav, 'audio/wav', {
        sessionId,
        questionnaireId,
        type: 'combined',
        duration: duration.toString(),
        channels: 'mono',
      });

      audioBuffers.delete(sessionId);

      const metadata: RecordingMetadata = {
        sessionId,
        questionnaireId,
        duration,
        format: 'wav',
        sampleRate: OUTPUT_SAMPLE_RATE,
        uploadTime: new Date().toISOString(),
        s3Key: combinedKey,
        s3Bucket: this.bucket,
      };

      logger.info('Recording saved to S3', { sessionId, s3Key: combinedKey, size: combinedWav.length });
      return metadata;
    } catch (error) {
      logger.error('Failed to save recording', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      audioBuffers.delete(sessionId);
      return null;
    }
  }

  /**
   * Build segments from chunks
   * Groups consecutive chunks from the same source into segments
   * Preserves timing gaps between chunks within a segment for natural speech
   */
  private buildSegments(chunks: TimestampedChunk[]): AudioSegment[] {
    if (chunks.length === 0) return [];

    // Sort by timestamp
    const sorted = [...chunks].sort((a, b) => a.timestamp - b.timestamp);
    
    // Track chunk processing
    let processedChunks = 0;
    let processedUserChunks = 0;
    let processedAssistantChunks = 0;
    let processedUserBytes = 0;
    let processedAssistantBytes = 0;
    
    // Group chunks by source changes
    const segmentGroups: { source: 'user' | 'assistant'; startMs: number; chunks: TimestampedChunk[] }[] = [];
    let currentGroup: { source: 'user' | 'assistant'; startMs: number; chunks: TimestampedChunk[] } | null = null;

    for (const chunk of sorted) {
      processedChunks++;
      if (chunk.source === 'user') {
        processedUserChunks++;
        processedUserBytes += chunk.data.length;
      } else {
        processedAssistantChunks++;
        processedAssistantBytes += chunk.data.length;
      }
      
      const sourceChanged = currentGroup && currentGroup.source !== chunk.source;

      if (!currentGroup || sourceChanged) {
        if (currentGroup && currentGroup.chunks.length > 0) {
          segmentGroups.push(currentGroup);
        }
        currentGroup = {
          source: chunk.source,
          startMs: chunk.timestamp,
          chunks: [chunk],
        };
      } else {
        currentGroup.chunks.push(chunk);
      }
    }

    // Save last group
    if (currentGroup && currentGroup.chunks.length > 0) {
      segmentGroups.push(currentGroup);
    }

    // Now build segments with proper timing within each group
    const segments: AudioSegment[] = [];
    
    for (const group of segmentGroups) {
      const segmentData = this.buildSegmentWithTiming(group.chunks, group.source);
      
      segments.push({
        startMs: group.startMs,
        source: group.source,
        data: segmentData,
      });
      
      logger.debug('Segment created', {
        source: group.source,
        chunkCount: group.chunks.length,
        outputBytes: segmentData.length,
      });
    }

    logger.info('Segment building complete', {
      inputChunks: chunks.length,
      processedChunks,
      processedUserChunks,
      processedAssistantChunks,
      processedUserBytes,
      processedAssistantBytes,
      outputSegments: segments.length,
    });

    return segments;
  }

  /**
   * Build a single segment by simply concatenating all chunks
   * Pure concatenation - no crossfade to avoid losing audio data
   */
  private buildSegmentWithTiming(chunks: TimestampedChunk[], source: 'user' | 'assistant'): Buffer {
    if (chunks.length === 0) return Buffer.alloc(0);
    
    // Simple concatenation - combine all chunk data in order
    const allData = chunks.map(c => c.data);
    const combinedData = Buffer.concat(allData);
    
    // Resample user audio to output sample rate (16kHz -> 24kHz)
    if (source === 'user') {
      return this.resampleAudio(combinedData, USER_SAMPLE_RATE, OUTPUT_SAMPLE_RATE);
    }
    
    return combinedData;
  }

  /**
   * Create mono WAV with segments placed sequentially (no overlap)
   * Applies fade-in/fade-out at segment boundaries to avoid clicks
   */
  private createSegmentedMonoWav(segments: AudioSegment[]): Buffer {
    if (segments.length === 0) {
      return this.createEmptyWav();
    }

    // Apply fade-in/fade-out to each segment to smooth transitions
    const fadeSamples = 48; // 2ms fade at 24kHz
    const processedSegments = segments.map((seg, index) => {
      const data = Buffer.from(seg.data); // Copy to avoid modifying original
      const samples = data.length / 2;
      
      // Apply fade-in at start (except for first segment)
      if (index > 0 && samples > fadeSamples) {
        for (let i = 0; i < fadeSamples; i++) {
          const fadeIn = i / fadeSamples;
          const offset = i * 2;
          const sample = data.readInt16LE(offset);
          data.writeInt16LE(Math.round(sample * fadeIn), offset);
        }
      }
      
      // Apply fade-out at end (except for last segment)
      if (index < segments.length - 1 && samples > fadeSamples) {
        for (let i = 0; i < fadeSamples; i++) {
          const fadeOut = 1 - (i / fadeSamples);
          const offset = (samples - fadeSamples + i) * 2;
          if (offset + 1 < data.length) {
            const sample = data.readInt16LE(offset);
            data.writeInt16LE(Math.round(sample * fadeOut), offset);
          }
        }
      }
      
      return data;
    });

    // Calculate total size
    let totalBytes = 0;
    for (const seg of processedSegments) {
      totalBytes += seg.length;
    }

    // Concatenate all segments sequentially
    const outputData = Buffer.alloc(totalBytes, 0);
    let currentOffset = 0;
    
    for (const seg of processedSegments) {
      seg.copy(outputData, currentOffset);
      currentOffset += seg.length;
    }

    // Create WAV header
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + outputData.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(OUTPUT_SAMPLE_RATE, 24);
    header.writeUInt32LE(OUTPUT_SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(outputData.length, 40);

    return Buffer.concat([header, outputData]);
  }

  /**
   * Create empty WAV
   */
  private createEmptyWav(): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(OUTPUT_SAMPLE_RATE, 24);
    header.writeUInt32LE(OUTPUT_SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(0, 40);
    return header;
  }

  /**
   * Apply a weighted low-pass filter to smooth high-frequency noise
   * Uses Gaussian-like weights: [1, 2, 4, 2, 1] for better smoothing
   */
  private applyLowPassFilter(inputBuffer: Buffer): Buffer {
    if (inputBuffer.length < 10) return inputBuffer;
    
    const inputSamples = inputBuffer.length / 2;
    const outputBuffer = Buffer.alloc(inputBuffer.length);
    
    // Gaussian-like weights for 5-tap filter
    const weights = [1, 2, 4, 2, 1];
    
    for (let i = 0; i < inputSamples; i++) {
      let weightedSum = 0;
      let actualWeightSum = 0;
      
      for (let j = -2; j <= 2; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < inputSamples) {
          const weight = weights[j + 2];
          weightedSum += inputBuffer.readInt16LE(idx * 2) * weight;
          actualWeightSum += weight;
        }
      }
      
      const filteredSample = Math.round(weightedSum / actualWeightSum);
      outputBuffer.writeInt16LE(filteredSample, i * 2);
    }
    
    return outputBuffer;
  }

  /**
   * Apply multiple passes of low-pass filter for stronger smoothing
   */
  private applyStrongLowPassFilter(inputBuffer: Buffer, passes: number = 2): Buffer {
    let result = inputBuffer;
    for (let i = 0; i < passes; i++) {
      result = this.applyLowPassFilter(result);
    }
    return result;
  }

  /**
   * Resample 16-bit PCM audio using linear interpolation
   * Applies low-pass filter first to reduce high-frequency noise
   */
  private resampleAudio(
    inputBuffer: Buffer,
    inputSampleRate: number,
    outputSampleRate: number
  ): Buffer {
    if (inputSampleRate === outputSampleRate || inputBuffer.length === 0) {
      return inputBuffer;
    }

    // Ensure even number of bytes
    if (inputBuffer.length % 2 !== 0) {
      inputBuffer = inputBuffer.subarray(0, inputBuffer.length - 1);
    }

    if (inputBuffer.length < 2) {
      return Buffer.alloc(0);
    }

    // Apply strong low-pass filter (2 passes) to reduce high-frequency noise
    const filteredBuffer = this.applyStrongLowPassFilter(inputBuffer, 2);

    const ratio = outputSampleRate / inputSampleRate; // 24000/16000 = 1.5 (upsampling)
    const inputSamples = filteredBuffer.length / 2;
    const outputSamples = Math.floor(inputSamples * ratio);
    
    if (outputSamples === 0) {
      return Buffer.alloc(0);
    }
    
    const outputBuffer = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const srcIndex = i / ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples - 1);
      const fraction = srcIndex - srcIndexFloor;

      const offset1 = srcIndexFloor * 2;
      const offset2 = srcIndexCeil * 2;
      
      if (offset1 + 1 >= filteredBuffer.length) break;

      const sample1 = filteredBuffer.readInt16LE(offset1);
      const sample2 = offset2 + 1 < filteredBuffer.length 
        ? filteredBuffer.readInt16LE(offset2) 
        : sample1;

      const interpolatedSample = Math.round(sample1 + (sample2 - sample1) * fraction);
      const clampedSample = Math.max(-32768, Math.min(32767, interpolatedSample));

      outputBuffer.writeInt16LE(clampedSample, i * 2);
    }

    return outputBuffer;
  }

  /**
   * Clean up buffer without saving
   */
  cleanupBuffer(sessionId: string): void {
    audioBuffers.delete(sessionId);
    logger.debug('Audio buffer cleaned up', { sessionId });
  }

  /**
   * Check if a buffer exists for a session
   */
  hasBuffer(sessionId: string): boolean {
    return audioBuffers.has(sessionId);
  }
}

// Singleton instance
let recordingRepository: RecordingRepository | null = null;

/**
 * Get the recording repository singleton
 */
export function getRecordingRepository(): RecordingRepository {
  if (!recordingRepository) {
    recordingRepository = new RecordingRepository();
  }
  return recordingRepository;
}
