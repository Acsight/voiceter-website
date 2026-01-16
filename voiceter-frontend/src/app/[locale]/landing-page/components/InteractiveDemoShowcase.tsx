'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

interface UseCase {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
}

interface InteractiveDemoShowcaseProps {
  onLaunchDemo?: () => void;
}

const InteractiveDemoShowcase = ({ onLaunchDemo }: InteractiveDemoShowcaseProps) => {
  const t = useTranslations();
  const locale = useLocale();
  const [selectedUseCase, setSelectedUseCase] = useState<string>('demo-01a-electronics-retail-personalized');
  const [waveformHeights, setWaveformHeights] = useState<number[]>([]);

  useEffect(() => {
    // Generate waveform heights only on client side to avoid hydration mismatch
    setWaveformHeights(Array.from({ length: 20 }, () => Math.random() * 60 + 20));
  }, []);

  const useCases: UseCase[] = [
  {
    id: 'demo-01a-electronics-retail-personalized',
    titleKey: 'demoShowcase.useCases.electronicsRetail.title',
    descriptionKey: 'demoShowcase.useCases.electronicsRetail.description',
    icon: 'ShoppingBagIcon'
  },
  {
    id: 'demo-01b-ecommerce-delivery-personalized',
    titleKey: 'demoShowcase.useCases.ecommerceDelivery.title',
    descriptionKey: 'demoShowcase.useCases.ecommerceDelivery.description',
    icon: 'TruckIcon'
  },
  {
    id: 'demo-01c-automotive-service-personalized',
    titleKey: 'demoShowcase.useCases.automotiveService.title',
    descriptionKey: 'demoShowcase.useCases.automotiveService.description',
    icon: 'WrenchScrewdriverIcon'
  },
  {
    id: 'demo-02-concept-test',
    titleKey: 'demoShowcase.useCases.conceptTest.title',
    descriptionKey: 'demoShowcase.useCases.conceptTest.description',
    icon: 'LightBulbIcon'
  },
  {
    id: 'demo-03-political-polling',
    titleKey: 'demoShowcase.useCases.politicalPolling.title',
    descriptionKey: 'demoShowcase.useCases.politicalPolling.description',
    icon: 'ScaleIcon'
  },
  {
    id: 'demo-04-brand-tracker',
    titleKey: 'demoShowcase.useCases.brandTracker.title',
    descriptionKey: 'demoShowcase.useCases.brandTracker.description',
    icon: 'ChartBarIcon'
  }];

  const toggleUseCase = (useCaseId: string) => {
    setSelectedUseCase(selectedUseCase === useCaseId ? '' : useCaseId);
  };

  const handleLaunchDemo = (demoId: string) => {
    // Open new tab with demo parameter including locale
    window.open(`/${locale}/full-demo-experience-page?demo=${demoId}`, '_blank');
  };

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t('demoShowcase.title')}
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {t('demoShowcase.subtitle')}
          </p>
        </div>

        {/* Accordion-Style Unified Layout */}
        <div className="max-w-5xl mx-auto">
          <div className="space-y-4">
            {useCases.map((useCase) => {
              const isOpen = selectedUseCase === useCase.id;

              return (
                <div
                  key={useCase.id}
                  className={`bg-card border-2 rounded-2xl overflow-hidden transition-all duration-300 ${
                  isOpen ?
                  'border-primary shadow-xl' :
                  'border-border hover:border-primary/50 hover:shadow-md'}`
                  }>

                  {/* Accordion Header - Use Case Info */}
                  <button
                    onClick={() => toggleUseCase(useCase.id)}
                    className="w-full text-left p-6 transition-colors hover:bg-primary/5"
                    aria-expanded={isOpen}
                    aria-controls={`demo-content-${useCase.id}`}>

                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                          isOpen ? 'bg-primary/20' : 'bg-muted'}`
                          }>

                          <Icon
                            name={useCase.icon as any}
                            size={24}
                            className={isOpen ? 'text-primary' : 'text-text-secondary'}
                            variant="solid" />

                        </div>
                        <div className="flex-1">
                          <h3
                            className={`font-semibold mb-2 text-lg ${
                            isOpen ? 'text-primary' : 'text-foreground'}`
                            }>

                            {t(useCase.titleKey)}
                          </h3>
                          <p className="text-sm text-text-secondary">{t(useCase.descriptionKey)}</p>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <Icon
                          name="ChevronDownIcon"
                          size={24}
                          className={`text-text-secondary transition-transform duration-300 ${
                          isOpen ? 'rotate-180' : ''}`
                          }
                          variant="outline" />

                      </div>
                    </div>
                  </button>

                  {/* Accordion Content - Live Demo Preview */}
                  <div
                    id={`demo-content-${useCase.id}`}
                    className={`transition-all duration-300 overflow-hidden ${
                    isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`
                    }>

                    <div className="p-6 pt-0 border-t border-border/50">
                      {/* Live Demo Status Bar */}
                      <div className="flex items-center justify-between mb-6 bg-background rounded-xl p-4 mt-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full bg-success animate-pulse-subtle" />
                          <span className="text-sm font-medium text-foreground">{t('demoShowcase.liveDemoPreview')}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-text-secondary">
                          <Icon name="ClockIcon" size={16} variant="outline" />
                          <span>{t('demoShowcase.avgDuration')}</span>
                        </div>
                      </div>
                      
                      {/* Waveform Visualization */}
                      {/* <div className="bg-background rounded-xl p-6 mb-6">
                        <div className="flex items-center justify-center space-x-2 h-20">
                          {waveformHeights.length > 0 ?
                          waveformHeights.map((height, i) =>
                          <div
                            key={i}
                            className="w-1 bg-gradient-primary rounded-full animate-pulse-subtle"
                            style={{
                              height: `${height}%`,
                              animationDelay: `${i * 0.1}s`
                            }} />

                          ) :

                          // Placeholder during SSR to prevent layout shift
                          Array.from({ length: 20 }).map((_, i) =>
                          <div
                            key={i}
                            className="w-1 bg-gradient-primary rounded-full"
                            style={{
                              height: '40%',
                              opacity: 0.3
                            }} />

                          )
                          }
                        </div>
                      </div> */}

                      {/* Launch Demo Button */}
                      <button
                        onClick={() => handleLaunchDemo(useCase.id)}
                        className="w-full px-8 py-4 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg hover:scale-105 flex items-center justify-center space-x-2">

                        <Icon name="PlayIcon" size={24} className="text-white" variant="solid" />
                        <span>{t('demoShowcase.launchFullDemo')}</span>
                      </button>

                      {/* Features List */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
                        <div className="flex items-center space-x-2">
                          <Icon name="CheckCircleIcon" size={20} className="text-success" variant="solid" />
                          <span className="text-sm text-text-secondary">{t('demoShowcase.features.realTimeTranscription')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Icon name="CheckCircleIcon" size={20} className="text-success" variant="solid" />
                          <span className="text-sm text-text-secondary">{t('demoShowcase.features.naturalConversations')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Icon name="CheckCircleIcon" size={20} className="text-success" variant="solid" />
                          <span className="text-sm text-text-secondary">{t('demoShowcase.features.instantDataExtraction')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>);

            })}
          </div>
        </div>
      </div>
    </section>);

};

export default InteractiveDemoShowcase;