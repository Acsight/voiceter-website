/**
 * Socket.IO Voice Chat Hook
 * 
 * React hook for voice chat using Socket.IO proxy server with Gemini Live API.
 * 
 * Usage:
 * ```tsx
 * const { 
 *   connect, 
 *   disconnect, 
 *   isReady, 
 *   transcripts,
 *   connectionState 
 * } = useSocketIOVoiceChat({
 *   serverUrl: 'http://localhost:3001',
 *   systemPrompt: 'You are a helpful assistant...',
 *   questionnaireId: 'demo1_csat_nps',
 *   voiceId: 'Charon',
 * });
 * ```
 * 
 * _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  WebSocketService,
  ConnectionState,
} from '../services/websocket/WebSocketService';

/**
 * Transcript entry
 */
export interface Transcript {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isFinal: boolean;
  isSpeculative?: boolean;
}

/**
 * Recorded response from backend
 */
export interface RecordedResponse {
  qid: string;
  question: string;
  answer: string;
  nlpAnalysis?: NLPAnalysisResult;
}

/**
 * NLP Analysis Result - matches backend format from Bedrock Prompt Management
 */
export interface NLPAnalysisResult {
  overall_sentiment_score: number;
  analyzed_topics: Array<{
    topic: string;
    sentiment: string;
    topic_sentiment_score: number;
    intent: string;
    emotion: string;
    keywords: string[];
    key_phrases: Array<{
      phrase: string;
      start_char: number;
      end_char: number;
    }>;
  }>;
  original_text?: string;
  questionId?: string;
  questionnaireId?: string;
}

/**
 * Survey answer from Prompt Management
 */
export interface SurveyAnswer {
  questionId: string;
  question: string;
  answer: string;
  confidence?: number;
}

/**
 * Hook configuration
 */
export interface UseSocketIOVoiceChatConfig {
  serverUrl: string;
  systemPrompt: string;
  questionnaireId?: string;
  /** Voice ID for Gemini Live (e.g., 'Charon', 'Aoede', 'Kore') */
  voiceId?: string;
  /** Language code (e.g., 'en-us', 'tr', 'es') */
  language?: string;
  /** User ID for session tracking */
  userId?: string;
}

/**
 * Service interface that both providers implement
 */
interface VoiceService {
  getConnectionState(): ConnectionState;
  connect(): void;
  disconnect(): void;
  sendAudioChunk(audioData: string, sequenceNumber: number): void;
  sendTranscriptUpdate(transcript: string, questionnaireId: string): void;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
}

/**
 * Hook return type
 */
export interface UseSocketIOVoiceChatReturn {
  // Connection
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  connectionState: ConnectionState;
  isReady: boolean;
  isConnecting: boolean;
  error: Error | null;

  // Transcripts
  transcripts: Transcript[];
  clearTranscripts: () => void;

  // Survey answers from Prompt Management
  surveyAnswers: SurveyAnswer[];
  clearSurveyAnswers: () => void;

  // Recorded responses from record_response tool
  recordedResponses: RecordedResponse[];
  clearRecordedResponses: () => void;

  // NLP Analysis for open-ended responses
  nlpAnalysis: NLPAnalysisResult | null;

  // Audio
  startStreaming: () => Promise<void>;
  stopStreaming: () => Promise<void>;
  isStreaming: boolean;

  // Session management
  endSession: () => Promise<void>;

  // Transcript update for survey answer extraction
  sendTranscriptForExtraction: (questionnaireId: string) => void;
}

/**
 * Audio processing configuration
 */
const AUDIO_CONFIG = {
  targetSampleRate: 16000,
  bufferSize: 4096,
  outputSampleRate: 24000,
};

/**
 * Convert base64 PCM16 to Float32Array for playback
 * 
 * CRITICAL AUDIO FORMAT from Gemini Live API:
 * - Sample Rate: 24,000 Hz
 * - Channels: 1 (Mono)
 * - Bit Depth: 16-bit signed integer (Int16)
 * - Endianness: Little-endian
 * - Transport: Base64 encoded raw PCM bytes
 * 
 * The inlineData.data from Gemini is base64-encoded raw PCM bytes.
 * We decode base64 -> get raw bytes -> interpret as Int16 little-endian -> normalize to Float32
 */

// Track audio decoding stats for debugging
let audioDecodeStats = {
  totalChunks: 0,
  totalSamples: 0,
  errorCount: 0,
  lastLogTime: 0,
};

function base64ToFloat32Array(base64String: string): Float32Array {
  if (!base64String || base64String.length === 0) {
    return new Float32Array(0);
  }
  
  audioDecodeStats.totalChunks++;
  
  try {
    // Clean the base64 string - handle URL-safe base64 variants
    let cleanBase64 = base64String.trim();
    
    // Replace URL-safe characters with standard base64
    cleanBase64 = cleanBase64.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed (base64 strings should be divisible by 4)
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += '=';
    }
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,3}$/.test(cleanBase64)) {
      audioDecodeStats.errorCount++;
      console.warn('[Audio] Invalid base64 string format, first 50 chars:', base64String.substring(0, 50));
      return new Float32Array(0);
    }
    
    // Decode base64 to binary string
    let binaryString: string;
    try {
      binaryString = window.atob(cleanBase64);
    } catch (e) {
      audioDecodeStats.errorCount++;
      console.error('[Audio] Base64 decode failed:', e);
      return new Float32Array(0);
    }
    
    const byteLength = binaryString.length;
    
    // PCM16 requires 2 bytes per sample - ensure even byte count
    const validLength = byteLength - (byteLength % 2);
    if (validLength === 0) {
      audioDecodeStats.errorCount++;
      console.warn('[Audio] No valid audio data after alignment');
      return new Float32Array(0);
    }
    
    // Create ArrayBuffer and copy decoded bytes
    const arrayBuffer = new ArrayBuffer(validLength);
    const uint8View = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < validLength; i++) {
      uint8View[i] = binaryString.charCodeAt(i);
    }
    
    // Use DataView for explicit little-endian Int16 reading
    // This is the CORRECT way to handle PCM16 LE data
    const dataView = new DataView(arrayBuffer);
    const numSamples = validLength / 2;
    const float32Array = new Float32Array(numSamples);
    
    // Convert Int16 PCM to Float32 [-1.0, 1.0]
    // Int16 range: -32768 to 32767
    // Divide by 32768 for symmetric normalization
    let minVal = 0;
    let maxVal = 0;
    let sumAbs = 0;
    let hasClipping = false;
    
    for (let i = 0; i < numSamples; i++) {
      const int16Sample = dataView.getInt16(i * 2, true); // true = little-endian
      const floatSample = int16Sample / 32768.0;
      float32Array[i] = floatSample;
      
      // Track stats
      if (floatSample < minVal) minVal = floatSample;
      if (floatSample > maxVal) maxVal = floatSample;
      sumAbs += Math.abs(floatSample);
      
      // Check for potential issues
      if (int16Sample === -32768 || int16Sample === 32767) {
        hasClipping = true;
      }
    }
    
    audioDecodeStats.totalSamples += numSamples;
    const avgAbs = sumAbs / numSamples;
    
    // Log stats periodically (every 2 seconds) or on issues
    const now = Date.now();
    const shouldLog = (now - audioDecodeStats.lastLogTime > 2000) || hasClipping || avgAbs < 0.001;
    
    if (shouldLog && numSamples > 0) {
      audioDecodeStats.lastLogTime = now;
      
      // Check for potential audio issues
      const issues: string[] = [];
      if (avgAbs < 0.001) issues.push('very quiet (avgAbs < 0.001)');
      if (hasClipping) issues.push('clipping detected');
      if (minVal > -0.1 && maxVal < 0.1) issues.push('low dynamic range');
      
      console.debug('[Audio] Decode stats:', {
        chunk: audioDecodeStats.totalChunks,
        samples: numSamples,
        durationMs: Math.round(numSamples / 24),
        min: minVal.toFixed(4),
        max: maxVal.toFixed(4),
        avgAbs: avgAbs.toFixed(4),
        totalSamples: audioDecodeStats.totalSamples,
        errors: audioDecodeStats.errorCount,
        issues: issues.length > 0 ? issues : 'none',
        // Show first few raw Int16 values for debugging
        rawSamples: Array.from(new Int16Array(arrayBuffer.slice(0, 20))),
      });
    }

    return float32Array;
  } catch (error) {
    audioDecodeStats.errorCount++;
    console.error('[Audio] Error decoding audio:', error);
    return new Float32Array(0);
  }
}

/**
 * Audio Player class with buffering for smooth playback
 * Optimized for Gemini Live 24kHz PCM output
 * 
 * IMPORTANT: Gemini Live outputs 24kHz, 16-bit PCM, mono, little-endian audio.
 * The AudioContext MUST be created at 24kHz to avoid resampling artifacts.
 * If the browser doesn't support 24kHz, we resample the audio before playback.
 */
class BufferedAudioPlayer {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private initialized = false;
  private initializing = false; // Guard against concurrent initialization
  private initPromise: Promise<void> | null = null; // Shared promise for concurrent callers
  private pendingAudioChunks: Float32Array[] = [];
  private isWorkletReady = false;
  private totalChunksReceived = 0;
  private totalChunksSent = 0;
  private actualSampleRate = 0;
  private needsResampling = false;
  private resampleRatio = 1;

  async start(): Promise<void> {
    // Already initialized - return immediately
    if (this.initialized) return;
    
    // Initialization in progress - wait for it to complete
    if (this.initializing && this.initPromise) {
      return this.initPromise;
    }
    
    // Start initialization
    this.initializing = true;
    this.initPromise = this.doStart();
    
    try {
      await this.initPromise;
    } finally {
      this.initializing = false;
      this.initPromise = null;
    }
  }

  private async doStart(): Promise<void> {
    if (this.initialized) return;

    console.log('[AudioPlayer] Starting initialization...');
    
    // Create AudioContext at 24kHz to match Gemini Live output
    // CRITICAL: If the browser doesn't support 24kHz, audio will be resampled
    try {
      this.audioContext = new AudioContext({ sampleRate: AUDIO_CONFIG.outputSampleRate });
      console.log('[AudioPlayer] Created AudioContext at requested 24kHz');
    } catch (e) {
      // Fallback: create default AudioContext and we'll resample manually
      console.warn('[AudioPlayer] Could not create 24kHz AudioContext, using default with resampling');
      this.audioContext = new AudioContext();
    }
    
    this.actualSampleRate = this.audioContext.sampleRate;
    
    // Check if we need to resample
    if (this.actualSampleRate !== AUDIO_CONFIG.outputSampleRate) {
      this.needsResampling = true;
      this.resampleRatio = this.actualSampleRate / AUDIO_CONFIG.outputSampleRate;
      console.warn(`[AudioPlayer] Will resample from ${AUDIO_CONFIG.outputSampleRate}Hz to ${this.actualSampleRate}Hz (ratio: ${this.resampleRatio.toFixed(4)})`);
    } else {
      this.needsResampling = false;
      this.resampleRatio = 1;
      console.log('[AudioPlayer] No resampling needed - native 24kHz support');
    }
    
    // Resume if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      console.log('[AudioPlayer] AudioContext suspended, resuming...');
      await this.audioContext.resume();
    }
    console.log(`[AudioPlayer] AudioContext state: ${this.audioContext.state}, sampleRate: ${this.audioContext.sampleRate}`);
    
    // CRITICAL: Ensure AudioContext is running
    if (this.audioContext.state !== 'running') {
      console.warn('[AudioPlayer] AudioContext not running after resume, trying again...');
      await this.audioContext.resume();
      console.log(`[AudioPlayer] AudioContext state after second resume: ${this.audioContext.state}`);
    }

    // Load the audio worklet processor
    console.log('[AudioPlayer] Loading audio worklet...');
    await this.audioContext.audioWorklet.addModule('/audio-player-processor.worklet.js');
    console.log('[AudioPlayer] Audio worklet loaded');
    
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-player-processor');
    this.workletNode.connect(this.audioContext.destination);
    
    console.log(`[AudioPlayer] Worklet connected. AudioContext: state=${this.audioContext.state}, sampleRate=${this.audioContext.sampleRate}, baseLatency=${this.audioContext.baseLatency}`);
    
    // CRITICAL: Send the sample rate FIRST, before marking as ready
    // This ensures the worklet's buffer is configured correctly before receiving audio
    this.workletNode.port.postMessage({
      type: 'set-sample-rate',
      sampleRate: this.actualSampleRate,
    });
    console.log(`[AudioPlayer] Sent sample rate to worklet: ${this.actualSampleRate}Hz`);
    
    // Handle messages from worklet
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'status') {
        const status = event.data;
        // Always log status for debugging audio issues
        const bufferedMs = (status.bufferedSamples / status.sampleRate) * 1000;
        console.debug('[AudioPlayer] Worklet status:', {
          bufferedMs: bufferedMs.toFixed(0) + 'ms',
          bufferedSamples: status.bufferedSamples,
          underflows: status.underflowedSamples,
          dropped: status.droppedSamples,
          chunksReceived: status.chunksReceived,
          totalWritten: status.totalWritten,
          totalRead: status.totalRead,
          sampleRate: status.sampleRate,
        });
      }
    };
    
    // Mark as ready AFTER sample rate is configured
    this.isWorkletReady = true;
    this.initialized = true;
    
    // Flush any pending audio chunks
    if (this.pendingAudioChunks.length > 0) {
      console.log(`[AudioPlayer] Flushing ${this.pendingAudioChunks.length} pending chunks`);
      for (const chunk of this.pendingAudioChunks) {
        this.sendAudioToWorklet(chunk);
      }
      this.pendingAudioChunks = [];
    }
    
    console.log(`[AudioPlayer] Initialization complete at ${this.actualSampleRate}Hz (source: ${AUDIO_CONFIG.outputSampleRate}Hz, resampling: ${this.needsResampling})`);
  }

  /**
   * Resample audio from source sample rate to target sample rate using linear interpolation
   * This is a simple but effective method for real-time audio resampling
   * 
   * IMPORTANT: Source is 24kHz from Gemini, target is browser's AudioContext sample rate
   * If browser is 48kHz, we need to UPSAMPLE (double the samples)
   * If browser is 24kHz, no resampling needed
   */
  private resampleAudio(samples: Float32Array): Float32Array {
    if (!this.needsResampling || this.resampleRatio === 1) {
      return samples;
    }
    
    // resampleRatio = actualSampleRate / 24000
    // If actualSampleRate = 48000, ratio = 2.0 (we need to double the samples)
    // If actualSampleRate = 44100, ratio = 1.8375 (we need to increase samples by 1.8375x)
    const outputLength = Math.ceil(samples.length * this.resampleRatio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      // Calculate the position in the source array
      const srcPos = i / this.resampleRatio;
      const srcIndex = Math.floor(srcPos);
      const fraction = srcPos - srcIndex;
      
      // Linear interpolation between adjacent samples
      const sample1 = samples[srcIndex] || 0;
      const sample2 = samples[Math.min(srcIndex + 1, samples.length - 1)] || 0;
      
      output[i] = sample1 + fraction * (sample2 - sample1);
    }
    
    return output;
  }

  /**
   * Send audio data to the worklet, with resampling if needed
   * 
   * CRITICAL: Resampling must happen here (in main thread) before sending to worklet.
   * The worklet's ring buffer is sized for the OUTPUT sample rate (e.g., 48kHz),
   * so we must send resampled audio to avoid buffer size mismatches.
   */
  private sendAudioToWorklet(samples: Float32Array): void {
    if (!this.workletNode) {
      console.warn('[AudioPlayer] Cannot send audio - worklet not initialized');
      return;
    }
    
    // Resample if needed (24kHz -> 48kHz typically)
    const audioToSend = this.needsResampling ? this.resampleAudio(samples) : samples;
    
    // Calculate duration for logging
    const inputDurationMs = (samples.length / AUDIO_CONFIG.outputSampleRate) * 1000;
    const outputDurationMs = (audioToSend.length / this.actualSampleRate) * 1000;
    
    // Log resampling stats every 20th chunk for debugging
    if (this.totalChunksSent % 20 === 0) {
      console.debug(`[AudioPlayer] Sending chunk #${this.totalChunksSent}: ${samples.length} -> ${audioToSend.length} samples (${inputDurationMs.toFixed(1)}ms -> ${outputDurationMs.toFixed(1)}ms), resampling=${this.needsResampling}`);
    }
    
    this.workletNode.port.postMessage({
      type: 'audio',
      audioData: audioToSend,
    });
    this.totalChunksSent++;
  }

  playAudio(samples: Float32Array): void {
    if (!samples || samples.length === 0) {
      return;
    }
    
    this.totalChunksReceived++;
    
    // Log every 20th chunk for debugging
    if (this.totalChunksReceived % 20 === 1) {
      const durationMs = (samples.length / AUDIO_CONFIG.outputSampleRate) * 1000;
      console.debug(`[AudioPlayer] Chunk #${this.totalChunksReceived}: ${samples.length} samples (${durationMs.toFixed(1)}ms at 24kHz), initialized=${this.initialized}, workletReady=${this.isWorkletReady}, pending=${this.pendingAudioChunks.length}, resampling=${this.needsResampling}`);
    }
    
    // Validate audio data - check for NaN or Infinity values that could cause corruption
    let hasInvalidSamples = false;
    let maxAbsValue = 0;
    for (let i = 0; i < Math.min(samples.length, 100); i++) {
      if (!Number.isFinite(samples[i])) {
        hasInvalidSamples = true;
        break;
      }
      maxAbsValue = Math.max(maxAbsValue, Math.abs(samples[i]));
    }
    
    if (hasInvalidSamples) {
      console.warn('[AudioPlayer] Received audio chunk with invalid samples (NaN/Infinity), skipping');
      return;
    }
    
    if (!this.initialized || !this.workletNode || !this.isWorkletReady) {
      // Queue audio if worklet not ready yet
      this.pendingAudioChunks.push(samples);
      // Increased limit to 500 chunks (~10 seconds of audio at typical chunk sizes)
      if (this.pendingAudioChunks.length > 500) {
        // Prevent memory buildup - drop oldest chunks
        this.pendingAudioChunks.shift();
        console.warn('[AudioPlayer] Dropping old audio chunk (worklet not ready, queue full)');
      }
      return;
    }

    this.sendAudioToWorklet(samples);
  }

  bargeIn(): void {
    if (!this.workletNode) return;
    
    this.workletNode.port.postMessage({
      type: 'barge-in',
    });
    
    // Also clear pending chunks
    this.pendingAudioChunks = [];
    console.log('BufferedAudioPlayer: Barge-in triggered');
  }

  async stop(): Promise<void> {
    this.isWorkletReady = false;
    this.pendingAudioChunks = [];
    
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.initialized = false;
    this.totalChunksReceived = 0;
    this.totalChunksSent = 0;
    this.actualSampleRate = 0;
    this.needsResampling = false;
    this.resampleRatio = 1;
    console.log('BufferedAudioPlayer: Stopped');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
  
  getSampleRate(): number {
    return this.actualSampleRate;
  }
  
  isResampling(): boolean {
    return this.needsResampling;
  }
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const binary: string[] = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return btoa(binary.join(''));
}

/**
 * Socket.IO Voice Chat Hook
 * 
 * Provides voice chat functionality using Gemini Live API via Socket.IO proxy.
 * 
 * _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
 */
export function useSocketIOVoiceChat(
  config: UseSocketIOVoiceChatConfig
): UseSocketIOVoiceChatReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyAnswer[]>([]);
  const [recordedResponses, setRecordedResponses] = useState<RecordedResponse[]>([]);
  const [nlpAnalysis, setNlpAnalysis] = useState<NLPAnalysisResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const serviceRef = useRef<VoiceService | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioPlayerRef = useRef<BufferedAudioPlayer | null>(null);
  const currentRoleRef = useRef<'user' | 'assistant' | null>(null);
  const currentContentIdRef = useRef<string | null>(null);
  const transcriptsRef = useRef<Transcript[]>([]);
  // Track if AI is speaking to pause audio capture and avoid echo
  const isAISpeakingRef = useRef<boolean>(false);
  // Audio sequence number for sendAudioChunk
  const audioSequenceRef = useRef<number>(0);
  // AudioWorklet node for input processing (replaces deprecated ScriptProcessorNode)
  const inputWorkletNodeRef = useRef<AudioWorkletNode | null>(null);

  /**
   * Initialize the WebSocket service
   */
  useEffect(() => {
    // Initialize WebSocket service for Gemini Live
    const service = new WebSocketService({
      backendUrl: config.serverUrl,
      maxReconnectAttempts: 3,
      reconnectDelay: 1000,
    });
    
    console.log('useSocketIOVoiceChat: Using Gemini Live via WebSocketService');

    serviceRef.current = service as unknown as VoiceService;

    // Set up event listeners
    const handleStateChange = (state: ConnectionState) => {
      setConnectionState(state);
    };

    const handleTextOutput = (data: { role: string; content: string; contentId?: string; isFinal?: boolean }) => {
      const role = data.role === 'USER' ? 'user' : 'assistant';
      const newContent = data.content?.trim() || '';

      // Skip empty content
      if (!newContent) return;

      setTranscripts((prev) => {
        // Get the last transcript entry
        const lastEntry = prev.length > 0 ? prev[prev.length - 1] : null;
        
        // Handle same role updates - Gemini Native Audio often sends REPLACEMENTS, not diffs
        // For Turkish and other languages, this is critical to avoid duplication like "Merhaba Merhaba nasılsın"
        if (lastEntry && lastEntry.role === role && !lastEntry.isFinal) {
          // Check if this is a duplicate (exact match)
          if (lastEntry.content === newContent) {
            return prev;
          }
          
          // Check if newContent is a superset (replacement/extension) of existing content
          // This handles Gemini's incremental transcription where it sends progressively longer text
          if (newContent.startsWith(lastEntry.content.substring(0, Math.min(20, lastEntry.content.length)))) {
            // newContent appears to be a replacement - use it directly
            return prev.map((t, i) =>
              i === prev.length - 1 
                ? { ...t, content: newContent, timestamp: Date.now() } 
                : t
            );
          }
          
          // Check if existing content already contains the new content (duplicate fragment)
          if (lastEntry.content.includes(newContent)) {
            return prev;
          }
          
          // Check for overlapping content at the boundary
          // Find if the end of lastEntry overlaps with the start of newContent
          let overlapLength = 0;
          const maxOverlap = Math.min(lastEntry.content.length, newContent.length);
          for (let i = 1; i <= maxOverlap; i++) {
            if (lastEntry.content.endsWith(newContent.substring(0, i))) {
              overlapLength = i;
            }
          }
          
          if (overlapLength > 0) {
            // Merge with overlap removed
            const mergedContent = lastEntry.content + newContent.substring(overlapLength);
            return prev.map((t, i) =>
              i === prev.length - 1 
                ? { ...t, content: mergedContent.trim(), timestamp: Date.now() } 
                : t
            );
          }
          
          // No overlap detected - append with space (true new content)
          const accumulatedContent = lastEntry.content + ' ' + newContent;
          return prev.map((t, i) =>
            i === prev.length - 1 
              ? { ...t, content: accumulatedContent.trim(), timestamp: Date.now() } 
              : t
          );
        }

        // Start a new transcript entry (role changed or previous was final)
        return [
          ...prev,
          {
            id: `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role,
            content: newContent,
            timestamp: Date.now(),
            isFinal: data.isFinal ?? false,
          },
        ];
      });
    };

    // CRITICAL: handleAudioOutput MUST be synchronous to avoid race conditions
    // Audio chunks arrive rapidly (~20-30ms apart) and async handling causes lost chunks
    const handleAudioOutput = (data: { content: string }) => {
      // Skip empty audio data
      if (!data.content || data.content.length === 0) {
        console.warn('[AudioOutput] Received empty audio chunk');
        return;
      }
      
      // Convert audio IMMEDIATELY - this is fast and synchronous
      const float32 = base64ToFloat32Array(data.content);
      if (float32.length === 0) {
        console.warn('[AudioOutput] Failed to decode audio chunk');
        return;
      }
      
      // Log chunk info for debugging (every 20th chunk)
      const chunkDurationMs = (float32.length / AUDIO_CONFIG.outputSampleRate) * 1000;
      if (audioDecodeStats.totalChunks % 20 === 1) {
        console.debug(`[AudioOutput] Chunk #${audioDecodeStats.totalChunks}: ${float32.length} samples (${chunkDurationMs.toFixed(1)}ms), base64 len=${data.content.length}`);
      }
      
      // Initialize audio player if needed (should already be initialized in connect())
      if (!audioPlayerRef.current) {
        console.log('[AudioOutput] Creating audio player on first chunk');
        audioPlayerRef.current = new BufferedAudioPlayer();
      }
      
      // CRITICAL: If audio player is not initialized yet, start it SYNCHRONOUSLY
      // and queue the audio. The start() will flush pending chunks when ready.
      if (!audioPlayerRef.current.isInitialized()) {
        // Queue audio first
        audioPlayerRef.current.playAudio(float32);
        // Then start initialization (non-blocking)
        audioPlayerRef.current.start().catch(err => {
          console.error('[AudioOutput] Failed to initialize audio player:', err);
        });
      } else {
        // Audio player is ready - send directly to worklet
        audioPlayerRef.current.playAudio(float32);
      }
    };

    const handleError = (data: { errorCode: string; errorMessage: string; recoverable: boolean }) => {
      setError(new Error(`${data.errorCode}: ${data.errorMessage}`));
    };

    const handleSurveyAnswers = (data: { answers: SurveyAnswer[]; source: string }) => {
      console.log('Survey answers received:', data);
      setSurveyAnswers(data.answers || []);
    };

    // Handle session complete - extract survey answers and NLP analysis if included
    const handleSessionComplete = (data: any) => {
      console.log('Session complete received:', data);
      
      // Extract survey answers from session:complete event if available
      if (data?.surveyAnswers && Array.isArray(data.surveyAnswers)) {
        console.log('Survey answers from session:complete:', data.surveyAnswers);
        // Convert to SurveyAnswer format
        const answers: SurveyAnswer[] = data.surveyAnswers.map((a: any) => ({
          questionId: a.questionId || '',
          question: a.questionText || a.question || '',
          answer: a.answer || '',
          confidence: a.confidence,
        }));
        setSurveyAnswers(answers);
      }
      
      // Extract NLP analysis from session:complete event if available
      // Combine all analyses into one result (same logic as handleNlpAnalysis)
      if (data?.nlpAnalysis && Array.isArray(data.nlpAnalysis) && data.nlpAnalysis.length > 0) {
        console.log('NLP analysis from session:complete:', data.nlpAnalysis.length, 'analyses');
        
        // Combine all analyses into one result
        const combinedAnalysis: NLPAnalysisResult = {
          overall_sentiment_score: 0,
          analyzed_topics: [],
          original_text: '',
        };
        
        let totalScore = 0;
        const allTopics: NLPAnalysisResult['analyzed_topics'] = [];
        const allTexts: string[] = [];
        
        for (const analysis of data.nlpAnalysis) {
          if (analysis.overall_sentiment_score !== undefined) {
            totalScore += analysis.overall_sentiment_score;
          }
          if (analysis.analyzed_topics && Array.isArray(analysis.analyzed_topics)) {
            allTopics.push(...analysis.analyzed_topics);
          }
          if (analysis.original_text) {
            allTexts.push(analysis.original_text);
          }
        }
        
        combinedAnalysis.overall_sentiment_score = Math.round(totalScore / data.nlpAnalysis.length);
        combinedAnalysis.analyzed_topics = allTopics;
        combinedAnalysis.original_text = allTexts.join(' ');
        
        console.log('Combined NLP analysis from session:complete:', {
          score: combinedAnalysis.overall_sentiment_score,
          topicCount: combinedAnalysis.analyzed_topics.length,
        });
        
        setNlpAnalysis(combinedAnalysis);
      }
    };

    // Handle recorded responses from record_response tool
    const handleResponseRecorded = (data: RecordedResponse) => {
      console.log('Response recorded received:', data);
      if (data && data.qid) {
        setRecordedResponses((prev) => {
          // Check if this question was already recorded
          const existingIndex = prev.findIndex((r) => r.qid === data.qid);
          if (existingIndex >= 0) {
            // Update existing response
            return prev.map((r, i) => (i === existingIndex ? data : r));
          }
          // Add new response
          return [...prev, data];
        });

        // Update NLP analysis if present
        if (data.nlpAnalysis) {
          console.log('NLP analysis received with response:', data.nlpAnalysis);
          setNlpAnalysis(data.nlpAnalysis);
        }
      }
    };

    // Handle NLP analysis events (separate from response)
    // Supports both single analysis format and batch format from session:end
    // When multiple analyses are received, combine them into one result
    const handleNlpAnalysis = (data: any) => {
      console.log('NLP analysis received:', data);
      
      // Handle batch format from session:end (analyses array)
      if (data && data.analyses && Array.isArray(data.analyses) && data.analyses.length > 0) {
        console.log('Received batch of', data.analyses.length, 'NLP analyses');
        
        // Combine all analyses into one result
        // - Average the overall sentiment scores
        // - Merge all analyzed topics
        // - Concatenate original texts
        const combinedAnalysis: NLPAnalysisResult = {
          overall_sentiment_score: 0,
          analyzed_topics: [],
          original_text: '',
        };
        
        let totalScore = 0;
        const allTopics: NLPAnalysisResult['analyzed_topics'] = [];
        const allTexts: string[] = [];
        
        for (const analysis of data.analyses) {
          if (analysis.overall_sentiment_score !== undefined) {
            totalScore += analysis.overall_sentiment_score;
          }
          if (analysis.analyzed_topics && Array.isArray(analysis.analyzed_topics)) {
            allTopics.push(...analysis.analyzed_topics);
          }
          if (analysis.original_text) {
            allTexts.push(analysis.original_text);
          }
        }
        
        combinedAnalysis.overall_sentiment_score = Math.round(totalScore / data.analyses.length);
        combinedAnalysis.analyzed_topics = allTopics;
        combinedAnalysis.original_text = allTexts.join(' ');
        
        console.log('Combined NLP analysis:', {
          score: combinedAnalysis.overall_sentiment_score,
          topicCount: combinedAnalysis.analyzed_topics.length,
          textLength: combinedAnalysis.original_text?.length,
        });
        
        setNlpAnalysis(combinedAnalysis);
        return;
      }
      
      // Handle single analysis format (questionId + analysis)
      if (data && data.analysis) {
        setNlpAnalysis(data.analysis);
        return;
      }
      
      // Handle direct NLPAnalysisResult format
      if (data && data.overall_sentiment_score !== undefined) {
        setNlpAnalysis(data);
        return;
      }
      
      console.warn('NLP analysis data format not recognized:', data);
    };

    // Handle turn start - AI started speaking, pause audio capture to avoid echo
    const handleTurnStart = () => {
      console.log('AI turn started - pausing audio capture to avoid echo');
      isAISpeakingRef.current = true;
    };

    // Handle turn complete - AI finished speaking, resume audio capture
    const handleTurnComplete = () => {
      console.log('AI turn complete - resuming audio capture');
      isAISpeakingRef.current = false;
      
      // Mark the last assistant transcript as final when turn completes
      setTranscripts((prev) => {
        if (prev.length === 0) return prev;
        const lastEntry = prev[prev.length - 1];
        if (lastEntry.role === 'assistant' && !lastEntry.isFinal) {
          return prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, isFinal: true } : t
          );
        }
        return prev;
      });
    };

    // Handle interruption - user interrupted AI, resume audio capture
    const handleInterruption = () => {
      console.log('Barge-in detected, clearing audio buffer and resuming capture');
      isAISpeakingRef.current = false;
      if (audioPlayerRef.current?.isInitialized()) {
        audioPlayerRef.current.bargeIn();
      }
    };

    // Common event handlers - use WebSocketService event names
    service.on('connection:state', handleStateChange);
    service.on('transcription:user', (data: any) => {
      console.log('[useSocketIOVoiceChat] transcription:user handler received:', data);
      // Backend sends { text, role, isFinal } - extract text field
      const transcript = data?.text || data?.transcript || '';
      handleTextOutput({ role: 'USER', content: transcript, isFinal: data?.isFinal ?? true });
    });
    service.on('transcription:assistant', (data: any) => {
      console.log('[useSocketIOVoiceChat] transcription:assistant handler received:', data);
      // Backend sends { text, role, isFinal } - extract text field
      const transcript = data?.text || data?.transcript || '';
      handleTextOutput({ role: 'ASSISTANT', content: transcript, isFinal: data?.isFinal ?? true });
    });
    service.on('audio:chunk', (data: any) => handleAudioOutput({ content: data?.audioData || '' }));
    service.on('error', handleError);
    service.on('survey:answers', handleSurveyAnswers);
    service.on('session:complete', handleSessionComplete);
    service.on('response:recorded', handleResponseRecorded);
    service.on('nlp:analysis', handleNlpAnalysis);
    
    // Register turn and interruption event handlers
    // These are critical for proper audio echo cancellation
    service.on('turn:start', handleTurnStart);
    service.on('turn:complete', handleTurnComplete);
    service.on('interruption', handleInterruption);

    return () => {
      // Clean up event listeners
      service.off('connection:state', handleStateChange);
      service.off('turn:start', handleTurnStart);
      service.off('turn:complete', handleTurnComplete);
      service.off('interruption', handleInterruption);
      service.disconnect();
    };
  }, [
    config.serverUrl,
    config.systemPrompt,
    config.questionnaireId,
    config.voiceId,
    config.language,
    config.userId
  ]);

  /**
   * Connect to the server and initialize session
   */
  const connect = useCallback(async () => {
    if (!serviceRef.current) return;

    setError(null);

    try {
      // Pre-initialize audio player to avoid delay when first audio chunk arrives
      // This is done early to ensure the AudioWorklet is loaded before audio starts
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new BufferedAudioPlayer();
      }
      if (!audioPlayerRef.current.isInitialized()) {
        try {
          await audioPlayerRef.current.start();
          console.log('Audio player pre-initialized during connect');
        } catch (err) {
          console.warn('Failed to pre-initialize audio player:', err);
          // Don't fail connect - audio player will be initialized on first chunk
        }
      }

      // Create a promise that resolves when connection is established
      const connectionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 30000); // 30 second timeout

        const handleStateChange = (state: ConnectionState) => {
          if (state === ConnectionState.CONNECTED) {
            clearTimeout(timeout);
            resolve();
          } else if (state === ConnectionState.ERROR) {
            clearTimeout(timeout);
            reject(new Error('Connection failed'));
          }
        };

        // Listen for connection state changes
        serviceRef.current!.on('connection:state', handleStateChange);
      });

      // Start the connection
      serviceRef.current.connect();

      // Wait for connection to be established
      await connectionPromise;
      console.log('WebSocket connection established');
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, []);

  /**
   * End session and wait for results
   * Sends session:end event and waits for session:complete with NLP/Survey results
   */
  const endSession = useCallback(async () => {
    if (!serviceRef.current) {
      console.warn('Service not available, cannot end session');
      return;
    }

    // Stop audio streaming first
    await stopStreamingInternal();

    // Cast to WebSocketService to access endSession method
    const wsService = serviceRef.current as unknown as import('../services/websocket/WebSocketService').WebSocketService;

    // Send session:end event
    wsService.endSession('user_ended');
    console.log('📤 Sent session:end event to backend');

    // Wait for session:complete event (with timeout)
    // The backend needs time to call Bedrock for NLP and Survey extraction
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log('⏱️ Timeout waiting for session:complete (15s), continuing anyway');
        resolve();
      }, 15000); // 15 second timeout for Bedrock processing

      // Listen for session:complete event
      const handleComplete = () => {
        console.log('✅ Received session:complete from backend');
        clearTimeout(timeout);
        resolve();
      };

      wsService.on('session:complete', handleComplete);
    });

    console.log('✅ Session ended, results should be available');
  }, []);

  /**
   * Disconnect from the server
   */
  const disconnect = useCallback(async () => {
    await stopStreamingInternal();

    if (serviceRef.current) {
      serviceRef.current.disconnect();
    }
  }, []);

  /**
   * Start audio streaming
   * Uses AudioWorklet for jitter-free audio capture (critical for Turkish transcription)
   */
  const startStreaming = useCallback(async () => {
    if (isStreaming) return;
    if (!serviceRef.current || serviceRef.current.getConnectionState() !== ConnectionState.CONNECTED) {
      throw new Error('Service not ready. Call connect() first.');
    }

    try {
      // Start the session on the backend first - this initializes Gemini Live
      // Cast to WebSocketService to access startSession method
      const wsService = serviceRef.current as unknown as import('../services/websocket/WebSocketService').WebSocketService;
      
      const languageToUse = config.language || 'en-US';
      console.log('🌍 [useSocketIOVoiceChat] Starting session with config:', {
        questionnaireId: config.questionnaireId,
        voiceId: config.voiceId,
        language: config.language,
        languageToUse,
      });
      
      wsService.startSession(
        config.questionnaireId || 'demo-01a-electronics-retail-personalized',
        config.voiceId || 'Charon',
        config.userId,
        languageToUse
      );
      console.log('✅ Session started on backend with language:', languageToUse);

      // Get microphone access with audio processing hints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Request 16kHz if supported (most browsers ignore this)
          sampleRate: AUDIO_CONFIG.targetSampleRate,
        },
      });

      mediaStreamRef.current = stream;

      // Create AudioContext at exactly 16kHz for Gemini Live
      // This ensures steady audio stream without main-thread resampling jitter
      // Critical for Turkish phoneme detection (ç, ş, ğ, ı, ö, ü)
      try {
        audioContextRef.current = new AudioContext({ 
          sampleRate: AUDIO_CONFIG.targetSampleRate,
          latencyHint: 'interactive' 
        });
        console.log(`✅ AudioContext created at ${AUDIO_CONFIG.targetSampleRate}Hz`);
      } catch (e) {
        // Fallback for browsers that don't support 16kHz (rare)
        console.warn('⚠️ Could not create 16kHz AudioContext, using default with resampling');
        audioContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      }

      const audioContext = audioContextRef.current;
      const actualSampleRate = audioContext.sampleRate;
      
      // Log sample rate info for debugging
      if (actualSampleRate !== AUDIO_CONFIG.targetSampleRate) {
        console.warn(`⚠️ AudioContext sample rate mismatch: got ${actualSampleRate}Hz, expected ${AUDIO_CONFIG.targetSampleRate}Hz`);
        console.warn('   Audio will be resampled in worklet - may affect Turkish transcription quality');
      }

      // Load the AudioWorklet for input processing
      // This runs on the audio thread, eliminating UI jitter that breaks Turkish transcription
      await audioContext.audioWorklet.addModule('/audio-input-processor.worklet.js');
      console.log('✅ Audio input worklet loaded');

      // Create source node from microphone stream
      sourceNodeRef.current = audioContext.createMediaStreamSource(stream);
      
      // Create worklet node for audio processing
      inputWorkletNodeRef.current = new AudioWorkletNode(audioContext, 'audio-input-processor');

      // Handle audio data from worklet
      inputWorkletNodeRef.current.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          // Skip if service not connected
          if (!serviceRef.current || serviceRef.current.getConnectionState() !== ConnectionState.CONNECTED) {
            return;
          }

          // The worklet sends silent chunks when paused (AI speaking)
          // This maintains temporal context for Gemini's VAD
          // We still send these to keep the audio stream continuous
          const pcmBuffer: ArrayBuffer = event.data.pcmBuffer;
          const isSilent = event.data.isSilent;
          
          // Convert ArrayBuffer to base64
          const base64Data = arrayBufferToBase64(pcmBuffer);
          
          // Send to backend (including silent chunks for temporal continuity)
          serviceRef.current.sendAudioChunk(base64Data, audioSequenceRef.current++);
          
          // Log occasionally for debugging (every 50 chunks = ~12.8 seconds at 256ms chunks)
          if (audioSequenceRef.current % 50 === 1) {
            console.log(`🎤 Audio chunk #${audioSequenceRef.current} sent (silent: ${isSilent})`);
          }
        }
      };

      // Connect source -> worklet (don't connect to destination to avoid feedback)
      sourceNodeRef.current.connect(inputWorkletNodeRef.current);

      // Set up echo prevention: pause/resume worklet when AI speaks
      // The worklet will send silent chunks instead of stopping completely
      // This is critical for Turkish transcription accuracy
      const updateWorkletCapture = () => {
        if (inputWorkletNodeRef.current) {
          inputWorkletNodeRef.current.port.postMessage({
            type: isAISpeakingRef.current ? 'pause' : 'resume'
          });
        }
      };

      // Override the isAISpeakingRef setter to also update worklet
      const originalIsAISpeaking = isAISpeakingRef.current;
      Object.defineProperty(isAISpeakingRef, 'current', {
        get: () => originalIsAISpeaking,
        set: (value: boolean) => {
          (isAISpeakingRef as any)._value = value;
          updateWorkletCapture();
        },
        configurable: true,
      });
      // Fix: use a backing field
      (isAISpeakingRef as any)._value = originalIsAISpeaking;
      Object.defineProperty(isAISpeakingRef, 'current', {
        get: () => (isAISpeakingRef as any)._value,
        set: (value: boolean) => {
          (isAISpeakingRef as any)._value = value;
          if (inputWorkletNodeRef.current) {
            inputWorkletNodeRef.current.port.postMessage({
              type: value ? 'pause' : 'resume'
            });
          }
        },
        configurable: true,
      });

      setIsStreaming(true);
      console.log('✅ Audio streaming started with AudioWorklet (jitter-free)');
    } catch (err) {
      console.error('Error starting audio streaming:', err);
      setError(err as Error);
      throw err;
    }
  }, [isStreaming, config.questionnaireId, config.voiceId, config.userId]);

  /**
   * Stop audio streaming (internal)
   * Properly cleans up AudioWorklet and all audio resources
   */
  const stopStreamingInternal = async () => {
    // Clean up AudioWorklet node
    if (inputWorkletNodeRef.current) {
      inputWorkletNodeRef.current.port.onmessage = null;
      inputWorkletNodeRef.current.disconnect();
      inputWorkletNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Reset audio sequence counter
    audioSequenceRef.current = 0;

    setIsStreaming(false);
  };

  /**
   * Stop audio streaming
   */
  const stopStreaming = useCallback(async () => {
    await stopStreamingInternal();
    console.log('Audio streaming stopped');
  }, []);

  /**
   * Clear transcripts
   */
  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
    transcriptsRef.current = [];
  }, []);

  /**
   * Clear survey answers
   */
  const clearSurveyAnswers = useCallback(() => {
    setSurveyAnswers([]);
  }, []);

  /**
   * Clear recorded responses
   */
  const clearRecordedResponses = useCallback(() => {
    setRecordedResponses([]);
    setNlpAnalysis(null);
  }, []);

  /**
   * Send transcript to backend for survey answer extraction via Prompt Management
   */
  const sendTranscriptForExtraction = useCallback((questionnaireId: string) => {
    if (!serviceRef.current) return;
    
    // Build full transcript from current transcripts
    const fullTranscript = transcripts
      .filter(t => t.isFinal && t.content.trim())
      .map(t => `${t.role === 'user' ? 'User' : 'AI'}: ${t.content}`)
      .join('\n');
    
    if (fullTranscript.length < 50) {
      console.debug('Transcript too short for extraction');
      return;
    }

    serviceRef.current.sendTranscriptUpdate(fullTranscript, questionnaireId);
  }, [transcripts]);

  // Keep transcriptsRef in sync with transcripts state
  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopStreamingInternal();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.stop();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  return {
    connect,
    disconnect,
    connectionState,
    isReady: connectionState === ConnectionState.CONNECTED,
    isConnecting: connectionState === ConnectionState.CONNECTING,
    error,
    transcripts,
    clearTranscripts,
    surveyAnswers,
    clearSurveyAnswers,
    recordedResponses,
    clearRecordedResponses,
    nlpAnalysis,
    startStreaming,
    stopStreaming,
    isStreaming,
    endSession,
    sendTranscriptForExtraction,
  };
}
