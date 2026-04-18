'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import Avatar from '../../components/Avatar';
import StatRow from '../../components/StatRow';
import VerifiedBadge from '../../components/VerifiedBadge';
import { useToast } from '../../components/Toast';
import PermissionGate from '../../components/PermissionGate';
import { useCapabilities } from '../../components/PermissionsProvider';
import { PERM, SECTIONS } from '../../lib/permissionKeys';
import { TIERS } from '../../lib/plans';

function titleCase(s) {
  if (!s || typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function UpgradeBanner({ title, body, ctaLabel, ctaHref }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 12, marginBottom: 20,
      border: '1px solid var(--border)', background: 'var(--card)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.4 }}>{body}</div>
      </div>
      <a href={ctaHref} style={{
        padding: '9px 14px', borderRadius: 8, background: 'var(--accent)',
        color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
      }}>{ctaLabel}</a>
    </div>
  );
}

const TABS = ['Activity', 'Categories', 'Achievements', 'Kids'];

// Achievement group labels. `achievements.category` is lowercase in the
// seed (`reading`, `quiz`, `streak`, `category`, `score`, `secret`,
// `social`). Map to display labels so the group heading doesn't read as
// "reading" / "quiz" etc.
const ACHIEVEMENT_GROUP_LABELS = {
  reading: 'Reading',
  quiz: 'Quizzes',
  streak: 'Streaks',
  category: 'Category',
  score: 'Score',
  secret: 'Hidden',
  social: 'Social',
};

// Category-level milestone thresholds. Four metrics tracked per category
// via get_user_category_metrics RPC: reads, quizzes passed, comments,
// upvotes received.
const CAT_THRESHOLDS = { reads: 50, quizzes: 30, comments: 20, upvotes: 50 };

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MilestoneCard({ category, subcatNames, catStats }) {
  const stat = catStats || { reads: 0, quizzes: 0, comments: 0, upvotes: 0, score: 0 };

  return (
    <a
      href={`/profile/category/${category.id}`}
      style={{
        display: 'block', borderRadius: 12,
        border: '1px solid var(--border)', background: 'var(--card)',
        overflow: 'hidden', textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>{category.name}</div>
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>Score {stat.score.toLocaleString()}</div>
        </div>
        <StatRow label="Reads" value={stat.reads} total={CAT_THRESHOLDS.reads} />
        <StatRow label="Quizzes" value={stat.quizzes} total={CAT_THRESHOLDS.quizzes} />
        <StatRow label="Comments" value={stat.comments} total={CAT_THRESHOLDS.comments} />
        <StatRow label="Upvotes" value={stat.upvotes} total={CAT_THRESHOLDS.upvotes} />

        {subcatNames.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--dim)' }}>
            {subcatNames.length} subcategories — tap to view
          </div>
        )}
      </div>
    </a>
  );
}

function AchievementGroup({ group }) {
  const earned = group.items.filter(a => a.earnedAt).length;
  const total = group.items.length;
  const label = ACHIEVEMENT_GROUP_LABELS[group.group] || titleCase(group.group);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--dim)' }}>{earned}/{total}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {group.items.map(a => (
          <div key={a.name} style={{
            padding: 14, borderRadius: 10,
            border: '1px solid var(--border)',
            background: a.earnedAt ? 'var(--card)' : '#ffffff',
            opacity: a.earnedAt ? 1 : 0.5,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>{a.name}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>{a.description}</div>
            </div>
            {a.earnedAt ? (
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--success)', whiteSpace: 'nowrap', marginLeft: 12 }}>Earned {timeAgo(a.earnedAt)}</div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--dim)', whiteSpace: 'nowrap', marginLeft: 12 }}>Locked</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const explicitTab = searchParams?.get('tab');
  const initialTab = TABS.includes(explicitTab) ? explicitTab : null;
  const mobileShowSection = TABS.includes(explicitTab);

  const [authUserId, setAuthUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [canKids, setCanKids] = useState(false);
  const [canExpertQueue, setCanExpertQueue] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [loggingOut, setLoggingOut] = useState(false);

  const [activity, setActivity] = useState([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  const [quizzes, setQuizzes] = useState([]);
  const [quizzesLoaded, setQuizzesLoaded] = useState(false);

  const [categories, setCategories] = useState([]);
  const [milestoneStats, setMilestoneStats] = useState({ cat: {} });
  const [milestonesLoaded, setMilestonesLoaded] = useState(false);

  const [achievements, setAchievements] = useState([]);
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);

  const [kids, setKids] = useState([]);
  const [kidsLoaded, setKidsLoaded] = useState(false);

  const { get: getProfileCap } = useCapabilities(SECTIONS.PROFILE);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      setAuthUserId(authUser.id);

      const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, avatar_color, is_verified_public_figure, verity_score, streak_current, streak_best, quizzes_completed_count, articles_read_count, comment_count, plan_status, email_verified, created_at, metadata, frozen_at, plans(name, tier)')
        .eq('id', authUser.id)
        .maybeSingle();

      if (data) setUser(data);

      const { data: ur } = await supabase.from('user_roles').select('roles(name)').eq('user_id', authUser.id);
      const rn = (ur || []).map(r => r.roles?.name).filter(Boolean);
      setUser(prev => prev ? { ...prev, _roles: rn } : prev);

      const [{ data: kidsAllowed }, { data: expertAllowed }] = await Promise.all([
        supabase.rpc('has_permission', { p_key: PERM.PROFILE_KIDS }),
        supabase.rpc('has_permission', { p_key: PERM.PROFILE_EXPERT_QUEUE }),
      ]);
      setCanKids(!!kidsAllowed);
      setCanExpertQueue(!!expertAllowed);

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!authUserId) return;

    if (tab === 'Activity' && !activityLoaded) loadActivity();
    if (tab === 'Quizzes' && !quizzesLoaded) loadQuizzes();
    if (tab === 'Categories' && !milestonesLoaded) loadMilestones();
    if (tab === 'Achievements' && !achievementsLoaded) loadAchievements();
    if (tab === 'Kids' && !kidsLoaded) loadKids();

    async function loadActivity() {
      // v2: quiz_attempts has per-answer rows — group client-side by
      // (article_id, attempt_number) to get "X/5 on [Title]".
      const [reads, quizzesRes, commentsRes] = await Promise.all([
        supabase.from('reading_log').select('id, created_at, completed, articles(title, slug)').eq('user_id', authUserId).order('created_at', { ascending: false }).limit(50),
        supabase.from('quiz_attempts').select('id, article_id, attempt_number, is_correct, created_at, articles(title, slug)').eq('user_id', authUserId).is('kid_profile_id', null).order('created_at', { ascending: false }).limit(200),
        supabase.from('comments').select('id, body, created_at, articles(title, slug)').eq('user_id', authUserId).order('created_at', { ascending: false }).limit(50),
      ]);

      const items = [];
      (reads.data || []).forEach(r => items.push({
        id: 'r-' + r.id, type: 'Read', color: 'var(--accent)',
        title: r.articles?.title || 'Untitled', slug: r.articles?.slug, time: r.created_at,
      }));

      // Group quiz answers by (article_id, attempt_number) → one item per attempt.
      const grouped = {};
      for (const row of quizzesRes.data || []) {
        const key = `${row.article_id}:${row.attempt_number}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: 'q-' + row.article_id + '-' + row.attempt_number,
            title: row.articles?.title || 'Untitled',
            slug: row.articles?.slug,
            time: row.created_at,
            correct: 0, total: 0,
          };
        }
        grouped[key].total++;
        if (row.is_correct) grouped[key].correct++;
      }
      for (const g of Object.values(grouped)) {
        items.push({
          id: g.id, type: `Quiz ${g.correct}/${g.total}`, color: 'var(--accent)',
          title: g.title, slug: g.slug, time: g.time,
        });
      }

      (commentsRes.data || []).forEach(c => items.push({
        id: 'c-' + c.id, type: 'Comment', color: 'var(--right)',
        title: c.articles?.title || 'Untitled', slug: c.articles?.slug, time: c.created_at,
      }));
      items.sort((a, b) => new Date(b.time) - new Date(a.time));
      setActivity(items);
      setActivityLoaded(true);
    }

    async function loadQuizzes() {
      // v2: per-answer rows grouped to per-attempt summaries.
      const { data } = await supabase
        .from('quiz_attempts')
        .select('id, article_id, attempt_number, is_correct, created_at, articles(title, slug)')
        .eq('user_id', authUserId)
        .is('kid_profile_id', null)
        .order('created_at', { ascending: false });
      const grouped = {};
      for (const row of data || []) {
        const key = `${row.article_id}:${row.attempt_number}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: row.id,
            title: row.articles?.title, slug: row.articles?.slug,
            score: 0, total: 0, passed: false, created_at: row.created_at,
          };
        }
        grouped[key].total++;
        if (row.is_correct) grouped[key].score++;
      }
      const list = Object.values(grouped).map(g => ({ ...g, passed: g.score >= 3 }));
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setQuizzes(list);
      setQuizzesLoaded(true);
    }

    async function loadMilestones() {
      // Adult profile shows adult categories only (D9/D12). Kids-only
      // categories carry a `kids-` slug prefix per the seed; filter them
      // out here for symmetry with the adult home feed.
      const [{ data: catRows }, { data: metricRows }] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, slug, sort_order, metadata, parent_id')
          .eq('is_active', true)
          .is('parent_id', null)
          .not('slug', 'like', 'kids-%')
          .order('sort_order'),
        supabase.rpc('get_user_category_metrics', { p_user_id: authUserId, p_category_id: null }),
      ]);

      const byCat = {};
      for (const row of metricRows || []) {
        byCat[row.category_id] = {
          score: row.score || 0,
          reads: row.reads || 0,
          quizzes: row.quizzes_passed || 0,
          comments: row.comments || 0,
          upvotes: row.upvotes_received || 0,
        };
      }

      setCategories(catRows || []);
      setMilestoneStats({ cat: byCat });
      setMilestonesLoaded(true);
    }


    async function loadAchievements() {
      // Load all active achievements + which ones this user has earned.
      const [{ data: allAch }, { data: earned }] = await Promise.all([
        supabase.from('achievements')
          .select('id, key, name, description, category, rarity, points_reward')
          .eq('is_active', true)
          .eq('is_secret', false)
          .order('category').order('points_reward'),
        supabase.from('user_achievements')
          .select('achievement_id, earned_at')
          .eq('user_id', authUserId)
          .is('kid_profile_id', null),
      ]);

      const earnedMap = {};
      for (const e of earned || []) {
        earnedMap[e.achievement_id] = e.earned_at;
      }

      // Group by the `category` column on the achievements table.
      const byGroup = {};
      for (const a of allAch || []) {
        const group = a.category || 'General';
        if (!byGroup[group]) byGroup[group] = [];
        byGroup[group].push({
          name: a.name,
          description: a.description,
          earnedAt: earnedMap[a.id] || null,
        });
      }

      const grouped = Object.entries(byGroup).map(([group, items]) => ({ group, items }));
      setAchievements(grouped);
      setAchievementsLoaded(true);
    }

    async function loadKids() {
      const { data } = await supabase
        .from('kid_profiles')
        .select('*')
        .eq('parent_user_id', authUserId);
      setKids(data || []);
      setKidsLoaded(true);
    }
  }, [tab, authUserId]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error(`logout failed: ${res.status}`);
      window.location.href = '/login';
    } catch (err) {
      console.error('logout failed', err);
      setLoggingOut(false);
      // Fall back to /logout which also clears the local session as a safety net.
      window.location.href = '/logout';
    }
  };

  if (loading) {
    return (
      <div className="vp-dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--dim)', fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="vp-dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{
          maxWidth: 420, width: '100%', padding: '32px 28px', borderRadius: 14,
          border: '1px solid var(--border)', background: 'var(--card)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>
            Sign in to Verity Post
          </div>
          <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 24, lineHeight: 1.5 }}>
            Create an account or log in to see your profile, track your reading, and join the conversation.
          </div>
          <a href="/signup" style={{
            display: 'block', padding: '12px', borderRadius: 10, marginBottom: 10,
            background: 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>Sign up</a>
          <a href="/login" style={{
            display: 'block', padding: '12px', borderRadius: 10,
            background: 'transparent', color: 'var(--white)',
            border: '1px solid var(--border)',
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>Log in</a>
        </div>
      </div>
    );
  }

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        {/* Profile header — only shown to verified users */}
        {user.email_verified && (
          <div style={{
            padding: '24px 20px', borderRadius: 14, marginBottom: 20,
            border: '1px solid var(--border)', background: 'var(--card)',
          }}>
            {/* Pass 17 / Task 140d: low-key frozen notice inline with the
              * profile card so the user sees their Verity Score stat in
              * context. The global AccountStateBanner covers the same state
              * at the top of every page. */}
            {user.frozen_at && (
              <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 12, lineHeight: 1.4 }}>
                Score frozen on {new Date(user.frozen_at).toLocaleDateString()}. Resubscribe to resume tracking progress.
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <Avatar user={user} size={56} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--white)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {user.username}
                  <VerifiedBadge user={user} size="lg" />
                </div>
                <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
                  {TIERS[user.plans?.tier]?.name || 'Free'} · Member since {memberSince}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {[
                { label: 'Verity Score', value: (user.verity_score || 0).toLocaleString() },
                { label: 'Day Streak', value: user.streak_current || 0 },
                { label: 'Articles Read', value: user.articles_read_count || 0 },
                { label: 'Comments', value: user.comment_count || 0 },
              ].map((stat, i) => (
                <div key={stat.label} style={{
                  padding: '10px 6px', textAlign: 'center', background: 'var(--bg)',
                  borderRight: i < 3 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>{stat.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section list or section content */}
        {!mobileShowSection && (() => {
          const isVerified = !!user.email_verified;
          const isPaid = !!user.plans?.tier && user.plans.tier !== 'free';

          // Profile Card is a D32 paid-tier feature. D10 invisible-gate:
          // free users don't see the link at all.
          const verifiedItems = isVerified ? [
            ...((isPaid) ? [{ label: 'Profile Card', desc: 'Your shareable profile card', href: '/profile/card' }] : []),
            { label: 'Activity', desc: 'Reading history, quizzes, and comments', href: '/profile?tab=Activity' },
            { label: 'Categories', desc: 'Progress across all categories', href: '/profile?tab=Categories' },
            { label: 'Achievements', desc: 'Badges and milestones', href: '/profile?tab=Achievements' },
          ] : [];

          const paidItems = (isVerified && isPaid) ? [
            { label: 'Bookmarks', desc: 'Saved articles and collections', href: '/bookmarks' },
            { label: 'Messages', desc: 'Conversations and inbox', href: '/messages' },
          ] : [];

          const roleItems = [
            ...(canExpertQueue ? [{ label: 'Expert Queue', desc: 'Questions from readers', href: '/expert-queue' }] : []),
            ...(canKids ? [{ label: 'Kids', desc: 'Kid profiles and activity', href: '/profile/kids' }] : []),
          ];

          const mainItems = [...verifiedItems, ...paidItems, ...roleItems];

          const groups = [
            ...(mainItems.length > 0 ? [{ items: mainItems }] : []),
            { heading: 'Help & Settings', items: [
              { label: 'Contact Us', desc: 'Get help or send feedback', href: '/profile/contact' },
              { label: 'Settings', desc: 'Profile, billing, security, privacy', href: '/profile/settings' },
            ]},
          ];

          return (
            <>
              {!isVerified && (
                <UpgradeBanner
                  title="Verify your email"
                  body="Unlock more of your profile and get the full Verity Post experience."
                  ctaLabel="Verify email"
                  ctaHref="/verify-email"
                />
              )}
              {isVerified && !isPaid && (
                <UpgradeBanner
                  title="Upgrade your plan"
                  body="Get the full experience and unlock everything Verity Post has to offer."
                  ctaLabel="See plans"
                  ctaHref="/profile/settings/billing"
                />
              )}
              {groups.map((group, gi) => (
                <div key={group.heading || gi} style={{ marginBottom: 20 }}>
                  {group.heading && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      {group.heading}
                    </div>
                  )}
                  {group.items.map(section => (
                    <a key={section.label} href={section.href} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', borderRadius: 10, marginBottom: 6,
                      border: '1px solid var(--border)', background: 'var(--card)',
                      textDecoration: 'none', color: 'inherit',
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>
                          {section.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{section.desc}</div>
                      </div>
                      <span style={{ fontSize: 16, color: 'var(--dim)' }}>›</span>
                    </a>
                  ))}
                </div>
              ))}
            </>
          );
        })()}

        {/* Back link + section content when navigated via ?tab= */}
        {mobileShowSection && (
          <div>
            <a href="/profile" style={{
              display: 'inline-block', fontSize: 13, fontWeight: 600,
              color: 'var(--dim)', textDecoration: 'none', marginBottom: 16,
            }}>← Back to profile</a>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: 'var(--white)' }}>{tab}</h2>
          </div>
        )}

        {/* Desktop: tab content */}
        {mobileShowSection && tab === 'Activity' && (
          <PermissionGate permission={PERM.PROFILE_ACTIVITY} section={SECTIONS.PROFILE}>
            <div>
              {!activityLoaded && <div style={{ color: 'var(--dim)', fontSize: 12, padding: 20, textAlign: 'center' }}>Loading...</div>}
              {activityLoaded && activity.length === 0 && (
                <div style={{ color: 'var(--dim)', fontSize: 12, padding: 20, textAlign: 'center' }}>No activity yet.</div>
              )}
              {activity.map(item => (
                <a key={item.id} href={item.slug ? `/story/${item.slug}` : '#'} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
                  borderBottom: '1px solid var(--rule)', textDecoration: 'none',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                    color: item.color, background: 'transparent',
                    border: `1px solid ${item.color}`, whiteSpace: 'nowrap',
                  }}>{item.type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--white)', fontWeight: 500 }}>{item.title}</div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--dim)', whiteSpace: 'nowrap' }}>{timeAgo(item.time)}</span>
                </a>
              ))}
            </div>
          </PermissionGate>
        )}

        {mobileShowSection && tab === 'Categories' && (
          <PermissionGate permission={PERM.PROFILE_CATEGORIES} section={SECTIONS.PROFILE}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!milestonesLoaded && <div style={{ color: 'var(--dim)', fontSize: 12, padding: 20, textAlign: 'center' }}>Loading...</div>}
              {milestonesLoaded && categories.length === 0 && (
                <div style={{ color: 'var(--dim)', fontSize: 12, padding: 20, textAlign: 'center' }}>No categories yet.</div>
              )}
              {milestonesLoaded && categories.map(cat => (
                <MilestoneCard
                  key={cat.id}
                  category={cat}
                  subcatNames={Array.isArray(cat.metadata?.subcategories) ? cat.metadata.subcategories : []}
                  catStats={milestoneStats.cat?.[cat.id]}
                />
              ))}
            </div>
          </PermissionGate>
        )}

        {mobileShowSection && tab === 'Achievements' && (
          <PermissionGate permission={PERM.PROFILE_ACHIEVEMENTS} section={SECTIONS.PROFILE}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!achievementsLoaded && <div style={{ color: 'var(--dim)', fontSize: 12, padding: 20, textAlign: 'center' }}>Loading...</div>}
              {achievementsLoaded && achievements.map(group => (
                <AchievementGroup key={group.group} group={group} />
              ))}
            </div>
          </PermissionGate>
        )}

        {mobileShowSection && tab === 'Kids' && (
          <PermissionGate permission={PERM.PROFILE_KIDS} section={SECTIONS.PROFILE}>
            <div>
              {!kidsLoaded && <div style={{ color: 'var(--dim)', fontSize: 12, padding: 20, textAlign: 'center' }}>Loading...</div>}
              {kidsLoaded && kids.length === 0 && (
                <div style={{ color: 'var(--dim)', fontSize: 12, padding: 20, textAlign: 'center' }}>No kid profiles yet.</div>
              )}
              {kids.map(k => (
                <div key={k.id} style={{
                  padding: 14, borderRadius: 10, marginBottom: 10,
                  border: '1px solid var(--border)', background: 'var(--card)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <Avatar user={{ avatar_color: k.avatar_color, username: k.display_name || k.name }} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>{k.display_name || k.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                      {k.age_tier ? `${k.age_tier} · ` : ''}{k.reading_level || '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PermissionGate>
        )}

        {/* Log out */}
        <button onClick={handleLogout} disabled={loggingOut} style={{
          marginTop: 32, width: '100%', padding: 12, borderRadius: 10,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--wrong)', fontSize: 13, fontWeight: 500,
          cursor: loggingOut ? 'default' : 'pointer', fontFamily: 'var(--font-sans)',
          opacity: loggingOut ? 0.6 : 1,
        }}>
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </div>
  );
}
