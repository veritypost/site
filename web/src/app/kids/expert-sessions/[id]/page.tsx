// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import { KID } from '@/lib/kidTheme';
import EmptyState from '@/components/kids/EmptyState';
import AskAGrownUp from '@/components/kids/AskAGrownUp';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

const ACTIVE_KID_KEY = 'vp_active_kid_id';

type ExpertUser = { username?: string | null; display_name?: string | null; expert_title?: string | null };
type SessionRow = Tables<'kid_expert_sessions'> & {
  users?: ExpertUser | null;
  categories?: { name?: string | null } | null;
};
type KidChip = Pick<Tables<'kid_profiles'>, 'id' | 'display_name' | 'avatar_color'>;
type QuestionRow = Tables<'kid_expert_questions'> & {
  kid_profiles?: { display_name?: string | null } | null;
};

export default function KidExpertSession() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [kids, setKids] = useState<KidChip[]>([]);
  const [activeKid, setActiveKid] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(ACTIVE_KID_KEY) || null; } catch { return null; }
  });
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [draft, setDraft] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [flash, setFlash] = useState<string>('');
  const [canJoin, setCanJoin] = useState<boolean>(true);
  const [canAsk, setCanAsk] = useState<boolean>(true);
  const [permsLoaded, setPermsLoaded] = useState<boolean>(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    await refreshAllPermissions();
    await refreshIfStale();
    const join = hasPermission('kids.expert.join_live');
    const ask = hasPermission('kids.expert.ask_question');
    setCanJoin(join);
    setCanAsk(ask);
    setPermsLoaded(true);
    if (!join) {
      setLoading(false);
      return;
    }
    const [
      { data: sess },
      { data: myKids },
      questionsRes,
    ] = await Promise.all([
      supabase.from('kid_expert_sessions').select('*, users!fk_kid_expert_sessions_expert_id(username, display_name, expert_title), categories(name)').eq('id', id).maybeSingle(),
      supabase.from('kid_profiles').select('id, display_name, avatar_color').eq('parent_user_id', user.id).eq('is_active', true).is('paused_at', null),
      fetch(`/api/expert-sessions/${id}/questions`).then((r) => r.ok ? r.json() : { questions: [] }).catch(() => ({ questions: [] })),
    ]);
    setSession(sess as SessionRow | null);
    setKids((myKids || []) as KidChip[]);
    if (!activeKid && (myKids || []).length > 0) setActiveKid((myKids as KidChip[])[0].id);
    setQuestions(Array.isArray(questionsRes?.questions) ? (questionsRes.questions as QuestionRow[]) : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  async function submit() {
    const text = draft.trim();
    if (!text || !activeKid) return;
    const res = await fetch(`/api/expert-sessions/${id}/questions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kid_profile_id: activeKid, question_text: text }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Send failed'); return; }
    setFlash('Question sent — the expert will answer if it fits the session.');
    setDraft('');
    load();
  }

  if (loading) {
    return (
      <div style={{ minHeight: 'calc(100dvh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: KID.font.sub, color: KID.dim }}>One sec…</div>
      </div>
    );
  }
  if (permsLoaded && !canJoin) {
    return (
      <div style={{ padding: '48px 16px' }}>
        <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto' }}>
          <AskAGrownUp
            reason="locked"
            body="Expert sessions aren\u2019t available on this account yet."
            action={{ href: '/kids', label: 'Back home' }}
          />
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div style={{ padding: '48px 16px' }}>
        <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto' }}>
          <EmptyState
            icon="mic"
            title="Session not found"
            body="The expert window may have been moved or cancelled."
            action={{ href: '/kids/expert-sessions', label: 'All sessions' }}
          />
        </div>
      </div>
    );
  }

  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + (session.duration_minutes || 30) * 60000);
  const now = Date.now();
  const isLive = now >= start.getTime() && now <= end.getTime();
  const isFuture = now < start.getTime();

  const approvedAnswered = questions.filter((q) => q.is_approved || q.answer_text);

  return (
    <div>
      <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto', padding: `${KID.space.cardPad}px 16px 80px` }}>
        <a
          href="/kids/expert-sessions"
          style={{
            display: 'inline-block', fontSize: KID.font.sub,
            color: KID.dim, textDecoration: 'none',
            padding: '8px 0', fontWeight: KID.weight.bold,
          }}
        >&larr; All sessions</a>

        <div style={{ marginTop: 8, marginBottom: KID.space.sectionGap }}>
          <h1 style={{
            fontSize: KID.font.h1, fontWeight: KID.weight.extra,
            color: KID.text, margin: '0 0 6px',
            letterSpacing: KID.tracking.tight, lineHeight: KID.leading.heading,
          }}>{session.title}</h1>
          <div style={{ fontSize: KID.font.sub, color: KID.dim }}>
            With {session.users?.display_name || session.users?.username}
            {session.users?.expert_title ? ` · ${session.users.expert_title}` : ''} · {start.toLocaleString()}
          </div>
          {session.description && (
            <p style={{
              fontSize: KID.font.body, color: KID.text,
              marginTop: 10, lineHeight: KID.leading.body,
            }}>{session.description}</p>
          )}
        </div>

        {error && (
          <div style={{
            background: KID.dangerSoft, border: `1px solid ${KID.danger}`,
            borderRadius: KID.radius.card, padding: 12,
            color: KID.danger, fontSize: KID.font.sub, marginBottom: KID.space.rowGap,
          }}>{error}</div>
        )}
        {flash && (
          <div style={{
            background: KID.successSoft, border: `1px solid ${KID.success}`,
            borderRadius: KID.radius.card, padding: 12,
            color: KID.success, fontSize: KID.font.sub, fontWeight: KID.weight.bold,
            marginBottom: KID.space.rowGap,
          }}>{flash}</div>
        )}

        {isLive && canAsk && kids.length > 0 ? (
          <div style={{
            background: KID.card, border: `2px solid ${KID.accent}`,
            borderRadius: KID.radius.card, padding: KID.space.cardPad,
            marginBottom: KID.space.sectionGap,
          }}>
            <div style={{
              fontSize: KID.font.label, fontWeight: KID.weight.bold,
              color: KID.dim, textTransform: 'uppercase',
              letterSpacing: KID.tracking.loose, marginBottom: 10,
            }}>Ask as</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {kids.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setActiveKid(k.id)}
                  style={{
                    minHeight: 44,
                    padding: '8px 16px', borderRadius: KID.radius.chip,
                    border: `1.5px solid ${activeKid === k.id ? KID.accent : KID.border}`,
                    background: activeKid === k.id ? KID.accent : KID.card,
                    color: activeKid === k.id ? KID.onAccent : KID.text,
                    fontSize: KID.font.sub, fontWeight: KID.weight.bold,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{k.display_name}</button>
              ))}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Your question…"
              style={{
                width: '100%', padding: 12,
                borderRadius: KID.radius.button,
                border: `1px solid ${KID.border}`,
                fontSize: KID.font.body, lineHeight: KID.leading.body,
                color: KID.text, background: KID.card,
                outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={submit}
              disabled={!draft.trim() || !activeKid}
              style={{
                marginTop: 10,
                minHeight: KID.space.hitMin, padding: '0 20px',
                borderRadius: KID.radius.button, border: 'none',
                background: (draft.trim() && activeKid) ? KID.accent : KID.cardAlt,
                color: (draft.trim() && activeKid) ? KID.onAccent : KID.dim,
                fontSize: KID.font.sub, fontWeight: KID.weight.bold,
                cursor: (draft.trim() && activeKid) ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >Send question</button>
          </div>
        ) : isFuture ? (
          <div style={{
            background: KID.warnSoft, border: `1px solid ${KID.warn}`,
            color: KID.warnInk, fontSize: KID.font.sub, padding: 14,
            borderRadius: KID.radius.card, marginBottom: KID.space.sectionGap,
          }}>
            This session hasn&apos;t started yet. Come back at {start.toLocaleTimeString()}.
          </div>
        ) : (
          <div style={{
            background: KID.cardAlt, border: `1px solid ${KID.border}`,
            color: KID.dim, fontSize: KID.font.sub, padding: 14,
            borderRadius: KID.radius.card, marginBottom: KID.space.sectionGap,
          }}>
            Session has ended. Answered questions are below.
          </div>
        )}

        <div style={{
          fontSize: KID.font.label, fontWeight: KID.weight.bold,
          color: KID.dim, textTransform: 'uppercase',
          letterSpacing: KID.tracking.loose, margin: '0 0 10px',
        }}>Questions &amp; answers</div>
        {approvedAnswered.length === 0 ? (
          <EmptyState
            icon="lightbulb"
            tone="accent"
            title="No approved questions yet"
            body="When kids ask and the expert approves, their questions land here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
            {approvedAnswered.map((q) => (
              <div key={q.id} style={{
                background: KID.card, border: `1px solid ${KID.border}`,
                borderRadius: KID.radius.card, padding: KID.space.cardPad,
              }}>
                <div style={{
                  fontSize: KID.font.label, fontWeight: KID.weight.bold,
                  color: KID.dim, textTransform: 'uppercase',
                  letterSpacing: KID.tracking.loose, marginBottom: 6,
                }}>
                  {(() => {
                    const ownFamily = kids.some((k) => k.id === q.kid_profile_id);
                    if (q.kid_profile_id === activeKid) return 'You asked';
                    if (ownFamily) return `${q.kid_profiles?.display_name || 'Kid'} asked`;
                    return 'A kid asked';
                  })()}
                </div>
                <div style={{
                  fontSize: KID.font.body, color: KID.text,
                  lineHeight: KID.leading.body, marginBottom: q.answer_text ? 10 : 0,
                }}>{q.question_text}</div>
                {q.answer_text ? (
                  <div style={{
                    background: KID.successSoft, border: `1px solid ${KID.success}`,
                    borderRadius: KID.radius.button, padding: 12,
                  }}>
                    <div style={{
                      fontSize: KID.font.label, color: KID.success,
                      fontWeight: KID.weight.bold, textTransform: 'uppercase',
                      letterSpacing: KID.tracking.loose, marginBottom: 4,
                    }}>Expert answer</div>
                    <div style={{ fontSize: KID.font.body, color: KID.text, lineHeight: KID.leading.body }}>
                      {q.answer_text}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: KID.font.label, color: KID.dim, marginTop: 6 }}>
                    Waiting for an answer…
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
