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
 * - Input and output audio transcription enabled
 * - Voice configuration
 *
 * @param config - Session configuration including voice, system prompt, and tools
 * @returns Formatted setup message for Gemini Live API
 */
export function buildSetupMessage(
  config: GeminiSessionConfig
): GeminiSetupMessage {
  const geminiConfig = getGeminiConfig();

  // Build speech config with voice only (no languageCode for native audio models)
  // NOTE: Native audio models like gemini-live-2.5-flash-native-audio auto-detect language
  // and don't support explicit languageCode. Language guidance is provided via system prompt.
  const speechConfig: any = {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: config.voiceName || geminiConfig.defaultVoice,
      },
    },
  };

  // Build generation config
  const generationConfig: any = {
    responseModalities: ['AUDIO'],
    speechConfig,
  };

  // Build system instruction with language guidance
  // For non-English languages, explicitly tell the model to respond in that language
  let systemInstructionText = config.systemPrompt;

  /* if (config.languageCode && !config.languageCode.startsWith('en')) {
    const languageName = getLanguageName(config.languageCode);
    // Google's recommended approach for non-English responses
    systemInstructionText = `${config.systemPrompt}

    LANGUAGE INSTRUCTION: RESPOND IN ${languageName.toUpperCase()}. YOU MUST RESPOND UNMISTAKABLY IN ${languageName.toUpperCase()}.`;
    
    console.log(`🌐 Non-English language detected: ${config.languageCode} (${languageName})`);
    console.log(`   Added language instruction to system prompt`);
  } */

  // Build the setup object with basic settings
  const setup: any = {
    // Specify model
    model: `projects/${geminiConfig.projectId}/locations/${geminiConfig.region}/publishers/google/models/${geminiConfig.model}`,

    // Set responseModalities to AUDIO
    generationConfig,

    // Include system instruction
    systemInstruction: {
      parts: [{ text: systemInstructionText }],
    },

    // Enable transcription (native audio models auto-detect language)
    inputAudioTranscription: {},
    outputAudioTranscription: {},

    // Configure VAD (Voice Activity Detection) for better conversation flow
    // - Low start sensitivity: Avoid false triggers from background noise
    // - Low end sensitivity: Wait longer before assuming user finished speaking
    // - Longer silence duration: Give user time to think between sentences (1.5s)
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',   // Avoid false triggers
        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',       // Wait longer for user to finish
        prefixPaddingMs: 200,                                // Buffer before speech starts
        silenceDurationMs: 1500,                             // Wait 1.5 seconds of silence before responding
      },
      activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',      // Enable barge-in
    },
  };

  // Include tool function declarations (only if tools are provided)
  const toolsArray = buildToolsArray(config.tools);
  if (toolsArray.length > 0) {
    setup.tools = toolsArray;
  }

  // 🔍 DETAILED LOGGING: Log the complete setup message structure
 /*  console.log('\n🔧 ========== GEMINI LIVE SETUP MESSAGE ==========');
  console.log('📍 Model:', setup.model);
  console.log('🎤 Voice:', speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName);
  console.log('📝 System prompt length:', config.systemPrompt?.length || 0, 'chars');
  console.log('🔧 Tools count:', toolsArray.length > 0 ? toolsArray[0].functionDeclarations?.length || 0 : 0);
  console.log('🎙️ Input Audio Transcription:', JSON.stringify(setup.inputAudioTranscription));
  console.log('🔊 Output Audio Transcription:', JSON.stringify(setup.outputAudioTranscription));
  console.log('🎯 VAD Config:', JSON.stringify(setup.realtimeInputConfig, null, 2));
  console.log('📦 Full setup keys:', Object.keys(setup).join(', '));
  console.log('================================================\n'); */

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
