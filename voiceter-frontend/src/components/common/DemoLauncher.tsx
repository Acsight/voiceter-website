'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

interface DemoLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

interface Language {
  code: string;
  name: string;
  flag: string;
}

const DemoLauncher = ({ isOpen, onClose, className = '' }: DemoLauncherProps) => {
  const t = useTranslations();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState<boolean>(false);

  const languages: Language[] = [
    { code: 'en', name: t('languages.en'), flag: '🇺🇸' },
    { code: 'tr', name: t('languages.tr'), flag: '🇹🇷' },
    { code: 'es', name: t('languages.es'), flag: '🇪🇸' },
    { code: 'fr', name: t('languages.fr'), flag: '🇫🇷' },
    { code: 'de', name: t('languages.de'), flag: '🇩🇪' },
    { code: 'zh', name: t('languages.zh'), flag: '🇨🇳' },
    { code: 'ja', name: t('languages.ja'), flag: '🇯🇵' },
    { code: 'ar', name: t('languages.ar'), flag: '🇸🇦' },
    { code: 'hi', name: t('languages.hi'), flag: '🇮🇳' },
  ];

  useEffect(() => {
    if (!isOpen) {
      setIsConnected(false);
      setIsConnecting(false);
      setTranscript('');
      setIsMicrophoneEnabled(false);
    }
  }, [isOpen]);

  const handleStartDemo = async () => {
    setIsConnecting(true);
    
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      setTranscript('AI Agent: Hello! I\'m your AI voice assistant. How can I help you with your market research today?');
    }, 2000);
  };

  const handleStopDemo = () => {
    setIsConnected(false);
    setTranscript('');
    setIsMicrophoneEnabled(false);
  };

  const toggleMicrophone = () => {
    setIsMicrophoneEnabled(!isMicrophoneEnabled);
    if (!isMicrophoneEnabled) {
      setTimeout(() => {
        setTranscript(prev => prev + '\n\nYou: I\'d like to learn about customer satisfaction surveys.\n\nAI Agent: Excellent! I can help you design and conduct comprehensive customer satisfaction surveys. Would you like to focus on product feedback, service quality, or overall experience?');
      }, 1500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-demo-overlay bg-background/95 backdrop-blur-md flex items-center justify-center p-4 ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-title"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-card rounded-2xl shadow-card max-w-4xl w-full max-h-[90vh] overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-border">
          <div>
            <h2 id="demo-title" className="text-2xl font-bold text-foreground">
              {t('demo.title')}
            </h2>
            <p className="text-text-secondary mt-1">
              {t('demo.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-foreground transition-smooth rounded-lg hover:bg-muted"
            aria-label={t('common.close')}
          >
            <Icon name="XMarkIcon" size={28} variant="outline" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Language Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-foreground mb-3">
              {t('demo.selectLanguage')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {languages.map((language) => (
                <button
                  key={language.code}
                  onClick={() => setSelectedLanguage(language.code)}
                  className={`flex items-center space-x-2 px-4 py-3 rounded-lg transition-smooth ${
                    selectedLanguage === language.code
                      ? 'bg-primary/10 border-2 border-primary text-primary' :'bg-muted border-2 border-transparent text-text-secondary hover:border-border hover:text-foreground'
                  }`}
                  aria-label={`Select ${language.name}`}
                  aria-pressed={selectedLanguage === language.code}
                >
                  <span className="text-2xl">{language.flag}</span>
                  <span className="font-medium text-sm">{language.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Demo Interface */}
          <div className="bg-background rounded-xl p-6 border border-border">
            {!isConnected && !isConnecting && (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-cta flex items-center justify-center">
                  <Icon name="MicrophoneIcon" size={40} className="text-white" variant="solid" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {t('demo.readyToStart')}
                </h3>
                <p className="text-text-secondary mb-6">
                  {t('demo.readyDescription')}
                </p>
                <button
                  onClick={handleStartDemo}
                  className="px-8 py-4 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg hover:scale-105"
                >
                  {t('demo.startDemo')}
                </button>
              </div>
            )}

            {isConnecting && (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                  <Icon name="SignalIcon" size={40} className="text-primary" variant="solid" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {t('demo.connecting')}
                </h3>
                <p className="text-text-secondary">
                  {t('demo.connectingDescription')}
                </p>
              </div>
            )}

            {isConnected && (
              <div>
                {/* Connection Status */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 rounded-full bg-success animate-pulse-subtle" />
                    <span className="text-sm font-medium text-success">{t('demo.connected')}</span>
                  </div>
                  <button
                    onClick={handleStopDemo}
                    className="px-4 py-2 text-sm font-medium text-error hover:bg-error/10 rounded-lg transition-smooth"
                  >
                    {t('demo.endDemo')}
                  </button>
                </div>

                {/* Transcript */}
                <div className="mb-6 h-64 overflow-y-auto bg-muted/30 rounded-lg p-4">
                  <div className="font-mono text-sm text-foreground whitespace-pre-wrap">
                    {transcript || t('demo.waitingForConversation')}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <button
                    onClick={toggleMicrophone}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-smooth ${
                      isMicrophoneEnabled
                        ? 'bg-error shadow-lg scale-110'
                        : 'bg-gradient-cta shadow-primary hover:shadow-lg hover:scale-105'
                    }`}
                    aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    aria-pressed={isMicrophoneEnabled}
                  >
                    <Icon
                      name={isMicrophoneEnabled ? 'MicrophoneIcon' : 'MicrophoneIcon'}
                      size={32}
                      className="text-white"
                      variant="solid"
                    />
                  </button>
                </div>
                <p className="text-center text-sm text-text-secondary mt-4">
                  {isMicrophoneEnabled ? t('demo.listening') : t('demo.clickToSpeak')}
                </p>
              </div>
            )}
          </div>

          {/* Browser Support Notice */}
          <div className="mt-6 flex items-start space-x-3 p-4 bg-warning/10 border border-warning/20 rounded-lg">
            <Icon name="InformationCircleIcon" size={24} className="text-warning flex-shrink-0" variant="solid" />
            <div className="text-sm">
              <p className="font-medium text-warning mb-1">{t('demo.browserCompatibility')}</p>
              <p className="text-text-secondary">
                {t('demo.browserCompatibilityDescription')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoLauncher;