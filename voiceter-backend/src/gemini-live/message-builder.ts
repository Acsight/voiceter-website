/**
 * Gemini Live Message Builder
 *
 * This module provides functions to build messages for the Gemini Live API,
 * including the setup message, audio input messages, and tool response messages.
 */

import { getGeminiConfig } from './config';
import {
  GeminiSetupMessage,
  GeminiAudioInputMessage,
  GeminiToolResponseMessage,
  GeminiSessionConfig,
  GeminiFunctionDeclaration,
} from './types';

/**
 * Build the setup message for initializing a Gemini Live session.
 *
 * This function creates a properly formatted setup message that includes:
 * - Model specification
 * - Response modalities set to AUDIO
 * - System instruction from config
 * - Tool function declarations (if provided)
 * - Voice configuration
 *
 * NOTE: Vertex AI WebSocket API requires snake_case field names!
 *
 * @param config - Session configuration including voice, system prompt, and tools
 * @returns Formatted setup message for Gemini Live API
 */
export function buildSetupMessage(
  config: GeminiSessionConfig
): GeminiSetupMessage {
  const geminiConfig = getGeminiConfig();

  // Build the setup object with snake_case field names (required by Vertex AI WebSocket API)
  const setup: any = {
    // Specify model (full resource name)
    model: `projects/${geminiConfig.projectId}/locations/${geminiConfig.region}/publishers/google/models/${geminiConfig.model}`,

    // Generation config with voice settings (snake_case)
    generation_config: {
      response_modalities: ['AUDIO'],
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: config.voiceName || geminiConfig.defaultVoice,
          },
        },
      },
    },

    // System instruction (snake_case)
    system_instruction: {
      parts: [{ text: config.systemPrompt }],
    },

    // Enable transcription for both input (user speech) and output (AI speech)
    // These are required to receive transcription events from Gemini
    input_audio_transcription: {},
    output_audio_transcription: {},

    // Configure VAD (Voice Activity Detection) for better conversation flow (snake_case)
    realtime_input_config: {
      automatic_activity_detection: {
        start_of_speech_sensitivity: 'START_SENSITIVITY_LOW',   // Avoid false triggers
        end_of_speech_sensitivity: 'END_SENSITIVITY_LOW',       // Wait longer for user to finish
        prefix_padding_ms: 200,                                 // Buffer before speech starts
        silence_duration_ms: 1500,                              // Wait 1.5 seconds of silence before responding
      },
      activity_handling: 'START_OF_ACTIVITY_INTERRUPTS',        // Enable barge-in
    },
  };

  // NOTE: Native audio models (gemini-live-2.5-flash-native-audio) auto-detect language
  // and do NOT support explicit language_code. Language is detected from audio stream.

  // Include tool function declarations (only if tools are provided)
  const toolsArray = buildToolsArray(config.tools);
  if (toolsArray.length > 0) {
    setup.tools = toolsArray;
  }

  // 🔍 DETAILED LOGGING: Log the complete setup message structure
  console.log('\n🔧 ========== GEMINI LIVE SETUP MESSAGE ==========');
  console.log('📍 Model:', setup.model);
  console.log('🎤 Voice:', setup.generation_config.speech_config.voice_config.prebuilt_voice_config.voice_name);
  console.log('🌐 Language:', 'auto-detect (native audio model)');
  console.log('📝 System prompt length:', config.systemPrompt?.length || 0, 'chars');
  console.log('🔧 Tools count:', toolsArray.length > 0 ? toolsArray[0].functionDeclarations?.length || 0 : 0);
  console.log('📦 Full setup structure keys:', Object.keys(setup).join(', '));
  console.log('================================================\n');

  return { setup } as GeminiSetupMessage;
}

/**
 * Build the tools array for the setup message.
 * Wraps function declarations in the required format.
 *
 * @param tools - Array of function declarations
 * @returns Formatted tools array for setup message
 */
function buildToolsArray(
  tools: GeminiFunctionDeclaration[]
): Array<{ functionDeclarations: GeminiFunctionDeclaration[] }> {
  if (!tools || tools.length === 0) {
    //console.log('⚠️  buildToolsArray: No tools provided - Gemini will NOT call any tools!');
    return [];
  }

 // console.log('✅ buildToolsArray: Building tools array with', tools.length, 'tools');
 // console.log('   Tool names:', tools.map(t => t.name).join(', '));

  return [
    {
      functionDeclarations: tools,
    },
  ];
}

/**
 * Build an audio input message for sending audio to Gemini Live.
 *
 * @param audioData - Base64-encoded PCM audio data
 * @returns Formatted audio input message
 */
export function buildAudioInputMessage(
  audioData: string
): GeminiAudioInputMessage {
  return {
    realtimeInput: {
      audio: {
        mimeType: 'audio/pcm;rate=16000',
        data: audioData,
      },
    },
  };
}

/**
 * Build a tool response message for sending tool execution results to Gemini Live.
 *
 * @param callId - The call ID from the original tool call
 * @param response - The tool execution result
 * @returns Formatted tool response message
 */
export function buildToolResponseMessage(
  callId: string,
  response: unknown
): GeminiToolResponseMessage {
  return {
    toolResponse: {
      functionResponses: [
        {
          id: callId,
          response: response,
        },
      ],
    },
  };
}

/**
 * Build a tool response message for multiple tool responses.
 *
 * @param responses - Array of call ID and response pairs
 * @returns Formatted tool response message with multiple responses
 */
export function buildMultipleToolResponseMessage(
  responses: Array<{ id: string; response: unknown }>
): GeminiToolResponseMessage {
  return {
    toolResponse: {
      functionResponses: responses,
    },
  };
}
