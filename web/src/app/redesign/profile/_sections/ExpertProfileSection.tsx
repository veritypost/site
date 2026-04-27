// Expert profile — credentials, areas, status, vacation toggle. Inline.
// Reads expert_applications + expert_application_categories; writes via
// the existing /api/expert/apply + /api/expert/vacation endpoints.

'use client';

import { useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import { Card } from '../../_components/Card';
import { buttonPrimaryStyle, buttonSecondaryStyle, textareaStyle } from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { SkeletonBlock } from '../../_components/Skeleton';
import { C, F, FONT, R, S } from '../../_lib/palette';
import { ExpertApplyForm } from './ExpertApplyForm';

interface Application {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | string;
  application_type: string | null;
  credentials: string | null;
  rejection_reason: string | null;
  vacation_until: string | null;
}

interface CategoryRef {
  id: string;
  name: string;
}

interface Props {
  preview: boolean;
}

export function ExpertProfileSection({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [app, setApp] = useState<Application | null>(null);
  const [areas, setAreas] = useState<CategoryRef[]>([]);
  const [credentialsDraft, setCredentialsDraft] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [savingVacation, setSavingVacation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: appRow } = await supabase
        .from('expert_applications')
        .select('id, status, application_type, credentials, rejection_reason, vacation_until')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const a = (appRow ?? null) as Application | null;
      setApp(a);
      setCredentialsDraft(a?.credentials ?? '');
      if (a?.id) {
        const { data: catRows } = await supabase
          .from('expert_application_categories')
          .select('categories(id, name)')
          .eq('application_id', a.id);
        if (cancelled) return;
        const list = ((catRows ?? []) as Array<{ categories: CategoryRef | null }>)
          .map((r) => r.categories)
          .filter((c): c is CategoryRef => !!c);
        setAreas(list);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase]);

  const saveCreds = async () => {
    if (preview) {
      toast.info('Sign in to update your credentials.');
      return;
    }
    setSavingCreds(true);
    try {
      const res = await fetch('/api/expert/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: credentialsDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Save failed.');
      }
      toast.success('Credentials updated.');
      setApp((a) => (a ? { ...a, credentials: credentialsDraft } : a));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingCreds(false);
    }
  };

  const toggleVacation = async () => {
    if (preview) {
      toast.info('Sign in to toggle vacation.');
      return;
    }
    if (!app) return;
    const onVacation = !!app.vacation_until && Date.parse(app.vacation_until) > Date.now();
    const next = onVacation ? null : new Date(Date.now() + 14 * 86400_000).toISOString();
    setSavingVacation(true);
    try {
      const res = await fetch('/api/expert/vacation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacation_until: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Could not update vacation.');
      }
      toast.success(onVacation ? 'Welcome back.' : 'Vacation on for 14 days.');
      setApp((a) => (a ? { ...a, vacation_until: next } : a));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update vacation.');
    } finally {
      setSavingVacation(false);
    }
  };

  if (loading) return <SkeletonBlock height={140} />;

  if (!app) {
    return (
      <ExpertApplyForm
        preview={preview}
        onSubmitted={() => {
          // Refresh the section so the freshly-created application
          // shows in its under-review state without leaving the panel.
          setLoading(true);
          setApp({
            id: 'pending-local',
            status: 'pending',
            application_type: null,
            credentials: null,
            rejection_reason: null,
            vacation_until: null,
          });
          setLoading(false);
        }}
      />
    );
  }

  const onVacation = !!app.vacation_until && Date.parse(app.vacation_until) > Date.now();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: S[3],
            fontFamily: FONT.sans,
          }}
        >
          <div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>
              APPLICATION STATUS
            </div>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: F.xl,
                fontWeight: 600,
                color: C.ink,
                marginTop: 2,
              }}
            >
              {statusLabel(app.status)}
            </div>
            {app.status === 'rejected' && app.rejection_reason ? (
              <div style={{ fontSize: F.sm, color: C.danger, marginTop: S[1] }}>
                {app.rejection_reason}
              </div>
            ) : null}
          </div>
          <span
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              borderRadius: 999,
              fontSize: F.xs,
              fontWeight: 600,
              background: statusBg(app.status),
              color: statusInk(app.status),
              border: `1px solid ${statusInk(app.status)}`,
            }}
          >
            {app.status}
          </span>
        </div>
      </Card>

      <Card
        title="Verified areas"
        description="The categories your badge applies to. Add or remove via re-application."
      >
        {areas.length === 0 ? (
          <p style={{ margin: 0, fontSize: F.sm, color: C.inkMuted }}>
            No categories assigned yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
            {areas.map((a) => (
              <span
                key={a.id}
                style={{
                  padding: `${S[1]}px ${S[3]}px`,
                  background: C.expertSoft,
                  color: C.expert,
                  border: `1px solid ${C.expert}`,
                  borderRadius: 999,
                  fontSize: F.sm,
                  fontWeight: 600,
                }}
              >
                {a.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Credentials"
        description="Public bio shown next to your expert badge. Editable any time."
        footer={
          <button
            type="button"
            onClick={saveCreds}
            disabled={savingCreds || credentialsDraft === (app.credentials ?? '')}
            style={{
              ...buttonPrimaryStyle,
              opacity: savingCreds || credentialsDraft === (app.credentials ?? '') ? 0.55 : 1,
              cursor:
                savingCreds || credentialsDraft === (app.credentials ?? '')
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {savingCreds ? 'Saving…' : 'Save credentials'}
          </button>
        }
      >
        <textarea
          value={credentialsDraft}
          onChange={(e) => setCredentialsDraft(e.target.value)}
          maxLength={600}
          style={{ ...textareaStyle, minHeight: 100 }}
        />
      </Card>

      <Card
        title="Vacation"
        description="Pause new questions when you're not available to answer. Auto-clears in 14 days; toggle off any time."
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: S[3],
            padding: S[3],
            background: onVacation ? C.warnSoft : C.surfaceSunken,
            border: `1px solid ${onVacation ? C.warn : C.border}`,
            borderRadius: R.md,
            fontFamily: FONT.sans,
          }}
        >
          <div>
            <div style={{ fontSize: F.sm, fontWeight: 600, color: onVacation ? C.warn : C.ink }}>
              {onVacation ? 'On vacation' : 'Available'}
            </div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>
              {onVacation && app.vacation_until
                ? `Returns ${new Date(app.vacation_until).toLocaleDateString()}.`
                : 'New questions can be assigned to you.'}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleVacation}
            disabled={savingVacation}
            style={onVacation ? buttonSecondaryStyle : buttonPrimaryStyle}
          >
            {savingVacation ? '…' : onVacation ? 'End vacation' : 'Start vacation'}
          </button>
        </div>
      </Card>
    </div>
  );
}

function statusLabel(s: string) {
  if (s === 'approved') return 'Verified expert';
  if (s === 'pending') return 'Under review';
  if (s === 'rejected') return 'Application not approved';
  if (s === 'revoked') return 'Verification revoked';
  return s;
}
function statusBg(s: string) {
  if (s === 'approved') return C.successSoft;
  if (s === 'pending') return C.expertSoft;
  if (s === 'rejected' || s === 'revoked') return C.dangerSoft;
  return C.surfaceSunken;
}
function statusInk(s: string) {
  if (s === 'approved') return C.success;
  if (s === 'pending') return C.expert;
  if (s === 'rejected' || s === 'revoked') return C.danger;
  return C.inkMuted;
}
