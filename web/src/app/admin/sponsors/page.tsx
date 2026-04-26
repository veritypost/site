'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import DataTable from '@/components/admin/DataTable';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Sponsor = Tables<'sponsors'>;

type SponsorForm = Partial<Sponsor> & { id?: string };

type DestructiveState = {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  run: (ctx: { reason?: string }) => Promise<void>;
};

function SponsorsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  const [form, setForm] = useState<SponsorForm>({});
  const [error, setError] = useState('');
  const [destructive, setDestructive] = useState<DestructiveState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const ok = ((r || []) as Array<{ roles: { name: string | null } | null }>).some(
        (x) => !!x.roles?.name && ADMIN_ROLES.has(x.roles.name)
      );
      if (!ok) { router.push('/'); return; }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const res = await fetch('/api/admin/sponsors');
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSponsors(data.sponsors || []);
    else push({ message: data?.error || 'Failed to load sponsors', variant: 'danger' });
  }

  const startNew = () => {
    setForm({
      name: '', slug: '', description: '', logo_url: '',
      website_url: '', contact_email: '', billing_email: '',
    });
    setEditing('new');
  };
  const startEdit = (s: Sponsor) => { setForm({ ...s }); setEditing(s); };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const url = isNew ? '/api/admin/sponsors' : `/api/admin/sponsors/${(editing as Sponsor).id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || 'Save failed';
        setError(msg);
        push({ message: msg, variant: 'danger' });
        return;
      }
      push({ message: isNew ? 'Sponsor created' : 'Sponsor updated', variant: 'success' });
      setEditing(null);
      await load();
    } catch (err) {
      const msg = (err as Error)?.message || 'Save failed';
      setError(msg);
      push({ message: msg, variant: 'danger' });
    } finally { setSaving(false); }
  };

  const remove = (s: Sponsor) => {
    setDestructive({
      title: `Delete sponsor ${s.name}?`,
      message: 'This removes the sponsor record and its associations. Billing history in external systems is not affected.',
      confirmText: s.name,
      confirmLabel: 'Delete sponsor',
      reasonRequired: false,
      action: 'sponsor.delete',
      targetTable: 'sponsors',
      targetId: s.id,
      oldValue: {
        name: s.name, slug: s.slug,
        contact_email: s.contact_email, billing_email: s.billing_email,
        is_active: s.is_active, total_spend_cents: s.total_spend_cents,
      },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/sponsors/${s.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.error || 'Delete failed');
        }
        push({ message: 'Sponsor deleted', variant: 'success' });
        await load();
      },
    });
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading sponsors…
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const cols = [
    {
      key: 'name', header: 'Name', truncate: true,
      render: (r: Sponsor) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: F.xs, color: C.dim }}>/{r.slug}</div>
        </div>
      ),
    },
    {
      key: 'contact', header: 'Contact', sortable: false, truncate: true,
      render: (r: Sponsor) => r.contact_email || <span style={{ color: C.muted }}>—</span>,
    },
    {
      key: 'total_spend_cents', header: 'Spend', align: 'right' as const,
      render: (r: Sponsor) => `$${((r.total_spend_cents ?? 0) / 100).toFixed(2)}`,
    },
    {
      key: 'is_active', header: 'Status',
      render: (r: Sponsor) => (
        <Badge variant={r.is_active ? 'success' : 'neutral'} dot size="xs">
          {r.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: '', sortable: false, align: 'right' as const,
      render: (r: Sponsor) => (
        <div style={{ display: 'inline-flex', gap: S[1] }} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => remove(r)} style={{ color: C.danger }}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Sponsors"
        subtitle="Manage sponsor accounts, contact details, and billing references."
        actions={<Button variant="primary" onClick={startNew}>New sponsor</Button>}
      />

      {error && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>{error}</div>
      )}

      <PageSection>
        <DataTable
          columns={cols}
          rows={sponsors}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title="No sponsors yet"
              description="Create your first sponsor to track billing, placements, and campaigns."
              cta={<Button variant="primary" onClick={startNew}>New sponsor</Button>}
            />
          }
        />
      </PageSection>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New sponsor' : `Edit sponsor`}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>Save</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: S[3] }}>
          <LabeledField label="Name">
            <TextInput value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </LabeledField>
          <LabeledField label="Slug">
            <TextInput value={form.slug ?? ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </LabeledField>
          <LabeledField label="Logo URL">
            <TextInput value={form.logo_url ?? ''} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
          </LabeledField>
          <LabeledField label="Website">
            <TextInput value={form.website_url ?? ''} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
          </LabeledField>
          <LabeledField label="Contact email">
            <TextInput type="email" value={form.contact_email ?? ''} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </LabeledField>
          <LabeledField label="Billing email">
            <TextInput type="email" value={form.billing_email ?? ''} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} />
          </LabeledField>
          <LabeledField label="Description">
            <Textarea rows={3} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </LabeledField>
        </div>
      </Drawer>

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch { push({ message: 'Action failed. Please try again.', variant: 'danger' }); setDestructive(null); }
        }}
      />
    </Page>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
        color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</label>
      {children}
    </div>
  );
}

export default function SponsorsAdmin() {
  return (
    <ToastProvider>
      <SponsorsInner />
    </ToastProvider>
  );
}
