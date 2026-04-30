'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

type PinnedArticle = {
  id: string;
  title: string | null;
  published_at: string | null;
  categories: { name: string | null } | null;
};

type Slot = {
  position: number;
  article: PinnedArticle | null;
};

const POSITIONS = [1, 2, 3, 4, 5] as const;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function TopStoriesInner() {
  const router = useRouter();
  const supabase = createClient();
  const { push } = useToast();

  const [slots, setSlots] = useState<Slot[]>(
    POSITIONS.map((p) => ({ position: p, article: null }))
  );
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PinnedArticle[]>([]);
  const [searching, setSearching] = useState(false);
  const [mutating, setMutating] = useState(false);

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from('top_stories')
      .select('position, articles(id, title, published_at, categories!fk_articles_category_id(name))')
      .order('position');

    const pinned = (data || []) as Array<{ position: number; articles: PinnedArticle | null }>;
    setSlots(
      POSITIONS.map((p) => ({
        position: p,
        article: pinned.find((r) => r.position === p)?.articles ?? null,
      }))
    );
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roleNames = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name?.toLowerCase())
        .filter((n): n is string => typeof n === 'string');
      if (!roleNames.some((r) => ADMIN_ROLES.has(r))) { router.push('/'); return; }

      setUserId(user.id);
      await fetchSlots();
      setLoading(false);
    })();
  }, [router, supabase, fetchSlots]);

  // Debounced article search
  useEffect(() => {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('articles')
        .select('id, title, published_at, categories!fk_articles_category_id(name)')
        .eq('status', 'published')
        .ilike('title', `%${query}%`)
        .order('published_at', { ascending: false })
        .limit(20);
      setSearchResults((data || []) as PinnedArticle[]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, supabase]);

  const pinArticle = async (position: number, article: PinnedArticle) => {
    if (!userId || mutating) return;
    setMutating(true);
    const { error } = await supabase
      .from('top_stories')
      .upsert({ position, article_id: article.id, pinned_by: userId }, { onConflict: 'position' });
    if (error) {
      push({ message: `Failed to pin: ${error.message}`, variant: 'danger' });
    } else {
      push({ message: `Position ${position} pinned.` });
      setSearchOpen(null);
      setQuery('');
      setSearchResults([]);
      await fetchSlots();
    }
    setMutating(false);
  };

  const removeSlot = async (position: number) => {
    if (mutating) return;
    setMutating(true);
    const { error } = await supabase.from('top_stories').delete().eq('position', position);
    if (error) {
      push({ message: `Failed to remove: ${error.message}`, variant: 'danger' });
    } else {
      push({ message: `Position ${position} cleared.` });
      await fetchSlots();
    }
    setMutating(false);
  };

  const toggleSearch = (position: number) => {
    setSearchOpen(searchOpen === position ? null : position);
    setQuery('');
    setSearchResults([]);
  };

  if (loading) {
    return (
      <Page maxWidth={720}>
        <div style={{ padding: S[8], color: C.dim, display: 'flex', alignItems: 'center', gap: S[2] }}>
          <Spinner /> <span>Loading…</span>
        </div>
      </Page>
    );
  }

  return (
    <Page maxWidth={720}>
      <PageHeader
        title="Top Stories"
        subtitle="Pin up to 5 articles to the front page in order. Empty slots fall back to today's most recent articles."
      />

      <PageSection title="Pinboard" description="Position 1 is the hero; positions 2–5 are supporting cards.">
        {slots.map((slot) => (
          <div
            key={slot.position}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: S[4],
              padding: `${S[4]}px 0`,
              borderBottom: `1px solid ${C.divider}`,
            }}
          >
            {/* Position number */}
            <div
              style={{
                width: 28,
                fontSize: F.lg,
                fontWeight: 700,
                color: C.muted,
                flexShrink: 0,
                paddingTop: 2,
                textAlign: 'center',
              }}
            >
              {slot.position}
            </div>

            {/* Article info + inline search */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {slot.article ? (
                <div>
                  <div style={{ fontSize: F.base, fontWeight: 600, color: C.white, lineHeight: 1.3 }}>
                    {slot.article.title}
                  </div>
                  <div style={{ fontSize: F.sm, color: C.dim, marginTop: S[1] }}>
                    {slot.article.categories?.name
                      ? `${slot.article.categories.name} · `
                      : ''}
                    {formatDate(slot.article.published_at)}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: F.base, color: C.muted, fontStyle: 'italic' }}>
                  Empty slot
                </div>
              )}

              {searchOpen === slot.position && (
                <div style={{ marginTop: S[3] }}>
                  <TextInput
                    value={query}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    placeholder="Search published articles…"
                    autoFocus
                  />
                  {searching && (
                    <div style={{ padding: `${S[2]}px 0`, color: C.dim, fontSize: F.sm, display: 'flex', alignItems: 'center', gap: S[2] }}>
                      <Spinner /> Searching…
                    </div>
                  )}
                  {!searching && searchResults.length === 0 && query.length >= 2 && (
                    <div style={{ padding: `${S[2]}px 0`, color: C.muted, fontSize: F.sm }}>
                      No results.
                    </div>
                  )}
                  {searchResults.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => pinArticle(slot.position, r)}
                      style={{
                        padding: `${S[2]}px ${S[3]}px`,
                        marginTop: S[1],
                        cursor: 'pointer',
                        borderRadius: 4,
                        border: `1px solid ${C.divider}`,
                        background: C.bg,
                        transition: 'background 100ms',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = C.bg; }}
                    >
                      <div style={{ fontSize: F.base, color: C.white, fontWeight: 500 }}>{r.title}</div>
                      <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>
                        {r.categories?.name ? `${r.categories.name} · ` : ''}
                        {formatDate(r.published_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: S[2], flexShrink: 0, paddingTop: 2 }}>
              <Button
                size="sm"
                variant={searchOpen === slot.position ? 'primary' : 'secondary'}
                onClick={() => toggleSearch(slot.position)}
                disabled={mutating}
              >
                {searchOpen === slot.position ? 'Cancel' : 'Change'}
              </Button>
              {slot.article && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => removeSlot(slot.position)}
                  disabled={mutating}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}
      </PageSection>
    </Page>
  );
}

export default function TopStoriesPage() {
  return <TopStoriesInner />;
}
