'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

interface Feature {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  detailsKey: string;
}

const KeyFeatures = () => {
  const t = useTranslations();
  const [expandedFeature, setExpandedFeature] = useState<string>('conversation-ai');

  const features: Feature[] = [
    {
      id: 'conversation-ai',
      titleKey: 'features.items.conversationAi.title',
      descriptionKey: 'features.items.conversationAi.description',
      icon: 'ChatBubbleLeftRightIcon',
      detailsKey: 'features.items.conversationAi.details',
    },
    {
      id: 'multilingual',
      titleKey: 'features.items.multilingual.title',
      descriptionKey: 'features.items.multilingual.description',
      icon: 'GlobeAltIcon',
      detailsKey: 'features.items.multilingual.details',
    },
    {
      id: 'real-time',
      titleKey: 'features.items.realtime.title',
      descriptionKey: 'features.items.realtime.description',
      icon: 'BoltIcon',
      detailsKey: 'features.items.realtime.details',
    },
    {
      id: 'compliance',
      titleKey: 'features.items.compliance.title',
      descriptionKey: 'features.items.compliance.description',
      icon: 'ShieldCheckIcon',
      detailsKey: 'features.items.compliance.details',
    },
    {
      id: 'api-first',
      titleKey: 'features.items.apiFirst.title',
      descriptionKey: 'features.items.apiFirst.description',
      icon: 'CodeBracketIcon',
      detailsKey: 'features.items.apiFirst.details',
    },
    {
      id: 'targeting',
      titleKey: 'features.items.targeting.title',
      descriptionKey: 'features.items.targeting.description',
      icon: 'MapPinIcon',
      detailsKey: 'features.items.targeting.details',
    },
  ];

  const toggleFeature = (featureId: string) => {
    setExpandedFeature(expandedFeature === featureId ? '' : featureId);
  };

  return (
    <section id="features" className="py-20 bg-gradient-to-br from-background to-secondary/5">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t('features.title')}
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {t('features.subtitle')}
          </p>
        </div>

        {/* Accordion-Style Layout */}
        <div className="max-w-5xl mx-auto">
          <div className="space-y-4">
            {features.map((feature) => {
              const isOpen = expandedFeature === feature.id;

              return (
                <div
                  key={feature.id}
                  className={`bg-card border-2 rounded-2xl overflow-hidden transition-all duration-300 ${
                    isOpen
                      ? 'border-primary shadow-xl'
                      : 'border-border hover:border-primary/50 hover:shadow-md'
                  }`}
                >
                  {/* Accordion Header */}
                  <button
                    onClick={() => toggleFeature(feature.id)}
                    className="w-full text-left p-6 transition-colors hover:bg-primary/5"
                    aria-expanded={isOpen}
                    aria-controls={`feature-content-${feature.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                            isOpen ? 'bg-primary/20' : 'bg-muted'
                          }`}
                        >
                          <Icon
                            name={feature.icon as any}
                            size={24}
                            className={isOpen ? 'text-primary' : 'text-text-secondary'}
                            variant="solid"
                          />
                        </div>
                        <div className="flex-1">
                          <h3
                            className={`font-semibold mb-2 text-lg ${
                              isOpen ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {t(feature.titleKey)}
                          </h3>
                          <p className="text-sm text-text-secondary">{t(feature.descriptionKey)}</p>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <Icon
                          name="ChevronDownIcon"
                          size={24}
                          className={`text-text-secondary transition-transform duration-300 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          variant="outline"
                        />
                      </div>
                    </div>
                  </button>

                  {/* Accordion Content */}
                  <div
                    id={`feature-content-${feature.id}`}
                    className={`transition-all duration-300 overflow-hidden ${
                      isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="p-6 pt-0 border-t border-border/50">
                      {/* Feature Details */}
                      <div className="mt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(t.raw(feature.detailsKey) as string[]).map((detail: string, index: number) => (
                            <div
                              key={index}
                              className="flex items-start space-x-3 p-4 bg-background rounded-lg"
                            >
                              <Icon
                                name="CheckCircleIcon"
                                size={20}
                                className="text-success flex-shrink-0 mt-0.5"
                                variant="solid"
                              />
                              <span className="text-text-secondary text-sm">{detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default KeyFeatures;