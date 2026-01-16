'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

interface Step {
  id: number;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  detailsKey: string;
  durationKey: string;
}

const HowItWorks = () => {
  const t = useTranslations();
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const steps: Step[] = [
    {
      id: 1,
      titleKey: 'howItWorks.steps.step1.title',
      descriptionKey: 'howItWorks.steps.step1.description',
      icon: 'DocumentTextIcon',
      detailsKey: 'howItWorks.steps.step1.details',
      durationKey: 'howItWorks.steps.step1.duration'
    },
    {
      id: 2,
      titleKey: 'howItWorks.steps.step2.title',
      descriptionKey: 'howItWorks.steps.step2.description',
      icon: 'RocketLaunchIcon',
      detailsKey: 'howItWorks.steps.step2.details',
      durationKey: 'howItWorks.steps.step2.duration'
    },
    {
      id: 3,
      titleKey: 'howItWorks.steps.step3.title',
      descriptionKey: 'howItWorks.steps.step3.description',
      icon: 'ChartBarIcon',
      detailsKey: 'howItWorks.steps.step3.details',
      durationKey: 'howItWorks.steps.step3.duration'
    }
  ];

  const activeStepData = steps.find((step) => step.id === activeStep);

  return (
    <section id="how-it-works" className="py-20 bg-background">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t('howItWorks.title')}
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">{t('howItWorks.subtitle')}

          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Timeline Navigation */}
          <div className="relative mb-12">
            {/* Progress Line */}
            <div className="absolute top-8 left-0 right-0 h-1 bg-muted hidden md:block">
              <div
                className="h-full bg-gradient-primary transition-all duration-500"
                style={{ width: `${(activeStep - 1) / (steps.length - 1) * 100}%` }} />

            </div>

            {/* Steps */}
            <div className="grid grid-cols-3 gap-2 md:gap-0 relative">
              {steps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`flex flex-col items-center text-center transition-smooth ${
                    activeStep === step.id ? 'md:scale-110 scale-105' : 'scale-100'}`
                  }
                  aria-label={`View step ${step.id}: ${t(step.titleKey)}`}
                  aria-pressed={activeStep === step.id}>

                  <div
                    className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mb-2 md:mb-4 transition-smooth relative z-10 ${
                      activeStep === step.id ?
                        'bg-gradient-cta shadow-primary' :
                        activeStep > step.id ?
                          'bg-primary/20' : 'bg-muted'}`
                    }>

                    <Icon
                      name={step.icon as any}
                      size={isMounted && window.innerWidth < 768 ? 20 : 28}
                      className={activeStep >= step.id ? 'text-white' : 'text-text-secondary'}
                      variant="solid" />

                  </div>
                  <div className="text-xs md:text-sm font-medium text-foreground mb-1">{t(step.titleKey)}</div>
                  <div className="text-[10px] md:text-xs text-text-secondary">{t(step.durationKey)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step Details */}
          {activeStepData &&
          <div className="bg-card border border-border rounded-2xl p-8 shadow-card">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column - Description */}
                <div>
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-cta flex items-center justify-center">
                      <Icon
                      name={activeStepData.icon as any}
                      size={24}
                      className="text-white"
                      variant="solid" />

                    </div>
                    <div>
                      <div className="text-sm text-primary font-medium">{t('howItWorks.step')} {activeStepData.id}</div>
                      <h3 className="text-2xl font-bold text-foreground">{t(activeStepData.titleKey)}</h3>
                    </div>
                  </div>
                  <p className="text-lg text-text-secondary mb-6">{t(activeStepData.descriptionKey)}</p>

                  <div className="flex items-center space-x-2 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                    <Icon name="ClockIcon" size={20} className="text-primary" variant="solid" />
                    <span className="text-sm font-medium text-primary">
                      {t('howItWorks.estimatedTime')}: {t(activeStepData.durationKey)}
                    </span>
                  </div>
                </div>

                {/* Right Column - Details */}
                <div>
                  <h4 className="text-lg font-semibold text-foreground mb-4">{t('howItWorks.keyFeatures')}</h4>
                  <ul className="space-y-3">
                    {(t.raw(activeStepData.detailsKey) as string[]).map((detail: string, index: number) =>
                  <li key={index} className="flex items-start space-x-3">
                        <Icon
                      name="CheckCircleIcon"
                      size={20}
                      className="text-success flex-shrink-0 mt-0.5"
                      variant="solid" />

                        <span className="text-text-secondary">{detail}</span>
                      </li>
                  )}
                  </ul>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                <button
                onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
                disabled={activeStep === 1}
                className="flex items-center space-x-2 px-4 py-2 text-text-secondary hover:text-foreground transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous step">

                  <Icon name="ChevronLeftIcon" size={20} variant="outline" />
                  <span>{t('common.previous')}</span>
                </button>

                <div className="flex items-center space-x-2">
                  {steps.map((step) =>
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`w-2 h-2 rounded-full transition-smooth ${
                  activeStep === step.id ? 'bg-primary w-8' : 'bg-muted'}`
                  }
                  aria-label={`Go to step ${step.id}`} />

                )}
                </div>

                <button
                onClick={() => setActiveStep(Math.min(steps.length, activeStep + 1))}
                disabled={activeStep === steps.length}
                className="flex items-center space-x-2 px-4 py-2 text-text-secondary hover:text-foreground transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next step">

                  <span>{t('common.next')}</span>
                  <Icon name="ChevronRightIcon" size={20} variant="outline" />
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </section>);

};

export default HowItWorks;