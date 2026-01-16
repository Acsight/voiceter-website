'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/AppIcon';

interface FAQ {
  id: number;
  question: string;
  answer: string;
  category: string;
}

const FAQSection = () => {
  const t = useTranslations('faq');
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(1);

  const faqs: FAQ[] = [
  {
    id: 1,
    question: t('questions.q1.question'),
    answer: t('questions.q1.answer'),
    category: t('categories.technology')
  },
  {
    id: 2,
    question: t('questions.q2.question'),
    answer: t('questions.q2.answer'),
    category: t('categories.languages')
  },
  {
    id: 3,
    question: t('questions.q3.question'),
    answer: t('questions.q3.answer'),
    category: t('categories.compliance')
  },
  {
    id: 4,
    question: t('questions.q4.question'),
    answer: t('questions.q4.answer'),
    category: t('categories.useCases')
  },
  {
    id: 5,
    question: t('questions.q5.question'),
    answer: t('questions.q5.answer'),
    category: t('categories.integration')
  },
  {
    id: 6,
    question: t('questions.q6.question'),
    answer: t('questions.q6.answer'),
    category: t('categories.performance')
  },
  {
    id: 7,
    question: t('questions.q7.question'),
    answer: t('questions.q7.answer'),
    category: t('categories.features')
  },
  {
    id: 8,
    question: t('questions.q8.question'),
    answer: t('questions.q8.answer'),
    category: t('categories.pricing')
  },
  {
    id: 9,
    question: t('questions.q9.question'),
    answer: t('questions.q9.answer'),
    category: t('categories.availability')
  },
  {
    id: 10,
    question: t('questions.q10.question'),
    answer: t('questions.q10.answer'),
    category: t('categories.support')
  },
  {
    id: 11,
    question: t('questions.q11.question'),
    answer: t('questions.q11.answer'),
    category: t('categories.analytics')
  },
  {
    id: 12,
    question: t('questions.q12.question'),
    answer: t('questions.q12.answer'),
    category: t('categories.operations')
  }];


  const toggleFAQ = (id: number) => {
    setExpandedFAQ(expandedFAQ === id ? null : id);
  };

  return (
    <section id="faq" className="py-20 bg-background pt-10">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t('title')}
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {faqs.map((faq) =>
            <div
              key={faq.id}
              className="bg-card border border-border rounded-xl overflow-hidden transition-smooth hover:border-primary/50">

                <button
                onClick={() => toggleFAQ(faq.id)}
                className="w-full px-6 py-5 flex items-center justify-between text-left"
                aria-expanded={expandedFAQ === faq.id}
                aria-label={`Toggle FAQ: ${faq.question}`}>

                  <div className="flex-1 pr-4">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
                        {faq.category}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{faq.question}</h3>
                  </div>
                  <Icon
                  name={expandedFAQ === faq.id ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                  size={24}
                  className="text-text-secondary flex-shrink-0"
                  variant="outline" />

                </button>

                {expandedFAQ === faq.id &&
              <div className="px-6 pb-5">
                    <div className="pt-4 border-t border-border">
                      <p className="text-text-secondary leading-relaxed">{faq.answer}</p>
                    </div>
                  </div>
              }
              </div>
            )}
          </div>
        </div>
      </div>
    </section>);

};

export default FAQSection;