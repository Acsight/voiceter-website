'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

const ComplianceSecurity = () => {
  const t = useTranslations();

  const certifications = [
    { nameKey: 'compliance.certifications.soc2.name', descriptionKey: 'compliance.certifications.soc2.description', icon: 'ShieldCheckIcon' },
    { nameKey: 'compliance.certifications.tcpa.name', descriptionKey: 'compliance.certifications.tcpa.description', icon: 'PhoneIcon' },
    { nameKey: 'compliance.certifications.gdpr.name', descriptionKey: 'compliance.certifications.gdpr.description', icon: 'LockClosedIcon' },
    { nameKey: 'compliance.certifications.ccpa.name', descriptionKey: 'compliance.certifications.ccpa.description', icon: 'DocumentTextIcon' },
    { nameKey: 'compliance.certifications.stirShaken.name', descriptionKey: 'compliance.certifications.stirShaken.description', icon: 'CheckBadgeIcon' }
  ];

  const securityFeatures = [
    { titleKey: 'compliance.securityFeatures.encryption.title', descriptionKey: 'compliance.securityFeatures.encryption.description', icon: 'KeyIcon' },
    { titleKey: 'compliance.securityFeatures.consent.title', descriptionKey: 'compliance.securityFeatures.consent.description', icon: 'DocumentCheckIcon' },
    { titleKey: 'compliance.securityFeatures.accessControls.title', descriptionKey: 'compliance.securityFeatures.accessControls.description', icon: 'UserGroupIcon' },
    { titleKey: 'compliance.securityFeatures.dncCompliance.title', descriptionKey: 'compliance.securityFeatures.dncCompliance.description', icon: 'ClockIcon' }
  ];


  return (
    <section id="security" className="py-20 bg-background">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">{t('compliance.title')}

          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {t('compliance.subtitle')}
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Certifications */}
          <div className="mb-12">
            <h3 className="text-2xl font-bold text-foreground mb-6 text-center">
              {t('compliance.certificationsTitle')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {certifications.map((cert, index) =>
              <div
                key={index}
                className="bg-card border border-border rounded-xl p-6 text-center hover:border-primary/50 transition-smooth">

                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon
                    name={cert.icon as any}
                    size={32}
                    className="text-primary"
                    variant="solid" />

                  </div>
                  <h4 className="text-lg font-bold text-foreground mb-2">{t(cert.nameKey)}</h4>
                  <p className="text-sm text-text-secondary">{t(cert.descriptionKey)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Security Features */}
          <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-border rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-foreground mb-6 text-center">
              {t('compliance.securityFeaturesTitle')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {securityFeatures.map((feature, index) =>
              <div key={index} className="flex items-start space-x-4 p-4 bg-card rounded-lg">
                  <div className="w-12 h-12 rounded-lg bg-gradient-cta flex items-center justify-center flex-shrink-0">
                    <Icon
                    name={feature.icon as any}
                    size={24}
                    className="text-white"
                    variant="solid" />

                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground mb-1">{t(feature.titleKey)}</h4>
                    <p className="text-sm text-text-secondary">{t(feature.descriptionKey)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>);

};

export default ComplianceSecurity;