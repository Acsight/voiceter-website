/**
 * Demo Components Index
 * 
 * Central export point for all demo-related components and hooks
 */

// Components
export { default as QuestionDisplay } from './QuestionDisplay';
export type { QuestionDisplayProps, Question, QuestionOption, QuestionConfiguration, QuestionType } from './QuestionDisplay';

export { default as ProgressIndicator } from './ProgressIndicator';
export type { ProgressIndicatorProps, ProgressInfo } from './ProgressIndicator';

export { default as TranscriptionView } from './TranscriptionView';
export type { TranscriptionViewProps, TranscriptionMessage } from './TranscriptionView';

export { default as SessionComplete } from './SessionComplete';
export type { SessionCompleteProps, SessionSummary, CompletionStatus } from './SessionComplete';

export { ConnectionStatus, ConnectionStatusBanner } from './ConnectionStatus';
export type { ConnectionStatusProps, ConnectionStatusBannerProps } from './ConnectionStatus';

export {
  MicrophonePermissionPrompt,
  MicrophonePermissionBanner,
  getMicrophoneErrorType,
  MicrophoneErrorType,
} from './MicrophonePermissionPrompt';
export type {
  MicrophonePermissionPromptProps,
  MicrophonePermissionBannerProps,
} from './MicrophonePermissionPrompt';

export { default as VoiceDemoInterface } from './VoiceDemoInterface';
export type { VoiceDemoInterfaceProps } from './VoiceDemoInterface';
export { DemoState } from './VoiceDemoInterface';

// Hooks
export { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
export type { UseMicrophonePermissionReturn, MicrophonePermissionState } from '@/hooks/useMicrophonePermission';
