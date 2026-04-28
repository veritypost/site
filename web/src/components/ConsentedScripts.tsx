// S7-I6 — consent-gated third-party script loader. ePrivacy Art. 5(3)
// requires opt-in for non-essential cookies before they fire. GA4 is
// non-essential; AdSense is non-essential. Both are gated here on the
// client-side consent record so EU traffic is compliant by default.
//
// Subscribes to the `vp-consent-change` window event (dispatched by
// `lib/consent.ts`) so opting in mid-session loads the scripts without
// a page reload.

'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { type ConsentRecord, readConsent } from '@/lib/consent';

interface ConsentedScriptsProps {
  gaMeasurementId: string;
  adsensePublisherId: string;
}

export default function ConsentedScripts({
  gaMeasurementId,
  adsensePublisherId,
}: ConsentedScriptsProps) {
  const [consent, setConsent] = useState<ConsentRecord | null>(null);

  useEffect(() => {
    setConsent(readConsent());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ConsentRecord | null>).detail ?? null;
      setConsent(detail);
    };
    window.addEventListener('vp-consent-change', onChange);
    // Cross-tab — `storage` fires for other tabs that updated localStorage.
    const onStorage = () => setConsent(readConsent());
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('vp-consent-change', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const analytics = consent?.categories.analytics === true;
  const advertising = consent?.categories.advertising === true;

  return (
    <>
      {analytics && gaMeasurementId && (
        <>
          <Script
            id="ga4-loader"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${gaMeasurementId}', { send_page_view: false });
            `}
          </Script>
        </>
      )}
      {advertising && adsensePublisherId && (
        <Script
          id="adsense-loader"
          strategy="afterInteractive"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsensePublisherId}`}
          crossOrigin="anonymous"
        />
      )}
    </>
  );
}
