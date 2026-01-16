'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';

interface UseCase {
  id: string;
  titleKey: string;
  headlineKey: string;
  scenarioKey: string;
  withVoiceterKey: string;
  itemsKey: string;
  resultsKey: string;
  content: {
    type: 'list' | 'code' | 'image';
    code?: string;
    imagePath?: string;
  };
  resultItems?: Array<{
    metricKey: string;
    valueKey: string;
  }>;
}

const UseCasesGallery = () => {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<string>('market-research');

  const useCases: UseCase[] = [
    {
      id: 'market-research',
      titleKey: 'useCases.tabs.marketResearch.title',
      headlineKey: 'useCases.tabs.marketResearch.headline',
      scenarioKey: 'useCases.tabs.marketResearch.scenario',
      withVoiceterKey: 'useCases.tabs.marketResearch.withVoiceter',
      itemsKey: 'useCases.tabs.marketResearch.items',
      resultsKey: 'useCases.tabs.marketResearch.results',
      content: {
        type: 'list',
      },
      resultItems: [
        {
          metricKey: 'useCases.tabs.marketResearch.savedOnBudget',
          valueKey: 'useCases.tabs.marketResearch.budgetValue',
        },
        {
          metricKey: 'useCases.tabs.marketResearch.completionTime',
          valueKey: 'useCases.tabs.marketResearch.timeValue',
        },
      ],
    },
    {
      id: 'agencies',
      titleKey: 'useCases.tabs.agencies.title',
      headlineKey: 'useCases.tabs.agencies.headline',
      scenarioKey: 'useCases.tabs.agencies.scenario',
      withVoiceterKey: 'useCases.tabs.agencies.withVoiceter',
      itemsKey: 'useCases.tabs.agencies.items',
      resultsKey: 'useCases.tabs.agencies.results',
      content: {
        type: 'list',
      },
      resultItems: [
        {
          metricKey: 'useCases.tabs.agencies.revenueGrowth',
          valueKey: 'useCases.tabs.agencies.revenueValue',
        },
        {
          metricKey: 'useCases.tabs.agencies.teamReduction',
          valueKey: 'useCases.tabs.agencies.teamValue',
        },
      ],
    },
    {
      id: 'developers',
      titleKey: 'useCases.tabs.developers.title',
      headlineKey: 'useCases.tabs.developers.headline',
      scenarioKey: 'useCases.tabs.developers.scenario',
      withVoiceterKey: 'useCases.tabs.developers.withVoiceter',
      itemsKey: '',
      resultsKey: 'useCases.tabs.developers.results',
      content: {
        type: 'code',
        code: `// Create and launch a survey in 10 lines of code
const voiceter = new VoiceterClient(apiKey);

const survey = await voiceter.surveys.create({
  name: "Post-Onboarding Feedback",
  questions: [...], // or use template
  language: "auto-detect",
  schedule: "optimal_time"
});

await survey.addRecipients(userPhoneNumbers);
await survey.launch();

// Get real-time results via webhook
voiceter.webhooks.on('response_completed', (data) => {
  // Process response in your system
});`,
      },
      resultItems: [
        {
          metricKey: 'useCases.tabs.developers.savedOnDev',
          valueKey: 'useCases.tabs.developers.devValue',
        },
        {
          metricKey: 'useCases.tabs.developers.integrationTime',
          valueKey: 'useCases.tabs.developers.timeValue',
        },
      ],
    },
  ];

  const activeUseCase = useCases.find(uc => uc.id === activeTab);

  return (
    <section id="use-cases" className="py-20 bg-gradient-to-br from-background to-primary/5">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t('useCases.title')}
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {t('useCases.subtitle')}
          </p>
        </div>

        <div className="max-w-7xl mx-auto">
          {/* Tab Navigation */}
          <div className="mb-12">
            {/* Mobile: Horizontal scroll with improved touch handling */}
            <div className="md:hidden">
              <div 
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4 touch-pan-x -mx-6 px-6"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {useCases.map((useCase) => (
                  <button
                    key={useCase.id}
                    onClick={() => setActiveTab(useCase.id)}
                    className={`flex-shrink-0 snap-center px-6 py-3 rounded-lg font-medium transition-smooth whitespace-nowrap text-sm ${
                      activeTab === useCase.id
                        ? 'bg-gradient-cta text-white shadow-primary'
                        : 'bg-card border border-border text-text-secondary hover:border-primary/50 hover:text-foreground'
                    }`}
                    aria-label={`View ${t(useCase.titleKey)}`}
                    aria-pressed={activeTab === useCase.id}
                  >
                    {t(useCase.titleKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop: Centered flex wrap */}
            <div className="hidden md:flex md:flex-wrap md:justify-center gap-4">
              {useCases.map((useCase) => (
                <button
                  key={useCase.id}
                  onClick={() => setActiveTab(useCase.id)}
                  className={`px-8 py-4 rounded-lg font-medium transition-smooth whitespace-nowrap ${
                    activeTab === useCase.id
                      ? 'bg-gradient-cta text-white shadow-primary'
                      : 'bg-card border border-border text-text-secondary hover:border-primary/50 hover:text-foreground'
                  }`}
                  aria-label={`View ${t(useCase.titleKey)}`}
                  aria-pressed={activeTab === useCase.id}
                >
                  {t(useCase.titleKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Active Use Case Content */}
          {activeUseCase && (
            <div className="bg-card border border-border rounded-2xl p-8 lg:p-12 shadow-card">
              {/* Headline */}
              <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                {t(activeUseCase.headlineKey)}
              </h3>

              {/* Scenario */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-foreground mb-3">{t('useCases.scenario')}:</h4>
                <p className="text-text-secondary leading-relaxed">{t(activeUseCase.scenarioKey)}</p>
              </div>

              {/* With Voiceter.ai Content */}
              <div className="mb-8">
                <h4 className="text-2xl font-bold text-primary mb-6">{t(activeUseCase.withVoiceterKey)}</h4>
                
                {activeUseCase.content.type === 'list' && activeUseCase.itemsKey && (
                  <div className="grid md:grid-cols-2 gap-8">
                    <ul className="space-y-3">
                      {(t.raw(activeUseCase.itemsKey) as string[]).map((item: string, index: number) => (
                        <li key={index} className="flex items-start space-x-3">
                          <Icon name="CheckCircleIcon" size={24} className="text-success flex-shrink-0 mt-0.5" variant="solid" />
                          <span className="text-text-secondary">{item}</span>
                        </li>
                      ))}
                    </ul>
                    
                    {/* Results Cards */}
                    {activeUseCase.resultItems && (
                      <div className="space-y-4">
                        <h5 className="text-xl font-bold text-foreground mb-4">{t(activeUseCase.resultsKey)}</h5>
                        {activeUseCase.resultItems.map((result, index) => (
                          <div
                            key={index}
                            className="bg-gradient-to-br from-success/10 to-success/5 border border-success/30 rounded-xl p-6 hover:shadow-lg transition-all duration-300"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="text-sm text-text-secondary mb-2">{t(result.metricKey)}</p>
                                <p className="text-3xl font-bold text-success">{t(result.valueKey)}</p>
                              </div>
                              <Icon
                                name="ArrowTrendingUpIcon"
                                size={40}
                                className="text-success/40"
                                variant="solid"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeUseCase.content.type === 'image' && activeUseCase.content.imagePath && (
                  <div className="rounded-lg overflow-hidden border border-border">
                    <AppImage
                      src={activeUseCase.content.imagePath}
                      alt="Market Research Agencies use case with Voiceter.ai features"
                      className="w-full h-auto"
                    />
                  </div>
                )}

                {activeUseCase.content.type === 'code' && activeUseCase.content.code && (
                  <div className="grid lg:grid-cols-2 gap-8">
                    <div className="w-full overflow-hidden">
                      {/* Code Studio Display */}
                      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
                        {/* Code Editor Header */}
                        <div className="bg-gray-800 px-3 sm:px-4 py-2 sm:py-3 flex items-center space-x-2 border-b border-gray-700">
                          <div className="flex space-x-1.5 sm:space-x-2">
                            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-yellow-500"></div>
                            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
                          </div>
                          <div className="flex-1 text-center">
                            <span className="text-gray-400 text-xs sm:text-sm font-mono">voiceter-integration.js</span>
                          </div>
                        </div>
                        
                        {/* Code Content - Fixed mobile responsiveness */}
                        <div className="p-3 sm:p-4 lg:p-6 overflow-x-auto touch-pan-x max-w-full">
                          <pre className="text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-mono leading-relaxed w-full">
                            <code className="text-gray-100 block whitespace-pre-wrap break-words sm:whitespace-pre sm:break-normal">
                              <span className="text-gray-500">// Create and launch a survey in 10 lines of code</span>
                              {'\n'}<span className="text-purple-400">const</span> <span className="text-blue-300">voiceter</span> = <span className="text-purple-400">new</span> <span className="text-yellow-300">VoiceterClient</span>(<span className="text-blue-300">apiKey</span>);
                              {'\n\n'}<span className="text-purple-400">const</span> <span className="text-blue-300">survey</span> = <span className="text-purple-400">await</span> <span className="text-blue-300">voiceter</span>.<span className="text-yellow-300">surveys</span>.<span className="text-green-300">create</span>({'{'}
                              {'\n'}  <span className="text-red-300">name</span>: <span className="text-green-400">"Post-Onboarding Feedback"</span>,
                              {'\n'}  <span className="text-red-300">questions</span>: [...], <span className="text-gray-500">// or use template</span>
                              {'\n'}  <span className="text-red-300">language</span>: <span className="text-green-400">"auto-detect"</span>,
                              {'\n'}  <span className="text-red-300">schedule</span>: <span className="text-green-400">"optimal_time"</span>
                              {'\n'}{'}'});
                              {'\n\n'}<span className="text-purple-400">await</span> <span className="text-blue-300">survey</span>.<span className="text-green-300">addRecipients</span>(<span className="text-blue-300">userPhoneNumbers</span>);
                              {'\n'}<span className="text-purple-400">await</span> <span className="text-blue-300">survey</span>.<span className="text-green-300">launch</span>();
                              {'\n\n'}<span className="text-gray-500">// Get real-time results via webhook</span>
                              {'\n'}<span className="text-blue-300">voiceter</span>.<span className="text-yellow-300">webhooks</span>.<span className="text-green-300">on</span>(<span className="text-green-400">'response_completed'</span>, (<span className="text-blue-300">data</span>) {'=>'} {'{'}
                              {'\n'}  <span className="text-gray-500">// Process response in your system</span>
                              {'\n'}{'}'});
                            </code>
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Results Cards */}
                    {activeUseCase.resultItems && (
                      <div className="space-y-4">
                        <h5 className="text-xl font-bold text-foreground mb-4">{t(activeUseCase.resultsKey)}</h5>
                        {activeUseCase.resultItems.map((result, index) => (
                          <div
                            key={index}
                            className="bg-gradient-to-br from-success/10 to-success/5 border border-success/30 rounded-xl p-6 hover:shadow-lg transition-all duration-300"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="text-sm text-text-secondary mb-2">{t(result.metricKey)}</p>
                                <p className="text-3xl font-bold text-success">{t(result.valueKey)}</p>
                              </div>
                              <Icon
                                name="ArrowTrendingUpIcon"
                                size={40}
                                className="text-success/40"
                                variant="solid"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default UseCasesGallery;