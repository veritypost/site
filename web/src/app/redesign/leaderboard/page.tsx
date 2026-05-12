// Static fixture — leaderboard list of users where each row expands to show
// that user's per-category breakdown, and each category within that breakdown
// expands again to show their per-subcategory scores.
//
// Two levels of nested expand under each person. Click chevron on the
// person row → reveal their categories. Click `+` next to a category →
// reveal that user's subs in that category.
//
// All data hardcoded. No supabase, no auth. Open at:
//   http://localhost:3333/redesign/leaderboard

'use client';

import { useState } from 'react';

const SERIF = "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const SANS =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, " +
  "'Helvetica Neue', Arial, sans-serif";

const C = {
  bg: '#ffffff',
  surface: '#fafafa',
  ink: '#0a0a0a',
  inkSoft: '#27272a',
  inkMuted: '#52525b',
  inkDim: '#71717a',
  inkFaint: '#a1a1aa',
  border: '#e5e5e5',
  borderDashed: '#e0e0e0',
  divider: '#f1f1f3',
  accent: '#0b5cff',
  accentSoft: '#e6efff',
  podiumGold: '#b8860b',
  podiumSilver: '#737373',
  podiumBronze: '#a16207',
};

type Period = 'today' | 'this_week' | 'this_month' | 'all_time';
type TagKind = 'i_agree' | 'helpful';

const TAG_META: Record<TagKind, { label: string; color: string }> = {
  i_agree: { label: 'I agree', color: '#1d4ed8' },
  helpful: { label: 'Helpful', color: '#15803d' },
};

const TAG_ORDER: TagKind[] = ['i_agree', 'helpful'];

interface Sub {
  id: string;
  name: string;
  score: number;
  reads: number;
}

interface Cat {
  id: string;
  name: string;
  score: number;
  reads: number;
  subs: Sub[];
}

interface User {
  id: string;
  rank: number;
  username: string;
  display: string;
  initials: string;
  avatar: { outer: string; inner: string; text: string };
  totalScore: number;
  totalReads: number;
  isYou?: boolean;
  cats: Cat[];
}

const CATALOG: Cat[] = [
  {
    id: 'pol',
    name: 'Politics',
    score: 0,
    reads: 0,
    subs: [
      { id: 'pol-elec', name: 'Election policy', score: 0, reads: 0 },
      { id: 'pol-for', name: 'Foreign policy', score: 0, reads: 0 },
      { id: 'pol-loc', name: 'Local politics', score: 0, reads: 0 },
      { id: 'pol-jud', name: 'Judiciary', score: 0, reads: 0 },
    ],
  },
  {
    id: 'hea',
    name: 'Public health',
    score: 0,
    reads: 0,
    subs: [
      { id: 'hea-pan', name: 'Pandemic response', score: 0, reads: 0 },
      { id: 'hea-vax', name: 'Vaccines', score: 0, reads: 0 },
      { id: 'hea-men', name: 'Mental health', score: 0, reads: 0 },
    ],
  },
  {
    id: 'tec',
    name: 'Technology',
    score: 0,
    reads: 0,
    subs: [
      { id: 'tec-ai', name: 'AI & ML', score: 0, reads: 0 },
      { id: 'tec-pri', name: 'Privacy', score: 0, reads: 0 },
      { id: 'tec-soc', name: 'Social platforms', score: 0, reads: 0 },
    ],
  },
  {
    id: 'cli',
    name: 'Climate',
    score: 0,
    reads: 0,
    subs: [
      { id: 'cli-ene', name: 'Energy transition', score: 0, reads: 0 },
      { id: 'cli-pol', name: 'Climate policy', score: 0, reads: 0 },
    ],
  },
  {
    id: 'eco',
    name: 'Economics',
    score: 0,
    reads: 0,
    subs: [
      { id: 'eco-mac', name: 'Macroeconomics', score: 0, reads: 0 },
      { id: 'eco-mar', name: 'Markets', score: 0, reads: 0 },
    ],
  },
];

// Build per-user breakdowns by sprinkling random-looking but stable scores.
function userCats(seed: number): Cat[] {
  return CATALOG.map((cat, i) => {
    const subs = cat.subs.map((sub, j) => {
      const score = Math.max(20, Math.round(180 + Math.sin(seed * (i + 1) + j * 1.7) * 140));
      const reads = Math.max(2, Math.round(score / 14));
      return { ...sub, score, reads };
    });
    const score = subs.reduce((s, x) => s + x.score, 0);
    const reads = subs.reduce((s, x) => s + x.reads, 0);
    return { ...cat, score, reads, subs: [...subs].sort((a, b) => b.score - a.score) };
  }).sort((a, b) => b.score - a.score);
}

const USERS: User[] = [
  {
    id: 'u1', rank: 1, username: 'amelia_w', display: 'Amelia W.', initials: 'AW',
    avatar: { outer: '#0b5cff', inner: '#fef9c3', text: '#0b3eaa' },
    totalScore: 4820, totalReads: 312, cats: userCats(1.8),
  },
  {
    id: 'u2', rank: 2, username: 'tomas_r', display: 'Tomas R.', initials: 'TR',
    avatar: { outer: '#7c3aed', inner: '#ede9fe', text: '#4c1d95' },
    totalScore: 4612, totalReads: 298, cats: userCats(2.4),
  },
  {
    id: 'u3', rank: 3, username: 'priya_d', display: 'Priya D.', initials: 'PD',
    avatar: { outer: '#15803d', inner: '#dcfce7', text: '#14532d' },
    totalScore: 4407, totalReads: 281, cats: userCats(3.1),
  },
  {
    id: 'u4', rank: 4, username: 'leon_k', display: 'Leon K.', initials: 'LK',
    avatar: { outer: '#0a66c2', inner: '#e3f0ff', text: '#0a3d6e' },
    totalScore: 3988, totalReads: 264, cats: userCats(3.8),
  },
  {
    id: 'u5', rank: 5, username: 'mia_c', display: 'Mia C.', initials: 'MC',
    avatar: { outer: '#b91c1c', inner: '#fee2e2', text: '#7f1d1d' },
    totalScore: 3756, totalReads: 247, cats: userCats(4.5),
  },
  {
    id: 'u6', rank: 6, username: 'rafael_g', display: 'Rafael G.', initials: 'RG',
    avatar: { outer: '#b45309', inner: '#fef3c7', text: '#78350f' },
    totalScore: 3502, totalReads: 233, isYou: true, cats: userCats(5.2),
  },
  {
    id: 'u7', rank: 7, username: 'noor_h', display: 'Noor H.', initials: 'NH',
    avatar: { outer: '#1d4ed8', inner: '#dbeafe', text: '#1e3a8a' },
    totalScore: 3284, totalReads: 219, cats: userCats(5.9),
  },
  {
    id: 'u8', rank: 8, username: 'jada_p', display: 'Jada P.', initials: 'JP',
    avatar: { outer: '#0a0a0a', inner: '#e4e4e7', text: '#0a0a0a' },
    totalScore: 3055, totalReads: 204, cats: userCats(6.6),
  },
];

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  this_week: 'This week',
  this_month: 'This month',
  all_time: 'All time',
};

export default function LeaderboardPersonExpandFixture() {
  const [period, setPeriod] = useState<Period>('this_week');
  const [openUsers, setOpenUsers] = useState<Set<string>>(new Set(['u1']));
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(['u1:pol']));
  const [activeTags, setActiveTags] = useState<Set<TagKind>>(new Set());
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  function toggleTag(k: TagKind) {
    const next = new Set(activeTags);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setActiveTags(next);
  }

  function toggleUser(id: string) {
    const next = new Set(openUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenUsers(next);
  }

  function toggleCat(userId: string, catId: string) {
    const key = `${userId}:${catId}`;
    const next = new Set(openCats);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenCats(next);
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: SANS, color: C.ink }}>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
        {/* Eyebrow */}
        <div
          style={{
            fontSize: 11,
            color: C.inkDim,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          Static fixture · /redesign/leaderboard · per-person expand
        </div>

        {/* Hero */}
        <header style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: 0,
              marginBottom: 6,
            }}
          >
            Most Informed
          </h1>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.55 }}>
            Click anyone&rsquo;s row to expand their per-category breakdown. Click{' '}
            <code style={{ fontFamily: 'ui-monospace, monospace' }}>+</code> next to a category to drill into
            their subcategories.
          </p>
        </header>

        {/* Period tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: `1px solid ${C.divider}`,
          }}
        >
          {(['today', 'this_week', 'this_month', 'all_time'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                background: period === p ? 'rgba(0,0,0,0.06)' : 'transparent',
                color: period === p ? C.ink : C.inkMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SANS,
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Tag filter row — same pattern as CommentRow.tsx tag picker.
            Active tag chips render solid in the tag color; the dashed `+`
            reveals the inactive tag chips inline. */}
        <div
          style={{
            display: 'flex',
            gap: 5,
            flexWrap: 'wrap',
            alignItems: 'center',
            paddingBottom: 16,
            marginBottom: 4,
          }}
        >
          <span style={{
            fontSize: 11, color: C.inkDim, marginRight: 6,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Tagged
          </span>
          {(() => {
            const active = TAG_ORDER.filter((k) => activeTags.has(k));
            const inactive = TAG_ORDER.filter((k) => !activeTags.has(k));
            return (
              <>
                {active.map((k) => {
                  const meta = TAG_META[k];
                  return (
                    <button
                      key={k}
                      onClick={() => toggleTag(k)}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 5,
                        border: `1px solid ${meta.color}`,
                        background: `${meta.color}18`,
                        color: meta.color,
                        cursor: 'pointer',
                        lineHeight: 1.6,
                        fontFamily: SANS,
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
                {inactive.length > 0 && (
                  <button
                    onClick={() => setTagPickerOpen((v) => !v)}
                    style={toggleStyle()}
                    aria-expanded={tagPickerOpen}
                    aria-label={tagPickerOpen ? 'Hide tag filters' : 'Show tag filters'}
                  >
                    {tagPickerOpen ? '−' : '+'}
                  </button>
                )}
                {tagPickerOpen && inactive.map((k) => {
                  const meta = TAG_META[k];
                  return (
                    <button
                      key={k}
                      onClick={() => { toggleTag(k); setTagPickerOpen(false); }}
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: 5,
                        border: `1px dashed ${C.borderDashed}`,
                        background: 'transparent',
                        color: C.inkDim,
                        cursor: 'pointer',
                        lineHeight: 1.6,
                        fontFamily: SANS,
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
                {active.length > 0 && (
                  <button
                    onClick={() => setActiveTags(new Set())}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 5,
                      border: 'none',
                      background: 'transparent',
                      color: C.inkFaint,
                      cursor: 'pointer',
                      lineHeight: 1.6,
                      fontFamily: SANS,
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                    }}
                  >
                    clear
                  </button>
                )}
              </>
            );
          })()}
        </div>

        {/* User list — each row expandable to per-category breakdown */}
        <div
          style={{
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {USERS.map((u, i) => {
            const userOpen = openUsers.has(u.id);
            const isLast = i === USERS.length - 1;
            return (
              <div
                key={u.id}
                style={{ borderBottom: isLast && !userOpen ? 'none' : `1px solid ${C.divider}` }}
              >
                {/* Person row */}
                <button
                  onClick={() => toggleUser(u.id)}
                  aria-expanded={userOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    background: u.isYou ? 'rgba(11,92,255,0.04)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: SANS,
                    textAlign: 'left',
                  }}
                >
                  {/* Rank */}
                  <span
                    style={{
                      width: 22,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: SERIF,
                      color:
                        u.rank === 1 ? C.podiumGold :
                        u.rank === 2 ? C.podiumSilver :
                        u.rank === 3 ? C.podiumBronze :
                        C.inkMuted,
                      textAlign: 'right',
                    }}
                  >
                    {u.rank}
                  </span>
                  {/* Avatar */}
                  <span
                    aria-hidden
                    style={{
                      width: 36, height: 36, borderRadius: 999,
                      background: u.avatar.outer,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 999,
                      background: u.avatar.inner,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: u.avatar.text, fontSize: 11, fontWeight: 700,
                    }}>{u.initials}</span>
                  </span>
                  {/* Name + handle */}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block',
                      fontSize: 14, fontWeight: 600, color: C.ink,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {u.display}{' '}
                      {u.isYou && (
                        <span style={{ color: C.accent, fontWeight: 500, fontSize: 11 }}>· you</span>
                      )}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: C.inkDim, marginTop: 2 }}>
                      @{u.username} · {u.totalReads} reads
                    </span>
                  </span>
                  {/* Score */}
                  <span style={{
                    fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: C.ink,
                    minWidth: 64, textAlign: 'right',
                  }}>
                    {u.totalScore.toLocaleString()}
                  </span>
                  {/* Chevron */}
                  <span
                    aria-hidden
                    style={{
                      width: 14, marginLeft: 4,
                      color: C.inkFaint,
                      fontSize: 11,
                      transform: userOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 140ms ease',
                    }}
                  >▶</span>
                </button>

                {/* Per-user category breakdown */}
                {userOpen && (
                  <div style={{ background: C.surface, borderTop: `1px solid ${C.divider}`, padding: '8px 0' }}>
                    {u.cats.map((cat) => {
                      const catKey = `${u.id}:${cat.id}`;
                      const catOpen = openCats.has(catKey);
                      return (
                        <div key={catKey}>
                          {/* Category row inside the user panel */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '8px 18px 8px 60px',
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                fontSize: 13,
                                fontWeight: 500,
                                color: C.inkSoft,
                                fontFamily: SANS,
                              }}
                            >
                              {cat.name}
                            </span>
                            <span style={{ fontSize: 11, color: C.inkDim, whiteSpace: 'nowrap' }}>
                              {cat.reads} reads
                            </span>
                            <span style={{
                              fontFamily: SERIF, fontSize: 13, fontWeight: 600,
                              color: C.inkSoft, minWidth: 56, textAlign: 'right',
                            }}>
                              {cat.score.toLocaleString()}
                            </span>
                            {cat.subs.length > 0 && (
                              <button
                                onClick={() => toggleCat(u.id, cat.id)}
                                aria-expanded={catOpen}
                                aria-label={`${catOpen ? 'Collapse' : 'Expand'} ${u.display} ${cat.name} subcategories`}
                                style={toggleStyle()}
                              >
                                {catOpen ? '−' : '+'}
                              </button>
                            )}
                          </div>

                          {/* Sub rows for this user × this category */}
                          {catOpen && (
                            <div style={{ paddingBottom: 6 }}>
                              {cat.subs.map((sub) => (
                                <div
                                  key={`${catKey}:${sub.id}`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '5px 18px 5px 90px',
                                  }}
                                >
                                  <span style={{
                                    flex: 1, fontSize: 12, color: C.inkMuted, fontFamily: SANS,
                                  }}>
                                    {sub.name}
                                  </span>
                                  <span style={{ fontSize: 11, color: C.inkDim, whiteSpace: 'nowrap' }}>
                                    {sub.reads} reads
                                  </span>
                                  <span style={{
                                    fontFamily: SERIF, fontSize: 12, fontWeight: 600,
                                    color: C.inkMuted, minWidth: 56, textAlign: 'right',
                                  }}>
                                    {sub.score.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div
          style={{
            fontSize: 11,
            color: C.inkDim,
            marginTop: 24,
            lineHeight: 1.6,
          }}
        >
          Click a person&rsquo;s row to expand their categories. Click{' '}
          <code style={{ fontFamily: 'ui-monospace, monospace' }}>+</code> on a category row to drill
          into that user&rsquo;s subcategory scores. Multiple users and multiple categories
          can be expanded simultaneously (Set semantics, like the comment-tag picker).
        </div>
      </main>
    </div>
  );
}

function toggleStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 5,
    border: `1px dashed ${C.borderDashed}`,
    background: 'transparent',
    color: C.inkFaint,
    cursor: 'pointer',
    lineHeight: 1.6,
    fontFamily: SANS,
    minWidth: 22,
  };
}
