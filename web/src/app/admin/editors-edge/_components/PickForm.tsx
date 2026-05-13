'use client';

// PickForm — create an Editor's Edge pick. The page passes the full
// adult-category list (top-level + subcategories); we filter the
// subcategory dropdown locally by the selected category's parent_id.
//
// On submit: POST /api/admin/editors-edge → toast → router.refresh()
// so the server-rendered list re-loads.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/admin/Toast';
import ArticlePicker, { type PickerArticle } from './ArticlePicker';

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

// Local datetime-local string in the user's TZ that corresponds to the
// given epoch ms. datetime-local inputs want "YYYY-MM-DDTHH:mm".
function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PickForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, startTransition] = useTransition();

  const topLevel = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories]
  );
  const subsByParent = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      const arr = m.get(c.parent_id) || [];
      arr.push(c);
      m.set(c.parent_id, arr);
    }
    return m;
  }, [categories]);

  const now = Date.now();
  const defaultFrom = useMemo(() => toLocalInputValue(now), [now]);
  const defaultTo = useMemo(() => toLocalInputValue(now + 48 * 60 * 60 * 1000), [now]);

  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [article, setArticle] = useState<PickerArticle | null>(null);
  const [validFrom, setValidFrom] = useState(defaultFrom);
  const [validTo, setValidTo] = useState(defaultTo);
  const [curatorNote, setCuratorNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const subOptions = categoryId ? subsByParent.get(categoryId) || [] : [];

  const reset = () => {
    setCategoryId('');
    setSubcategoryId('');
    setArticle(null);
    setCuratorNote('');
    const fresh = Date.now();
    setValidFrom(toLocalInputValue(fresh));
    setValidTo(toLocalInputValue(fresh + 48 * 60 * 60 * 1000));
    setFormError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!categoryId) {
      setFormError('Pick a category.');
      return;
    }
    if (!article) {
      setFormError('Pick an article.');
      return;
    }
    const fromMs = new Date(validFrom).getTime();
    const toMs = new Date(validTo).getTime();
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      setFormError('Valid-from / valid-to must be real dates.');
      return;
    }
    if (fromMs >= toMs) {
      setFormError('Valid-from must be before valid-to.');
      return;
    }
    if (curatorNote.length > 500) {
      setFormError('Curator note must be 500 characters or fewer.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/editors-edge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            article_id: article.id,
            category_id: categoryId,
            subcategory_id: subcategoryId || null,
            valid_from: new Date(fromMs).toISOString(),
            valid_to: new Date(toMs).toISOString(),
            slot: 0,
            curator_note: curatorNote.trim() || null,
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          push({
            message: `Create failed: ${json.error ?? res.statusText}`,
            variant: 'danger',
          });
          return;
        }
        push({ message: 'Pick scheduled.', variant: 'success' });
        reset();
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        push({ message: `Create failed: ${msg}`, variant: 'danger' });
      }
    });
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#334155',
    marginBottom: 6,
    letterSpacing: '0.02em',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#ffffff',
    color: '#0f172a',
    boxSizing: 'border-box',
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label htmlFor="ee-category" style={labelStyle}>
          Category
        </label>
        <select
          id="ee-category"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setSubcategoryId('');
          }}
          required
          disabled={pending}
          style={inputStyle}
        >
          <option value="">Select a category…</option>
          {topLevel.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {subOptions.length > 0 && (
        <div>
          <label htmlFor="ee-subcategory" style={labelStyle}>
            Subcategory (optional)
          </label>
          <select
            id="ee-subcategory"
            value={subcategoryId}
            onChange={(e) => setSubcategoryId(e.target.value)}
            disabled={pending}
            style={inputStyle}
          >
            <option value="">— Category-level pick —</option>
            {subOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={labelStyle}>Article</label>
        <ArticlePicker value={article} onChange={setArticle} disabled={pending} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label htmlFor="ee-valid-from" style={labelStyle}>
            Valid from
          </label>
          <input
            id="ee-valid-from"
            type="datetime-local"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            disabled={pending}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="ee-valid-to" style={labelStyle}>
            Valid to
          </label>
          <input
            id="ee-valid-to"
            type="datetime-local"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            disabled={pending}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label htmlFor="ee-note" style={labelStyle}>
          Curator note (optional, 500 max)
        </label>
        <textarea
          id="ee-note"
          value={curatorNote}
          onChange={(e) => setCuratorNote(e.target.value.slice(0, 500))}
          disabled={pending}
          rows={3}
          maxLength={500}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'inherit',
            minHeight: 60,
          }}
        />
        <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
          {curatorNote.length} / 500
        </div>
      </div>

      {formError && (
        <div
          style={{
            padding: '8px 10px',
            border: '1px solid #fca5a5',
            background: '#fef2f2',
            color: '#991b1b',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '10px 16px',
          borderRadius: 6,
          border: '1px solid #0f172a',
          background: pending ? '#475569' : '#0f172a',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Scheduling…' : 'Schedule pick'}
      </button>
    </form>
  );
}
