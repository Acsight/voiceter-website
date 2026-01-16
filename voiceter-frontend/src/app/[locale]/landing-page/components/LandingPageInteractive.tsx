'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';

import NavigationBar from '@/components/common/NavigationBar';
import DemoLauncher from '@/components/common/DemoLauncher';
import ScrollProgress from '@/components/common/ScrollProgress';
import HeroSection from './HeroSection';
import InteractiveDemoShowcase from './InteractiveDemoShowcase';
import ValueProposition from './ValueProposition';
import HowItWorks from './HowItWorks';
import KeyFeatures from './KeyFeatures';
import ComplianceSecurity from './ComplianceSecurity';
import UseCasesGallery from './UseCasesGallery';
import FAQSection from './FAQSection';
import WaitlistForm from './WaitlistForm';
import AboutSection from './AboutSection';
import Footer from './Footer';

const LandingPageInteractive = () => {
  const locale = useLocale();
  const [isDemoOpen, setIsDemoOpen] = useState<boolean>(false);

  const handleDemoClick = () => {
    // Open full demo experience in new tab with default scenario
    window.open(`/${locale}/full-demo-experience-page?demo=demo-01a-electronics-retail-personalized`, '_blank');
  };

  const handleWaitlistClick = () => {
    const waitlistSection = document.getElementById('waitlist');
    if (waitlistSection) {
      waitlistSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSectionChange = (section: string) => {
    // Track section changes for analytics
    if (typeof window !== 'undefined') {
      console.log('Active section:', section);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar onDemoClick={handleDemoClick} onSectionChange={handleSectionChange} />
      <ScrollProgress showMilestones={true} />
      
      <main>
        <HeroSection onDemoClick={handleDemoClick} onWaitlistClick={handleWaitlistClick} />
        <InteractiveDemoShowcase />
        <ValueProposition />
        <HowItWorks />
        <KeyFeatures />
        <ComplianceSecurity />
        <UseCasesGallery />
        <section id="waitlist" className="py-20 bg-gradient-to-b from-background via-background to-primary/5 pt-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-center">
              <WaitlistForm />
            </div>
          </div>
        </section>
        <FAQSection />
        <AboutSection />
      </main>

      <Footer />

      <DemoLauncher isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>);

};

export default LandingPageInteractive;