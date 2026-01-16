'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';

interface Testimonial {
  id: number;
  name: string;
  role: string;
  company: string;
  image: string;
  alt: string;
  quote: string;
  metrics: {
    label: string;
    value: string;
  };
}

const SocialProof = () => {
  const [activeTestimonial, setActiveTestimonial] = useState<number>(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(true);

  const testimonials: Testimonial[] = [
  {
    id: 1,
    name: 'Sarah Chen',
    role: 'Director of Market Research',
    company: 'TechCorp Global',
    image: "https://img.rocket.new/generatedImages/rocket_gen_img_1f1230b9d-1763294070661.png",
    alt: 'Professional Asian woman with long black hair in navy blazer smiling at camera in modern office',
    quote: 'Voiceter AI reduced our survey completion time from 3 weeks to 2 days. The multilingual support allowed us to expand into Asian markets seamlessly. ROI was immediate.',
    metrics: {
      label: 'Time Saved',
      value: '92%'
    }
  },
  {
    id: 2,
    name: 'Michael Rodriguez',
    role: 'VP of Customer Experience',
    company: 'RetailMax Inc',
    image: "https://img.rocket.new/generatedImages/rocket_gen_img_1eeccc02b-1763300934261.png",
    alt: 'Hispanic male executive with short dark hair in charcoal suit smiling confidently in corporate setting',
    quote: 'The data quality is exceptional. No more manual cleanup or inconsistent responses. Our team now focuses on insights instead of data processing. Game changer for our CX program.',
    metrics: {
      label: 'Cost Reduction',
      value: '78%'
    }
  },
  {
    id: 3,
    name: 'Emily Thompson',
    role: 'Chief Analytics Officer',
    company: 'FinanceFirst Bank',
    image: "https://img.rocket.new/generatedImages/rocket_gen_img_1158c42da-1763295926268.png",
    alt: 'Caucasian woman with blonde hair in professional gray suit jacket in modern banking office',
    quote: 'Security and compliance were our top concerns. Voiceter exceeded all requirements with SOC 2 and HIPAA certifications. The real-time analytics dashboard is phenomenal.',
    metrics: {
      label: 'Response Rate',
      value: '89%'
    }
  }];


  const clientLogos: string[] = [
  'TechCorp',
  'RetailMax',
  'FinanceFirst',
  'HealthPlus',
  'AutoDrive',
  'MediaStream'];


  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, testimonials.length]);

  const handleTestimonialChange = (index: number) => {
    setActiveTestimonial(index);
    setIsAutoPlaying(false);
  };

  const activeTestimonialData = testimonials[activeTestimonial];

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Trusted by Industry Leaders
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            Join 500+ companies conducting smarter research with AI voice agents
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Success Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            <div className="text-center p-6 bg-card border border-border rounded-xl">
              <div className="text-4xl font-bold text-primary mb-2">10,000+</div>
              <div className="text-text-secondary">Surveys Completed</div>
            </div>
            <div className="text-center p-6 bg-card border border-border rounded-xl">
              <div className="text-4xl font-bold text-secondary mb-2">47</div>
              <div className="text-text-secondary">Languages Supported</div>
            </div>
            <div className="text-center p-6 bg-card border border-border rounded-xl">
              <div className="text-4xl font-bold text-success mb-2">98%</div>
              <div className="text-text-secondary">Client Satisfaction</div>
            </div>
          </div>

          {/* Testimonial Carousel */}
          <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-border rounded-2xl p-8 mb-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Testimonial Image */}
              <div className="flex justify-center lg:justify-start">
                <div className="relative">
                  <div className="w-48 h-48 rounded-2xl overflow-hidden border-4 border-primary/20">
                    <AppImage
                      src={activeTestimonialData.image}
                      alt={activeTestimonialData.alt}
                      className="w-full h-full object-cover" />

                  </div>
                  <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full bg-gradient-cta flex items-center justify-center shadow-primary">
                    <Icon name="ChatBubbleLeftRightIcon" size={28} className="text-white" variant="solid" />
                  </div>
                </div>
              </div>

              {/* Testimonial Content */}
              <div className="lg:col-span-2">
                <div className="mb-6">
                  <Icon name="QuoteIcon" size={40} className="text-primary/30 mb-4" variant="solid" />
                  <p className="text-lg text-foreground mb-6 leading-relaxed">
                    "{activeTestimonialData.quote}"
                  </p>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-lg font-bold text-foreground">{activeTestimonialData.name}</div>
                    <div className="text-sm text-text-secondary">{activeTestimonialData.role}</div>
                    <div className="text-sm text-primary">{activeTestimonialData.company}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-success">{activeTestimonialData.metrics.value}</div>
                    <div className="text-sm text-text-secondary">{activeTestimonialData.metrics.label}</div>
                  </div>
                </div>

                {/* Carousel Controls */}
                <div className="flex items-center justify-center space-x-2">
                  {testimonials.map((_, index) =>
                  <button
                    key={index}
                    onClick={() => handleTestimonialChange(index)}
                    className={`h-2 rounded-full transition-smooth ${
                    activeTestimonial === index ? 'bg-primary w-8' : 'bg-muted w-2'}`
                    }
                    aria-label={`View testimonial ${index + 1}`} />

                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Client Logos */}
          <div>
            <h3 className="text-center text-sm font-medium text-text-secondary mb-6">
              TRUSTED BY FORTUNE 500 COMPANIES
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {clientLogos.map((logo, index) =>
              <div
                key={index}
                className="flex items-center justify-center p-6 bg-card border border-border rounded-lg hover:border-primary/50 transition-smooth">

                  <span className="text-lg font-bold text-text-secondary">{logo}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>);

};

export default SocialProof;