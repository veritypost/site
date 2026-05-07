// Background — short questionnaire that powers the per-comment firsthand
// context, the eventual "find an expert" search, and the public-profile
// background line. Designed so the regular reader (no credentials) feels
// invited, not interrogated. Everything is optional. Pick what fits.
//
// Persistence:
//   - Scalar fields → users.background_* via update_own_profile RPC
//   - Education     → user_education table via set_own_education RPC
//   - Links         → user_links table via set_own_links RPC
//   - Topics        → user_topics_known table via set_own_topics_known RPC
//
// The expert verification layer (currently launch-hidden) eventually plugs
// into this surface as a deeper tier on top of self-described entries.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/friendlyError';

import { useToast } from '../../_components/Toast';
import { Card } from '../../_components/Card';
import { Field, buttonPrimaryStyle, inputStyle, textareaStyle } from '../../_components/Field';
import { C, F, R, S } from '../../_lib/palette';

const ONE_LINE_LIMIT = 80;
const PROFESSION_LIMIT = 60;
const YEARS_LIMIT = 24;
const WHERE_LIMIT = 60;
const LIVED_LIMIT = 240;
const LANGUAGES_LIMIT = 80;
const LINK_URL_LIMIT = 200;
const LINK_LABEL_LIMIT = 24;
const LINK_MAX = 4;
const LINK_LABEL_PRESETS = ['LinkedIn', 'Personal site', 'GitHub', 'Research', 'Resume'];
const EDU_SCHOOL_LIMIT = 80;
const EDU_DEGREE_LIMIT = 32;
const EDU_FIELD_LIMIT = 60;
const EDU_YEARS_LIMIT = 16;
const EDU_MAX = 5;

type OptionalKey =
  | 'profession'
  | 'years'
  | 'education'
  | 'lived'
  | 'where'
  | 'topics'
  | 'languages'
  | 'links';

interface OptionalFieldDef {
  key: OptionalKey;
  label: string;
  hint: string;
  kind: 'text' | 'textarea' | 'topics' | 'links' | 'education';
  limit?: number;
  placeholder: string;
}

interface BackgroundLink {
  url: string;
  label: string;
}

interface EducationEntry {
  school: string;
  degree: string;
  field: string;
  years: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

const OPTIONAL_FIELDS: OptionalFieldDef[] = [
  {
    key: 'profession',
    label: 'What you do',
    hint: 'Job, trade, or role.',
    kind: 'text',
    limit: PROFESSION_LIMIT,
    placeholder: 'e.g. civil engineer, ER nurse, retired teacher',
  },
  {
    key: 'years',
    label: 'Years in the field',
    hint: 'Only meaningful if you filled in what you do.',
    kind: 'text',
    limit: YEARS_LIMIT,
    placeholder: 'e.g. 30 yrs · since 2008',
  },
  {
    key: 'education',
    label: 'Education',
    hint: 'Schools, degrees, training. Add as many as feel relevant.',
    kind: 'education',
    placeholder: '',
  },
  {
    key: 'lived',
    label: 'Lived experience',
    hint: 'Something you’ve been through that shapes how you read certain stories.',
    kind: 'textarea',
    limit: LIVED_LIMIT,
    placeholder: 'e.g. dad of three in Detroit · Vietnam vet, infantry, ‘68–’70 · raised on a farm',
  },
  {
    key: 'where',
    label: 'Where you’re based',
    hint: 'Region or city. As specific as you’re comfortable.',
    kind: 'text',
    limit: WHERE_LIMIT,
    placeholder: 'e.g. rural Maine · Tokyo · suburban Atlanta',
  },
  {
    key: 'topics',
    label: 'Topics you know well',
    hint: 'Helps people find you when they’re looking for someone with knowledge in an area.',
    kind: 'topics',
    placeholder: '',
  },
  {
    key: 'languages',
    label: 'Languages',
    hint: 'Languages you read or speak fluently.',
    kind: 'text',
    limit: LANGUAGES_LIMIT,
    placeholder: 'e.g. English, Spanish, Mandarin',
  },
  {
    key: 'links',
    label: 'Links',
    hint: 'LinkedIn, personal site, research page — wherever readers can verify you or learn more.',
    kind: 'links',
    placeholder: '',
  },
];

interface BackgroundDoc {
  oneLine: string;
  profession: string;
  years: string;
  education: EducationEntry[];
  lived: string;
  livedPublic: boolean;
  where: string;
  topics: string[]; // category UUIDs
  languages: string;
  links: BackgroundLink[];
}

const EMPTY_DOC: BackgroundDoc = {
  oneLine: '',
  profession: '',
  years: '',
  education: [],
  lived: '',
  livedPublic: false,
  where: '',
  topics: [],
  languages: '',
  links: [],
};

function fieldHasValue(doc: BackgroundDoc, key: OptionalKey): boolean {
  if (key === 'topics') return doc.topics.length > 0;
  if (key === 'links') return doc.links.some((l) => l.url.trim().length > 0);
  if (key === 'education') {
    return doc.education.some(
      (e) => e.school.trim() || e.degree.trim() || e.field.trim() || e.years.trim()
    );
  }
  return !!(doc[key as keyof BackgroundDoc] as string || '').trim();
}

export function BackgroundCard() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [doc, setDoc] = useState<BackgroundDoc>({ ...EMPTY_DOC });
  const [topicOptions, setTopicOptions] = useState<CategoryOption[]>([]);
  const [username, setUsername] = useState<string>('');
  const [open, setOpen] = useState<Record<OptionalKey, boolean>>({
    profession: false,
    years: false,
    education: false,
    lived: false,
    where: false,
    topics: false,
    languages: false,
    links: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const initialRef = useRef<string>(JSON.stringify(EMPTY_DOC));

  // Initial load: user row + education + links + topics + categories. Anything
  // that fails leaves its slice empty; the user can still edit + save other
  // sections independently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) {
        if (!cancelled) setLoading(false);
        return;
      }

      const [userRes, eduRes, linksRes, topicsRes, catsRes] = await Promise.all([
        supabase
          .from('users')
          .select(
            'username, background_oneline, background_profession, background_years, background_where, background_lived, background_lived_public, background_languages'
          )
          .eq('id', uid)
          .maybeSingle(),
        supabase
          .from('user_education')
          .select('school, degree, field, years, sort_order')
          .eq('user_id', uid)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true }),
        supabase
          .from('user_links')
          .select('url, label, sort_order')
          .eq('user_id', uid)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true }),
        supabase
          .from('user_topics_known')
          .select('category_id')
          .eq('user_id', uid),
        supabase
          .from('categories')
          .select('id, name')
          .is('parent_id', null)
          .order('name', { ascending: true }),
      ]);

      if (cancelled) return;

      const userRow = (userRes.data || {}) as Partial<{
        username: string | null;
        background_oneline: string | null;
        background_profession: string | null;
        background_years: string | null;
        background_where: string | null;
        background_lived: string | null;
        background_lived_public: boolean | null;
        background_languages: string | null;
      }>;
      setUsername(userRow.username ?? '');

      const loaded: BackgroundDoc = {
        oneLine: userRow.background_oneline ?? '',
        profession: userRow.background_profession ?? '',
        years: userRow.background_years ?? '',
        where: userRow.background_where ?? '',
        lived: userRow.background_lived ?? '',
        livedPublic: userRow.background_lived_public ?? false,
        languages: userRow.background_languages ?? '',
        education: (eduRes.data || []).map((e) => ({
          school: e.school ?? '',
          degree: e.degree ?? '',
          field: e.field ?? '',
          years: e.years ?? '',
        })),
        links: (linksRes.data || []).map((l) => ({
          url: l.url ?? '',
          label: l.label ?? '',
        })),
        topics: (topicsRes.data || []).map((t) => t.category_id),
      };

      setDoc(loaded);
      initialRef.current = JSON.stringify(loaded);
      setOpen({
        profession: fieldHasValue(loaded, 'profession'),
        years: fieldHasValue(loaded, 'years'),
        education: fieldHasValue(loaded, 'education'),
        lived: fieldHasValue(loaded, 'lived'),
        where: fieldHasValue(loaded, 'where'),
        topics: fieldHasValue(loaded, 'topics'),
        languages: fieldHasValue(loaded, 'languages'),
        links: fieldHasValue(loaded, 'links'),
      });
      setTopicOptions(
        (catsRes.data || []).map((c) => ({ id: c.id, name: c.name ?? '' }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const dirty = JSON.stringify(doc) !== initialRef.current;
  const oneLineRemaining = ONE_LINE_LIMIT - doc.oneLine.length;

  function update<K extends keyof BackgroundDoc>(key: K, value: BackgroundDoc[K]) {
    setDoc((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTopic(id: string) {
    setDoc((prev) => {
      const exists = prev.topics.includes(id);
      const next = exists ? prev.topics.filter((x) => x !== id) : [...prev.topics, id];
      return { ...prev, topics: next };
    });
  }

  function addLink(label: string = '') {
    setDoc((prev) => {
      if (prev.links.length >= LINK_MAX) return prev;
      return { ...prev, links: [...prev.links, { url: '', label }] };
    });
  }

  function updateLink(index: number, patch: Partial<BackgroundLink>) {
    setDoc((prev) => {
      const next = prev.links.map((l, i) => (i === index ? { ...l, ...patch } : l));
      return { ...prev, links: next };
    });
  }

  function removeLink(index: number) {
    setDoc((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }));
  }

  function addEducation() {
    setDoc((prev) => {
      if (prev.education.length >= EDU_MAX) return prev;
      return {
        ...prev,
        education: [
          ...prev.education,
          { school: '', degree: '', field: '', years: '' },
        ],
      };
    });
  }

  function updateEducation(index: number, patch: Partial<EducationEntry>) {
    setDoc((prev) => {
      const next = prev.education.map((e, i) =>
        i === index ? { ...e, ...patch } : e
      );
      return { ...prev, education: next };
    });
  }

  function removeEducation(index: number) {
    setDoc((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  }

  function toggleOpen(key: OptionalKey) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Drop incomplete rows so the RPCs don't reject. School is the only
      // required education field; URL is the only required link field.
      const educationClean = doc.education
        .map((e) => ({
          school: e.school.trim(),
          degree: e.degree.trim(),
          field: e.field.trim(),
          years: e.years.trim(),
        }))
        .filter((e) => e.school.length > 0);
      const linksClean = doc.links
        .map((l) => ({ url: l.url.trim(), label: l.label.trim() }))
        .filter((l) => l.url.length > 0);

      const profileFields = {
        background_oneline: doc.oneLine.trim() || null,
        background_profession: doc.profession.trim() || null,
        background_years: doc.years.trim() || null,
        background_where: doc.where.trim() || null,
        background_lived: doc.lived.trim() || null,
        background_lived_public: doc.livedPublic,
        background_languages: doc.languages.trim() || null,
      };

      // Run all four writes in parallel — independent RPCs, no FK dependency
      // between them.
      const [profileRes, eduRes, linksRes, topicsRes] = await Promise.all([
        supabase.rpc('update_own_profile', { p_fields: profileFields as never }),
        supabase.rpc('set_own_education', { p_entries: educationClean as never }),
        supabase.rpc('set_own_links', { p_entries: linksClean as never }),
        supabase.rpc('set_own_topics_known', { p_category_ids: doc.topics }),
      ]);

      const firstError = [profileRes, eduRes, linksRes, topicsRes].find((r) => r.error)?.error;
      if (firstError) {
        toast.error(friendlyError(firstError));
        return;
      }

      initialRef.current = JSON.stringify(doc);
      toast.success('Background saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card title="Background" description="Loading…">
        <div style={{ minHeight: 80 }} />
      </Card>
    );
  }

  return (
    <Card
      title="Background"
      description="A short line says who’s writing when you comment. Share anything else that fits — every field is optional and you can skip whatever you want."
      footer={
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onSave}
          style={{
            ...buttonPrimaryStyle,
            opacity: dirty && !saving ? 1 : 0.55,
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      }
    >
      <div style={{ display: 'grid', gap: S[5] }}>

        {/* Primary line — always visible. */}
        <Field
          label="In one line, who’s writing?"
          optional
          hint="Lived experience or expertise. Not political identity. 80 characters."
        >
          {(id) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id={id}
                type="text"
                value={doc.oneLine}
                onChange={(e) => update('oneLine', e.target.value.slice(0, ONE_LINE_LIMIT))}
                maxLength={ONE_LINE_LIMIT}
                placeholder="e.g. dad of three in Detroit  ·  civil engineer, 30 yrs"
                style={{
                  ...inputStyle,
                  fontFamily: 'var(--font-serif), Georgia, serif',
                  fontStyle: doc.oneLine ? 'italic' : 'normal',
                }}
              />
              <span
                aria-live="polite"
                style={{
                  fontFamily: 'var(--font-serif), Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: F.xs,
                  color: oneLineRemaining < 12 ? C.warn : C.inkFaint,
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                  minWidth: 22,
                  textAlign: 'right',
                }}
              >
                {oneLineRemaining}
              </span>
            </div>
          )}
        </Field>

        {doc.oneLine.trim() && (
          <div
            style={{
              padding: '10px 14px',
              background: C.surfaceSunken,
              borderRadius: R.md,
              borderLeft: `2px solid ${C.divider}`,
            }}
          >
            <div
              style={{
                fontSize: F.xs,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: C.inkFaint,
                marginBottom: 4,
              }}
            >
              Preview
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif), Georgia, serif',
                fontStyle: 'italic',
                fontSize: F.sm,
                color: C.inkMuted,
                letterSpacing: '0.01em',
              }}
            >
              — {doc.oneLine}
            </div>
          </div>
        )}

        <div
          style={{
            paddingTop: S[3],
            borderTop: `1px solid ${C.divider}`,
          }}
        >
          <div style={{ fontSize: F.sm, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            Add more (optional)
          </div>
          <div style={{ fontSize: F.xs, color: C.inkMuted, marginBottom: S[3] }}>
            Pick anything that fits. Skip what doesn’t. Topics powers
            future “find someone who knows X” search.
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: S[3] }}>
            {OPTIONAL_FIELDS.map((f) => {
              const isOpen = open[f.key];
              const filled = fieldHasValue(doc, f.key);
              const showCount = f.key === 'topics' && filled
                ? ` · ${doc.topics.length}`
                : f.key === 'links' && filled
                ? ` · ${doc.links.filter((l) => l.url.trim()).length}`
                : f.key === 'education' && filled
                ? ` · ${doc.education.filter(
                    (e) => e.school.trim() || e.degree.trim() || e.field.trim() || e.years.trim()
                  ).length}`
                : '';
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleOpen(f.key)}
                  aria-expanded={isOpen}
                  style={{
                    fontSize: F.xs,
                    fontWeight: 600,
                    padding: '6px 11px',
                    borderRadius: R.pill,
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                    border: filled
                      ? `1px solid ${C.ink}`
                      : `1px dashed ${C.borderStrong}`,
                    background: filled ? C.ink : 'transparent',
                    color: filled ? C.bg : C.inkMuted,
                    letterSpacing: '0.01em',
                  }}
                >
                  {filled ? '✓ ' : '+ '}
                  {f.label}{showCount}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gap: S[4] }}>
            {OPTIONAL_FIELDS.map((f) => {
              if (!open[f.key]) return null;
              return (
                <div key={f.key}>
                  {f.key === 'lived' && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        marginBottom: S[3],
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={doc.livedPublic}
                        onChange={(e) => update('livedPublic', e.target.checked)}
                        style={{
                          marginTop: 3,
                          width: 16,
                          height: 16,
                          accentColor: C.accent,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ display: 'grid', gap: 2 }}>
                        <span style={{ fontSize: F.sm, color: C.ink, fontWeight: 600 }}>
                          Show this on my public profile
                        </span>
                        <span style={{ fontSize: F.xs, color: C.inkMuted }}>
                          Off by default — lived experience can include details that
                          identify you. Flip on if you want others to see it.
                        </span>
                      </span>
                    </label>
                  )}
                  <Field label={f.label} optional hint={f.hint}>
                    {(id) => {
                      if (f.kind === 'education') {
                        return (
                          <div id={id} style={{ display: 'grid', gap: 14 }}>
                            {doc.education.map((entry, i) => (
                              <div
                                key={i}
                                style={{
                                  display: 'grid',
                                  gap: 8,
                                  padding: '12px 14px',
                                  border: `1px solid ${C.border}`,
                                  borderRadius: R.md,
                                  background: C.surface,
                                  position: 'relative',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input
                                    type="text"
                                    value={entry.school}
                                    onChange={(e) =>
                                      updateEducation(i, {
                                        school: e.target.value.slice(0, EDU_SCHOOL_LIMIT),
                                      })
                                    }
                                    maxLength={EDU_SCHOOL_LIMIT}
                                    placeholder="School or institution (e.g. University of Michigan)"
                                    style={{ ...inputStyle, fontSize: F.sm, flex: 1, minWidth: 0 }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeEducation(i)}
                                    aria-label="Remove education"
                                    title="Remove"
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: R.sm,
                                      border: `1px solid ${C.border}`,
                                      background: 'transparent',
                                      color: C.inkMuted,
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      lineHeight: 1,
                                      flexShrink: 0,
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  <input
                                    type="text"
                                    value={entry.degree}
                                    onChange={(e) =>
                                      updateEducation(i, {
                                        degree: e.target.value.slice(0, EDU_DEGREE_LIMIT),
                                      })
                                    }
                                    maxLength={EDU_DEGREE_LIMIT}
                                    placeholder="Degree"
                                    style={{ ...inputStyle, fontSize: F.sm, flex: '1 1 110px', minWidth: 0 }}
                                  />
                                  <input
                                    type="text"
                                    value={entry.field}
                                    onChange={(e) =>
                                      updateEducation(i, {
                                        field: e.target.value.slice(0, EDU_FIELD_LIMIT),
                                      })
                                    }
                                    maxLength={EDU_FIELD_LIMIT}
                                    placeholder="Field of study"
                                    style={{ ...inputStyle, fontSize: F.sm, flex: '2 1 180px', minWidth: 0 }}
                                  />
                                  <input
                                    type="text"
                                    value={entry.years}
                                    onChange={(e) =>
                                      updateEducation(i, {
                                        years: e.target.value.slice(0, EDU_YEARS_LIMIT),
                                      })
                                    }
                                    maxLength={EDU_YEARS_LIMIT}
                                    placeholder="Years"
                                    style={{ ...inputStyle, fontSize: F.sm, flex: '1 1 100px', minWidth: 0 }}
                                  />
                                </div>
                              </div>
                            ))}
                            {doc.education.length < EDU_MAX ? (
                              <button
                                type="button"
                                onClick={() => addEducation()}
                                style={{
                                  fontSize: F.xs,
                                  fontWeight: 600,
                                  padding: '6px 11px',
                                  borderRadius: R.pill,
                                  border: `1px dashed ${C.borderStrong}`,
                                  background: 'transparent',
                                  color: C.inkSoft,
                                  cursor: 'pointer',
                                  alignSelf: 'flex-start',
                                  justifySelf: 'flex-start',
                                }}
                              >
                                + Add {doc.education.length === 0 ? 'education' : 'another'}
                              </button>
                            ) : (
                              <div style={{ fontSize: F.xs, fontStyle: 'italic', color: C.inkFaint }}>
                                Up to {EDU_MAX} entries — remove one to add another.
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (f.kind === 'links') {
                        return (
                          <div id={id} style={{ display: 'grid', gap: 10 }}>
                            {doc.links.map((link, i) => (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  alignItems: 'center',
                                }}
                              >
                                <input
                                  type="text"
                                  value={link.label}
                                  onChange={(e) =>
                                    updateLink(i, {
                                      label: e.target.value.slice(0, LINK_LABEL_LIMIT),
                                    })
                                  }
                                  maxLength={LINK_LABEL_LIMIT}
                                  placeholder="Label (e.g. LinkedIn)"
                                  style={{ ...inputStyle, fontSize: F.sm, flex: '1 1 130px', minWidth: 0 }}
                                />
                                <input
                                  type="url"
                                  inputMode="url"
                                  value={link.url}
                                  onChange={(e) =>
                                    updateLink(i, {
                                      url: e.target.value.slice(0, LINK_URL_LIMIT),
                                    })
                                  }
                                  maxLength={LINK_URL_LIMIT}
                                  placeholder="https://"
                                  style={{ ...inputStyle, fontSize: F.sm, flex: '3 1 200px', minWidth: 0 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeLink(i)}
                                  aria-label="Remove link"
                                  title="Remove link"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: R.sm,
                                    border: `1px solid ${C.border}`,
                                    background: 'transparent',
                                    color: C.inkMuted,
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    lineHeight: 1,
                                    flexShrink: 0,
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {doc.links.length < LINK_MAX && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  alignItems: 'center',
                                  gap: 8,
                                  paddingTop: doc.links.length > 0 ? 4 : 0,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => addLink()}
                                  style={{
                                    fontSize: F.xs,
                                    fontWeight: 600,
                                    padding: '6px 11px',
                                    borderRadius: R.pill,
                                    border: `1px dashed ${C.borderStrong}`,
                                    background: 'transparent',
                                    color: C.inkSoft,
                                    cursor: 'pointer',
                                  }}
                                >
                                  + Add a link
                                </button>
                                <span style={{ fontSize: F.xs, color: C.inkFaint }}>
                                  or quick-add:
                                </span>
                                {LINK_LABEL_PRESETS.filter(
                                  (preset) =>
                                    !doc.links.some(
                                      (l) =>
                                        l.label.trim().toLowerCase() === preset.toLowerCase()
                                    )
                                ).map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => addLink(preset)}
                                    style={{
                                      fontSize: F.xs,
                                      fontWeight: 500,
                                      padding: '4px 9px',
                                      borderRadius: R.pill,
                                      border: `1px solid ${C.border}`,
                                      background: 'transparent',
                                      color: C.inkMuted,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                            )}
                            {doc.links.length >= LINK_MAX && (
                              <div style={{ fontSize: F.xs, fontStyle: 'italic', color: C.inkFaint }}>
                                Up to {LINK_MAX} links — remove one to add another.
                              </div>
                            )}
                          </div>
                        );
                      }
                      if (f.kind === 'topics') {
                        return (
                          <div
                            id={id}
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 6,
                              padding: '4px 0',
                            }}
                          >
                            {topicOptions.length === 0 && (
                              <div style={{ fontSize: F.xs, fontStyle: 'italic', color: C.inkFaint }}>
                                No topics available yet.
                              </div>
                            )}
                            {topicOptions.map((topic) => {
                              const selected = doc.topics.includes(topic.id);
                              return (
                                <button
                                  key={topic.id}
                                  type="button"
                                  onClick={() => toggleTopic(topic.id)}
                                  aria-pressed={selected}
                                  style={{
                                    fontSize: F.xs,
                                    fontWeight: 600,
                                    padding: '5px 11px',
                                    borderRadius: R.pill,
                                    cursor: 'pointer',
                                    transition: 'all 120ms ease',
                                    border: selected
                                      ? `1px solid ${C.ink}`
                                      : `1px solid ${C.border}`,
                                    background: selected ? C.ink : 'transparent',
                                    color: selected ? C.bg : C.inkSoft,
                                  }}
                                >
                                  {selected ? '✓ ' : ''}{topic.name}
                                </button>
                              );
                            })}
                          </div>
                        );
                      }
                      const value = String(doc[f.key as keyof BackgroundDoc] ?? '');
                      const remaining = (f.limit ?? 0) - value.length;
                      const inputProps = {
                        id,
                        value,
                        placeholder: f.placeholder,
                        maxLength: f.limit,
                        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                          const nextRaw = e.target.value;
                          const sliced = f.limit ? nextRaw.slice(0, f.limit) : nextRaw;
                          update(f.key as keyof BackgroundDoc, sliced as never);
                        },
                      };
                      return (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          {f.kind === 'textarea' ? (
                            <textarea {...inputProps} rows={2} style={textareaStyle} />
                          ) : (
                            <input {...inputProps} type="text" style={inputStyle} />
                          )}
                          {f.limit && (
                            <span
                              style={{
                                fontFamily: 'var(--font-serif), Georgia, serif',
                                fontStyle: 'italic',
                                fontSize: F.xs,
                                color: remaining < 12 ? C.warn : C.inkFaint,
                                fontVariantNumeric: 'tabular-nums',
                                flexShrink: 0,
                                minWidth: 26,
                                textAlign: 'right',
                                marginTop: 12,
                              }}
                            >
                              {remaining}
                            </span>
                          )}
                        </div>
                      );
                    }}
                  </Field>
                </div>
              );
            })}
          </div>
        </div>

        {username && (
          <div
            style={{
              paddingTop: S[3],
              borderTop: `1px solid ${C.divider}`,
              fontSize: F.xs,
              color: C.inkMuted,
            }}
          >
            <a
              href={`/u/${encodeURIComponent(username)}`}
              target="_blank"
              rel="noopener"
              style={{
                color: C.accent,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              View your public profile ↗
            </a>
            <span style={{ marginLeft: 8, color: C.inkFaint }}>
              opens in a new tab — preview what readers see
            </span>
          </div>
        )}

      </div>
    </Card>
  );
}
