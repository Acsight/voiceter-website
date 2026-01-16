'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

interface HeroSectionProps {
  onDemoClick: () => void;
  onWaitlistClick: () => void;
}

const HeroSection = ({ onDemoClick, onWaitlistClick }: HeroSectionProps) => {
  const t = useTranslations();
  
  return (
    <section id="demo" className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: '1s' }} />
        
        {/* Sound Wave Animation - Left Side */}
        <div className="absolute left-0 top-0 bottom-0 w-32 flex items-center justify-around opacity-20">
          {[...Array(8)].map((_, i) =>
          <div
            key={`left-${i}`}
            className={`w-1 bg-gradient-to-t from-primary via-secondary to-primary rounded-full ${
            i % 2 === 0 ? 'animate-wave' : 'animate-wave-reverse'}`}
            style={{
              height: `${30 + i % 3 * 20}%`,
              animationDelay: `${i * 0.15}s`
            }} />

          )}
        </div>

        {/* Sound Wave Animation - Right Side */}
        <div className="absolute right-0 top-0 bottom-0 w-32 flex items-center justify-around opacity-20">
          {[...Array(8)].map((_, i) =>
          <div
            key={`right-${i}`}
            className={`w-1 bg-gradient-to-t from-secondary via-primary to-secondary rounded-full ${
            i % 2 === 0 ? 'animate-wave-reverse' : 'animate-wave'}`}
            style={{
              height: `${30 + i % 3 * 20}%`,
              animationDelay: `${i * 0.15 + 0.6}s`
            }} />

          )}
        </div>

        {/* Sound Wave Animation - Top Center */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 flex items-end justify-around opacity-15">
          {[...Array(12)].map((_, i) =>
          <div
            key={`top-${i}`}
            className={`w-1 bg-gradient-to-b from-primary to-transparent rounded-full ${
            i % 2 === 0 ? 'animate-wave' : 'animate-wave-reverse'}`}
            style={{
              height: `${40 + i % 4 * 15}%`,
              animationDelay: `${i * 0.1}s`
            }} />

          )}
        </div>
      </div>

      <div className="container mx-auto px-6 lg:px-16 py-20 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full mt-0 mb-[38px] pt-2">
            <Icon name="SparklesIcon" size={20} className="text-primary" variant="solid" />
            <span className="text-sm font-medium text-primary">{t('hero.badge')}</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight mb-[39px]">
            {t('hero.headline')}
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-text-secondary mb-12 max-w-3xl mx-auto mt-0 pt-3.5 pb-2.5 px-0">
            {t('hero.subheadline')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={onDemoClick}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg hover:scale-105 flex items-center justify-center space-x-2"
              aria-label={t('common.tryLiveDemo')}>
              <Icon name="PlayIcon" size={24} className="text-white" variant="solid" />
              <span>{t('common.tryLiveDemo')}</span>
            </button>
            <button
              onClick={onWaitlistClick}
              className="w-full sm:w-auto px-8 py-4 bg-card border-2 border-primary text-primary font-semibold rounded-lg transition-smooth hover:bg-primary hover:text-primary-foreground hover:scale-105"
              aria-label={t('common.joinWaitlist')}>
              {t('common.joinWaitlist')}
            </button>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <Icon name="ChevronDownIcon" size={32} className="text-text-secondary" variant="outline" />
      </div>
    </section>);

};

export default HeroSection;