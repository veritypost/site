// Stream B — /directory landing (RSC).
// Renders pane 1 (top-level categories) with empty panes 2/3.
// On <900px viewports the shell defaults to level 1 because there is
// no category in the URL, matching browser-back semantics.

import { createServiceClient } from '@/lib/supabase/server';
import type { DirectoryCategory } from '@/lib/directory/types';
import DirectoryShell from '@/components/directory/DirectoryShell';
import CategoryPane from '@/components/directory/CategoryPane';

async function fetchTopLevel(): Promise<DirectoryCategory[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name, parent_id, sort_order, article_count, description')
    .is('deleted_at', null)
    .eq('is_kids_safe', false)
    .is('parent_id', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  return (data || []) as DirectoryCategory[];
}

function EmptyPane({ label, hint }: { label: string; hint: string }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg, #fcfcfc)',
        borderRight: '1px solid var(--border, #dcdcdc)',
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--ink-3, #777)',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          borderBottom: '1px solid var(--border, #dcdcdc)',
        }}
      >
        {label}
      </header>
      <div
        style={{
          padding: 32,
          fontFamily: '"Source Serif 4", Georgia, serif',
          fontStyle: 'italic',
          color: 'var(--ink-3, #777)',
        }}
      >
        {hint}
      </div>
    </div>
  );
}

export default async function DirectoryIndexPage() {
  const categories = await fetchTopLevel();
  return (
    <DirectoryShell
      activeCategorySlug={null}
      activeSubcategorySlug={null}
      categoryPane={<CategoryPane categories={categories} activeSlug={null} />}
      subcategoryPane={
        <EmptyPane label="Subcategories" hint="Select a section to view subcategories." />
      }
      articlePane={
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-alt, #f3f3f3)',
          }}
        >
          <header
            style={{
              padding: '16px 24px',
              fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--ink-3, #777)',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              borderBottom: '1px solid var(--border, #dcdcdc)',
              background: 'var(--bg-alt, #f3f3f3)',
            }}
          >
            Briefing records
          </header>
          <div
            style={{
              padding: 32,
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontStyle: 'italic',
              color: 'var(--ink-3, #777)',
            }}
          >
            Select a section to view records.
          </div>
        </div>
      }
    />
  );
}
