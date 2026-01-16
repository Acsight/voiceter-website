'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
];

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLanguage = languages.find((lang) => lang.code === locale) || languages[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const switchLanguage = (newLocale: string) => {
    if (newLocale === locale) {
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    
    startTransition(() => {
      // Replace the locale in the pathname
      const newPathname = pathname.replace(`/${locale}`, `/${newLocale}`);
      router.push(newPathname);
      router.refresh();
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:border-primary transition-smooth"
        aria-label="Select language"
        aria-expanded={isOpen}
        disabled={isPending}
      >
        <span className="text-base flex items-center justify-center w-5 h-5">{currentLanguage.flag}</span>
        <span className="font-medium text-sm">{currentLanguage.name}</span>
        <Icon
          name={isOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'}
          size={16}
          className="text-text-secondary"
          variant="outline"
        />
        {isPending && (
          <span className="ml-2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </button>

      {isOpen && (
        <div 
          className="absolute left-0 mt-2 w-48 rounded-lg shadow-xl overflow-hidden"
          style={{ 
            zIndex: 1001,
            backgroundColor: '#1a1a2e',
            border: '1px solid #2d2d44'
          }}
        >
          {languages.map((language) => (
            <button
              key={language.code}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                switchLanguage(language.code);
              }}
              className="w-full inline-flex items-center gap-3 px-4 py-3 transition-all cursor-pointer"
              style={{
                backgroundColor: language.code === locale ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                color: language.code === locale ? '#818cf8' : '#e2e8f0',
              }}
              onMouseEnter={(e) => {
                if (language.code !== locale) {
                  e.currentTarget.style.backgroundColor = '#2d2d44';
                }
              }}
              onMouseLeave={(e) => {
                if (language.code !== locale) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
              disabled={isPending}
              type="button"
            >
              <span className="text-base flex items-center justify-center w-5 h-5">{language.flag}</span>
              <span className="font-medium text-sm">{language.name}</span>
              {language.code === locale && (
                <Icon
                  name="CheckIcon"
                  size={16}
                  className="ml-auto"
                  style={{ color: '#818cf8' }}
                  variant="solid"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
