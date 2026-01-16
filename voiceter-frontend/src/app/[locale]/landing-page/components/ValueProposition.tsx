'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

interface CalculatorInputs {
  sampleSize: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

interface ROIResults {
  traditionalTime: number;
  aiTime: number;
  traditionalCost: number;
  aiCost: number;
  timeSaved: number;
  costSaved: number;
}

const ValueProposition = () => {
  const t = useTranslations();
  const [inputs, setInputs] = useState<CalculatorInputs>({
    sampleSize: 1000,
    complexity: 'moderate'
  });

  const calculateROI = (): ROIResults => {
    const complexityMultiplier = {
      simple: 1,
      moderate: 1.5,
      complex: 2
    };

    const baseTimePerSurvey = 5; // minutes
    const traditionalTime = inputs.sampleSize * baseTimePerSurvey * complexityMultiplier[inputs.complexity] / 60; // hours
    const aiTime = traditionalTime / 10;

    const traditionalCostPerHour = 60;
    const aiCostPerHour = 180; // 70% cost reduction

    const traditionalCost = traditionalTime * traditionalCostPerHour;
    const aiCost = aiTime * aiCostPerHour;

    return {
      traditionalTime: Math.round(traditionalTime),
      aiTime: Math.round(aiTime * 10) / 10,
      traditionalCost: Math.round(traditionalCost),
      aiCost: Math.round(aiCost),
      timeSaved: Math.round(traditionalTime - aiTime),
      costSaved: Math.round(traditionalCost - aiCost)
    };
  };

  const results = calculateROI();

  // Format numbers consistently for both server and client
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US');
  };

  return (
    <section className="py-20 bg-gradient-to-br from-background to-primary/5">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">{t('valueProposition.title')}

          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">{t('valueProposition.subtitle')}

          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {/* Traditional Call Center */}
            <div className="bg-card border border-border rounded-2xl p-8">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 rounded-lg bg-error/10 flex items-center justify-center">
                  <Icon name="PhoneIcon" size={24} className="text-error" variant="solid" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">{t('valueProposition.traditionalCallCenter')}</h3>
                  <p className="text-sm text-text-secondary">{t('valueProposition.manualSurveyProcess')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-text-secondary">{t('valueProposition.completionTime')}</span>
                  <span className="text-2xl font-bold text-foreground">{results.traditionalTime}{t('valueProposition.hourAbbr')}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-text-secondary">{t('valueProposition.totalCost')}</span>
                  <span className="text-2xl font-bold text-foreground">${formatCurrency(results.traditionalCost)}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-text-secondary">{t('valueProposition.dataQuality')}</span>
                  <span className="text-warning font-semibold">{t('common.variable')}</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-error/5 border border-error/20 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Icon name="ExclamationTriangleIcon" size={20} className="text-error flex-shrink-0 mt-0.5" variant="solid" />
                  <div className="text-sm text-text-secondary">
                    <p className="font-medium text-error mb-1">{t('valueProposition.theOldWay')}</p>
                    <ul className="space-y-1">
                      {(t.raw('valueProposition.oldWayItems') as string[]).map((item: string, index: number) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Voice Agents */}
            <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary rounded-2xl p-8 relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 bg-success text-success-foreground text-xs font-bold rounded-full">
                  {t('common.recommended')}
                </span>
              </div>

              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 rounded-lg bg-gradient-cta flex items-center justify-center">
                  <Icon name="MicrophoneIcon" size={24} className="text-white" variant="solid" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">{t('valueProposition.aiVoiceAgents')}</h3>
                  <p className="text-sm text-text-secondary">{t('valueProposition.automatedAiProcess')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-text-secondary">{t('valueProposition.completionTime')}</span>
                  <span className="text-2xl font-bold text-primary">{results.aiTime}{t('valueProposition.hourAbbr')}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-text-secondary">{t('valueProposition.totalCost')}</span>
                  <span className="text-2xl font-bold text-primary">${formatCurrency(results.aiCost)}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-text-secondary">{t('valueProposition.dataQuality')}</span>
                  <span className="text-success font-semibold">{t('common.consistent')}</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-success/10 border border-success/20 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Icon name="CheckCircleIcon" size={20} className="text-success flex-shrink-0 mt-0.5" variant="solid" />
                  <div className="text-sm text-text-secondary">
                    <p className="font-medium text-success mb-1">{t('valueProposition.theVoiceterWay')}</p>
                    <ul className="space-y-1">
                      {(t.raw('valueProposition.voiceterWayItems') as string[]).map((item: string, index: number) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROI Calculator */}
          <div className="bg-card border border-border rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-foreground mb-6">{t('valueProposition.calculateYourRoi')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Sample Size */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('valueProposition.sampleSize')}
                </label>
                <input
                  type="number"
                  value={inputs.sampleSize}
                  onChange={(e) => setInputs({ ...inputs, sampleSize: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  min="100"
                  max="100000"
                  step="100" />
              </div>

              {/* Complexity */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('valueProposition.surveyComplexity')}
                </label>
                <select
                  value={inputs.complexity}
                  onChange={(e) => setInputs({ ...inputs, complexity: e.target.value as any })}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="simple">{t('valueProposition.simple')}</option>
                  <option value="moderate">{t('valueProposition.moderate')}</option>
                  <option value="complex">{t('valueProposition.complex')}</option>
                </select>
              </div>
            </div>

            {/* Results */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-success/10 border border-success/20 rounded-xl">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon name="ClockIcon" size={20} className="text-success" variant="solid" />
                  <span className="text-sm font-medium text-success">{t('valueProposition.timeSaved')}</span>
                </div>
                <div className="text-3xl font-bold text-foreground">{results.timeSaved} {t('valueProposition.hours')}</div>
                <p className="text-sm text-text-secondary mt-1">{t('valueProposition.timeSavedDesc')}</p>
              </div>

              <div className="p-6 bg-success/10 border border-success/20 rounded-xl">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon name="CurrencyDollarIcon" size={20} className="text-success" variant="solid" />
                  <span className="text-sm font-medium text-success">{t('valueProposition.costSaved')}</span>
                </div>
                <div className="text-3xl font-bold text-foreground">${formatCurrency(results.costSaved)}</div>
                <p className="text-sm text-text-secondary mt-1">{t('valueProposition.costSavedDesc')}</p>
              </div>
            </div>

            {/* Vision Statement */}
            <div className="mt-8 text-center">
              <p className="text-lg font-medium text-primary italic">
                {t('valueProposition.visionStatement')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>);

};

export default ValueProposition;