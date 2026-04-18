'use client';

import { useState } from 'react';
import { createClient } from '../../../lib/supabase/client';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
};

const EXPERTISE_FIELDS = [
  'Politics & Government',
  'Science & Research',
  'Technology & AI',
  'Health & Medicine',
  'Economics & Finance',
  'Law & Justice',
  'Climate & Environment',
  'International Affairs',
  'Education',
  'Media & Journalism',
  'Military & Defense',
  'Public Health',
];

export default function ExpertSignupPage() {
  const [step, setStep] = useState(1);
  const [focused, setFocused] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Step 2
  const [expertise, setExpertise] = useState([]);
  const [role, setRole] = useState('');
  const [credentials, setCredentials] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [professionalEmail, setProfessionalEmail] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [agreed, setAgreed] = useState(false);
  // Pass 17 / UJ-710: 3 sample responses the reviewer uses to score the
  // application. Sent as `sample_responses: [{topic, body}, ...]`.
  const [sample1Topic, setSample1Topic] = useState('');
  const [sample1Body, setSample1Body] = useState('');
  const [sample2Topic, setSample2Topic] = useState('');
  const [sample2Body, setSample2Body] = useState('');
  const [sample3Topic, setSample3Topic] = useState('');
  const [sample3Body, setSample3Body] = useState('');

  const toggleExpertise = (f) => setExpertise((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);

  const field = (name) => ({
    width: '100%', padding: '11px 14px', fontSize: '14px', color: C.text, backgroundColor: C.bg,
    border: `1.5px solid ${focused === name ? C.accent : C.border}`, borderRadius: '10px',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, ageConfirmed, agreedToTerms }),
      });
      const signupBody = await signupRes.json();
      if (!signupRes.ok) throw new Error(signupBody.error || 'Signup failed');

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const socialLinks = {};
      if (linkedin) socialLinks.linkedin = linkedin;
      if (portfolio) socialLinks.portfolio = portfolio;

      const applyRes = await fetch('/api/expert/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_type: 'expert',
          full_name: fullName,
          title: role,
          bio: credentials,
          expertise_areas: expertise,
          website_url: portfolio || null,
          social_links: socialLinks,
          credentials: professionalEmail ? [{ type: 'email', value: professionalEmail }] : [],
          portfolio_urls: portfolio ? [portfolio] : [],
          sample_responses: [
            { topic: sample1Topic.trim(), body: sample1Body.trim() },
            { topic: sample2Topic.trim(), body: sample2Body.trim() },
            { topic: sample3Topic.trim(), body: sample3Body.trim() },
          ].filter(s => s.topic && s.body),
          category_ids: [],
        }),
      });
      const applyBody = await applyRes.json();
      if (!applyRes.ok) throw new Error(applyBody.error || 'Application failed');

      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '48px 36px', width: '100%', maxWidth: '440px', boxSizing: 'border-box', textAlign: 'center' }}>
          <div style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: C.text, margin: '0 0 10px 0' }}>Application received!</h2>
          <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 20px 0', lineHeight: '1.6' }}>
            Thanks, {fullName || 'there'}. Our editorial team will review your application within{' '}
            <strong style={{ color: C.text }}>48 hours</strong>. You&apos;ll hear back at{' '}
            <strong style={{ color: C.text }}>{email || 'your email'}</strong>.
          </p>
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px', marginBottom: '24px' }}>
            <p style={{ fontSize: '13px', color: '#166534', margin: 0, lineHeight: '1.5' }}>
              In the meantime, you can browse Verity Post as a regular reader.
            </p>
          </div>
          <button type="button" onClick={() => window.location.href = '/'}
            style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: C.accent, border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Start Reading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxSizing: 'border-box',
    }}>
      <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '40px 36px', width: '100%', maxWidth: '480px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: C.accent, letterSpacing: '-0.5px', marginBottom: '22px' }}>Verity Post</div>

        {/* Step pills */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '26px' }}>
          {['Account', 'Credentials'].map((label, i) => (
            <div key={i} style={{
              padding: '5px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: '600',
              backgroundColor: step === i + 1 ? C.accent : i + 1 < step ? C.success : C.bg,
              color: step === i + 1 || i + 1 < step ? '#fff' : C.dim,
              border: `1px solid ${step === i + 1 ? C.accent : i + 1 < step ? C.success : C.border}`,
            }}>
              {`${i + 1}. ${label}`}
            </div>
          ))}
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: '700', color: C.text, margin: '0 0 6px 0' }}>Apply as an Expert Contributor</h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 26px 0', lineHeight: '1.5' }}>
          {step === 1 ? 'Create your account first, then describe your expertise.' : 'Help us verify your professional background.'}
        </p>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>{error}</p>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); if (password !== confirmPassword) { setError('Passwords do not match.'); return; } setError(''); setStep(2); }}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Full name</label>
              <input type="text" placeholder="Dr. Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value)}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)} style={field('name')} required autoComplete="name" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Email address</label>
              <input type="email" placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} style={field('email')} required autoComplete="email" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" value={password}
                  onChange={(e) => setPassword(e.target.value)} onFocus={() => setFocused('pw')} onBlur={() => setFocused(null)}
                  style={{ ...field('pw'), paddingRight: '56px' }} required autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: C.dim, fontFamily: 'inherit' }}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Confirm password</label>
              <input type={showPassword ? 'text' : 'password'} placeholder="Repeat password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} onFocus={() => setFocused('cpw')} onBlur={() => setFocused(null)}
                style={field('cpw')} required autoComplete="new-password" />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
              <input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)}
                style={{ accentColor: C.accent, width: '16px', height: '16px', marginTop: '2px', flexShrink: 0 }} required />
              <span style={{ fontSize: '13px', color: C.dim, lineHeight: '1.5' }}>
                I confirm I am 13 or older.
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}>
              <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={{ accentColor: C.accent, width: '16px', height: '16px', marginTop: '2px', flexShrink: 0 }} required />
              <span style={{ fontSize: '13px', color: C.dim, lineHeight: '1.5' }}>
                I agree to the{' '}
                <a href="/terms" style={{ color: C.accent, fontWeight: '600', fontSize: '13px', textDecoration: 'none' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" style={{ color: C.accent, fontWeight: '600', fontSize: '13px', textDecoration: 'none' }}>Privacy Policy</a>
              </span>
            </label>

            <button type="submit" disabled={!ageConfirmed || !agreedToTerms}
              style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: (!ageConfirmed || !agreedToTerms) ? '#cccccc' : C.accent, border: 'none', borderRadius: '10px', cursor: (!ageConfirmed || !agreedToTerms) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              Next: Credentials →
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Areas of expertise (select all that apply)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 12px', border: `1.5px solid ${C.border}`, borderRadius: '10px', backgroundColor: C.bg }}>
                {EXPERTISE_FIELDS.map((f) => (
                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
                    <input type="checkbox" checked={expertise.includes(f)} onChange={() => toggleExpertise(f)}
                      style={{ accentColor: C.accent, width: '14px', height: '14px' }} />
                    <span>{f}</span>
                  </label>
                ))}
              </div>
              {expertise.length === 0 && <p style={{ fontSize: '11px', color: C.dim, margin: '6px 0 0' }}>Pick at least one.</p>}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Your role / title</label>
              <input type="text" placeholder="e.g. Professor, Senior Researcher, Staff Attorney" value={role}
                onChange={(e) => setRole(e.target.value)} onFocus={() => setFocused('role')} onBlur={() => setFocused(null)}
                style={field('role')} required />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Credentials &amp; bio</label>
              <textarea placeholder="Describe your background and qualifications. What makes you an expert in this field? (min. 100 characters)" value={credentials}
                onChange={(e) => setCredentials(e.target.value)} onFocus={() => setFocused('bio')} onBlur={() => setFocused(null)}
                rows={4} required
                style={{ ...field('bio'), resize: 'vertical', lineHeight: '1.5', minHeight: '96px' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Portfolio / Website URL</label>
              <input type="url" placeholder="https://yourwebsite.com" value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)} onFocus={() => setFocused('port')} onBlur={() => setFocused(null)} style={field('port')} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '4px' }}>Professional email <span style={{ color: C.dim, fontWeight: '400', fontSize: '12px' }}>(institutional / work)</span></label>
              <input type="email" placeholder="jane.smith@university.edu" value={professionalEmail}
                onChange={(e) => setProfessionalEmail(e.target.value)} onFocus={() => setFocused('proem')} onBlur={() => setFocused(null)} style={field('proem')} />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>LinkedIn profile</label>
              <input type="url" placeholder="https://linkedin.com/in/yourprofile" value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)} onFocus={() => setFocused('li')} onBlur={() => setFocused(null)} style={field('li')} />
            </div>

            {/* Pass 17 / UJ-710: three sample responses the reviewer uses
              * to score the application. Submission fails server-side if
              * fewer than three complete responses are provided. */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '4px' }}>Sample responses</label>
              <p style={{ fontSize: '12px', color: C.dim, margin: '0 0 10px' }}>
                Pick three topics you could answer as an expert on Verity Post, and draft a short representative reply for each (2–4 sentences).
              </p>
              {[1, 2, 3].map(n => {
                const topic = n === 1 ? sample1Topic : n === 2 ? sample2Topic : sample3Topic;
                const body = n === 1 ? sample1Body : n === 2 ? sample2Body : sample3Body;
                const setTopic = n === 1 ? setSample1Topic : n === 2 ? setSample2Topic : setSample3Topic;
                const setBody = n === 1 ? setSample1Body : n === 2 ? setSample2Body : setSample3Body;
                return (
                  <div key={n} style={{ marginBottom: 12 }}>
                    <input type="text" placeholder={`Sample ${n} — topic (e.g. "Vaccine efficacy in elderly populations")`} value={topic}
                      onChange={(e) => setTopic(e.target.value)} style={{ ...field(`s${n}t`), marginBottom: 6 }} />
                    <textarea placeholder={`Sample ${n} — your response (2–4 sentences)`} value={body}
                      onChange={(e) => setBody(e.target.value)} rows={3}
                      style={{ ...field(`s${n}b`), resize: 'vertical', lineHeight: '1.5', minHeight: '68px' }} />
                  </div>
                );
              })}
            </div>

            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '18px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '13px', color: '#92400e', lineHeight: '1.5' }}>
                <strong>Expert applications are reviewed within 48 hours.</strong> Your account will be active immediately as a regular reader while we review.
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                style={{ accentColor: C.accent, width: '16px', height: '16px', marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: C.dim, lineHeight: '1.5' }}>
                I confirm my credentials are accurate and I agree to the{' '}
                <a href="/terms#expert" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, fontWeight: '600', fontSize: '13px', textDecoration: 'none' }}>Expert Contributor Terms</a>
              </span>
            </label>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setStep(1)}
                style={{ padding: '13px 20px', fontSize: '14px', fontWeight: '600', color: C.text, backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                ← Back
              </button>
              <button type="submit" disabled={loading || !agreed || expertise.length === 0}
                style={{ flex: 1, padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: (loading || !agreed || expertise.length === 0) ? '#cccccc' : C.accent, border: 'none', borderRadius: '10px', cursor: (loading || !agreed || expertise.length === 0) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {loading ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}

        <p style={{ textAlign: 'center', fontSize: '13px', color: C.dim, marginTop: '20px' }}>
          Not an expert?{' '}
          <a href="/signup" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontWeight: '600', fontSize: '13px', padding: 0, fontFamily: 'inherit', textDecoration: 'none' }}>
            Regular signup
          </a>
        </p>
      </div>
    </div>
  );
}
