'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

const PricingSection = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const pricingTiers: PricingTier[] = [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for small research projects',
      price: billingCycle === 'monthly' ? '$499' : '$4,990',
      period: billingCycle === 'monthly' ? '/month' : '/year',
      features: [
        'Up to 1,000 surveys/month',
        '5 languages supported',
        'Real-time transcription',
        'Basic analytics dashboard',
        'Email support',
        'Data export (CSV, Excel)',
      ],
      cta: 'Start Free Trial',
      highlighted: false,
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'For growing research teams',
      price: billingCycle === 'monthly' ? '$1,499' : '$14,990',
      period: billingCycle === 'monthly' ? '/month' : '/year',
      features: [
        'Up to 5,000 surveys/month',
        '20 languages supported',
        'Advanced transcription & sentiment analysis',
        'Custom analytics & reports',
        'Priority support',
        'API integration',
        'Team collaboration tools',
        'Custom branding',
      ],
      cta: 'Start Free Trial',
      highlighted: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For large-scale research operations',
      price: 'Custom',
      period: '',
      features: [
        'Unlimited surveys',
        'All 47 languages',
        'Dedicated AI training',
        'White-label solution',
        '24/7 dedicated support',
        'Custom integrations',
        'Advanced security features',
        'SLA guarantees',
        'On-premise deployment option',
      ],
      cta: 'Contact Sales',
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 bg-gradient-to-br from-background to-secondary/5">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8">
            Choose the plan that fits your research needs. All plans include 14-day free trial.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center space-x-4 p-2 bg-card border border-border rounded-lg">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-md transition-smooth ${
                billingCycle === 'monthly' ?'bg-gradient-cta text-primary-foreground' :'text-text-secondary hover:text-foreground'
              }`}
              aria-pressed={billingCycle === 'monthly'}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-6 py-2 rounded-md transition-smooth ${
                billingCycle === 'annual' ?'bg-gradient-cta text-primary-foreground' :'text-text-secondary hover:text-foreground'
              }`}
              aria-pressed={billingCycle === 'annual'}
            >
              Annual
              <span className="ml-2 px-2 py-0.5 bg-success text-success-foreground text-xs font-bold rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {pricingTiers.map((tier) => (
              <div
                key={tier.id}
                className={`relative rounded-2xl p-8 transition-smooth ${
                  tier.highlighted
                    ? 'bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary shadow-card scale-105'
                    : 'bg-card border border-border hover:border-primary/50'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="px-4 py-1 bg-gradient-cta text-primary-foreground text-sm font-bold rounded-full shadow-primary">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-foreground mb-2">{tier.name}</h3>
                  <p className="text-sm text-text-secondary mb-4">{tier.description}</p>
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-bold text-foreground">{tier.price}</span>
                    {tier.period && <span className="text-text-secondary ml-2">{tier.period}</span>}
                  </div>
                </div>

                <button
                  className={`w-full px-6 py-3 rounded-lg font-semibold transition-smooth mb-6 ${
                    tier.highlighted
                      ? 'bg-gradient-cta text-primary-foreground shadow-primary hover:shadow-lg hover:scale-105'
                      : 'bg-card border-2 border-primary text-primary hover:bg-primary/10'
                  }`}
                >
                  {tier.cta}
                </button>

                <div className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <Icon
                        name="CheckCircleIcon"
                        size={20}
                        className="text-success flex-shrink-0 mt-0.5"
                        variant="solid"
                      />
                      <span className="text-sm text-text-secondary">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-12 text-center">
            <p className="text-text-secondary mb-4">
              All plans include 14-day free trial. No credit card required.
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm text-text-secondary">
              <div className="flex items-center space-x-2">
                <Icon name="ShieldCheckIcon" size={16} className="text-success" variant="solid" />
                <span>SOC 2 Certified</span>
              </div>
              <div className="flex items-center space-x-2">
                <Icon name="LockClosedIcon" size={16} className="text-success" variant="solid" />
                <span>GDPR Compliant</span>
              </div>
              <div className="flex items-center space-x-2">
                <Icon name="ClockIcon" size={16} className="text-success" variant="solid" />
                <span>99.99% Uptime</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;