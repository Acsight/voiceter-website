'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface ConversionTrackerProps {
  className?: string;
}

interface Stats {
  surveysCompleted: number;
  activeUsers: number;
  languagesSupported: number;
}

const ConversionTracker = ({ className = '' }: ConversionTrackerProps) => {
  const [stats, setStats] = useState<Stats>({
    surveysCompleted: 125847,
    activeUsers: 523,
    languagesSupported: 47,
  });

  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        surveysCompleted: prev.surveysCompleted + Math.floor(Math.random() * 3) + 1,
        activeUsers: prev.activeUsers + Math.floor(Math.random() * 5) - 2,
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US');
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-navigation ${className}`}>
      <div className="bg-card border border-border rounded-xl shadow-card p-4 max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse-subtle" />
            <span className="text-sm font-medium text-foreground">Live Stats</span>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 text-text-secondary hover:text-foreground transition-smooth"
            aria-label="Close stats"
          >
            <Icon name="XMarkIcon" size={16} variant="outline" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="space-y-3">
          {/* Surveys Completed */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon name="CheckCircleIcon" size={18} className="text-primary" variant="solid" />
              </div>
              <div>
                <div className="text-xs text-text-secondary">Surveys Completed</div>
                <div className="text-lg font-bold font-mono text-foreground">
                  {formatNumber(stats.surveysCompleted)}
                </div>
              </div>
            </div>
          </div>

          {/* Active Users */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                <Icon name="UsersIcon" size={18} className="text-secondary" variant="solid" />
              </div>
              <div>
                <div className="text-xs text-text-secondary">Active Now</div>
                <div className="text-lg font-bold font-mono text-foreground">
                  {formatNumber(stats.activeUsers)}
                </div>
              </div>
            </div>
          </div>

          {/* Languages Supported */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Icon name="GlobeAltIcon" size={18} className="text-accent" variant="solid" />
              </div>
              <div>
                <div className="text-xs text-text-secondary">Languages</div>
                <div className="text-lg font-bold font-mono text-foreground">
                  {stats.languagesSupported}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-4 pt-4 border-t border-border">
          <button
            onClick={() => {
              const demoSection = document.getElementById('demo');
              if (demoSection) {
                demoSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="w-full px-4 py-2 bg-gradient-cta text-primary-foreground text-sm font-semibold rounded-lg transition-smooth hover:shadow-primary"
          >
            Join 500+ Companies
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConversionTracker;