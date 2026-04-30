'use client';
import React, { useState, useMemo, useRef, useCallback } from 'react';

const SERIF = "var(--font-serif, 'Source Serif 4', Georgia, serif)";
const SANS  = "var(--font-sans, Inter, system-ui, sans-serif)";

const C = {
  bg:           '#ffffff',
  surface:      '#f7f7f7',
  text:         '#111111',
  soft:         '#444444',
  dim:          '#5a5a5a',
  muted:        '#999999',
  border:       '#e5e5e5',
  breaking:     '#ef4444',
  breakingBg:   'rgba(239,68,68,0.04)',
  developing:   '#f59e0b',
  developingBg: 'rgba(245,158,11,0.025)',
  resolved:     '#9ca3af',
} as const;

type Lifecycle    = 'breaking' | 'developing' | 'resolved';
type DisplayGroup = 'today' | 'yesterday' | 'this_week' | 'april_2026' | 'earlier';
type SortKey      = 'recent' | 'coverage' | 'duration';
type CoverageKey  = 'any' | 'light' | 'medium' | 'heavy';
type QuizKey      = 'all' | 'quizzed' | 'unquizzed';

interface Article { date: string; headline: string }
interface Story {
  id: string; slug: string; lifecycle: Lifecycle;
  title: string; category: string;
  articles: Article[]; sources: string[];
  displayGroup: DisplayGroup;
  followedByDefault?: boolean;
}

interface FilterState {
  lifecycle: Lifecycle[];
  dateFrom: string; dateTo: string;
  source: string;
  coverage: CoverageKey;
  quiz: QuizKey;
  sort: SortKey;
}

const DEFAULT_FILTERS: FilterState = {
  lifecycle: [], dateFrom: '', dateTo: '',
  source: '', coverage: 'any', quiz: 'all', sort: 'recent',
};

function lcColor(lc: Lifecycle) {
  if (lc === 'breaking')  return C.breaking;
  if (lc === 'developing') return C.developing;
  return C.resolved;
}
function latestMs(s: Story)   { return Math.max(...s.articles.map(a => +new Date(a.date))); }
function earliestMs(s: Story) { return Math.min(...s.articles.map(a => +new Date(a.date))); }
function durationDays(s: Story) { return Math.round((latestMs(s) - earliestMs(s)) / 86_400_000); }
function latestHeadline(s: Story) { return s.articles[s.articles.length - 1].headline; }
function relTime(ms: number) {
  const h = Math.floor((Date.now() - ms) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7
    ? `${d}d ago`
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms));
}
function fmtDate(s: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(s));
}

const STORIES: Story[] = [
  {
    id: '1', slug: 'ukraine-spring-offensive-2026', lifecycle: 'breaking',
    title: 'Ukraine Launches Renewed Offensive Along Eastern Front',
    category: 'World', sources: ['AP', 'Reuters', 'BBC', 'NYT'],
    displayGroup: 'today', followedByDefault: true,
    articles: [
      { date: '2026-04-27', headline: 'Ukrainian troops breach Bakhmut outer defensive line in overnight push' },
      { date: '2026-04-27', headline: 'Russia calls UN emergency session as front lines shift dramatically' },
      { date: '2026-04-28', headline: 'US intelligence assesses Ukrainian gains as significant but fragile' },
      { date: '2026-04-28', headline: 'Satellite imagery confirms troop buildup east of Kharkiv' },
      { date: '2026-04-29', headline: 'Frontline commanders report momentum shifting after 48-hour push' },
      { date: '2026-04-29', headline: "Pentagon: counteroffensive \"exceeds initial projections\"" },
      { date: '2026-04-29', headline: 'Ukraine offensive enters day 3 with no sign of slowing' },
    ],
  },
  {
    id: '2', slug: 'nvidia-antitrust-doj', lifecycle: 'breaking',
    title: "DOJ Opens Antitrust Investigation Into Nvidia's AI Chip Dominance",
    category: 'Technology', sources: ['Bloomberg', 'Reuters', 'WSJ'],
    displayGroup: 'today',
    articles: [
      { date: '2026-04-29', headline: 'DOJ formally opens antitrust probe into Nvidia GPU market practices' },
      { date: '2026-04-29', headline: 'Nvidia shares fall 8% on antitrust investigation news' },
      { date: '2026-04-29', headline: 'AMD and Intel stocks surge as investors eye competitive rebalancing' },
      { date: '2026-04-29', headline: "Nvidia: \"We compete fairly in a rapidly evolving market\"" },
    ],
  },
  {
    id: '11', slug: 'apple-wwdc-2026', lifecycle: 'breaking',
    title: 'Apple Announces iOS 20 with On-Device AI and Real-Time Translation',
    category: 'Technology', sources: ['The Verge', 'Bloomberg', 'Wired'],
    displayGroup: 'today',
    articles: [
      { date: '2026-04-29', headline: 'Apple WWDC 2026 opens with Cook calling iOS 20 "the biggest iOS update ever"' },
      { date: '2026-04-29', headline: 'iOS 20 features on-device LLM running entirely without cloud connectivity' },
      { date: '2026-04-29', headline: 'New Neural Engine chip provides 40-TOPS on-device processing' },
      { date: '2026-04-29', headline: 'iOS 20 developer beta available today; public beta arrives June 15' },
    ],
  },
  {
    id: '3', slug: 'fed-rate-decision-may-2026', lifecycle: 'developing',
    title: 'Federal Reserve Signals Pause on Rate Cuts Amid Sticky Inflation',
    category: 'Business', sources: ['WSJ', 'Bloomberg', 'FT', 'Reuters'],
    displayGroup: 'today', followedByDefault: true,
    articles: [
      { date: '2026-04-11', headline: 'March CPI comes in hotter than expected at 3.4%' },
      { date: '2026-04-15', headline: 'Powell in testimony: "We need more data before easing"' },
      { date: '2026-04-24', headline: 'Goldman revises Fed forecast: first cut now seen in September' },
      { date: '2026-04-25', headline: 'PCE inflation ticks up, sealing fate of May pause' },
      { date: '2026-04-27', headline: 'Fed enters blackout period ahead of May 1 FOMC decision' },
      { date: '2026-04-29', headline: 'Fed decision preview: Markets brace for hawkish hold' },
    ],
  },
  {
    id: '4', slug: 'bird-flu-h5n1-human-cases', lifecycle: 'developing',
    title: 'H5N1 Human Cases Rise Across Three States as CDC Widens Surveillance',
    category: 'Health', sources: ['AP', 'Reuters', 'NYT'],
    displayGroup: 'today', followedByDefault: true,
    articles: [
      { date: '2026-03-13', headline: 'CDC confirms first human H5N1 case in Michigan dairy worker' },
      { date: '2026-04-08', headline: 'First H5N1 case with no known animal contact raises alarm' },
      { date: '2026-04-21', headline: 'CDC surveillance expanded to poultry processing workers nationwide' },
      { date: '2026-04-23', headline: 'Three states now reporting H5N1; total US count reaches 17' },
      { date: '2026-04-29', headline: 'CDC: 6 new H5N1 cases confirmed; widening surveillance catching more' },
      { date: '2026-04-29', headline: 'Congress fast-tracks $4.2B pandemic preparedness package' },
    ],
  },
  {
    id: '5', slug: 'gpt-5-release-competition', lifecycle: 'developing',
    title: 'GPT-5 Reshapes Enterprise AI Spending and Competitive Landscape',
    category: 'Technology', sources: ['Bloomberg', 'The Verge', 'FT'],
    displayGroup: 'yesterday',
    articles: [
      { date: '2026-04-17', headline: 'OpenAI launches GPT-5 with multimodal reasoning and 2M context window' },
      { date: '2026-04-20', headline: 'Enterprise CIOs scramble to evaluate GPT-5 ROI' },
      { date: '2026-04-27', headline: 'OpenAI developer conference reveals GPT-5 API roadmap' },
      { date: '2026-04-28', headline: 'Six weeks in: GPT-5 has reshuffled enterprise AI vendor rankings entirely' },
    ],
  },
  {
    id: '12', slug: 'la-teachers-strike-2026', lifecycle: 'developing',
    title: 'Los Angeles Teachers Strike Enters Sixth Day as Talks Stall',
    category: 'Education', sources: ['LAT', 'AP', 'Reuters'],
    displayGroup: 'yesterday',
    articles: [
      { date: '2026-04-23', headline: 'LAUSD teachers walk out over pay and AI-assisted grading dispute' },
      { date: '2026-04-25', headline: 'Governor offers $180M state bridge grant to fund compromise salary increase' },
      { date: '2026-04-28', headline: "Union votes to continue strike; members reject district's \"last, best offer\"" },
    ],
  },
  {
    id: '6', slug: 'california-water-compact', lifecycle: 'developing',
    title: 'Western States Near Landmark Colorado River Water-Sharing Agreement',
    category: 'Environment', sources: ['AP', 'LAT', 'Denver Post'],
    displayGroup: 'this_week',
    articles: [
      { date: '2026-04-01', headline: 'Seven-state Colorado River talks resume in Las Vegas' },
      { date: '2026-04-14', headline: 'Nevada signs preliminary framework; holdouts remain Arizona and California' },
      { date: '2026-04-23', headline: 'Breakthrough: California agrees to 15% cut in exchange for relief fund' },
      { date: '2026-04-27', headline: 'Draft compact text circulated; attorneys review before signing' },
    ],
  },
  {
    id: '7', slug: 'supreme-court-affirmative-action-states', lifecycle: 'developing',
    title: 'States Move to Codify Affirmative Action After Supreme Court Ruling',
    category: 'Politics', sources: ['NYT', 'WaPo', 'AP'],
    displayGroup: 'this_week',
    articles: [
      { date: '2026-04-20', headline: 'Supreme Court 6-3 ruling bars race-conscious admissions at public universities' },
      { date: '2026-04-22', headline: 'Civil rights groups announce legal strategy to preserve diversity programs' },
      { date: '2026-04-23', headline: 'Fourteen states introduce emergency legislation within 72 hours' },
      { date: '2026-04-27', headline: 'Illinois becomes first state to pass affirmative action statute since ruling' },
    ],
  },
  {
    id: '10', slug: 'svb-successor-collapse', lifecycle: 'resolved',
    title: 'Regional Banking Stress Returns as Two Mid-Size Lenders Seek FDIC Help',
    category: 'Business', sources: ['WSJ', 'Bloomberg', 'FT'],
    displayGroup: 'this_week',
    articles: [
      { date: '2026-04-15', headline: 'Heartland Commercial Bank halts withdrawals citing liquidity crunch' },
      { date: '2026-04-18', headline: 'FDIC takeover of Heartland finalized; deposits transferred to First National' },
      { date: '2026-04-22', headline: 'FDIC: no systemic risk determination needed; situation contained' },
      { date: '2026-04-26', headline: "Both banks' loan books sold; resolution costs estimated at $1.4B" },
    ],
  },
  {
    id: '9', slug: 'elon-musk-doge-exit', lifecycle: 'resolved',
    title: 'Elon Musk Steps Back from DOGE Role After Budget Standoff',
    category: 'Politics', sources: ['Reuters', 'AP', 'NYT', 'WaPo'],
    displayGroup: 'april_2026',
    articles: [
      { date: '2026-02-26', headline: 'DOGE claims $47B in "identified savings"; critics question methodology' },
      { date: '2026-03-12', headline: 'Trump confirms Musk stepping back; praises "incredible contribution"' },
      { date: '2026-04-05', headline: 'Government watchdog: DOGE saved $8.2B, not $47B as claimed' },
      { date: '2026-04-20', headline: 'Polling: 38% view DOGE as successful; 49% as a failure' },
      { date: '2026-04-22', headline: "DOGE's lasting legacy: which cuts stuck, which were reversed" },
      { date: '2026-04-24', headline: 'Analysis: DOGE spent $2.3B operating to claim $8.2B in savings' },
    ],
  },
  {
    id: '8', slug: 'longevity-drug-trials-2026', lifecycle: 'developing',
    title: 'Rapamycin Trials Show Promise in Extending Healthy Lifespan in Adults',
    category: 'Science', sources: ['Nature', 'STAT News', 'NYT'],
    displayGroup: 'april_2026',
    articles: [
      { date: '2026-04-08', headline: 'Phase II trial shows rapamycin reduces biological age markers by avg. 4.6 years' },
      { date: '2026-04-16', headline: 'Stanford longevity researchers validate trial design and results' },
      { date: '2026-04-22', headline: 'Off-label rapamycin use surges among biohackers despite trial warnings' },
      { date: '2026-04-26', headline: 'Phase III trial recruitment opens; 12,000 participants sought' },
    ],
  },
];

const CATS = ['All','World','Politics','Business','Technology','Health','Science','Environment','Education'];
const SOURCES_QUICK = ['AP', 'Reuters', 'Bloomberg', 'NYT', 'WSJ', 'BBC', 'WaPo'];
const GROUP_ORDER: DisplayGroup[] = ['today','yesterday','this_week','april_2026','earlier'];
const GROUP_LABELS: Record<DisplayGroup, string> = {
  today: 'TODAY', yesterday: 'YESTERDAY', this_week: 'THIS WEEK',
  april_2026: 'APRIL 2026', earlier: 'EARLIER',
};

// ── Coverage mini-timeline ─────────────────────────────────────────────────

function CoverageTimeline({ story }: { story: Story }) {
  const color  = lcColor(story.lifecycle);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; label: string } | null>(null);

  const dayMap = new Map<string, number>();
  for (const a of story.articles) dayMap.set(a.date, (dayMap.get(a.date) ?? 0) + 1);
  const dates  = Array.from(dayMap.keys()).sort();
  const minT   = dates.length >= 2 ? +new Date(dates[0]) : 0;
  const maxT   = dates.length >= 2 ? +new Date(dates[dates.length - 1]) : 0;
  const range  = maxT - minT || 1;
  const maxCnt = dates.length > 0 ? Math.max(...Array.from(dayMap.values())) : 1;
  const MAX_H  = 20, MIN_H = 4;

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (dates.length < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetT = minT + pct * range;
    let closest = dates[0];
    let closestDiff = Infinity;
    for (const d of dates) {
      const diff = Math.abs(+new Date(d) - targetT);
      if (diff < closestDiff) { closestDiff = diff; closest = d; }
    }
    const cnt = dayMap.get(closest) ?? 0;
    const barPct = ((+new Date(closest) - minT) / range) * 100;
    setTip({ x: barPct, label: `${fmtDate(closest)} · ${cnt} article${cnt !== 1 ? 's' : ''}` });
  }, [dates, dayMap, minT, range]);

  if (dates.length < 2) return null;

  return (
    <div style={{ position: 'relative', marginBottom: 14, cursor: 'crosshair' }}
      onMouseMove={handleMove}
      onMouseLeave={() => setTip(null)}
    >
      {tip && (
        <div ref={tipRef} style={{
          position: 'absolute', bottom: '100%',
          left: `clamp(40px, ${tip.x}%, calc(100% - 60px))`,
          transform: 'translateX(-50%)',
          background: C.text, color: '#fff', fontSize: 10, fontFamily: SANS,
          fontWeight: 600, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
          pointerEvents: 'none', marginBottom: 6, zIndex: 10,
        }}>
          {tip.label}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
            borderTop: `4px solid ${C.text}`,
          }}/>
        </div>
      )}
      <div style={{ height: MAX_H + 4, position: 'relative' }}>
        {dates.map((date) => {
          const pct    = ((+new Date(date) - minT) / range);
          const cnt    = dayMap.get(date) ?? 1;
          const h      = MIN_H + ((cnt / maxCnt) * (MAX_H - MIN_H));
          const isLast = date === dates[dates.length - 1];
          return (
            <div key={date} style={{
              position: 'absolute', bottom: 0,
              left: `${Math.min(pct * 100, 97)}%`,
              width: isLast ? 4 : 3, height: h,
              background: isLast ? color : `${color}50`,
              borderRadius: 2,
              boxShadow: isLast ? `0 0 5px ${color}88` : 'none',
            }}/>
          );
        })}
      </div>
      <div style={{
        height: 1, background: C.border, marginTop: 3,
        position: 'relative',
      }}>
        <span style={{
          position: 'absolute', left: 0, top: 3,
          fontSize: 9, color: C.muted, fontFamily: SANS, fontWeight: 500,
        }}>
          {fmtDate(dates[0])}
        </span>
        <span style={{
          position: 'absolute', right: 0, top: 3,
          fontSize: 9, color, fontFamily: SANS, fontWeight: 600,
        }}>
          {fmtDate(dates[dates.length - 1])}
        </span>
      </div>
    </div>
  );
}

// ── Following strip ────────────────────────────────────────────────────────

function FollowingStrip({ stories, followed, onToggle }: {
  stories: Story[]; followed: Set<string>; onToggle: (id: string) => void;
}) {
  const active = stories.filter(s => followed.has(s.id));
  if (active.length === 0) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: C.muted, fontFamily: SANS,
        padding: '14px 20px 8px',
      }}>
        Following
      </div>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 16px',
        scrollbarWidth: 'none',
        maskImage: 'linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)',
      }}>
        {active.map(s => {
          const color = lcColor(s.lifecycle);
          return (
            <div key={s.id} style={{
              flexShrink: 0, background: C.surface,
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 10, padding: '10px 14px',
              maxWidth: 200, cursor: 'pointer',
              transition: 'box-shadow 150ms ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
                  boxShadow: s.lifecycle === 'breaking' ? `0 0 6px ${color}` : 'none',
                }}/>
                <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: SANS, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {s.lifecycle}
                </span>
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: C.text, fontFamily: SERIF,
                lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {s.title}
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, marginTop: 5 }}>
                {s.articles.length} articles
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 1, background: C.border, margin: '0 0 4px' }}/>
    </div>
  );
}

// ── Story card ─────────────────────────────────────────────────────────────

function StoryCard({ story, dimmed, followed, onToggleFollow }: {
  story: Story; dimmed: boolean; followed: boolean; onToggleFollow: (id: string) => void;
}) {
  const color    = lcColor(story.lifecycle);
  const dur      = durationDays(story);
  const latest   = latestHeadline(story);
  const lms      = latestMs(story);
  const isResolved = story.lifecycle === 'resolved';

  const titleSize =
    story.lifecycle === 'breaking'  ? 22 :
    story.lifecycle === 'developing' ? 18 : 15;
  const titleWeight =
    story.lifecycle === 'breaking'  ? 800 :
    story.lifecycle === 'developing' ? 700 : 400;

  const borderLeft =
    story.lifecycle === 'breaking'  ? `4px solid ${C.breaking}` :
    story.lifecycle === 'developing' ? `2px solid ${C.developing}` :
    `1px solid ${C.border}`;

  return (
    <div style={{
      opacity: dimmed ? 0.13 : 1,
      transform: dimmed ? 'scale(0.97)' : 'scale(1)',
      transition: 'opacity 200ms ease, transform 200ms ease',
      borderLeft,
      background: story.lifecycle === 'breaking' ? C.breakingBg :
                  story.lifecycle === 'developing' ? C.developingBg : 'transparent',
      paddingLeft: 16, paddingRight: 20, paddingTop: 18, paddingBottom: 16,
      borderBottom: `1px solid ${C.border}`,
      cursor: 'pointer',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {story.lifecycle === 'breaking' && (
              <span className="vp-live-dot" style={{
                width: 7, height: 7, borderRadius: '50%',
                background: C.breaking, display: 'inline-block', flexShrink: 0,
              }}/>
            )}
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.18em',
              textTransform: 'uppercase', color, fontFamily: SANS,
            }}>
              {story.lifecycle}
            </span>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: C.muted, fontFamily: SANS,
          }}>
            {story.category}
          </span>
        </div>
        <span style={{ fontSize: 10, color: isResolved ? C.muted : color, fontFamily: SANS, fontWeight: 500, flexShrink: 0 }}>
          {relTime(lms)}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: SERIF,
        fontSize: titleSize, fontWeight: titleWeight,
        lineHeight: 1.22, letterSpacing: titleSize >= 20 ? '-0.02em' : '-0.01em',
        color: isResolved ? C.dim : C.text,
        marginBottom: 12,
      }}>
        {story.title}
      </div>

      {/* Coverage timeline */}
      <CoverageTimeline story={story} />

      {/* Latest wire */}
      <div style={{
        borderTop: `1px solid ${C.border}`, paddingTop: 10, marginBottom: 12,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: isResolved ? C.muted : color,
          fontFamily: SANS, marginRight: 6,
        }}>
          {isResolved ? 'Final' : 'Latest'}
        </span>
        <span style={{
          fontSize: 13, color: isResolved ? C.dim : C.soft,
          fontFamily: SERIF, lineHeight: 1.45,
        }}>
          {latest}
        </span>
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>
          {story.articles.length} articles
          {dur > 0 && <> · <span style={{ color: isResolved ? C.muted : C.dim }}>{dur}d story</span></>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>
            {story.sources.slice(0, 2).join(' · ')}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFollow(story.id); }}
            title={followed ? 'Unfollow story' : 'Follow story'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
              color: followed ? color : C.muted,
              transition: 'color 150ms ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={followed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '20px 20px 12px',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: C.muted, fontFamily: SANS, flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }}/>
      <span style={{
        fontSize: 10, color: C.muted, fontFamily: SANS, flexShrink: 0,
      }}>
        {count}
      </span>
    </div>
  );
}

// ── Filter pill row ────────────────────────────────────────────────────────

function PillToggle({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void;
}) {
  const c = color || C.text;
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 20, fontFamily: SANS,
      fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
      border: active ? 'none' : `1px solid ${C.border}`,
      background: active ? c : 'transparent',
      color: active ? '#fff' : C.dim,
      transition: 'all 150ms ease', whiteSpace: 'nowrap', minHeight: 34,
    }}>
      {label}
    </button>
  );
}

// ── Filter sheet ───────────────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: C.muted, fontFamily: SANS,
        marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FilterSheet({ open, filters, onClose, onChange, resultCount }: {
  open: boolean; filters: FilterState;
  onClose: () => void;
  onChange: (f: FilterState) => void;
  resultCount: number;
}) {
  const toggleLc = (lc: Lifecycle) => {
    const next = filters.lifecycle.includes(lc)
      ? filters.lifecycle.filter(x => x !== lc)
      : [...filters.lifecycle, lc];
    onChange({ ...filters, lifecycle: next });
  };
  const isLcActive = (lc: Lifecycle) => filters.lifecycle.includes(lc);
  const hasFilters =
    filters.lifecycle.length > 0 || filters.dateFrom || filters.dateTo ||
    filters.source || filters.coverage !== 'any' || filters.quiz !== 'all' || filters.sort !== 'recent';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.35)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 250ms ease',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: C.bg, borderRadius: '18px 18px 0 0',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.12)',
        transform: open ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform 320ms cubic-bezier(0.4,0,0.2,1)',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }}/>
        </div>

        {/* Sheet header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px 16px', borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: SANS }}>
            Advanced Filters
          </span>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {hasFilters && (
              <button onClick={() => onChange(DEFAULT_FILTERS)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: C.breaking, fontFamily: SANS, fontWeight: 600, padding: 0,
              }}>
                Clear all
              </button>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', color: C.dim,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 20px 0' }}>

          <FilterSection title="Sort by">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['recent','coverage','duration'] as SortKey[]).map(s => (
                <PillToggle key={s}
                  label={s === 'recent' ? 'Most Recent' : s === 'coverage' ? 'Most Coverage' : 'Longest Running'}
                  active={filters.sort === s}
                  onClick={() => onChange({ ...filters, sort: s })}
                />
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Status">
            <div style={{ display: 'flex', gap: 8 }}>
              <PillToggle label="Breaking"  active={isLcActive('breaking')}  color={C.breaking}  onClick={() => toggleLc('breaking')} />
              <PillToggle label="Developing" active={isLcActive('developing')} color={C.developing} onClick={() => toggleLc('developing')} />
              <PillToggle label="Resolved"  active={isLcActive('resolved')}  color={C.dim}       onClick={() => toggleLc('resolved')} />
            </div>
          </FilterSection>

          <FilterSection title="Date range">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, marginBottom: 5 }}>From</div>
                <input
                  type="date" value={filters.dateFrom}
                  onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 10,
                    border: `1px solid ${filters.dateFrom ? C.text : C.border}`,
                    fontSize: 13, fontFamily: SANS, color: C.text,
                    background: C.bg, boxSizing: 'border-box', outline: 'none',
                  }}
                />
              </div>
              <span style={{ color: C.muted, fontSize: 12, marginTop: 18 }}>→</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, marginBottom: 5 }}>To</div>
                <input
                  type="date" value={filters.dateTo}
                  onChange={e => onChange({ ...filters, dateTo: e.target.value })}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 10,
                    border: `1px solid ${filters.dateTo ? C.text : C.border}`,
                    fontSize: 13, fontFamily: SANS, color: C.text,
                    background: C.bg, boxSizing: 'border-box', outline: 'none',
                  }}
                />
              </div>
            </div>
          </FilterSection>

          <FilterSection title="Source">
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type="text" value={filters.source} placeholder="e.g. Reuters, AP, Bloomberg…"
                onChange={e => onChange({ ...filters, source: e.target.value })}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: `1px solid ${filters.source ? C.text : C.border}`,
                  fontSize: 13, fontFamily: SANS, color: C.text,
                  background: C.bg, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SOURCES_QUICK.map(src => (
                <button key={src}
                  onClick={() => onChange({ ...filters, source: filters.source === src ? '' : src })}
                  style={{
                    padding: '4px 10px', borderRadius: 14, fontSize: 11, fontFamily: SANS,
                    cursor: 'pointer', fontWeight: 500,
                    border: filters.source === src ? `1px solid ${C.text}` : `1px solid ${C.border}`,
                    background: filters.source === src ? C.text : 'transparent',
                    color: filters.source === src ? '#fff' : C.dim,
                    transition: 'all 120ms ease',
                  }}
                >
                  {src}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Coverage depth">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                ['any', 'Any'],
                ['light', 'Light  <5'],
                ['medium', 'In Depth  5–15'],
                ['heavy', 'Major  15+'],
              ] as [CoverageKey, string][]).map(([k, label]) => (
                <PillToggle key={k} label={label} active={filters.coverage === k}
                  onClick={() => onChange({ ...filters, coverage: k })} />
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Quiz">
            <div style={{ display: 'flex', gap: 8 }}>
              {([['all','All Stories'],['quizzed','Quizzed'],['unquizzed','Not Quizzed']] as [QuizKey, string][]).map(([k, label]) => (
                <PillToggle key={k} label={label} active={filters.quiz === k}
                  onClick={() => onChange({ ...filters, quiz: k })} />
              ))}
            </div>
          </FilterSection>

          <div style={{ height: 20 }}/>
        </div>

        {/* CTA */}
        <div style={{
          padding: '16px 20px', borderTop: `1px solid ${C.border}`,
          background: C.bg,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        }}>
          <button onClick={onClose} style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: C.text, color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 15, fontWeight: 700, fontFamily: SANS,
            transition: 'background 150ms ease',
          }}>
            Show {resultCount} {resultCount === 1 ? 'story' : 'stories'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Active filter pills ────────────────────────────────────────────────────

function ActiveFilters({ filters, onChange }: {
  filters: FilterState; onChange: (f: FilterState) => void;
}) {
  const pills: { label: string; clear: () => void }[] = [];

  filters.lifecycle.forEach(lc => {
    pills.push({
      label: lc.charAt(0).toUpperCase() + lc.slice(1),
      clear: () => onChange({ ...filters, lifecycle: filters.lifecycle.filter(x => x !== lc) }),
    });
  });
  if (filters.source)   pills.push({ label: filters.source, clear: () => onChange({ ...filters, source: '' }) });
  if (filters.dateFrom) pills.push({ label: `From ${fmtDate(filters.dateFrom)}`, clear: () => onChange({ ...filters, dateFrom: '' }) });
  if (filters.dateTo)   pills.push({ label: `To ${fmtDate(filters.dateTo)}`, clear: () => onChange({ ...filters, dateTo: '' }) });
  if (filters.coverage !== 'any') pills.push({ label: `Coverage: ${filters.coverage}`, clear: () => onChange({ ...filters, coverage: 'any' }) });
  if (filters.quiz !== 'all')     pills.push({ label: `Quiz: ${filters.quiz}`, clear: () => onChange({ ...filters, quiz: 'all' }) });
  if (filters.sort !== 'recent')  pills.push({ label: `Sort: ${filters.sort}`, clear: () => onChange({ ...filters, sort: 'recent' }) });

  if (pills.length === 0) return null;

  return (
    <div style={{
      display: 'flex', gap: 6, padding: '0 16px 10px',
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {pills.map((p, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: '4px 10px 4px 12px',
          fontSize: 11, color: C.text, fontFamily: SANS, fontWeight: 500,
          flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {p.label}
          <button onClick={p.clear} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.muted, padding: 0, lineHeight: 1, fontSize: 14,
            display: 'flex', alignItems: 'center',
          }}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Bottom nav ─────────────────────────────────────────────────────────────

function BottomNav() {
  type NavItem = { label: string; icon: React.ReactNode; active?: boolean };
  const nav: NavItem[] = [
    {
      label: 'Home',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      label: 'Browse', active: true,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
    },
    {
      label: 'Most Informed',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      ),
    },
    {
      label: 'Profile',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {nav.map(({ label, icon, active }) => (
        <div key={label} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '10px 12px',
          color: active ? C.text : C.muted,
          cursor: 'pointer',
          transition: 'color 120ms ease',
          WebkitTapHighlightColor: 'transparent',
        }}>
          {icon}
          <span style={{
            fontSize: 9, fontWeight: active ? 700 : 500,
            fontFamily: SANS, letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const [query,       setQuery]       = useState('');
  const [category,    setCategory]    = useState('All');
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [filters,     setFilters]     = useState<FilterState>(DEFAULT_FILTERS);
  const [followed,    setFollowed]    = useState<Set<string>>(
    () => new Set(STORIES.filter(s => s.followedByDefault).map(s => s.id))
  );

  const toggleFollow = useCallback((id: string) => {
    setFollowed(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = filters.lifecycle.length;
    if (filters.source)           n++;
    if (filters.dateFrom)         n++;
    if (filters.dateTo)           n++;
    if (filters.coverage !== 'any') n++;
    if (filters.quiz !== 'all')   n++;
    if (filters.sort !== 'recent') n++;
    return n;
  }, [filters]);

  const isMatch = useCallback((story: Story): boolean => {
    if (category !== 'All' && story.category !== category) return false;
    if (filters.lifecycle.length > 0 && !filters.lifecycle.includes(story.lifecycle)) return false;
    if (filters.source) {
      const q = filters.source.toLowerCase();
      if (!story.sources.some(s => s.toLowerCase().includes(q))) return false;
    }
    if (filters.coverage !== 'any') {
      const n = story.articles.length;
      if (filters.coverage === 'light'  && n >= 5)  return false;
      if (filters.coverage === 'medium' && (n < 5 || n > 15)) return false;
      if (filters.coverage === 'heavy'  && n <= 15) return false;
    }
    if (filters.dateFrom) {
      const from = +new Date(filters.dateFrom);
      if (latestMs(story) < from) return false;
    }
    if (filters.dateTo) {
      const to = +new Date(filters.dateTo);
      if (earliestMs(story) > to) return false;
    }
    if (query.trim().length >= 2) {
      const q = query.toLowerCase();
      const inTitle    = story.title.toLowerCase().includes(q);
      const inCategory = story.category.toLowerCase().includes(q);
      const inArticles = story.articles.some(a => a.headline.toLowerCase().includes(q));
      const inSources  = story.sources.some(s => s.toLowerCase().includes(q));
      if (!inTitle && !inCategory && !inArticles && !inSources) return false;
    }
    return true;
  }, [query, category, filters]);

  const sorted = useCallback((stories: Story[]) => {
    return [...stories].sort((a, b) => {
      if (filters.sort === 'coverage') return b.articles.length - a.articles.length;
      if (filters.sort === 'duration') return durationDays(b) - durationDays(a);
      return latestMs(b) - latestMs(a);
    });
  }, [filters.sort]);

  const grouped = useMemo(() => {
    const map = new Map<DisplayGroup, Story[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const story of STORIES) {
      map.get(story.displayGroup)?.push(story);
    }
    const result: { group: DisplayGroup; stories: Story[] }[] = [];
    for (const g of GROUP_ORDER) {
      const matching = sorted((map.get(g) ?? []).filter(isMatch));
      if (matching.length > 0) result.push({ group: g, stories: matching });
    }
    return result;
  }, [isMatch, sorted]);

  const totalMatching = useMemo(
    () => STORIES.filter(isMatch).length,
    [isMatch]
  );

  const hasAnyResults = grouped.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS }}>
      <style>{`
        @keyframes vp-live-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.8); }
          15%       { opacity: 1;   transform: scale(1.3); box-shadow: 0 0 0 4px rgba(239,68,68,0.2); }
        }
        .vp-live-dot {
          animation: vp-live-pulse 2.4s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        * { -webkit-tap-highlight-color: transparent; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Fixed header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Masthead */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px 8px', maxWidth: 720, margin: '0 auto',
        }}>
          <span style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: C.text }}>
            Browse
          </span>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: SANS, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {totalMatching} {totalMatching === 1 ? 'story' : 'stories'}
          </span>
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 16px 8px', maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: C.surface, borderRadius: 12, padding: '10px 14px',
            border: `1px solid ${query ? C.text + '44' : 'transparent'}`,
            transition: 'border-color 150ms ease',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search stories, headlines, sources…"
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 14, color: C.text, width: '100%', fontFamily: SANS,
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{
                border: 'none', background: 'none', cursor: 'pointer',
                color: C.muted, fontSize: 18, padding: 0, lineHeight: 1, flexShrink: 0,
              }}>×</button>
            )}
            <div style={{ width: 1, height: 16, background: C.border, flexShrink: 0 }}/>
            <button
              onClick={() => setFilterOpen(true)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                padding: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={activeFilterCount > 0 ? C.text : C.muted} strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
                <line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
              <span style={{
                fontSize: 12, fontWeight: activeFilterCount > 0 ? 700 : 500,
                color: activeFilterCount > 0 ? C.text : C.muted, fontFamily: SANS,
              }}>
                {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
              </span>
            </button>
          </div>
        </div>

        {/* Category chips */}
        <div style={{
          display: 'flex', gap: 6, padding: '0 16px 12px',
          overflowX: 'auto', scrollbarWidth: 'none',
          maxWidth: 720, margin: '0 auto',
          maskImage: 'linear-gradient(to right, transparent, black 8px, black calc(100% - 8px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 8px, black calc(100% - 8px), transparent)',
        }}>
          {CATS.map(cat => {
            const active = cat === category;
            return (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                border: active ? 'none' : `1px solid ${C.border}`,
                background: active ? C.text : 'transparent',
                color: active ? '#fff' : C.dim,
                fontSize: 12, fontWeight: active ? 700 : 500,
                borderRadius: 20, padding: '5px 14px', cursor: 'pointer',
                flexShrink: 0, fontFamily: SANS,
                transform: active ? 'scale(1.04)' : 'scale(1)',
                transition: 'all 140ms cubic-bezier(0.34,1.56,0.64,1)',
                minHeight: 32,
              }}>
                {cat}
              </button>
            );
          })}
        </div>

        {/* Active filter pills */}
        <ActiveFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Content */}
      <main style={{
        maxWidth: 720, margin: '0 auto',
        paddingTop: activeFilterCount > 0 ? 220 : 188,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
      }}>

        <FollowingStrip stories={STORIES} followed={followed} onToggle={toggleFollow} />

        {!hasAnyResults && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: SERIF, marginBottom: 6 }}>
              No stories match
            </div>
            <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, marginBottom: 20 }}>
              {query ? `Nothing found for "${query}"` : 'Try adjusting your filters'}
            </div>
            <button
              onClick={() => { setQuery(''); setCategory('All'); setFilters(DEFAULT_FILTERS); }}
              style={{
                padding: '10px 20px', borderRadius: 10, background: C.text, color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: SANS,
              }}
            >
              Clear all filters
            </button>
          </div>
        )}

        {grouped.map(({ group, stories }) => (
          <div key={group}>
            <SectionHeader label={GROUP_LABELS[group]} count={stories.length} />
            {stories.map(story => (
              <StoryCard
                key={story.id}
                story={story}
                dimmed={false}
                followed={followed.has(story.id)}
                onToggleFollow={toggleFollow}
              />
            ))}
          </div>
        ))}
      </main>

      <BottomNav />

      <FilterSheet
        open={filterOpen}
        filters={filters}
        onClose={() => setFilterOpen(false)}
        onChange={setFilters}
        resultCount={totalMatching}
      />
    </div>
  );
}
