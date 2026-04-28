'use client';

/**
 * Pipeline Config — consolidates the legacy /admin/pipeline/settings,
 * /admin/prompt-presets, and /admin/categories surfaces (Decision 13).
 *
 * Four tabs (?tab=...):
 *   kill-switches  kill switches + cost caps
 *   thresholds     plagiarism / cluster / story-match thresholds
 *   prompts        prompt presets CRUD
 *   categories     taxonomy editor
 *
 * Tabs swap one client-component view in place; querystring is the
 * source of truth so deep links work. The legacy top-level pages live
 * on as flag-gated redirects to this page so existing bookmarks resolve.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import Page, { PageHeader } from '@/components/admin/Page';
import Spinner from '@/components/admin/Spinner';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

import KillSwitchesTab from './_tabs/KillSwitchesTab';
import ThresholdsTab from './_tabs/ThresholdsTab';
import PromptsTab from './_tabs/PromptsTab';
import CategoriesTab from './_tabs/CategoriesTab';

import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

type TabId = 'kill-switches' | 'thresholds' | 'prompts' | 'categories';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'kill-switches', label: 'Kill switches' },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'categories', label: 'Categories' },
];

function parseTab(raw: string | null): TabId {
  if (raw === 'thresholds' || raw === 'prompts' || raw === 'categories') return raw;
  return 'kill-switches';
}

export default function PipelineConfigPage() {
  return (
    <Suspense fallback={<Page maxWidth={1200}><div style={{ padding: S[6] }}><Spinner /></div></Page>}>
      <PipelineConfigInner />
    </Suspense>
  );
}

function PipelineConfigInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = parseTab(sp.get('tab'));

  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?next=/admin/pipeline-config');
        return;
      }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roles = (userRoles || [])
        .map((r: { roles: { name: string } | { name: string }[] | null }) => {
          const rel = r.roles;
          if (Array.isArray(rel)) return rel[0]?.name;
          return rel?.name;
        })
        .filter(Boolean) as string[];
      if (cancelled) return;
      if (roles.some((r) => ADMIN_ROLES.has(r))) setAuthorized(true);
      else router.push('/');
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (!authChecked) {
    return (
      <Page maxWidth={1200}>
        <div style={{ padding: S[6] }}><Spinner /></div>
      </Page>
    );
  }
  if (!authorized) return null;

  return (
    <Page maxWidth={1200}>
      <PageHeader title="Pipeline Config" subtitle="Kill switches, thresholds, prompts, categories" />

      <div
        style={{
          display: 'flex',
          gap: S[1],
          borderBottom: `1px solid ${C.divider}`,
          marginBottom: S[4],
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                const params = new URLSearchParams(sp.toString());
                params.set('tab', t.id);
                router.replace(`?${params.toString()}`, { scroll: false });
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? C.accent : 'transparent'}`,
                padding: `${S[2]}px ${S[3]}px`,
                cursor: 'pointer',
                color: active ? C.white : C.dim,
                fontSize: F.md,
                fontWeight: active ? 600 : 500,
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'kill-switches' && <KillSwitchesTab />}
      {tab === 'thresholds' && <ThresholdsTab />}
      {tab === 'prompts' && <PromptsTab />}
      {tab === 'categories' && <CategoriesTab />}
    </Page>
  );
}
