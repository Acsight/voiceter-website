'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface ScrollProgressProps {
  className?: string;
  showMilestones?: boolean;
}

interface Milestone {
  id: string;
  labelKey: string;
  position: number;
}

const ScrollProgress = ({ className = '', showMilestones = true }: ScrollProgressProps) => {
  const t = useTranslations();
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [activeMilestone, setActiveMilestone] = useState<string>('');
  const [milestones, setMilestones] = useState<Milestone[]>([
    { id: 'demo', labelKey: 'scrollProgress.demo', position: 10 },
    { id: 'how-it-works', labelKey: 'scrollProgress.howItWorks', position: 20 },
    { id: 'features', labelKey: 'scrollProgress.features', position: 40 },
    { id: 'use-cases', labelKey: 'scrollProgress.useCases', position: 60 },
    { id: 'faq', labelKey: 'scrollProgress.faq', position: 80 },
  ]);

  // Calculate actual section positions on mount and resize
  useEffect(() => {
    const calculateMilestonePositions = () => {
      const documentHeight = document.documentElement.scrollHeight;
      const windowHeight = window.innerHeight;
      const scrollableHeight = documentHeight - windowHeight;

      const sectionIds = ['demo', 'how-it-works', 'features', 'use-cases', 'faq'];
      const labelKeys = ['scrollProgress.demo', 'scrollProgress.howItWorks', 'scrollProgress.features', 'scrollProgress.useCases', 'scrollProgress.faq'];

      const updatedMilestones: Milestone[] = sectionIds.map((id, index) => {
        const element = document.getElementById(id);
        let position = 0;

        if (element) {
          // Get element's distance from top of document
          const elementTop = element.offsetTop;
          // Subtract navigation offset to trigger milestone when section enters viewport
          const adjustedTop = Math.max(0, elementTop - 100);
          // Calculate position as percentage of scrollable height
          position = (adjustedTop / scrollableHeight) * 100;
        } else {
          // Fallback to evenly distributed positions if element not found
          position = (index / (sectionIds.length - 1)) * 100;
        }

        return {
          id,
          labelKey: labelKeys[index],
          position: Math.min(Math.max(position, 0), 100),
        };
      });

      setMilestones(updatedMilestones);
    };

    // Calculate on mount
    calculateMilestonePositions();

    // Recalculate on window resize
    const handleResize = () => {
      calculateMilestonePositions();
    };

    window.addEventListener('resize', handleResize);

    // Small delay to ensure DOM is fully loaded
    const timeoutId = setTimeout(calculateMilestonePositions, 500);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      const progress = (scrollPosition / (documentHeight - windowHeight)) * 100;
      const clampedProgress = Math.min(Math.max(progress, 0), 100);
      setScrollProgress(clampedProgress);

      // Find the active milestone based on actual scroll progress
      const currentMilestone = milestones.reduce((prev, curr) => {
        return clampedProgress >= curr.position ? curr : prev;
      }, milestones[0]);

      setActiveMilestone(currentMilestone.id);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [milestones]);

  const scrollToMilestone = (milestoneId: string) => {
    const element = document.getElementById(milestoneId);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className={`fixed top-nav-height left-0 right-0 ${className}`} style={{ zIndex: 999 }}>
      {/* Progress Bar */}
      <div className="relative h-1 bg-muted">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-primary transition-all duration-300"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Milestones */}
      {showMilestones && (
        <div className="hidden lg:block absolute top-2 left-0 right-0">
          <div className="container mx-auto px-nav-padding-x">
            <div className="relative">
              <div className="flex justify-between items-center">
                {milestones.map((milestone) => {
                  const isActive = activeMilestone === milestone.id;
                  const isPassed = scrollProgress >= milestone.position;

                  return (
                    <button
                      key={milestone.id}
                      onClick={() => scrollToMilestone(milestone.id)}
                      className={`flex flex-col items-center space-y-1 transition-smooth group ${
                        isActive ? 'scale-110' : 'scale-100'
                      }`}
                      style={{
                        position: 'absolute',
                        left: `${milestone.position}%`,
                        transform: 'translateX(-50%)',
                      }}
                      aria-label={`Scroll to ${t(milestone.labelKey)}`}
                      aria-current={isActive ? 'true' : 'false'}
                    >
                      <div
                        className={`w-3 h-3 rounded-full transition-smooth ${
                          isPassed
                            ? 'bg-primary shadow-primary'
                            : 'bg-muted group-hover:bg-border'
                        }`}
                      />
                      <span
                        className={`text-xs font-medium transition-smooth whitespace-nowrap ${
                          isActive
                            ? 'text-primary'
                            : isPassed
                            ? 'text-foreground'
                            : 'text-text-secondary group-hover:text-foreground'
                        }`}
                      >
                        {t(milestone.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScrollProgress;