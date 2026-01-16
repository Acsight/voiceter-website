'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import { loadDemoCards } from '@/utils/questionnaireLoader';
import type { DemoCard } from '@/types/questionnaire';
import VoiceDemoInterface from '@/components/demo/VoiceDemoInterface';

function FullDemoExperienceContent() {
  const searchParams = useSearchParams();
  const demoParam = searchParams?.get('demo') || '';
  const t = useTranslations();
  const locale = useLocale();

  const [demoCards, setDemoCards] = useState<DemoCard[]>([]);
  const [selectedDemo, setSelectedDemo] = useState<string>(demoParam);
  const [isLoadingDemos, setIsLoadingDemos] = useState<boolean>(true);
  const [selectedVoice, setSelectedVoice] = useState<string>('Charon'); // Default Gemini voice

  // Helper function to get translated demo card content
  const getTranslatedCard = (card: DemoCard): DemoCard => {
    const demoKey = card.id as keyof typeof translations;
    const translations = {
      'demo-01a-electronics-retail-personalized': 'demo-01a-electronics-retail-personalized',
      'demo-02-concept-test': 'demo-02-concept-test',
      'demo-03-political-polling': 'demo-03-political-polling',
      'demo-04-brand-tracker': 'demo-04-brand-tracker',
      'demo-01b-ecommerce-delivery-personalized': 'demo-01b-ecommerce-delivery-personalized',
      'demo-01c-automotive-service-personalized': 'demo-01c-automotive-service-personalized',
    };
    
    if (translations[demoKey]) {
      try {
        return {
          ...card,
          title: t(`fullDemo.demos.${demoKey}.title`),
          description: t(`fullDemo.demos.${demoKey}.description`),
          industry: t(`fullDemo.demos.${demoKey}.industry`),
          features: [
            t(`fullDemo.demos.${demoKey}.features.0`),
            t(`fullDemo.demos.${demoKey}.features.1`),
            t(`fullDemo.demos.${demoKey}.features.2`),
            t(`fullDemo.demos.${demoKey}.features.3`),
          ].filter(f => f && !f.startsWith('fullDemo.demos')),
        };
      } catch {
        return card;
      }
    }
    return card;
  };

  // Load demo cards on mount
  useEffect(() => {
    async function loadDemos() {
      setIsLoadingDemos(true);
      try {
        const cards = await loadDemoCards();
        setDemoCards(cards);
        
        // If demo parameter is provided in URL, auto-select it
        if (demoParam && cards.some(card => card.id === demoParam)) {
          setSelectedDemo(demoParam);
        }
      } catch (error) {
        console.error('Failed to load demo cards:', error);
      } finally {
        setIsLoadingDemos(false);
      }
    }
    loadDemos();
  }, [demoParam]);

  // Handle demo selection
  const handleDemoSelect = (demoId: string) => {
    setSelectedDemo(demoId);
    
    // Update URL to reflect selected demo
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('demo', demoId);
      window.history.pushState({}, '', url.toString());
    }
  };

  // Handle return to demo selection
  const handleReturnToSelection = () => {
    setSelectedDemo('');
    
    // Clear demo parameter from URL
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.history.pushState({}, '', url.toString());
    }
  };

  // Get the selected demo card for metadata
  const selectedDemoCard = demoCards.find(card => card.id === selectedDemo);
  const translatedSelectedCard = selectedDemoCard ? getTranslatedCard(selectedDemoCard) : null;

  // Show demo selection screen if no demo is selected
  if (!selectedDemo) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <Link href={`/${locale}/landing-page`} className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                <Icon name="ArrowLeftIcon" size={24} className="text-primary" variant="outline" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{t('fullDemo.title')}</h1>
                  <p className="text-sm text-text-secondary">{t('fullDemo.chooseDemo')}</p>
                </div>
              </Link>
              <Link
                href={`/${locale}/landing-page`}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-foreground hover:bg-muted rounded-lg transition-smooth"
              >
                {t('common.backToLandingPage')}
              </Link>
            </div>
          </div>
        </header>

        {/* Demo Selection Content */}
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-6xl mx-auto">
            {/* Introduction */}
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-foreground mb-4">
                {t('fullDemo.selectDemo')}
              </h2>
              <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                {t('fullDemo.selectDemoDescription')}
              </p>
            </div>

            {/* Loading State */}
            {isLoadingDemos && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-text-secondary">{t('fullDemo.loadingDemos')}</p>
                </div>
              </div>
            )}

            {/* Demo Cards Grid */}
            {!isLoadingDemos && demoCards.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {demoCards.map((card) => {
                  const translatedCard = getTranslatedCard(card);
                  return (
                  <div
                    key={card.id}
                    onClick={() => handleDemoSelect(card.id)}
                    className="bg-card border-2 border-border rounded-xl p-6 hover:border-primary hover:shadow-lg transition-all cursor-pointer group flex flex-col h-full"
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="text-4xl flex-shrink-0">{card.icon}</div>
                        <div>
                          <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                            {translatedCard.title}
                          </h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                              {card.duration}
                            </span>
                            <span className="text-xs text-text-secondary">
                              {translatedCard.industry}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Icon
                        name="ChevronRightIcon"
                        size={24}
                        className="text-text-secondary group-hover:text-primary transition-colors flex-shrink-0"
                        variant="outline"
                      />
                    </div>

                    {/* Description */}
                    <p className="text-sm text-text-secondary mb-4 line-clamp-2">
                      {translatedCard.description}
                    </p>

                    {/* Key Features - flex-grow to push button down */}
                    <div className="space-y-2 flex-grow">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        {t('fullDemo.keyFeatures')}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {translatedCard.features.slice(0, 3).map((feature, index) => (
                          <span
                            key={index}
                            className="text-xs px-2 py-1 bg-muted text-foreground rounded"
                          >
                            {feature}
                          </span>
                        ))}
                        {translatedCard.features.length > 3 && (
                          <span className="text-xs px-2 py-1 bg-muted text-text-secondary rounded">
                            +{translatedCard.features.length - 3} {t('fullDemo.more')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Start Button - always at bottom */}
                    <button className="w-full mt-6 px-4 py-3 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg hover:scale-105 flex items-center justify-center space-x-2">
                      <Icon name="PlayIcon" size={20} className="text-white" variant="solid" />
                      <span>{t('fullDemo.startThisDemo')}</span>
                    </button>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Error State */}
            {!isLoadingDemos && demoCards.length === 0 && (
              <div className="text-center py-20">
                <Icon name="ExclamationTriangleIcon" size={48} className="text-error mx-auto mb-4" variant="outline" />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {t('fullDemo.unableToLoad')}
                </h3>
                <p className="text-text-secondary mb-6">
                  {t('fullDemo.unableToLoadDescription')}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-smooth"
                >
                  {t('fullDemo.refreshPage')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show the real VoiceDemoInterface when a demo is selected
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleReturnToSelection}
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            >
              <Icon name="ArrowLeftIcon" size={24} className="text-primary" variant="outline" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {translatedSelectedCard ? translatedSelectedCard.title : t('fullDemo.title')}
                </h1>
                <p className="text-sm text-text-secondary">
                  {t('fullDemo.realTimeVoiceSurvey')}
                </p>
              </div>
            </button>
            <Link
              href={`/${locale}/landing-page`}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-foreground hover:bg-muted rounded-lg transition-smooth"
            >
              {t('common.backToLandingPage')}
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content - Real VoiceDemoInterface Component */}
      <div className="container mx-auto px-6 py-8">
        <VoiceDemoInterface
          questionnaireId={selectedDemo}
          voiceId={selectedVoice}
          onDemoCompleted={handleReturnToSelection}
          onReturnToSelection={handleReturnToSelection}
          className="max-w-7xl mx-auto"
        />
      </div>
    </div>
  );
}

export default function FullDemoExperiencePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Loading demo...</p>
        </div>
      </div>
    }>
      <FullDemoExperienceContent />
    </Suspense>
  );
}
