// Phase B — drawer section for editing feeds.extraction_config (jsonb)
// on feed_type='scrape_json' rows. Save POSTs to
// /api/admin/feeds/{id}/extraction-config; Test POSTs to .../extraction-config/test.
// Renders only when the parent decides feed_type === 'scrape_json'.
'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/admin/Button';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

// Minimal shape we need; the parent passes a full DisplayFeed but the editor
// only reads two properties. Avoids re-importing DisplayFeed across files.
type EditorFeed = {
  id: string;
  extraction_config: unknown;
};

interface ExtractionConfigEditorProps {
  feed: EditorFeed;
  onSaved: (updated: object) => void;
}

// Operator-facing presets for the four wholesale news APIs we support.
// Values use the ${ENV_VAR} placeholder syntax; resolution happens in
// /lib/pipeline/scrape-json.ts at scrape time.
const PRESETS: Record<string, object> = {
  NewsAPI: {
    json_path_to_articles: 'articles',
    field_map: {
      url: 'url',
      title: 'title',
      excerpt: 'description',
      pubDate: 'publishedAt',
    },
    headers: { 'X-Api-Key': '${NEWSAPI_KEY}' },
  },
  GNews: {
    json_path_to_articles: 'articles',
    field_map: {
      url: 'url',
      title: 'title',
      excerpt: 'description',
      pubDate: 'publishedAt',
    },
    query_params: { token: '${GNEWS_KEY}', lang: 'en' },
  },
  MediaStack: {
    json_path_to_articles: 'data',
    field_map: {
      url: 'url',
      title: 'title',
      excerpt: 'description',
      pubDate: 'published_at',
    },
    query_params: { access_key: '${MEDIASTACK_KEY}' },
  },
  NewsData: {
    json_path_to_articles: 'results',
    field_map: {
      url: 'link',
      title: 'title',
      excerpt: 'description',
      pubDate: 'pubDate',
    },
    query_params: { apikey: '${NEWSDATA_KEY}' },
  },
};

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'testing' }
  | {
      kind: 'tested';
      count: number;
      sample: Array<{ url?: string; title?: string }>;
    }
  | { kind: 'error'; message: string };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: F.xs,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: ADMIN_C.dim,
  marginBottom: S[1],
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ExtractionConfigEditor({
  feed,
  onSaved,
}: ExtractionConfigEditorProps) {
  const initial = useMemo(() => {
    try {
      return JSON.stringify(feed.extraction_config ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }, [feed.extraction_config]);

  const [text, setText] = useState<string>(initial);
  const [preset, setPreset] = useState<string>('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const parseOrError = (): { ok: true; value: unknown } | { ok: false; error: string } => {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'invalid JSON',
      };
    }
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const choice = e.target.value;
    setPreset(choice);
    if (choice && PRESETS[choice]) {
      setText(JSON.stringify(PRESETS[choice], null, 2));
    }
  };

  const handleSave = async () => {
    const parsed = parseOrError();
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: `invalid JSON: ${parsed.error}` });
      return;
    }
    setStatus({ kind: 'saving' });
    try {
      const res = await fetch(`/api/admin/feeds/${feed.id}/extraction-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction_config: parsed.value }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || body.ok === false) {
        setStatus({
          kind: 'error',
          message: body.error || `save failed (HTTP ${res.status})`,
        });
        return;
      }
      onSaved(parsed.value as object);
      setStatus({ kind: 'saved', at: new Date().toISOString() });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'save failed',
      });
    }
  };

  const handleTest = async () => {
    const parsed = parseOrError();
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: `invalid JSON: ${parsed.error}` });
      return;
    }
    setStatus({ kind: 'testing' });
    try {
      const res = await fetch(
        `/api/admin/feeds/${feed.id}/extraction-config/test`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extraction_config: parsed.value }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        article_count?: number;
        sample?: Array<{ url?: string; title?: string }>;
      };
      if (!res.ok || body.ok === false) {
        setStatus({
          kind: 'error',
          message: body.error || `test failed (HTTP ${res.status})`,
        });
        return;
      }
      setStatus({
        kind: 'tested',
        count: body.article_count ?? 0,
        sample: body.sample ?? [],
      });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'test failed',
      });
    }
  };

  const busy = status.kind === 'saving' || status.kind === 'testing';

  return (
    <div>
      <div
        style={{
          fontSize: F.sm,
          fontWeight: 700,
          color: ADMIN_C.ink,
          marginBottom: S[2],
        }}
      >
        Extraction config
      </div>

      <div style={{ marginBottom: S[2] }}>
        <label style={labelStyle}>Preset</label>
        <select
          value={preset}
          onChange={handlePresetChange}
          disabled={busy}
          style={{
            width: '100%',
            padding: `${S[1]}px ${S[2]}px`,
            fontSize: F.sm,
            fontFamily: 'inherit',
            color: ADMIN_C.ink,
            background: ADMIN_C.bg,
            border: `1px solid ${ADMIN_C.border}`,
            borderRadius: 6,
          }}
        >
          <option value="">Choose preset…</option>
          {Object.keys(PRESETS).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: S[1] }}>
          Loads a starter template into the editor below. Save when ready.
        </div>
      </div>

      <div style={{ marginBottom: S[2] }}>
        <label style={labelStyle}>JSON</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          spellCheck={false}
          disabled={busy}
          style={{
            width: '100%',
            padding: S[2],
            fontSize: F.sm,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: ADMIN_C.ink,
            background: ADMIN_C.bg,
            border: `1px solid ${ADMIN_C.border}`,
            borderRadius: 6,
            resize: 'vertical',
            whiteSpace: 'pre',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: S[2], marginBottom: S[2] }}>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={busy}>
          {status.kind === 'saving' ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleTest} disabled={busy}>
          {status.kind === 'testing' ? 'Testing…' : 'Test'}
        </Button>
      </div>

      <StatusLine status={status} />
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle') {
    return (
      <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
        Edit the JSON, then Save or Test.
      </div>
    );
  }
  if (status.kind === 'saving') {
    return <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>Saving…</div>;
  }
  if (status.kind === 'testing') {
    return <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>Testing…</div>;
  }
  if (status.kind === 'saved') {
    return (
      <div style={{ fontSize: F.xs, color: ADMIN_C.success }}>
        Saved at {formatTime(status.at)}.
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div style={{ fontSize: F.xs, color: ADMIN_C.danger, whiteSpace: 'pre-wrap' }}>
        {status.message}
      </div>
    );
  }
  // tested
  const shown = Math.min(5, status.sample.length);
  return (
    <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
      <div style={{ color: ADMIN_C.success, marginBottom: S[1] }}>
        Tested — {status.count} article{status.count === 1 ? '' : 's'}.
        {status.sample.length > 0 && ` (Showing first ${shown})`}
      </div>
      {status.sample.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: S[3], listStyle: 'disc' }}>
          {status.sample.slice(0, 5).map((a, i) => (
            <li
              key={i}
              style={{
                color: ADMIN_C.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {a.url ?? a.title ?? '(no url/title)'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
