// Inline expert application form. Renders inside the Expert profile
// section when the user has no application yet, so they never get
// kicked out of the profile shell to /signup/expert. POSTs to the same
// /api/expert/apply route the legacy form uses; capture the essential
// fields only — full portfolio links + structured credentials objects
// are still on the legacy form for now.

'use client';

import { useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import { Card } from '../../_components/Card';
import {
  Field,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  inputStyle,
  textareaStyle,
} from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { SkeletonBlock } from '../../_components/Skeleton';
import { C, F, FONT, R, S } from '../../_lib/palette';

interface Category {
  id: string;
  name: string;
}

type ApplicationType = 'expert' | 'educator' | 'journalist';

interface Props {
  preview: boolean;
  onSubmitted?: () => void;
}

export function ExpertApplyForm({ preview, onSubmitted }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [applicationType, setApplicationType] = useState<ApplicationType>('expert');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [credentials, setCredentials] = useState('');
  const [pickedCats, setPickedCats] = useState<Set<string>>(new Set());
  const [sampleA, setSampleA] = useState('');
  const [sampleB, setSampleB] = useState('');
  const [sampleC, setSampleC] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)
        .is('parent_id', null)
        .not('slug', 'like', 'kids-%')
        .order('sort_order');
      if (cancelled) return;
      setCategories((data ?? []) as Category[]);
      setLoadingCats(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase]);

  const togglePicked = (id: string) => {
    setPickedCats((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to submit an application.');
      return;
    }
    if (!fullName.trim() || !bio.trim() || pickedCats.size === 0) {
      toast.error('Add your name, a short bio, and at least one area.');
      return;
    }
    const samples = [sampleA, sampleB, sampleC].filter((s) => s.trim().length > 0);
    if (samples.length < 1) {
      toast.error('Include at least one sample answer.');
      return;
    }
    setSubmitting(true);
    try {
      const expertise_areas = Array.from(pickedCats)
        .map((id) => categories.find((c) => c.id === id)?.name)
        .filter((n): n is string => !!n);
      const res = await fetch('/api/expert/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_type: applicationType,
          full_name: fullName.trim(),
          organization: organization.trim() || null,
          title: title.trim() || null,
          bio: bio.trim(),
          expertise_areas,
          website_url: websiteUrl.trim() || null,
          social_links: {},
          credentials: credentials.trim() ? [credentials.trim()] : [],
          portfolio_urls: [],
          sample_responses: samples,
          category_ids: Array.from(pickedCats),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Too many applications. Try again later.');
        }
        throw new Error((data as { error?: string }).error ?? 'Could not submit.');
      }
      toast.success('Application submitted. We review within 5 business days.');
      onSubmitted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card
      title="Apply for verification"
      description="Verified experts answer questions in their fields under a badge readers can trust."
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{
            ...buttonPrimaryStyle,
            opacity: submitting ? 0.55 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
      }
    >
      <div style={{ display: 'grid', gap: S[4], fontFamily: FONT.sans }}>
        <Field label="I'm applying as" required>
          {() => (
            <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
              {(['expert', 'educator', 'journalist'] as const).map((t) => {
                const active = t === applicationType;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setApplicationType(t)}
                    style={{
                      ...buttonSecondaryStyle,
                      background: active ? C.ink : C.bg,
                      color: active ? C.bg : C.ink,
                      borderColor: active ? C.ink : C.border,
                      textTransform: 'capitalize',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <Field label="Full name" required>
          {(id) => (
            <input
              id={id}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              style={inputStyle}
              autoComplete="name"
            />
          )}
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: S[3],
          }}
        >
          <Field label="Organization" optional>
            {(id) => (
              <input
                id={id}
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                maxLength={120}
                style={inputStyle}
                autoComplete="organization"
              />
            )}
          </Field>
          <Field label="Title" optional>
            {(id) => (
              <input
                id={id}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                style={inputStyle}
                autoComplete="organization-title"
              />
            )}
          </Field>
        </div>

        <Field
          label="Short bio"
          hint="One paragraph readers will see next to your badge. ~280 characters."
          required
        >
          {(id) => (
            <textarea
              id={id}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={400}
              style={{ ...textareaStyle, minHeight: 90 }}
            />
          )}
        </Field>

        <Field
          label="Areas of expertise"
          hint="Pick every category your verification should cover."
          required
        >
          {() => (
            <div>
              {loadingCats ? (
                <SkeletonBlock height={48} />
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {categories.map((c) => {
                    const active = pickedCats.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => togglePicked(c.id)}
                        style={{
                          padding: `${S[1]}px ${S[3]}px`,
                          background: active ? C.expert : C.bg,
                          color: active ? '#fff' : C.inkSoft,
                          border: `1px solid ${active ? C.expert : C.border}`,
                          borderRadius: R.pill,
                          fontSize: F.sm,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Field>

        <Field
          label="Credentials"
          hint="Degrees, licenses, prior bylines, board roles, etc."
          required
        >
          {(id) => (
            <textarea
              id={id}
              value={credentials}
              onChange={(e) => setCredentials(e.target.value)}
              maxLength={600}
              style={{ ...textareaStyle, minHeight: 80 }}
            />
          )}
        </Field>

        <Field
          label="Website or profile URL"
          optional
          hint="Anywhere your work is publicly verifiable — university, publication, LinkedIn, personal site."
        >
          {(id) => (
            <input
              id={id}
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://"
              style={inputStyle}
              autoComplete="url"
            />
          )}
        </Field>

        <Field
          label="Sample answers"
          hint="Up to three short answers showing how you'd respond to questions in your field. The first is required."
        >
          {() => (
            <div style={{ display: 'grid', gap: S[2] }}>
              <textarea
                value={sampleA}
                onChange={(e) => setSampleA(e.target.value)}
                placeholder="Sample 1 (required)"
                maxLength={1200}
                style={{ ...textareaStyle, minHeight: 80 }}
              />
              <textarea
                value={sampleB}
                onChange={(e) => setSampleB(e.target.value)}
                placeholder="Sample 2 (optional)"
                maxLength={1200}
                style={{ ...textareaStyle, minHeight: 80 }}
              />
              <textarea
                value={sampleC}
                onChange={(e) => setSampleC(e.target.value)}
                placeholder="Sample 3 (optional)"
                maxLength={1200}
                style={{ ...textareaStyle, minHeight: 80 }}
              />
            </div>
          )}
        </Field>
      </div>
    </Card>
  );
}
