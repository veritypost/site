'use client';

// Admin: mint owner-tier referral links + see all referral activity.
// Owner-tier = Pro granted immediately, no email-verify wait.
// User-tier = auto-minted per beta user; listed read-only here.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '@/lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import NumberInput from '@/components/admin/NumberInput';
import DatePicker from '@/components/admin/DatePicker';
import Toolbar from '@/components/admin/Toolbar';
import DataTable from '@/components/admin/DataTable';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import Field from '@/components/admin/Field';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { getSiteUrl } from '@/lib/siteUrl';
import type { Tables } from '@/types/database-helpers';

type Code = Tables<'access_codes'>;

function ReferralsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [codes, setCodes] = useState<Code[]>([]);
  const [tab, setTab] = useState<'owner' | 'user'>('owner');
  const [showMint, setShowMint] = useState(false);
  const [minting, setMinting] = useState(false);
  const [description, setDescription] = useState('');
  // Closed-beta defaults: 1-use, 7-day expiry. Admin can override.
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [lastMinted, setLastMinted] = useState<{ url: string; code: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: roles } = await supabase
        .from('user_roles').select('roles(name)').eq('user_id', user.id);
      const names = ((roles || []) as Array<{ roles: { name: string | null } | null }>)
        .map((r) => r.roles?.name).filter((n): n is string => typeof n === 'string');
      if (!names.some((n) => ADMIN_ROLES.has(n))) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const { data } = await supabase
      .from('access_codes')
      .select('*')
      .eq('type', 'referral')
      .order('created_at', { ascending: false });
    setCodes((data || []) as Code[]);
  }

  const ownerCodes = codes.filter((c) => c.tier === 'owner');
  const userCodes = codes.filter((c) => c.tier === 'user');
  const totalRedemptions = codes.reduce((sum, c) => sum + (c.current_uses || 0), 0);
  const ownerRedemptions = ownerCodes.reduce((sum, c) => sum + (c.current_uses || 0), 0);

  const mint = async () => {
    setMinting(true);
    try {
      const max = maxUses === '' ? null : parseInt(maxUses, 10);
      const res = await fetch('/api/admin/referrals/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim() || null,
          max_uses: max,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.code) {
        push({ message: json.error || 'Mint failed', variant: 'danger' });
        return;
      }
      push({ message: `Link minted: ${json.code}`, variant: 'success' });
      setLastMinted({ url: json.url, code: json.code });
      setDescription('');
      setMaxUses('');
      setExpiresAt('');
      await loadAll();
    } finally {
      setMinting(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      push({ message: 'URL copied', variant: 'success' });
    } catch {
      push({ message: 'Copy failed', variant: 'danger' });
    }
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading…
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const siteUrl = getSiteUrl();
  const cols = [
    {
      key: 'code', header: 'Code',
      render: (c: Code) => (
        <code style={{ fontSize: F.sm, fontWeight: 700, color: C.white, letterSpacing: '0.04em' }}>
          {c.code}
        </code>
      ),
    },
    {
      key: 'url', header: 'URL', sortable: false, truncate: true,
      render: (c: Code) => (
        <button
          type="button"
          onClick={() => copyUrl(`${siteUrl}/r/${c.code}`)}
          style={{
            background: 'transparent', border: 'none', color: C.accent,
            cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            fontSize: F.sm, textAlign: 'left',
          }}
        >
          {`${siteUrl}/r/${c.code}`}
        </button>
      ),
    },
    {
      key: 'description', header: 'Note', truncate: true,
      render: (c: Code) => c.description || <span style={{ color: C.muted }}>—</span>,
    },
    {
      key: 'tier', header: 'Tier',
      render: (c: Code) => (
        <Badge size="xs" variant={c.tier === 'owner' ? 'info' : 'neutral'}>
          {c.tier}
        </Badge>
      ),
    },
    {
      key: 'usage', header: 'Signups', align: 'right' as const,
      render: (c: Code) => {
        const u = c.current_uses || 0;
        return c.max_uses ? `${u} / ${c.max_uses}` : `${u}`;
      },
    },
    {
      key: 'expires_at', header: 'Expires',
      render: (c: Code) => c.expires_at
        ? new Date(c.expires_at).toLocaleDateString()
        : <span style={{ color: C.muted }}>Never</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (c: Code) => {
        const expired = c.expires_at && new Date(c.expires_at) < new Date();
        const disabled = !!c.disabled_at || !c.is_active;
        if (expired) return <Badge variant="danger" dot size="xs">Expired</Badge>;
        if (disabled) return <Badge variant="neutral" dot size="xs">Disabled</Badge>;
        return <Badge variant="success" dot size="xs">Active</Badge>;
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Referral links"
        subtitle="Owner-minted links: 1 use, 7-day default expiry, instant Pro. User-minted links: 2 per user, 1 use each, require email verification."
        actions={
          <Button variant="primary" onClick={() => { setShowMint(true); setLastMinted(null); }}>
            Mint owner link
          </Button>
        }
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: S[3], marginBottom: S[6],
      }}>
        <StatCard label="Owner links" value={ownerCodes.length} />
        <StatCard label="User links" value={userCodes.length} />
        <StatCard label="Total signups via referral" value={totalRedemptions} trend="up" />
        <StatCard label="Owner-link signups" value={ownerRedemptions} />
      </div>

      <Toolbar
        left={
          <div style={{ display: 'flex', gap: S[1] }}>
            {(['owner', 'user'] as const).map((t) => {
              const active = tab === t;
              const label = t === 'owner' ? 'Owner-minted' : 'User-minted';
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: `${S[1]}px ${S[3]}px`,
                    borderRadius: 6,
                    border: `1px solid ${active ? C.accent : C.divider}`,
                    background: active ? C.accent : C.bg,
                    color: active ? '#ffffff' : C.soft,
                    fontSize: F.sm, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{label}</button>
              );
            })}
          </div>
        }
      />

      <DataTable
        columns={cols}
        rows={tab === 'owner' ? ownerCodes : userCodes}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            title={tab === 'owner' ? 'No owner-minted links' : 'No user-minted links yet'}
            description={
              tab === 'owner'
                ? 'Mint your first link to invite seed users with instant Pro access.'
                : 'User-tier links auto-mint when a beta user verifies their email.'
            }
            cta={tab === 'owner'
              ? <Button variant="primary" onClick={() => { setShowMint(true); setLastMinted(null); }}>Mint owner link</Button>
              : null
            }
          />
        }
      />

      <Drawer
        open={showMint}
        onClose={() => { setShowMint(false); setLastMinted(null); }}
        title="Mint owner-tier referral link"
        description="The recipient gets Pro access immediately on signup, with no email-verification wall."
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowMint(false); setLastMinted(null); }}>
              Close
            </Button>
            <Button variant="primary" loading={minting} onClick={mint}>
              Mint link
            </Button>
          </>
        }
      >
        {lastMinted && (
          <div style={{
            padding: S[3], marginBottom: S[3], borderRadius: 8,
            background: 'rgba(16,185,129,0.1)', border: `1px solid #10b981`,
          }}>
            <div style={{ fontSize: F.xs, fontWeight: 700, color: '#10b981', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Last minted
            </div>
            <div style={{
              fontFamily: 'ui-monospace, monospace', fontSize: F.sm, color: C.white, marginBottom: 8,
              wordBreak: 'break-all',
            }}>
              {lastMinted.url}
            </div>
            <Button size="sm" variant="secondary" onClick={() => copyUrl(lastMinted.url)}>Copy URL</Button>
          </div>
        )}

        <Field label="Internal description (optional)">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Kara — beta partner Q2"
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S[3] }}>
          <Field label="Max uses (blank = ∞)">
            <NumberInput
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </Field>
          <Field label="Expires (optional)">
            <DatePicker
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        </div>
      </Drawer>
    </Page>
  );
}

export default function ReferralsAdmin() {
  return (
    <ToastProvider>
      <ReferralsInner />
    </ToastProvider>
  );
}
