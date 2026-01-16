'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import Icon from '@/components/ui/AppIcon';
import Image from 'next/image';
import LanguageSwitcher from './LanguageSwitcher';

interface NavigationSection {
  label: string;
  anchor: string;
  description: string;
  priority: number;
}

interface NavigationBarProps {
  onSectionChange?: (section: string) => void;
  onDemoClick: () => void;
  className?: string;
}

const NavigationBar = ({ onDemoClick, onSectionChange, className = '' }: NavigationBarProps) => {
  const t = useTranslations();
  const locale = useLocale();
  const [activeSection, setActiveSection] = useState<string>('demo');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [scrollProgress, setScrollProgress] = useState<number>(0);

  const sections: NavigationSection[] = [
    { label: t('nav.demo'), anchor: 'demo', description: t('nav.demo'), priority: 1 },
    { label: t('nav.howItWorks'), anchor: 'how-it-works', description: t('nav.howItWorks'), priority: 2 },
    { label: t('nav.features'), anchor: 'features', description: t('nav.features'), priority: 3 },
    { label: t('nav.useCases'), anchor: 'use-cases', description: t('nav.useCases'), priority: 4 },
    { label: t('nav.faq'), anchor: 'faq', description: t('nav.faq'), priority: 5 },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      const progress = (scrollPosition / (documentHeight - windowHeight)) * 100;
      setScrollProgress(Math.min(progress, 100));

      const sectionElements = sections.map(section => ({
        id: section.anchor,
        element: document.getElementById(section.anchor),
      }));

      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const section = sectionElements[i];
        if (section.element) {
          const rect = section.element.getBoundingClientRect();
          if (rect.top <= 150) {
            if (activeSection !== section.id) {
              setActiveSection(section.id);
              onSectionChange?.(section.id);
            }
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeSection, onSectionChange, sections]);

  const scrollToSection = (anchor: string) => {
    const element = document.getElementById(anchor);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
    setIsMenuOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, anchor: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      scrollToSection(anchor);
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-navigation bg-background/95 backdrop-blur-sm border-b border-border ${className}`}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="container mx-auto px-nav-padding-x">
          <div className="flex items-center justify-between h-nav-height">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center justify-center transition-smooth hover:opacity-80"
              aria-label="Voiceter AI Home"
            >
              <div className="relative w-[207px] h-[207px] flex items-center justify-center">
                <Image
                  src="/assets/images/Logo_DarkBackground_Tagline-1764237799610.png"
                  alt="Voiceter.ai Logo"
                  width={207}
                  height={207}
                  className="object-contain"
                  priority
                />
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-nav-item-spacing">
              {sections.map((section) => (
                <button
                  key={section.anchor}
                  onClick={() => scrollToSection(section.anchor)}
                  onKeyDown={(e) => handleKeyDown(e, section.anchor)}
                  className={`text-nav font-medium transition-smooth relative group ${
                    activeSection === section.anchor
                      ? 'text-primary' :'text-text-secondary hover:text-foreground'
                  }`}
                  title={section.description}
                  aria-label={`Navigate to ${section.label}`}
                  aria-current={activeSection === section.anchor ? 'true' : 'false'}
                >
                  {section.label}
                  {activeSection === section.anchor && (
                    <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-gradient-primary rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Language Switcher & CTA Button - Desktop */}
            <div className="hidden lg:flex items-center space-x-4">
              <LanguageSwitcher />
              <button
                onClick={onDemoClick}
                className="px-6 py-3 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg hover:scale-105"
                aria-label={t('common.tryLiveDemo')}
              >
                {t('common.tryLiveDemo')}
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 text-foreground hover:text-primary transition-smooth"
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
            >
              <Icon
                name={isMenuOpen ? 'XMarkIcon' : 'Bars3Icon'}
                size={28}
                variant="outline"
              />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
          <div
            className="h-full bg-gradient-primary transition-all duration-300"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-demo-overlay bg-background/98 backdrop-blur-md lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
        >
          <div className="flex flex-col h-full">
            {/* Mobile Header */}
            <div className="flex items-center justify-between px-mobile-padding py-6 border-b border-border">
              <Link
                href="/"
                className="flex items-center justify-center"
                onClick={() => setIsMenuOpen(false)}
              >
                <div className="relative w-[207px] h-[207px] flex items-center justify-center">
                  <Image
                    src="/assets/images/Logo_DarkBackground_Tagline-1764237799610.png"
                    alt="Voiceter.ai Logo"
                    width={207}
                    height={207}
                    className="object-contain"
                  />
                </div>
              </Link>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 text-foreground hover:text-primary transition-smooth"
                aria-label="Close menu"
              >
                <Icon name="XMarkIcon" size={28} variant="outline" />
              </button>
            </div>

            {/* Mobile Navigation Items */}
            <div className="flex-1 overflow-y-auto px-mobile-padding py-8">
              <div className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.anchor}
                    onClick={() => scrollToSection(section.anchor)}
                    className={`w-full text-left px-6 py-4 rounded-lg transition-smooth ${
                      activeSection === section.anchor
                        ? 'bg-primary/10 text-primary border border-primary/20' :'text-text-secondary hover:bg-muted hover:text-foreground'
                    }`}
                    aria-label={`Navigate to ${section.label}`}
                  >
                    <div className="font-semibold text-lg">{section.label}</div>
                    <div className="text-sm mt-1 opacity-80">{section.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile CTA */}
            <div className="px-mobile-padding py-6 border-t border-border space-y-4">
              <div className="flex justify-center">
                <LanguageSwitcher />
              </div>
              <button
                onClick={() => scrollToSection('demo')}
                className="w-full px-6 py-4 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg active:scale-95"
              >
                {t('common.tryLiveDemo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavigationBar;