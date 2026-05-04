import { useState, useEffect, useRef, useMemo } from 'react';

// ---------- mock corpus ----------
const articles = [
  { id: 1, type: 'article', title: 'The committee vote nobody is watching', dek: 'A procedural maneuver may reshape how federal agencies are funded for a decade.', section: 'Politics', subsection: 'Congress', date: '2026-04-22', daysAlive: 12, passers: 1247, experts: 8, pinned: 12, cluster: 'Federal Agency Funding', clusterId: 'fed-funding', expertDomains: ['budget policy'], passed: true },
  { id: 2, type: 'article', title: 'What the climate model got right, and what it didn\u2019t', dek: 'Five years on, a postmortem of the IPCC\u2019s most-cited 2021 projection.', section: 'Science', subsection: 'Climate', date: '2026-03-08', daysAlive: 57, passers: 4318, experts: 23, pinned: 41, cluster: 'IPCC Postmortem', clusterId: 'ipcc', expertDomains: ['climate science', 'atmospheric physics'], passed: true },
  { id: 3, type: 'article', title: 'The quiet repeal of a banking rule', dek: 'A 2008-era safeguard was rolled back last week. Almost no one covered it.', section: 'Economy', subsection: 'Federal Reserve', date: '2026-04-30', daysAlive: 4, passers: 218, experts: 3, pinned: 2, cluster: null, expertDomains: ['financial regulation'], passed: false },
  { id: 4, type: 'article', title: 'Inside the longest-running Supreme Court oral argument since 1979', dek: 'Three hours, twelve interruptions, and a justice who said almost nothing.', section: 'Politics', subsection: 'Supreme Court', date: '2026-02-14', daysAlive: 79, passers: 6201, experts: 14, pinned: 28, cluster: 'Voting Rights Term', clusterId: 'voting-rights', expertDomains: ['constitutional law'], passed: true },
  { id: 5, type: 'article', title: 'A new strain, an old playbook', dek: 'Public health agencies have been here before. The lessons they did and didn\u2019t learn.', section: 'Science', subsection: 'Health', date: '2026-04-18', daysAlive: 16, passers: 2841, experts: 19, pinned: 22, cluster: 'H5N2 Outbreak', clusterId: 'h5n2', expertDomains: ['epidemiology', 'public health'], passed: false },
  { id: 6, type: 'article', title: 'How AI startups are pricing inference, and what it means for margins', dek: 'Three pricing models, three different bets on the next 24 months.', section: 'Technology', subsection: 'AI', date: '2026-04-25', daysAlive: 9, passers: 982, experts: 6, pinned: 7, cluster: null, expertDomains: ['machine learning'], passed: true },
  { id: 7, type: 'article', title: 'Maine\u2019s housing bill, in plain English', dek: 'What the legislature actually passed, and what it didn\u2019t.', section: 'Local', subsection: 'Maine', date: '2026-04-12', daysAlive: 22, passers: 1420, experts: 5, pinned: 18, cluster: 'Maine Housing 2026', clusterId: 'maine-housing', expertDomains: ['housing policy'], passed: true },
  { id: 8, type: 'article', title: 'The Fed\u2019s September decision, decoded', dek: 'A 25 basis point cut and the language the chair used to justify it.', section: 'Economy', subsection: 'Federal Reserve', date: '2026-04-02', daysAlive: 32, passers: 3127, experts: 11, pinned: 19, cluster: 'Rate Cycle 2026', clusterId: 'rate-cycle', expertDomains: ['monetary policy'], passed: true },
  { id: 9, type: 'article', title: 'A short history of the export control loophole', dek: 'How a 1979 amendment created a forty-year gray zone in semiconductor policy.', section: 'Technology', subsection: 'Policy', date: '2026-01-28', daysAlive: 96, passers: 5012, experts: 17, pinned: 33, cluster: 'Chip Export Controls', clusterId: 'chip-export', expertDomains: ['trade policy'], passed: false },
  { id: 10, type: 'article', title: 'The Buxton zoning meeting that drew 400 people', dek: 'Thirty parking spaces, one farm road, and a town divided.', section: 'Local', subsection: 'Buxton', date: '2026-04-29', daysAlive: 5, passers: 312, experts: 1, pinned: 4, cluster: null, expertDomains: ['land use'], passed: true },
  { id: 11, type: 'article', title: 'A long read on the new wave of European labor strikes', dek: 'Why this round looks different from the last, and what unions are actually demanding.', section: 'World', subsection: 'Europe', date: '2026-03-20', daysAlive: 45, passers: 2103, experts: 9, pinned: 14, cluster: 'EU Labor Wave', clusterId: 'eu-labor', expertDomains: ['labor economics'], passed: false },
  { id: 12, type: 'article', title: 'What we know about the H5N2 spillover', dek: 'Three counties, one farm, and the timeline epidemiologists are reconstructing.', section: 'Science', subsection: 'Health', date: '2026-04-26', daysAlive: 8, passers: 1873, experts: 28, pinned: 31, cluster: 'H5N2 Outbreak', clusterId: 'h5n2', expertDomains: ['epidemiology', 'virology'], passed: false },
  { id: 13, type: 'article', title: 'The voting rights term, halfway through', dek: 'Five cases, two surprises, and the dissent that\u2019s already being cited.', section: 'Politics', subsection: 'Supreme Court', date: '2026-04-08', daysAlive: 26, passers: 4912, experts: 21, pinned: 35, cluster: 'Voting Rights Term', clusterId: 'voting-rights', expertDomains: ['constitutional law', 'election law'], passed: true },
  { id: 14, type: 'article', title: 'A field guide to reading Fed minutes', dek: 'Six phrases that mean more than they look, and how to spot them.', section: 'Economy', subsection: 'Federal Reserve', date: '2025-12-15', daysAlive: 140, passers: 7820, experts: 12, pinned: 52, cluster: 'Rate Cycle 2026', clusterId: 'rate-cycle', expertDomains: ['monetary policy'], passed: true },
  { id: 15, type: 'article', title: 'NATO\u2019s eastern logistics problem', dek: 'Pre-positioning, rail gauge, and the slow grammar of alliance planning.', section: 'World', subsection: 'Europe', date: '2026-02-22', daysAlive: 71, passers: 1654, experts: 7, pinned: 11, cluster: null, expertDomains: ['security policy'], passed: false },
];

const clusters = [
  { id: 'fed-funding', name: 'Federal Agency Funding', summary: 'A multi-week thread on appropriations, FY2027.', articleCount: 8, daysAlive: 12, expertCount: 8, recentVelocity: 0.6, followed: false },
  { id: 'ipcc', name: 'IPCC Postmortem', summary: 'Re-examining the 2021 projections five years on.', articleCount: 14, daysAlive: 57, expertCount: 23, recentVelocity: 0.2, followed: true },
  { id: 'voting-rights', name: 'Voting Rights Term', summary: 'The 2025\u201326 Supreme Court term\u2019s voting cases.', articleCount: 22, daysAlive: 79, expertCount: 21, recentVelocity: 0.4, followed: true },
  { id: 'h5n2', name: 'H5N2 Outbreak', summary: 'A spillover event and the public health response.', articleCount: 11, daysAlive: 16, expertCount: 28, recentVelocity: 0.95, followed: true },
  { id: 'maine-housing', name: 'Maine Housing 2026', summary: 'The state legislature\u2019s housing package.', articleCount: 6, daysAlive: 22, expertCount: 5, recentVelocity: 0.3, followed: true },
  { id: 'rate-cycle', name: 'Rate Cycle 2026', summary: 'The Fed\u2019s 2026 cutting cycle.', articleCount: 19, daysAlive: 140, expertCount: 12, recentVelocity: 0.5, followed: false },
  { id: 'chip-export', name: 'Chip Export Controls', summary: 'Semiconductor policy and its forty-year history.', articleCount: 9, daysAlive: 96, expertCount: 17, recentVelocity: 0.1, followed: false },
  { id: 'eu-labor', name: 'EU Labor Wave', summary: 'Strikes across Germany, France, Italy.', articleCount: 7, daysAlive: 45, expertCount: 9, recentVelocity: 0.3, followed: false },
];

const expertResponses = [
  { id: 'e1', type: 'expert', expertName: 'Dr. Yuki Tanaka', expertDomain: 'epidemiology', articleId: 12, articleTitle: 'What we know about the H5N2 spillover', preview: 'The reconstruction depends on serology data we won\u2019t have for another two weeks\u2026' },
  { id: 'e2', type: 'expert', expertName: 'Prof. Elena Sokolova', expertDomain: 'monetary policy', articleId: 8, articleTitle: 'The Fed\u2019s September decision, decoded', preview: 'The chair\u2019s use of \u201cresilient\u201d here is meaningfully different from the July statement\u2026' },
  { id: 'e3', type: 'expert', expertName: 'Dr. Marcus Held', expertDomain: 'climate science', articleId: 2, articleTitle: 'What the climate model got right, and what it didn\u2019t', preview: 'The cloud-feedback term is where the spread comes from. Most coverage ignores this\u2026' },
];

const pinnedContext = [
  { id: 'p1', type: 'pinned', articleId: 1, articleTitle: 'The committee vote nobody is watching', preview: 'Correction added by user @kjmiller: the rule cited is 7 USC \u00a7 2014, not \u00a7 2104.' },
  { id: 'p2', type: 'pinned', articleId: 5, articleTitle: 'A new strain, an old playbook', preview: 'Pinned context: the 2009 H1N1 timeline referenced here is documented in the CDC MMWR archive\u2026' },
  { id: 'p3', type: 'pinned', articleId: 12, articleTitle: 'What we know about the H5N2 spillover', preview: 'Pinned by experts: the spillover hypothesis is one of three currently being investigated\u2026' },
];

const userReads = [1, 2, 4, 6, 7, 8, 10, 13, 14];

// ---------- helpers ----------
const fmt = (n) => n.toLocaleString('en-US');
const fmtDate = (d) => {
  const [, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+day}`;
};
const depthScore = (a) =>
  Math.log(a.passers + 1) * 0.35 +
  Math.log(a.experts + 1) * 0.30 +
  Math.log(a.pinned + 1) * 0.15 +
  Math.log(a.daysAlive + 1) * 0.10 +
  (1 / (a.daysAlive + 1)) * 0.10;
const matches = (h, n) => !n ? true : (h ? h.toLowerCase().includes(n.toLowerCase()) : false);

// ---------- main component ----------
export default function VerityPostSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('depth');
  const [activeRefinements, setActiveRefinements] = useState(new Set());
  const inputRef = useRef(null);

  useEffect(() => { if (!open) setActiveRefinements(new Set()); }, [open]);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && !open && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault(); setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault(); setOpen(false); setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) { const t = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(t); }
  }, [open]);

  const toggleRefinement = (key) => {
    setActiveRefinements((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // contextual refinement chips offered for the current query
  const offeredRefinements = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const offers = [{ key: 'mine', label: 'your reads only' }];

    const matchingClusters = clusters.filter((c) => matches(c.name, q) || matches(c.summary, q)).slice(0, 2);
    matchingClusters.forEach((c) => offers.push({ key: `cluster:${c.id}`, label: `in ${c.name}` }));

    const domainSet = new Set();
    articles.forEach((a) => {
      if (matches(a.title, q) || matches(a.dek, q)) {
        a.expertDomains.forEach((d) => domainSet.add(d));
      }
    });
    expertResponses.forEach((e) => {
      if (matches(e.expertDomain, q) || matches(e.preview, q) || matches(e.articleTitle, q)) {
        domainSet.add(e.expertDomain);
      }
    });
    Array.from(domainSet).slice(0, 2).forEach((d) => offers.push({ key: `expert:${d}`, label: `experts in ${d}` }));

    return offers;
  }, [query]);

  // execute search
  const { results, activeClusterCallout } = useMemo(() => {
    const q = query.trim();
    if (!q) return { results: [], activeClusterCallout: null };

    const onlyMine = activeRefinements.has('mine');
    const clusterFilters = Array.from(activeRefinements).filter((r) => r.startsWith('cluster:')).map((r) => r.slice(8));
    const expertFilters = Array.from(activeRefinements).filter((r) => r.startsWith('expert:')).map((r) => r.slice(7));

    let articleResults = articles.filter((a) => {
      if (onlyMine && !userReads.includes(a.id)) return false;
      if (clusterFilters.length && !clusterFilters.includes(a.clusterId)) return false;
      if (expertFilters.length && !a.expertDomains.some((d) => expertFilters.includes(d))) return false;
      return matches(a.title, q) || matches(a.dek, q) || matches(a.section, q) || matches(a.subsection, q) || (a.cluster && matches(a.cluster, q));
    });

    let clusterResults = clusters.filter((c) => {
      if (onlyMine || expertFilters.length) return false;
      if (clusterFilters.length) return clusterFilters.includes(c.id);
      return matches(c.name, q) || matches(c.summary, q);
    });

    let expertResults = expertResponses.filter((e) => {
      if (onlyMine || clusterFilters.length) return false;
      if (expertFilters.length) return expertFilters.includes(e.expertDomain);
      return matches(e.expertDomain, q) || matches(e.preview, q) || matches(e.articleTitle, q);
    });

    let pinnedResults = pinnedContext.filter((p) => {
      if (onlyMine || clusterFilters.length || expertFilters.length) return false;
      return matches(p.preview, q) || matches(p.articleTitle, q);
    });

    if (sort === 'depth') articleResults.sort((a, b) => depthScore(b) - depthScore(a));
    if (sort === 'recent') articleResults.sort((a, b) => a.daysAlive - b.daysAlive);

    let callout = null;
    const matchingActive = clusters.find(
      (c) => c.recentVelocity > 0.7 && (matches(c.name, q) || (q && q.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])))
    );
    if (matchingActive) callout = matchingActive;

    const all = [
      ...clusterResults.slice(0, 2).map((c) => ({ ...c, kind: 'cluster' })),
      ...articleResults.map((a) => ({ ...a, kind: 'article' })),
      ...expertResults.map((e) => ({ ...e, kind: 'expert' })),
      ...pinnedResults.map((p) => ({ ...p, kind: 'pinned' })),
    ];

    return { results: all, activeClusterCallout: callout };
  }, [query, sort, activeRefinements]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,400..700,30..100;1,9..144,400..700,30..100&family=Geist:wght@300..600&family=JetBrains+Mono:wght@400;500&display=swap');
        :root {
          --serif: 'Fraunces', Georgia, serif;
          --sans: 'Geist', -apple-system, sans-serif;
          --mono: 'JetBrains Mono', ui-monospace, monospace;
          --stone-50: #fafaf9; --stone-100: #f5f5f4; --stone-200: #e7e5e4;
          --stone-300: #d6d3d1; --stone-400: #a8a29e; --stone-500: #78716c;
          --stone-600: #57534e; --stone-700: #44403c; --stone-800: #292524; --stone-900: #1c1917;
          --teal-900: #134e4a;
        }
        body { background: var(--stone-50); }
        .vp-serif { font-family: var(--serif); font-optical-sizing: auto; font-variation-settings: 'SOFT' 50; }
        .vp-sans { font-family: var(--sans); }
        .vp-mono { font-family: var(--mono); font-feature-settings: 'tnum' on; }
        .vp-input::placeholder { font-family: var(--serif); font-style: italic; color: var(--stone-400); font-weight: 400; }
        .vp-overlay-enter { animation: vpFade 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes vpFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .vp-result { opacity: 0; animation: vpResult 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes vpResult { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .vp-chip-row { animation: vpChipsIn 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes vpChipsIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .vp-trigger:hover .vp-trigger-text { color: var(--stone-900); }
        .vp-trigger:hover .vp-trigger-icon { opacity: 1; color: var(--stone-900); }
        .vp-link { transition: color 200ms ease-out; }
        .vp-link:hover { color: var(--stone-900); }
        .vp-result-row { transition: background 180ms ease-out; }
        .vp-result-row:hover { background: rgba(231, 229, 228, 0.4); }
        .vp-chip { transition: all 180ms ease-out; }
        .vp-chip:hover { border-color: var(--stone-400); color: var(--stone-900); }
        .vp-chip.active:hover { border-color: var(--stone-700); background: var(--stone-700); }
      `}</style>

      <div className="min-h-screen vp-sans" style={{ background: 'var(--stone-50)', color: 'var(--stone-900)' }}>
        <header className="sticky top-0 z-10 flex items-center justify-between px-6"
          style={{ height: 56, background: 'var(--stone-50)', borderBottom: '1px solid rgba(231, 229, 228, 0.8)' }}>
          <span className="vp-serif" style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--stone-900)' }}>
            verity post
          </span>
          <button onClick={() => setOpen(true)} className="vp-trigger flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'none', border: 'none', padding: '6px 4px' }}>
            <svg className="vp-trigger-icon" width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--stone-500)', opacity: 0.6, transition: 'all 200ms ease-out' }}>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <span className="vp-trigger-text vp-sans" style={{ fontSize: 13, color: 'var(--stone-500)', transition: 'color 200ms ease-out' }}>
              search
            </span>
          </button>
        </header>

        <div className="flex">
          <aside className="sticky" style={{
            width: 208, top: 56, height: 'calc(100vh - 56px)',
            background: 'var(--stone-50)', borderRight: '1px solid rgba(231, 229, 228, 0.8)',
            overflowY: 'auto', padding: '20px 18px',
          }}>
            <SidebarSection name="Home" active subs={[]} />
            <SidebarSection name="Politics" subs={['Congress', 'Supreme Court', 'Executive', 'Foreign Policy', 'Campaigns']} />
            <SidebarSection name="World" subs={['Americas', 'Europe', 'Asia', 'Africa', 'Middle East']} />
            <SidebarSection name="Science" subs={['Climate', 'Space', 'Health', 'Biology', 'Physics']} />
            <SidebarSection name="Technology" subs={['AI', 'Policy', 'Startups', 'Security', 'Internet']} />
            <SidebarSection name="Economy" subs={['Markets', 'Labor', 'Housing', 'Trade', 'Federal Reserve']} />
            <SidebarSection name="Culture" subs={['Books', 'Film', 'Music', 'Art', 'Television']} />
            <SidebarSection name="Sports" subs={['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'College']} />
            <SidebarSection name="Local" subs={['Buxton', 'Portland', 'Maine', 'New England']} />
            <SidebarSection name="Following" subs={clusters.filter((c) => c.followed).map((c) => c.name)} />
          </aside>

          <main className="flex-1 px-12 py-16">
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <p className="vp-mono" style={{ fontSize: 11, color: 'var(--stone-400)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Editorial layout in progress
              </p>
              <p className="vp-serif" style={{ marginTop: 24, fontSize: 28, lineHeight: 1.25, color: 'var(--stone-300)', maxWidth: 600 }}>
                Press <span className="vp-mono" style={{ fontSize: 22, background: 'var(--stone-100)', padding: '2px 8px', borderRadius: 4, color: 'var(--stone-700)' }}>/</span> or click <span style={{ color: 'var(--stone-500)' }}>search</span> in the masthead.
              </p>
              <p className="vp-sans" style={{ marginTop: 32, fontSize: 13, color: 'var(--stone-500)', lineHeight: 1.6, maxWidth: 560 }}>
                Try <em className="vp-serif" style={{ color: 'var(--stone-700)' }}>fed</em>, <em className="vp-serif" style={{ color: 'var(--stone-700)' }}>climate</em>, <em className="vp-serif" style={{ color: 'var(--stone-700)' }}>h5n2</em>, or <em className="vp-serif" style={{ color: 'var(--stone-700)' }}>voting</em>. Refinements appear as one-tap suggestions when they're useful.
              </p>
            </div>
          </main>
        </div>
      </div>

      {open && (
        <div className="vp-overlay-enter"
          style={{ position: 'fixed', inset: 0, background: 'var(--stone-50)', zIndex: 50, overflowY: 'auto' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setQuery(''); } }}>
          <button onClick={() => { setOpen(false); setQuery(''); }} className="vp-link"
            style={{
              position: 'fixed', top: 20, right: 28, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--stone-400)', letterSpacing: '0.05em',
            }}>
            esc
          </button>

          <div style={{ maxWidth: 720, margin: '0 auto', padding: '88px 32px 120px' }}>
            <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="search the record" className="vp-input vp-serif"
              style={{
                width: '100%', height: 56, background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--stone-200)', outline: 'none',
                fontSize: 22, color: 'var(--stone-900)', padding: '0 0 12px',
              }} />

            {/* contextual chip row + sort */}
            {query && offeredRefinements.length > 0 && (
              <div className="vp-chip-row" style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {offeredRefinements.map((r) => {
                  const active = activeRefinements.has(r.key);
                  return (
                    <button key={r.key} onClick={() => toggleRefinement(r.key)}
                      className={`vp-chip vp-sans ${active ? 'active' : ''}`}
                      style={{
                        background: active ? 'var(--stone-900)' : 'transparent',
                        border: `1px solid ${active ? 'var(--stone-900)' : 'var(--stone-200)'}`,
                        color: active ? 'var(--stone-50)' : 'var(--stone-600)',
                        borderRadius: 999, padding: '5px 12px',
                        fontSize: 12, cursor: 'pointer', letterSpacing: '-0.005em',
                      }}>
                      {r.label}
                    </button>
                  );
                })}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="vp-sans" style={{ fontSize: 12, color: 'var(--stone-400)' }}>sort:</span>
                  <button onClick={() => setSort('depth')} className="vp-sans"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontSize: 12, color: sort === 'depth' ? 'var(--stone-900)' : 'var(--stone-500)',
                      textDecoration: sort === 'depth' ? 'underline' : 'none', textUnderlineOffset: 4,
                    }}>depth</button>
                  <span style={{ color: 'var(--stone-300)', fontSize: 12 }}>·</span>
                  <button onClick={() => setSort('recent')} className="vp-sans"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontSize: 12, color: sort === 'recent' ? 'var(--stone-900)' : 'var(--stone-500)',
                      textDecoration: sort === 'recent' ? 'underline' : 'none', textUnderlineOffset: 4,
                    }}>recent</button>
                </div>
              </div>
            )}

            {/* empty state */}
            {!query && (
              <div style={{ marginTop: 56, display: 'grid', gap: 56 }}>
                <EmptyStack title="Your reads"
                  items={userReads.map((id) => articles.find((a) => a.id === id)).filter(Boolean).slice(0, 6)}
                  render={(a) => <ResultArticleLine key={a.id} a={a} />} />
                <EmptyStack title="Following"
                  items={clusters.filter((c) => c.followed)}
                  render={(c) => <ResultClusterLine key={c.id} c={c} />} />
                <EmptyStack title="Active in the last 7 days"
                  items={clusters.filter((c) => c.recentVelocity > 0.4).sort((a, b) => b.recentVelocity - a.recentVelocity)}
                  render={(c) => <ResultClusterLine key={c.id} c={c} active />} />
              </div>
            )}

            {/* results */}
            {query && (
              <div style={{ marginTop: 36 }}>
                {activeClusterCallout && (
                  <div className="vp-mono vp-result"
                    style={{
                      fontSize: 11, letterSpacing: '0.03em', color: 'var(--teal-900)',
                      marginBottom: 24, paddingLeft: 12, borderLeft: '2px solid var(--teal-900)',
                    }}>
                    Active cluster: {Math.floor(activeClusterCallout.recentVelocity * 18)} new discussions today in {activeClusterCallout.name}.
                  </div>
                )}

                <div>
                  {results.length === 0 ? (
                    <p className="vp-serif" style={{ fontSize: 16, color: 'var(--stone-400)', fontStyle: 'italic' }}>
                      Nothing in the record matches that.
                    </p>
                  ) : (
                    results.map((r, i) => (
                      <div key={`${r.kind}-${r.id}`} className="vp-result vp-result-row"
                        style={{
                          animationDelay: `${Math.min(i * 28, 280)}ms`,
                          padding: '20px 12px', marginLeft: -12, marginRight: -12,
                          borderRadius: 2, cursor: 'pointer',
                        }}>
                        {r.kind === 'article' && <ResultArticle a={r} />}
                        {r.kind === 'cluster' && <ResultCluster c={r} />}
                        {r.kind === 'expert' && <ResultExpert e={r} />}
                        {r.kind === 'pinned' && <ResultPinned p={r} />}
                      </div>
                    ))
                  )}
                </div>

                {results.length > 8 && (
                  <button className="vp-link vp-mono"
                    style={{
                      marginTop: 40, background: 'none', border: 'none',
                      fontSize: 11, color: 'var(--stone-500)', letterSpacing: '0.05em', cursor: 'pointer',
                    }}>
                    load more ↓
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------- subcomponents ----------

function SidebarSection({ name, subs, active }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="vp-serif" style={{
        fontSize: 15, fontWeight: active ? 600 : 500,
        color: active ? 'var(--stone-900)' : 'var(--stone-700)',
        cursor: 'pointer', letterSpacing: '-0.005em',
      }}>
        {name}
      </div>
      {subs.map((s) => (
        <div key={s} className="vp-sans vp-link"
          style={{ fontSize: 12, color: 'var(--stone-500)', cursor: 'pointer', marginTop: 6 }}>
          {s}
        </div>
      ))}
    </div>
  );
}

function EmptyStack({ title, items, render }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="vp-serif" style={{ fontSize: 15, fontWeight: 500, color: 'var(--stone-900)', marginBottom: 14, letterSpacing: '-0.005em' }}>
        {title}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>{items.map((it) => render(it))}</div>
    </div>
  );
}

function ResultArticleLine({ a }) {
  return (
    <div className="vp-link" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, cursor: 'pointer' }}>
      <span className="vp-sans" style={{ fontSize: 13, color: 'var(--stone-700)', lineHeight: 1.5 }}>{a.title}</span>
      <span className="vp-mono" style={{ fontSize: 11, color: 'var(--stone-400)', whiteSpace: 'nowrap' }}>{fmtDate(a.date)}</span>
    </div>
  );
}

function ResultClusterLine({ c, active }) {
  return (
    <div className="vp-link" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, cursor: 'pointer' }}>
      <span className="vp-sans" style={{ fontSize: 13, color: 'var(--stone-700)', lineHeight: 1.5 }}>{c.name}</span>
      <span className="vp-mono" style={{ fontSize: 11, color: active ? 'var(--teal-900)' : 'var(--stone-400)', whiteSpace: 'nowrap' }}>
        {c.articleCount} pieces · {c.expertCount} experts
      </span>
    </div>
  );
}

function ResultArticle({ a }) {
  return (
    <div>
      <div className="vp-mono" style={{ fontSize: 10, color: 'var(--stone-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Article
      </div>
      <h3 className="vp-serif" style={{ fontSize: 18, fontWeight: 500, color: 'var(--stone-900)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
        {a.title}
      </h3>
      <p className="vp-sans" style={{ fontSize: 14, color: 'var(--stone-700)', lineHeight: 1.5, marginTop: 6 }}>{a.dek}</p>
      <div className="vp-mono" style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 10, letterSpacing: '0.01em' }}>
        {a.section} {a.subsection ? `· ${a.subsection}` : ''} · {fmtDate(a.date)} · {fmt(a.passers)} passers · {a.experts} expert {a.experts === 1 ? 'response' : 'responses'} · {a.pinned} pinned · {a.daysAlive}d alive
      </div>
      {a.cluster && (
        <div className="vp-sans" style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 6 }}>
          in cluster: <span className="vp-link" style={{ color: 'var(--stone-700)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{a.cluster}</span>
        </div>
      )}
      <div className="vp-mono" style={{ fontSize: 11, color: a.passed ? 'var(--stone-500)' : 'var(--stone-400)', marginTop: 8 }}>
        {a.passed ? `discussion: ${fmt(a.passers)} participants — read` : `discussion: ${fmt(a.passers)} participants — pass the quiz to read`}
      </div>
    </div>
  );
}

function ResultCluster({ c }) {
  return (
    <div>
      <div className="vp-mono" style={{ fontSize: 10, color: 'var(--teal-900)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Story Cluster
      </div>
      <h3 className="vp-serif" style={{ fontSize: 18, fontWeight: 500, color: 'var(--stone-900)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
        {c.name}
      </h3>
      <p className="vp-sans" style={{ fontSize: 14, color: 'var(--stone-700)', lineHeight: 1.5, marginTop: 6 }}>{c.summary}</p>
      <div className="vp-mono" style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 10 }}>
        {c.articleCount} articles · {c.expertCount} experts · {c.daysAlive}d alive {c.recentVelocity > 0.7 ? '· active' : ''}
      </div>
    </div>
  );
}

function ResultExpert({ e }) {
  return (
    <div>
      <div className="vp-mono" style={{ fontSize: 10, color: 'var(--teal-900)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Expert response · {e.expertDomain}
      </div>
      <div className="vp-serif" style={{ fontSize: 16, fontWeight: 500, color: 'var(--stone-900)', letterSpacing: '-0.005em' }}>
        {e.expertName}
      </div>
      <p className="vp-serif" style={{ fontSize: 15, color: 'var(--stone-700)', lineHeight: 1.5, marginTop: 6, fontStyle: 'italic' }}>
        "{e.preview}"
      </p>
      <div className="vp-sans" style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 8 }}>
        on: <span className="vp-link" style={{ color: 'var(--stone-700)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{e.articleTitle}</span>
      </div>
    </div>
  );
}

function ResultPinned({ p }) {
  return (
    <div>
      <div className="vp-mono" style={{ fontSize: 10, color: 'var(--teal-900)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Pinned context
      </div>
      <p className="vp-serif" style={{ fontSize: 15, color: 'var(--stone-800)', lineHeight: 1.5, fontStyle: 'italic' }}>{p.preview}</p>
      <div className="vp-sans" style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 8 }}>
        pinned on: <span className="vp-link" style={{ color: 'var(--stone-700)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{p.articleTitle}</span>
      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';

export default function VerityMobile() {
  const [section, setSection] = useState({ cat: 'home', sub: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Scroll page to top on mount so phone is fully visible
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const nav = [
    { id: 'home', label: 'Home', subs: [] },
    { id: 'politics', label: 'Politics', subs: ['Congress', 'Supreme Court', 'Executive', 'Foreign Policy', 'Campaigns'] },
    { id: 'world', label: 'World', subs: ['Americas', 'Europe', 'Asia', 'Africa', 'Middle East'] },
    { id: 'science', label: 'Science', subs: ['Climate', 'Space', 'Health', 'Biology', 'Physics'] },
    { id: 'tech', label: 'Technology', subs: ['AI', 'Policy', 'Startups', 'Security', 'Internet'] },
    { id: 'economy', label: 'Economy', subs: ['Markets', 'Labor', 'Housing', 'Trade', 'Federal Reserve'] },
    { id: 'culture', label: 'Culture', subs: ['Books', 'Film', 'Music', 'Art', 'Television'] },
    { id: 'sports', label: 'Sports', subs: ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'College'] },
    { id: 'local', label: 'Local', subs: ['Buxton', 'Portland', 'Maine', 'New England'] },
    { id: 'following', label: 'Following', subs: ['Appropriations 2026', 'Supreme Court Term', 'Mexico Election'] },
  ];

  const currentCat = nav.find(n => n.id === section.cat);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .v-display { font-family: 'Fraunces', Georgia, 'Times New Roman', serif; font-optical-sizing: auto; font-variation-settings: "SOFT" 50, "WONK" 0; }
        .v-ui { font-family: 'Geist', system-ui, -apple-system, sans-serif; font-feature-settings: "ss01", "cv11"; }
        .v-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes vfadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vsheetup { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .v-fade { animation: vfadein 200ms ease-out; }
        .v-sheet { animation: vsheetup 320ms cubic-bezier(0.2, 0, 0, 1); }
        .v-rule { background-image: linear-gradient(to right, transparent, rgba(0,0,0,0.15) 20%, rgba(0,0,0,0.15) 80%, transparent); }
        .v-scroll::-webkit-scrollbar { display: none; }
        .v-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .v-phone-shell {
          background: #1c1917;
          padding: 12px;
          border-radius: 48px;
          box-shadow: 0 30px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.4);
        }
        .v-phone-screen {
          border-radius: 38px;
          overflow: hidden;
          position: relative;
          background: #fafaf9;
        }
      `}</style>

      <div className="v-ui min-h-screen bg-stone-200 flex items-start justify-center pt-6 pb-10 px-4">
        <div className="v-phone-shell">
          <div className="v-phone-screen" style={{ width: 390, height: 800 }}>

            <div className="absolute top-0 left-0 right-0 h-11 px-7 flex items-center justify-between text-stone-900 z-50 pointer-events-none">
              <span className="v-mono text-[14px] font-semibold tabular-nums">9:41</span>
              <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-32 h-7 bg-stone-900 rounded-full" />
              <div className="flex items-center gap-1.5 v-mono text-[11px]">
                <span>•••</span>
                <span>100</span>
              </div>
            </div>

            <header className="absolute top-11 left-0 right-0 h-12 px-5 flex items-center bg-stone-50/95 backdrop-blur-sm border-b border-stone-200/60 z-40">
              <span className="v-display text-[16px] font-semibold tracking-tight text-stone-900 lowercase">verity post</span>
              <button
                onClick={() => setMenuOpen(true)}
                className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-1 py-1 active:opacity-60 transition-opacity"
              >
                <span className="v-display text-[16px] font-semibold tracking-tight text-stone-900">
                  {section.sub || currentCat.label}
                </span>
                <span className="v-display text-[13px] text-stone-400 leading-none mt-1">▾</span>
              </button>
            </header>

            {/* CONTENT SURFACE */}
            <div className="absolute top-[92px] bottom-0 left-0 right-0">
            </div>

            {menuOpen && (
              <>
                <div
                  className="absolute inset-0 z-50 bg-stone-900/40 v-fade"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute bottom-0 left-0 right-0 z-50 v-sheet bg-stone-50 rounded-t-[28px] flex flex-col" style={{ maxHeight: '85%' }}>
                  <div className="pt-2 pb-1 flex justify-center">
                    <div className="w-9 h-1 rounded-full bg-stone-300" />
                  </div>

                  <div className="px-6 pt-3 pb-4 flex items-center justify-between">
                    <span className="v-display text-[20px] font-semibold tracking-tight text-stone-900">Sections</span>
                    <button
                      onClick={() => setMenuOpen(false)}
                      className="text-[12.5px] uppercase tracking-[0.12em] text-stone-500 font-medium active:text-stone-900"
                    >
                      Done
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto v-scroll px-6 pb-8">
                    <button
                      onClick={() => setSearchOpen(!searchOpen)}
                      className={`block w-full text-left text-[12px] uppercase tracking-[0.18em] font-medium transition-colors mb-5 pb-5 border-b border-stone-200/80 ${searchOpen ? 'text-stone-900' : 'text-stone-500 active:text-stone-900'}`}
                    >
                      Search
                    </button>

                    {nav.map((cat, i) => {
                      const catActive = section.cat === cat.id && !section.sub;
                      return (
                        <div key={cat.id} className={i > 0 ? 'mt-5 pt-5 border-t border-stone-200/60' : ''}>
                          <button
                            onClick={() => { setSection({ cat: cat.id, sub: null }); setMenuOpen(false); }}
                            className="w-full text-left active:opacity-60"
                          >
                            <div className="flex items-baseline gap-2">
                              <span className={`v-display text-[22px] tracking-tight ${catActive ? 'font-semibold text-stone-900' : 'font-medium text-stone-900'}`}>
                                {cat.label}
                              </span>
                              {catActive && (
                                <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500">current</span>
                              )}
                            </div>
                          </button>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                            {cat.subs.map(sub => {
                              const subActive = section.cat === cat.id && section.sub === sub;
                              return (
                                <button
                                  key={sub}
                                  onClick={() => { setSection({ cat: cat.id, sub }); setMenuOpen(false); }}
                                  className={`text-[14px] active:opacity-60 ${subActive ? 'text-stone-900 font-medium' : 'text-stone-500'}`}
                                >
                                  {sub}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {searchOpen && (
                      <div className="mt-8 pt-6 border-t border-stone-200/80 v-fade">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[12px] uppercase tracking-[0.18em] text-stone-700 font-medium">Advanced</span>
                          <button
                            onClick={() => setSearchOpen(false)}
                            className="text-[11px] uppercase tracking-[0.16em] text-stone-400 font-medium active:text-stone-900"
                          >
                            Close
                          </button>
                        </div>
                        <div className="h-48" />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-stone-900 rounded-full pointer-events-none" />

          </div>
        </div>
      </div>
    </>
  );
}