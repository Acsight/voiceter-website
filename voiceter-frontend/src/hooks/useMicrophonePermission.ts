/**
 * Microphone Permission Hook
 * 
 * Custom React hook for managing microphone permissions and handling errors.
 */

import { useState, useCallback, useRef } from 'react';
import {
  AudioCaptureService,
  CaptureState,
  getAudioCaptureService,
} from '@/services/audio/AudioCaptureService';
import { getErrorHandlingService } from '@/services/error';
import {
  MicrophoneErrorType,
  getMicrophoneErrorType,
} from '@/components/demo/MicrophonePermissionPrompt';

/**
 * Microphone permission state
 */
export enum MicrophonePermissionState {
  UNKNOWN = 'unknown',
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'prompt',
  ERROR = 'error',
}

/**
 * Microphone permission hook return type
 */
export interface UseMicrophonePermissionReturn {
  permissionState: MicrophonePermissionState;
  captureState: CaptureState;
  errorType: MicrophoneErrorType | null;
  isGranted: boolean;
  isDenied: boolean;
  isError: boolean;
  requestPermission: () => Promise<boolean>;
  retryPermission: () => Promise<boolean>;
  audioCaptureService: AudioCaptureService;
}

/**
 * Custom hook for managing microphone permissions
 */
export function useMicrophonePermission(): UseMicrophonePermissionReturn {
  const [permissionState, setPermissionState] = useState<MicrophonePermissionState>(
    MicrophonePermissionState.UNKNOWN
  );
  const [captureState, setCaptureState] = useState<CaptureState>(CaptureState.IDLE);
  const [errorType, setErrorType] = useState<MicrophoneErrorType | null>(null);

  const audioCaptureServiceRef = useRef<AudioCaptureService>(getAudioCaptureService());
  const errorHandlingServiceRef = useRef(getErrorHandlingService());

  const audioCaptureService = audioCaptureServiceRef.current;
  const errorHandlingService = errorHandlingServiceRef.current;

  /**
   * Request microphone permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setPermissionState(MicrophonePermissionState.PROMPT);
      setErrorType(null);

      // Set up state change callback
      audioCaptureService.onStateChange((state) => {
        setCaptureState(state);
      });

      // Set up error callback
      audioCaptureService.onError((error) => {
        const micErrorType = getMicrophoneErrorType(error);
        setErrorType(micErrorType);
        setPermissionState(MicrophonePermissionState.ERROR);
        errorHandlingService.handleMicrophoneError(error);
      });

      // Initialize audio capture (this will request permission)
      await audioCaptureService.initialize();

      setPermissionState(MicrophonePermissionState.GRANTED);
      setErrorType(null);
      return true;
    } catch (error) {
      const err = error as Error;
      const micErrorType = getMicrophoneErrorType(err);
      setErrorType(micErrorType);

      // Determine permission state based on error
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      ) {
        setPermissionState(MicrophonePermissionState.DENIED);
      } else {
        setPermissionState(MicrophonePermissionState.ERROR);
      }

      errorHandlingService.handleMicrophoneError(err);
      return false;
    }
  }, [audioCaptureService, errorHandlingService]);

  /**
   * Retry permission request (stops and reinitializes)
   */
  const retryPermission = useCallback(async (): Promise<boolean> => {
    // Stop current capture if active
    if (captureState !== CaptureState.IDLE) {
      audioCaptureService.stop();
    }

    // Reset state
    setErrorType(null);

    // Request permission again
    return requestPermission();
  }, [audioCaptureService, captureState, requestPermission]);

  return {
    permissionState,
    captureState,
    errorType,
    isGranted: permissionState === MicrophonePermissionState.GRANTED,
    isDenied: permissionState === MicrophonePermissionState.DENIED,
    isError: permissionState === MicrophonePermissionState.ERROR,
    requestPermission,
    retryPermission,
    audioCaptureService,
  };
}
