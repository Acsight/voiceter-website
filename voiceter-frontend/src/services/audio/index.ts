/**
 * Audio Services
 * 
 * Export all audio-related services
 */

export {
  AudioCaptureService,
  getAudioCaptureService,
  resetAudioCaptureService,
  CaptureState,
  type AudioCaptureConfig,
  type AudioChunkCallback,
  type ErrorCallback,
  type StateChangeCallback,
} from './AudioCaptureService';

export {
  AudioStreamingIntegration,
  createAudioStreamingIntegration,
  type AudioStreamingConfig,
  type VADStateChangeCallback,
} from './AudioStreamingIntegration';

export {
  AudioPlaybackService,
  getAudioPlaybackService,
  resetAudioPlaybackService,
  PlaybackState,
  type AudioPlaybackConfig,
  type PlaybackErrorCallback,
  type PlaybackStateChangeCallback,
  type PlaybackCompleteCallback,
} from './AudioPlaybackService';

export {
  AudioBargeInService,
  createAudioBargeInService,
  type BargeInConfig,
  type BargeInCallback,
} from './AudioBargeInService';

export {
  VoiceDemoAudioService,
  createVoiceDemoAudioService,
  type VoiceDemoAudioConfig,
} from './VoiceDemoAudioService';

export {
  VoiceActivityDetector,
  createVoiceActivityDetector,
  VADState,
  type VADConfig,
  type VADStateCallback,
  type SpeechCallback,
} from './VoiceActivityDetector';

export {
  NovaSonicAudioIntegration,
  createNovaSonicAudioIntegration,
  getNovaSonicAudioIntegration,
  resetNovaSonicAudioIntegration,
  NOVA_SONIC_AUDIO_CONFIG,
  type NovaSonicAudioConfig,
  type NovaSonicAudioCallbacks,
  type NovaSonicAudioState,
} from './NovaSonicAudioIntegration';
