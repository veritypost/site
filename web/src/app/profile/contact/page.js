// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';
import { useState } from 'react';

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
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!topic || !subject.trim() || !body.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: topic,
          subject: subject.trim(),
          description: body.trim(),
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

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <a
          href="/profile"
          style={{
            display: 'inline-block',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--dim)',
            textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          ← Back to profile
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Contact Us
        </h1>
        <p style={{ fontSize: 13, color: 'var(--dim)', margin: '0 0 24px' }}>
          Have a question or need help? Send us a message and we&apos;ll get back to you.
        </p>

        {submitted ? (
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 8,
              }}
            >
              Message sent
            </div>
            <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 16 }}>
              We&apos;ll get back to you as soon as possible.
            </div>
            <button
              onClick={() => {
                setSubmitted(false);
                setTopic('');
                setSubject('');
                setBody('');
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
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
                  color: 'var(--dim)',
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
                      if (!subject || TOPICS.some((x) => x.label === subject))
                        setSubject(t.value === 'other' ? '' : t.label);
                    }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      border: `1px solid ${topic === t.value ? 'var(--text-primary)' : 'var(--border)'}`,
                      background: topic === t.value ? 'var(--text-primary)' : 'var(--bg)',
                      color: topic === t.value ? 'var(--bg)' : 'var(--dim)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--dim)',
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
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--font-sans)',
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
                  color: 'var(--dim)',
                  marginBottom: 6,
                }}
              >
                Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe your issue or question in detail..."
                rows={6}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--font-sans)',
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

            {/* Submit — canonical primary-button palette (matches signup
                / login): black background with white text when enabled,
                dim grey when disabled. Uses explicit hex to avoid palette
                var resolution drift across routes. */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !topic || !subject.trim() || !body.trim()}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                background:
                  !submitting && topic && subject.trim() && body.trim() ? '#111111' : '#cccccc',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor:
                  !submitting && topic && subject.trim() && body.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)',
                alignSelf: 'flex-start',
              }}
            >
              {submitting ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
