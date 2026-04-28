// Public landing after the email-confirm click. Outcomes:
//   ?status=ok      → confirmed, your request is in the queue
//   ?status=expired → link expired, go submit again
//   ?status=invalid → unknown token, go submit again
//   ?status=error   → something fell over, retry

import Link from 'next/link';
import { BRAND_NAME } from '../../../lib/brand';

export const metadata = {
  title: `Email confirmed — ${BRAND_NAME}`,
  description: `Email confirmation result for your ${BRAND_NAME} beta access request.`,
};

const COPY: Record<
  string,
  { title: string; body: string; cta: { href: string; label: string } | null }
> = {
  ok: {
    title: 'Email confirmed.',
    body: "Thanks — your request is in the queue. We'll review it and email you a personal invite link if you're approved.",
    cta: null,
  },
  expired: {
    title: 'That confirmation link expired.',
    body: "Submit your email again and we'll send a fresh one. Links are good for 24 hours.",
    cta: { href: '/request-access', label: 'Request access again' },
  },
  invalid: {
    title: "We couldn't verify that link.",
    body: 'It may have already been used or pasted incompletely. Submit your email again to get a new link.',
    cta: { href: '/request-access', label: 'Request access again' },
  },
  error: {
    title: 'Something went wrong.',
    body: 'Please try the link again. If it still fails, submit your email once more for a fresh link.',
    cta: { href: '/request-access', label: 'Request access again' },
  },
};

export default async function RequestAccessConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }> | { status?: string };
}) {
  const sp = await Promise.resolve(searchParams as { status?: string });
  const key = sp.status && COPY[sp.status] ? sp.status : 'ok';
  const c = COPY[key];

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: '#fafafa',
        color: '#111111',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#6b7280',
            marginBottom: 16,
          }}
        >
          {BRAND_NAME}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, marginBottom: 12 }}>
          {c.title}
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: '#374151', marginBottom: 24 }}>
          {c.body}
        </p>
        {c.cta && (
          <Link
            href={c.cta.href}
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              borderRadius: 10,
              background: '#111111',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            {c.cta.label}
          </Link>
        )}
      </div>
    </main>
  );
}
