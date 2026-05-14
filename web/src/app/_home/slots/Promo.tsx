// Promo / house — newsletter signup, app pitch, ad. Always labeled
// (designer rule). For the base scaffold this is a simple labeled CTA
// block driven by payload. Real ad integration uses the existing <Ad />
// component once an AD content_type is added.

import Link from 'next/link';
import { C, serifStack } from './_shared';
import type { SlotRow } from '../types';

export default function Promo({ slot }: { slot: SlotRow }) {
  if (slot.config.kind === 'ad') {
    const adLabel =
      typeof slot.config.label === 'string' && slot.config.label
        ? slot.config.label
        : (slot.kind as string);
    return (
      <section
        style={{
          border: `1px dashed ${C.rule}`,
          background: C.surfaceSoft,
          padding: 28,
          textAlign: 'center',
          fontFamily: 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: C.dim,
        }}
      >
        Advertisement · {adLabel}
      </section>
    );
  }

  const item = slot.items.find((i) => i.content_type !== 'article');
  const label =
    (typeof slot.config.label === 'string' ? slot.config.label : null) ??
    'From Verity Post';
  const heading =
    typeof item?.payload?.heading === 'string'
      ? (item.payload.heading as string)
      : null;
  const body =
    typeof item?.payload?.body === 'string'
      ? (item.payload.body as string)
      : null;
  const href =
    typeof item?.payload?.href === 'string'
      ? (item.payload.href as string)
      : null;
  const cta =
    typeof item?.payload?.cta === 'string'
      ? (item.payload.cta as string)
      : 'Learn more';

  if (!heading) return null;

  return (
    <section
      style={{
        borderTop: `1px solid ${C.rule}`,
        borderBottom: `1px solid ${C.rule}`,
        padding: '24px 0',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: C.dim,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: serifStack,
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.3,
          color: C.text,
          margin: '8px 0 0',
        }}
      >
        {heading}
      </p>
      {body && (
        <p
          style={{
            fontSize: 14,
            color: C.soft,
            margin: '8px auto 0',
            maxWidth: 540,
          }}
        >
          {body}
        </p>
      )}
      {href && (
        <Link
          href={href}
          style={{
            display: 'inline-block',
            marginTop: 12,
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            textDecoration: 'underline',
            textUnderlineOffset: 4,
          }}
        >
          {cta} →
        </Link>
      )}
    </section>
  );
}
