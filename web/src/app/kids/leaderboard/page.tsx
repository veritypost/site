// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KID } from '@/lib/kidTheme';
import EmptyState from '@/components/kids/EmptyState';
import AskAGrownUp from '@/components/kids/AskAGrownUp';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';

const ACTIVE_KID_KEY = 'vp_active_kid_id';

type FamilyMember = { id?: string; display?: string; kind?: 'kid' | 'adult'; score?: number };
type GlobalRow = { id?: string; display_name?: string; score?: number };
type Scope = 'family' | 'global';

export default function KidsLeaderboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [globalRows, setGlobalRows] = useState<GlobalRow[]>([]);
  const [globalOptIn, setGlobalOptIn] = useState<boolean | null>(null);
  const [scope, setScope] = useState<Scope>('family');
  const [activeKidId, setActiveKidId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>('');
  const [canFamily, setCanFamily] = useState<boolean>(true);
  const [canGlobal, setCanGlobal] = useState<boolean>(true);

  useEffect(() => {
    const id = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_KID_KEY) : null;
    if (!id) {
      router.replace('/kids');
      return;
    }
    setActiveKidId(id);

    let cancelled = false;
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      const family = hasPermission('kids.leaderboard.family');
      const global = hasPermission('kids.leaderboard.global.view');
      if (cancelled) return;
      setCanFamily(family);
      setCanGlobal(global);
      if (!family && !global) {
        setLoading(false);
        return;
      }
      try {
        const [familyRes, globalRes] = await Promise.all([
          family ? fetch('/api/family/leaderboard') : Promise.resolve(null),
          global ? fetch(`/api/kids/global-leaderboard?kid_profile_id=${encodeURIComponent(id)}`) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const familyBody = familyRes ? await familyRes.json().catch(() => ({})) : {};
        const globalBody = globalRes ? await globalRes.json().catch(() => ({})) : {};
        if (familyRes && familyRes.ok) {
          setMembers(Array.isArray(familyBody?.members) ? familyBody.members : []);
        }
        if (globalRes && globalRes.ok) {
          setGlobalRows(Array.isArray(globalBody?.rows) ? globalBody.rows : []);
          setGlobalOptIn(typeof globalBody?.self_opt_in === 'boolean' ? globalBody.self_opt_in : null);
        }
        if (familyRes && !familyRes.ok && globalRes && !globalRes.ok) {
          setErrorText(familyBody?.error || globalBody?.error || `Error ${familyRes.status}`);
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setErrorText('Could not load the leaderboard.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: 'calc(100dvh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: KID.font.sub, color: KID.dim }}>One sec…</div>
      </div>
    );
  }

  if (!canFamily && !canGlobal) {
    return (
      <div style={{ padding: '48px 16px' }}>
        <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto' }}>
          <AskAGrownUp
            reason="locked"
            body="Leaderboards aren\u2019t turned on for this profile."
            action={{ href: '/kids', label: 'Back home' }}
          />
        </div>
      </div>
    );
  }

  const effectiveScope: Scope = scope === 'global' && !canGlobal ? 'family' : scope === 'family' && !canFamily ? 'global' : scope;
  const globalSelfOptedOut = effectiveScope === 'global' && globalOptIn === false;

  const empty = effectiveScope === 'family'
    ? { rows: members, icon: 'star' as const, title: 'No family members yet', body: 'Other household members show up here once they join.' }
    : { rows: globalRows, icon: 'star' as const, title: 'No kid readers yet', body: 'Come back soon — this board lights up as kids read.' };

  const availableScopes: Scope[] = [];
  if (canFamily) availableScopes.push('family');
  if (canGlobal) availableScopes.push('global');

  return (
    <div>
      <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto', padding: `${KID.space.cardPad}px 16px 40px` }}>
        <h1 style={{
          fontSize: KID.font.h1, fontWeight: KID.weight.extra,
          color: KID.text, margin: '0 0 6px',
          letterSpacing: KID.tracking.tight, lineHeight: KID.leading.heading,
        }}>
          Leaderboard
        </h1>
        <p style={{
          fontSize: KID.font.sub, color: KID.dim,
          margin: '0 0 16px', lineHeight: KID.leading.relaxed,
        }}>
          {effectiveScope === 'family' ? 'Who in your family has been reading the most?' : 'Top readers across Verity Post kids.'}
        </p>

        {availableScopes.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: KID.space.sectionGap, flexWrap: 'wrap' }}>
            {availableScopes.map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                style={{
                  minHeight: KID.space.hitMin - 8,
                  padding: '10px 18px', borderRadius: KID.radius.chip,
                  border: `1.5px solid ${effectiveScope === s ? KID.accent : KID.border}`,
                  background: effectiveScope === s ? KID.accent : KID.card,
                  color: effectiveScope === s ? KID.onAccent : KID.text,
                  fontSize: KID.font.sub, fontWeight: KID.weight.bold,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {s === 'family' ? 'Family' : 'Global kids'}
              </button>
            ))}
          </div>
        )}

        {errorText && (
          <div style={{
            background: KID.dangerSoft, border: `1px solid ${KID.danger}`,
            borderRadius: KID.radius.card, padding: 14,
            fontSize: KID.font.sub, color: KID.danger, marginBottom: KID.space.sectionGap,
          }}>
            {errorText}
          </div>
        )}

        {!errorText && globalSelfOptedOut && (
          <AskAGrownUp
            reason="locked"
            title="Your global leaderboard is off"
            body="A grown-up can turn it on in your profile so you can see how you rank with kids across Verity Post."
            icon="lock"
          />
        )}

        {!errorText && !globalSelfOptedOut && empty.rows.length === 0 && (
          <EmptyState icon={empty.icon} tone="gold" title={empty.title} body={empty.body} />
        )}

        {!errorText && effectiveScope === 'family' && members.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
            {members.map((m, i) => {
              const name = m.display || 'Unknown';
              const initial = name.slice(0, 1).toUpperCase();
              const isKid = m.kind === 'kid';
              return (
                <LeaderRow
                  key={m.id || i}
                  rank={i + 1}
                  name={name}
                  initial={initial}
                  score={m.score ?? 0}
                  label={isKid ? 'Kid' : 'Adult'}
                  accent={isKid ? KID.streak : KID.accent}
                />
              );
            })}
          </div>
        )}

        {!errorText && effectiveScope === 'global' && globalRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
            {globalRows.map((r, i) => {
              const name = r.display_name || 'Unknown';
              const initial = name.slice(0, 1).toUpperCase();
              const isSelf = r.id === activeKidId;
              return (
                <LeaderRow
                  key={r.id || i}
                  rank={i + 1}
                  name={isSelf ? `${name} (you)` : name}
                  initial={initial}
                  score={r.score ?? 0}
                  label="Kid"
                  accent={isSelf ? KID.accent : KID.streak}
                  highlight={isSelf}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LeaderRow({ rank, name, initial, score, label, accent, highlight }: {
  rank: number;
  name: string;
  initial: string;
  score: number;
  label: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: KID.card,
      border: `2px solid ${highlight ? KID.accent : KID.border}`,
      borderRadius: KID.radius.card,
      padding: '14px 16px',
      minHeight: KID.space.hitMin,
    }}>
      <div style={{
        width: 44, minWidth: 44, height: 44, borderRadius: 22,
        background: KID.cardAlt, color: KID.text,
        fontSize: KID.font.h3, fontWeight: KID.weight.extra,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {rank}
      </div>
      <div style={{
        width: 52, height: 52, borderRadius: 26,
        background: accent, color: accent === KID.streak || accent === KID.achievement ? KID.onWarm : KID.onAccent,
        fontSize: 24, fontWeight: KID.weight.extra,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: KID.font.h3, fontWeight: KID.weight.bold,
          color: KID.text, lineHeight: KID.leading.heading,
        }}>{name}</div>
        <div style={{
          fontSize: KID.font.label, color: KID.dim,
          textTransform: 'uppercase', letterSpacing: KID.tracking.loose,
          fontWeight: KID.weight.bold,
        }}>{label}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: KID.font.h2, fontWeight: KID.weight.extra,
          color: KID.text, lineHeight: 1.1,
        }}>{score}</div>
        <div style={{
          fontSize: KID.font.label, color: KID.dim,
          textTransform: 'uppercase', letterSpacing: KID.tracking.loose,
          fontWeight: KID.weight.bold,
        }}>Score</div>
      </div>
    </div>
  );
}
