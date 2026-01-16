import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n/request';

import '../../styles/index.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  
  // Enable static rendering for metadata
  setRequestLocale(locale);
  
  try {
    // Get messages for metadata
    const messages = await getMessages();
    const metadata = messages.metadata as any;

    return {
      title: metadata?.title || 'Voiceter AI - AI Voice Agents for Market Research Surveys',
      description: metadata?.description || 'Conduct market research surveys 10× faster with AI-powered CATI platform.',
      icons: {
        icon: [
          { url: '/assets/images/Favicon-1764525882156.png', type: 'image/png' }
        ],
      },
    };
  } catch {
    return {
      title: 'Voiceter AI - AI Voice Agents for Market Research Surveys',
      description: 'Conduct market research surveys 10× faster with AI-powered CATI platform.',
    };
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  
  // Enable static rendering - this must be called before getMessages
  setRequestLocale(locale);

  // Get messages for the specific locale (uses locale from setRequestLocale)
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>

        <script type="module" async src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Fvoicetera6144back.builtwithrocket.new&_be=https%3A%2F%2Fapplication.rocket.new&_v=0.1.10" />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.1" />
      </body>
    </html>
  );
}
