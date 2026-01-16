'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function LocaleRootPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale as string;
  
  useEffect(() => {
    if (locale) {
      router.replace(`/${locale}/landing-page`);
    }
  }, [locale, router]);

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px'
        }} />
        <p style={{ color: '#666' }}>Redirecting...</p>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
