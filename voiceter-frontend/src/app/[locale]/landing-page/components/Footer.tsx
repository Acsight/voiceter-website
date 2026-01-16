'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';

const Footer = () => {
  const t = useTranslations();
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    product: [
      { labelKey: 'footer.features', href: '#features' },
      { labelKey: 'footer.useCases', href: '#use-cases' },
      { labelKey: 'footer.demo', href: '#demo' },
    ],
    resources: [
      { labelKey: 'footer.howItWorks', href: '#how-it-works' },
      { labelKey: 'footer.faq', href: '#faq' },
    ],
    company: [
      { labelKey: 'footer.securityCompliance', href: '#security' },
      { labelKey: 'footer.joinWaitlist', href: '#waitlist' },
      { labelKey: 'footer.privacyPolicy', href: '#privacy' },
    ],
  };

  const socialLinks = [
    { name: 'Twitter', icon: 'XMarkIcon', href: '#' },
    { name: 'LinkedIn', icon: 'LinkIcon', href: '#' },
    { name: 'GitHub', icon: 'CodeBracketIcon', href: '#' },
  ];

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-6 lg:px-16 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center space-x-3 mb-4">
              <span className="text-xl font-bold text-foreground">Voiceter AI</span>
            </Link>
            <p className="text-sm text-text-secondary mb-4 max-w-xs">
              {t('footer.description')}
            </p>
            <div className="flex items-center space-x-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center hover:bg-primary/10 transition-smooth"
                  aria-label={social.name}
                >
                  <Icon name={social.icon as any} size={20} className="text-text-secondary" variant="outline" />
                </a>
              ))}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">{t('footer.product')}</h3>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.labelKey}>
                  <a
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-primary transition-smooth"
                  >
                    {t(link.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">{t('footer.resources')}</h3>
            <ul className="space-y-2">
              {footerLinks.resources.map((link) => (
                <li key={link.labelKey}>
                  <a
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-primary transition-smooth"
                  >
                    {t(link.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">{t('footer.company')}</h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.labelKey}>
                  <a
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-primary transition-smooth"
                  >
                    {t(link.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <p className="text-sm text-text-secondary">
              {t('footer.copyright')}
            </p>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Icon name="ShieldCheckIcon" size={16} className="text-success" variant="solid" />
                <span className="text-xs text-text-secondary">{t('footer.soc2')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Icon name="LockClosedIcon" size={16} className="text-success" variant="solid" />
                <span className="text-xs text-text-secondary">{t('footer.gdpr')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Icon name="DocumentCheckIcon" size={16} className="text-success" variant="solid" />
                <span className="text-xs text-text-secondary">{t('footer.tcpa')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;