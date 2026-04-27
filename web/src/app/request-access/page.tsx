'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RequestAccessPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          reason: reason.trim() || null,
          referral_source: source.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
        return;
      }
      if (json.status === 'already_approved') {
        setDone(json.message || 'You were already approved. Check your inbox for the invite link.');
      } else if (json.status === 'pending_existing') {
        setDone("We already have your request. We'll get back to you soon.");
      } else {
        setDone("Request submitted. We'll review and email you if approved.");
      }
    } catch {
      setError('Network issue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
          Verity Post — Request access
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 12 }}>
          Tell us a little about yourself.
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.55, color: '#4b5563', marginBottom: 28 }}>
          We&apos;re reading every request. If you&apos;re a fit for the beta, we&apos;ll email you
          a personal invite link.
        </p>

        {done && (
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 10,
              background: '#ecfdf5',
              border: '1px solid #10b981',
              color: '#065f46',
              fontSize: 15,
              lineHeight: 1.5,
              marginBottom: 24,
            }}
          >
            {done}
          </div>
        )}

        {!done && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}
            <Field label="Email" required>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                style={inputStyle}
              />
            </Field>
            <Field label="Name (optional)">
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                style={inputStyle}
              />
            </Field>
            <Field label="Why do you want in? (optional)">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                rows={4}
                maxLength={1500}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="What you're hoping to do here, what you read, anything that helps us decide."
              />
            </Field>
            <Field label="How did you hear about us? (optional)">
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={submitting}
                style={inputStyle}
              />
            </Field>
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              style={{
                marginTop: 8,
                padding: '12px 18px',
                borderRadius: 10,
                background: '#111111',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 15,
                border: 'none',
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting || !email.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? 'Sending…' : 'Submit request'}
            </button>
          </form>
        )}

        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: '1px solid #e5e7eb',
            fontSize: 13,
            color: '#6b7280',
          }}
        >
          Already have an invite link?{' '}
          <Link href="/signup" style={{ color: '#111111', fontWeight: 600 }}>
            Use it on the signup page
          </Link>
          .
        </div>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 15,
  background: '#ffffff',
  color: '#111111',
  fontFamily: 'inherit',
};

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          color: '#374151',
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  );
}
