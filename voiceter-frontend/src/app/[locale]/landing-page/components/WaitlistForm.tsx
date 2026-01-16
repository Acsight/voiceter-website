'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface FormData {
  email: string;
  name: string;
  company: string;
  companySize: string;
  role: string;
}

interface FormErrors {
  email?: string;
  name?: string;
  company?: string;
}

const WaitlistForm = () => {
  const t = useTranslations();
  const [formData, setFormData] = useState<FormData>({
    email: '',
    name: '',
    company: '',
    companySize: '',
    role: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const companySizes = [
    { key: '1-50', value: '1-50 employees' },
    { key: '51-200', value: '51-200 employees' },
    { key: '201-500', value: '201-500 employees' },
    { key: '501-1000', value: '501-1000 employees' },
    { key: '1000+', value: '1000+ employees' }
  ];

  const roles = [
    { key: 'marketResearch', value: 'Market Research Professional' },
    { key: 'developer', value: 'Developer' },
    { key: 'productManager', value: 'Product Manager' },
    { key: 'cx', value: 'CX' },
    { key: 'insightsLead', value: 'Insights Lead' },
    { key: 'agencyOwner', value: 'Agency Owner' },
    { key: 'other', value: 'Other' }
  ];


  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.email) {
      newErrors.email = t('waitlist.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('waitlist.emailInvalid');
    }

    if (!formData.name) {
      newErrors.name = t('waitlist.nameRequired');
    } else if (formData.name.trim().length < 2) {
      newErrors.name = t('waitlist.nameInvalid');
    }

    if (!formData.company) {
      newErrors.company = t('waitlist.companyRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      // Get backend URL from environment (convert ws:// to https://)
      const wsUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'ws://localhost:8080';
      const backendUrl = wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
      
      const response = await fetch(`${backendUrl}/api/waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          company: formData.company,
          company_size: formData.companySize,
          role: formData.role
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit form');
      }

      setSubmitStatus('success');
      setFormData({
        name: '',
        email: '',
        company: '',
        companySize: '',
        role: ''
      });
    } catch (error) {
      setSubmitStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit waitlist form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field as keyof FormErrors]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  return (
    <section className="bg-gradient-to-br from-primary/10 to-secondary/10 py-10">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              {t('waitlist.title')}
            </h2>
            <p className="text-xl text-text-secondary">
              {t('waitlist.subtitle')}
            </p>
          </div>

          {/* Form Container */}
          <div className="bg-card border border-border rounded-2xl p-8 shadow-card">
            {submitStatus === 'success' &&
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
                <p className="text-green-100 font-medium">✓ {t('waitlist.success')}</p>
                <p className="text-green-200 text-sm mt-1">{t('waitlist.successDetail')}</p>
              </div>
            }

            {submitStatus === 'error' &&
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg relative">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-red-100 font-medium">⚠ {t('common.error')}</p>
                    <p className="text-red-200 text-sm mt-1">{errorMessage}</p>
                  </div>
                  <button
                  onClick={() => {
                    navigator.clipboard.writeText(errorMessage);
                  }}
                  className="ml-2 text-red-200 hover:text-red-100 text-xs underline"
                  title="Copy error message">

                    Copy
                  </button>
                </div>
              </div>
            }

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                  {t('waitlist.workEmail')} *
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className={`w-full px-4 py-3 bg-background border rounded-lg text-foreground focus:outline-none focus:ring-2 transition-smooth ${
                  errors.email ? 'border-red-500 focus:ring-red-500' : 'border-border focus:ring-primary'}`
                  }
                  placeholder={t('waitlist.emailPlaceholder')} />

                {errors.email &&
                <p className="mt-2 text-sm text-red-400 flex items-center space-x-1">
                    <span>⚠</span>
                    <span>{errors.email}</span>
                  </p>
                }
              </div>

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                  {t('waitlist.name')} *
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className={`w-full px-4 py-3 bg-background border rounded-lg text-foreground focus:outline-none focus:ring-2 transition-smooth ${
                  errors.name ? 'border-red-500 focus:ring-red-500' : 'border-border focus:ring-primary'}`
                  }
                  placeholder={t('waitlist.namePlaceholder')} />

                {errors.name &&
                <p className="mt-2 text-sm text-red-400 flex items-center space-x-1">
                    <span>⚠</span>
                    <span>{errors.name}</span>
                  </p>
                }
              </div>

              {/* Company */}
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-foreground mb-2">
                  {t('waitlist.companyName')} *
                </label>
                <input
                  type="text"
                  id="company"
                  value={formData.company}
                  onChange={(e) => handleChange('company', e.target.value)}
                  className={`w-full px-4 py-3 bg-background border rounded-lg text-foreground focus:outline-none focus:ring-2 transition-smooth ${
                  errors.company ? 'border-red-500 focus:ring-red-500' : 'border-border focus:ring-primary'}`
                  }
                  placeholder={t('waitlist.companyPlaceholder')} />

                {errors.company &&
                <p className="mt-2 text-sm text-red-400 flex items-center space-x-1">
                    <span>⚠</span>
                    <span>{errors.company}</span>
                  </p>
                }
              </div>

              {/* Company Size & Role */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="companySize" className="block text-sm font-medium text-foreground mb-2">
                    {t('waitlist.companySize')}
                  </label>
                  <select
                    id="companySize"
                    value={formData.companySize}
                    onChange={(e) => handleChange('companySize', e.target.value)}
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary">

                    <option value="">{t('waitlist.selectSize')}</option>
                    {companySizes.map((size) =>
                    <option key={size.key} value={size.value}>
                        {t(`waitlist.companySizes.${size.key}`)}
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-foreground mb-2">
                    {t('waitlist.role')}
                  </label>
                  <select
                    id="role"
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary">

                    <option value="">{t('waitlist.selectRole')}</option>
                    {roles.map((role) =>
                    <option key={role.key} value={role.value}>
                        {t(`waitlist.roles.${role.key}`)}
                      </option>
                    )}
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-8 py-4 bg-gradient-cta text-primary-foreground font-semibold rounded-lg shadow-primary transition-smooth hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2">

                {isSubmitting ?
                <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{t('waitlist.submitting')}</span>
                  </> :

                <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
                      <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
                      <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
                    </svg>
                    <span>{t('waitlist.submit')}</span>
                  </>
                }
              </button>
            </form>

            <p className="text-xs text-text-secondary text-center mt-6">
              {t('waitlist.privacyNote')}
            </p>
          </div>

          {/* Benefits Cards */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-card border border-border rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-primary mx-auto mb-3">
                <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
              </svg>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('waitlist.benefits.earlyAccess')}</h3>
              <p className="text-sm text-text-secondary">{t('waitlist.benefits.earlyAccessDesc')}</p>
            </div>

            <div className="text-center p-6 bg-card border border-border rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-secondary mx-auto mb-3">
                <path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 0 1-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004ZM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 0 1-.921.42Z" />
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z" clipRule="evenodd" />
              </svg>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('waitlist.benefits.exclusivePricing')}</h3>
              <p className="text-sm text-text-secondary">{t('waitlist.benefits.exclusivePricingDesc')}</p>
            </div>

            <div className="text-center p-6 bg-card border border-border rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-accent mx-auto mb-3">
                <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
                <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 3.57-4.047ZM20.226 19.389a8.287 8.287 0 0 0-1.308-5.135 3.75 3.75 0 0 1 3.57 4.047l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.567.2-1.156.349-1.764.441Z" />
              </svg>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('waitlist.benefits.prioritySupport')}</h3>
              <p className="text-sm text-text-secondary">{t('waitlist.benefits.prioritySupportDesc')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>);

};

export default WaitlistForm;