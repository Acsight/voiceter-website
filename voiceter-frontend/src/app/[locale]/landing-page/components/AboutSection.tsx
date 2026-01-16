'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

const AboutSection = () => {
  const t = useTranslations();

  return (
    <section id="about" className="py-20 bg-background pt-10">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="max-w-6xl mx-auto">
          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-card border border-border rounded-xl text-center">
              <Icon name="EnvelopeIcon" size={32} className="text-primary mx-auto mb-3" variant="solid" />
              <h4 className="font-semibold text-foreground mb-2">{t('about.email')}</h4>
              <p className="text-sm text-text-secondary">contact@voiceter.ai</p>
            </div>
            {/* <div className="p-6 bg-card border border-border rounded-xl text-center">
              <Icon name="PhoneIcon" size={32} className="text-secondary mx-auto mb-3" variant="solid" />
              <h4 className="font-semibold text-foreground mb-2">Phone</h4>
              <p className="text-sm text-text-secondary">+1 (555) 123-4567</p>
            </div> */}
            <div className="p-6 bg-card border border-border rounded-xl text-center">
              <Icon name="MapPinIcon" size={32} className="text-accent mx-auto mb-3" variant="solid" />
              <h4 className="font-semibold text-foreground mb-2">{t('about.location')}</h4>
              <p className="text-sm text-text-secondary">San Francisco, CA</p>
            </div>
          </div>
        </div>
      </div>
    </section>);

};

export default AboutSection;