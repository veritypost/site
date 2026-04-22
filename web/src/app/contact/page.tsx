// @migrated-to-permissions 2026-04-19
// @feature-verified shared_components 2026-04-19
'use client';

// Round D H-11 — public contact form. Anon-friendly mirror of
// /profile/contact, posting to /api/support/public (IP-rate-limited)
// rather than the authed /api/support. Used by:
// - App Store reviewers who need a reachable contact surface pre-signup
// - Anon visitors hitting the footer "Contact" link
// - Signed-in visitors (one-line banner links them to /profile/contact
//   so their ticket is attributed to their account)
//
// Kept a light palette in line with other public shells (/help,
// /how-it-works); /profile/contact keeps its dark-themed chrome for
// the authenticated profile tree.

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

const TOPICS = [
  { value: 'account', label: 'Account Issue' },
  { value: 'billing', label: 'Billing & Subscription' },
  { value: 'bug', label: 'Report a Bug' },
  { value: 'content', label: 'Content Concern' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'kids', label: 'Kids Mode' },
  { value: 'expert', label: 'Expert Verification' },
  { value: 'feedback', label: 'App Feedback' },
  { value: 'accessibility', label: 'Accessibility' },
  { value: 'appeal', label: 'Ban Appeal' },
  { value: 'other', label: 'Other' },
];

export default function ContactPage() {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setLoggedIn(Boolean(data?.user));
      } catch {
        if (!cancelled) setLoggedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!topic || !subject.trim() || !body.trim() || !email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/support/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: topic,
          subject: subject.trim(),
          description: body.trim(),
          email: email.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to submit. Please try again.');
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  };

  const canSubmit = Boolean(
    topic && subject.trim() && body.trim() && email.trim() && email.includes('@')
  );

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <a
          href="/"
          style={{
            display: 'inline-block',
            fontSize: 13,
            fontWeight: 600,
            color: '#666666',
            textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          Back to home
        </a>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#111111',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          Contact us
        </h1>
        <p style={{ fontSize: 15, color: '#666666', margin: '0 0 24px', lineHeight: 1.6 }}>
          Have a question or need help? Send us a message and we will reply to the email address you
          provide.
        </p>

        {loggedIn && !submitted && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              marginBottom: 20,
              background: '#f0f7ff',
              border: '1px solid #c7dcf0',
              color: '#0b4a8f',
              fontSize: 13,
            }}
          >
            Signed in? Sending from{' '}
            <a
              href="/profile/contact"
              style={{ color: '#0b4a8f', fontWeight: 700, textDecoration: 'underline' }}
            >
              your account contact form
            </a>{' '}
            attaches the ticket to your profile so we can reply faster.
          </div>
        )}

        {submitted ? (
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              border: '1px solid #e5e5e5',
              background: '#f7f7f7',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111111', marginBottom: 8 }}>
              Message sent
            </div>
            <div style={{ fontSize: 13, color: '#666666', marginBottom: 16 }}>
              We will reply to {email} as soon as we can.
            </div>
            <button
              onClick={() => {
                setSubmitted(false);
                setTopic('');
                setSubject('');
                setBody('');
                setEmail('');
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid #111111',
                background: '#ffffff',
                color: '#111111',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Send another message
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Topic */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#111111',
                  marginBottom: 6,
                }}
              >
                Topic
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TOPICS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setTopic(t.value);
                      if (!subject || TOPICS.some((x) => x.label === subject)) {
                        setSubject(t.value === 'other' ? '' : t.label);
                      }
                    }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      border: `1px solid ${topic === t.value ? '#111111' : '#d4d4d4'}`,
                      background: topic === t.value ? '#111111' : '#ffffff',
                      color: topic === t.value ? '#ffffff' : '#333333',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Email */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#111111',
                  marginBottom: 6,
                }}
              >
                Your email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #d4d4d4',
                  background: '#ffffff',
                  fontSize: 14,
                  color: '#111111',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Subject */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#111111',
                  marginBottom: 6,
                }}
              >
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of your issue"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #d4d4d4',
                  background: '#ffffff',
                  fontSize: 14,
                  color: '#111111',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Body */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#111111',
                  marginBottom: 6,
                }}
              >
                Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe your issue or question in detail."
                rows={6}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #d4d4d4',
                  background: '#ffffff',
                  fontSize: 14,
                  color: '#111111',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                background: !submitting && canSubmit ? '#111111' : '#cccccc',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: !submitting && canSubmit ? 'pointer' : 'not-allowed',
                alignSelf: 'flex-start',
              }}
            >
              {submitting ? 'Sending...' : 'Send message'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
