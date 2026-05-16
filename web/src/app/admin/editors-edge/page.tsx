// /admin/editors-edge — Editor's Edge curation timeline.
//
// Server component. The /admin tree is already permission-gated by
// `app/admin/layout.tsx` (MOD_ROLES) and the underlying mutation
// endpoints re-check `admin.curate.editors_edge`, so this page does not
// gate again — it just loads data via the service-role client and
// renders the timeline + the create form.
//
// Layout: two columns on desktop (left = picks list, right = form).
// Mobile / narrow viewports stack form on top.

import { createServiceClient } from '@/lib/supabase/server';
import PickRow from './_components/PickRow';
import PickForm from './_components/PickForm';

export const dynamic = 'force-dynamic';

type Filter = 'current' | 'upcoming' | 'all';

type Pick = {
  id: string;
  article_id: string;
  category_id: string;
  subcategory_id: string | null;
  slot: number;
  valid_from: string;
  valid_to: string;
  curator_note: string | null;
  created_at: string;
  article: { id: string; title: string | null; slug: string | null } | null;
  category: { id: string; name: string | null; slug: string | null } | null;
  subcategory: { id: string; name: string | null; slug: string | null } | null;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

async function loadPicks(filter: Filter): Promise<Pick[]> {
  // editors_edge_picks is not in the generated Database type yet (migration
  // applied at runtime). Cast through to bypass the missing relation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { data: rows, error } = await svc
    .from('editors_edge_picks')
    .select(
      'id, article_id, category_id, subcategory_id, slot, valid_from, valid_to, curator_note, created_at, removed_at'
    )
    .is('removed_at', null)
    .order('valid_from', { ascending: false })
    .limit(200);
  if (error || !rows) {
    if (error) {
      console.warn('[admin.editors_edge.page] load picks failed:', error.message);
    }
    return [];
  }

  const nowIso = new Date().toISOString();
  const filtered = (rows as Array<{
    id: string;
    article_id: string;
    category_id: string;
    subcategory_id: string | null;
    slot: number;
    valid_from: string;
    valid_to: string;
    curator_note: string | null;
    created_at: string;
  }>).filter((r) => {
    if (filter === 'current') return r.valid_from <= nowIso && r.valid_to > nowIso;
    if (filter === 'upcoming') return r.valid_from > nowIso;
    return true;
  });

  if (filtered.length === 0) return [];

  // Hydrate articles + categories in 2 follow-up queries (no FK-join hint
  // needed; cheaper than threading the FK alias for a small admin list).
  const articleIds = Array.from(new Set(filtered.map((r) => r.article_id)));
  const catIds = Array.from(
    new Set([
      ...filtered.map((r) => r.category_id),
      ...filtered.map((r) => r.subcategory_id).filter((v): v is string => !!v),
    ])
  );

  const supabase = createServiceClient();

  const [articlesRes, categoriesRes, storiesRes] = await Promise.all([
    supabase
      .from('articles')
      .select('id, title, story_id')
      .in('id', articleIds),
    supabase
      .from('categories')
      .select('id, name, slug')
      .in('id', catIds),
    Promise.resolve(null as unknown),
  ]);

  const articleRows = (articlesRes.data || []) as Array<{
    id: string;
    title: string | null;
    story_id: string | null;
  }>;
  const storyIds = Array.from(
    new Set(articleRows.map((a) => a.story_id).filter((v): v is string => !!v))
  );
  let storySlugById = new Map<string, string | null>();
  if (storyIds.length > 0) {
    const { data: stories } = await supabase
      .from('stories')
      .select('id, slug')
      .in('id', storyIds);
    storySlugById = new Map(
      ((stories || []) as Array<{ id: string; slug: string | null }>).map((s) => [s.id, s.slug])
    );
  }
  void storiesRes;

  const articleById = new Map<
    string,
    { id: string; title: string | null; slug: string | null }
  >();
  for (const a of articleRows) {
    articleById.set(a.id, {
      id: a.id,
      title: a.title,
      slug: a.story_id ? storySlugById.get(a.story_id) ?? null : null,
    });
  }

  const categoryById = new Map<
    string,
    { id: string; name: string | null; slug: string | null }
  >();
  for (const c of ((categoriesRes.data || []) as Array<{
    id: string;
    name: string | null;
    slug: string | null;
  }>)) {
    categoryById.set(c.id, c);
  }

  return filtered.map((r) => ({
    ...r,
    article: articleById.get(r.article_id) ?? null,
    category: categoryById.get(r.category_id) ?? null,
    subcategory: r.subcategory_id ? categoryById.get(r.subcategory_id) ?? null : null,
  }));
}

async function loadAdultCategories(): Promise<Category[]> {
  const supabase = createServiceClient();
  // Adult, top-level + subcategories together. PickForm filters
  // subcategories client-side by parent_id when a category is selected.
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, is_kids_safe, deleted_at, sort_order')
    .is('deleted_at', null)
    .eq('is_kids_safe', false)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error || !data) {
    if (error) console.warn('[admin.editors_edge.page] load categories failed:', error.message);
    return [];
  }
  return (data as Array<{
    id: string;
    name: string | null;
    slug: string | null;
    parent_id: string | null;
  }>)
    .filter((c) => c.name && c.slug)
    .map((c) => ({
      id: c.id,
      name: c.name as string,
      slug: c.slug as string,
      parent_id: c.parent_id,
    }));
}

export default async function EditorsEdgeAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const sp = (await searchParams) || {};
  const raw = sp.filter;
  const filter: Filter = raw === 'upcoming' || raw === 'all' ? raw : 'current';

  const [picks, categories] = await Promise.all([loadPicks(filter), loadAdultCategories()]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f9fafb',
        color: '#0f172a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '32px 32px 96px',
          boxSizing: 'border-box',
        }}
      >
        <header style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#64748b',
              marginBottom: 4,
            }}
          >
            Curation
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Editor&rsquo;s Edge
          </h1>
          <p style={{ marginTop: 6, color: '#475569', fontSize: 14 }}>
            Curated picks shown at the top of each category on the /search
            surface and the iOS Browse tab. One pick at a time per category
            (and per subcategory when set). Default window is 48 hours.
          </p>
        </header>

        <nav
          aria-label="Filter"
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          {(['current', 'upcoming', 'all'] as const).map((f) => {
            const active = f === filter;
            const href = f === 'current' ? '/admin/editors-edge' : `/admin/editors-edge?filter=${f}`;
            return (
              <a
                key={f}
                href={href}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? '#0f172a' : '#cbd5e1'}`,
                  background: active ? '#0f172a' : '#ffffff',
                  color: active ? '#ffffff' : '#334155',
                  fontWeight: active ? 600 : 500,
                  fontSize: 13,
                  textDecoration: 'none',
                  textTransform: 'capitalize',
                }}
              >
                {f === 'current' ? 'Current only' : f}
              </a>
            );
          })}
        </nav>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 360px',
            gap: 32,
            alignItems: 'start',
          }}
        >
          <section>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#475569',
                margin: '0 0 12px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {filter === 'current'
                ? 'Currently visible'
                : filter === 'upcoming'
                ? 'Scheduled / upcoming'
                : 'All active picks'}{' '}
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>({picks.length})</span>
            </h2>

            {picks.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  border: '1px dashed #cbd5e1',
                  borderRadius: 8,
                  background: '#ffffff',
                  color: '#64748b',
                  fontSize: 14,
                }}
              >
                No picks in this view yet. Use the form on the right to schedule one.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {picks.map((p) => (
                  <PickRow key={p.id} pick={p} />
                ))}
              </ul>
            )}
          </section>

          <aside style={{ position: 'sticky', top: 24 }}>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#475569',
                  margin: '0 0 16px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Schedule a pick
              </h2>
              <PickForm categories={categories} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
