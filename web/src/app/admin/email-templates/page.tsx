'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Drawer from '@/components/admin/Drawer';
import Modal from '@/components/admin/Modal';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type EmailTemplate = Tables<'email_templates'>;

// Source of truth: `web/src/app/api/cron/send-emails/route.js` TYPE_TO_TEMPLATE.
// Only templates whose `key` is in this set are eligible to render + send.
// Every other row in `email_templates` is parked UI: editable copy, no
// delivery wired. Mirror this constant in the cron when types are added.
const ACTIVE_TEMPLATE_KEYS = new Set<string>([
  'data_export_ready',
  'kid_trial_expired',
  'expert_reverification_due',
]);

type TabKey = 'active' | 'inactive';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 720px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return isMobile;
}

function EmailTemplatesInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();
  const isMobile = useIsMobile();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('active');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles!fk_user_roles_role_id(name)').eq('user_id', user.id);
      const roleNames = (
        (userRoles || []) as Array<{ roles: { name: string | null } | null }>
      )
        .map((r) => r.roles?.name)
        .filter((n): n is string => typeof n === 'string');
      if (!profile || !roleNames.some((r) => ADMIN_ROLES.has(r))) { router.push('/'); return; }

      const { data, error: tErr } = await supabase
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true });
      if (tErr) { setLoadError(tErr.message); setTemplates([]); }
      else setTemplates((data || []) as EmailTemplate[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isWiredForDelivery = (t: EmailTemplate) => !!t.key && ACTIVE_TEMPLATE_KEYS.has(t.key);

  const activeTemplates = templates.filter(isWiredForDelivery);
  const inactiveTemplates = templates.filter((t) => !isWiredForDelivery(t));

  const visible = (tab === 'active' ? activeTemplates : inactiveTemplates).filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(q) ||
      t.key?.toLowerCase().includes(q) ||
      t.subject?.toLowerCase().includes(q)
    );
  });

  const selected = selectedId ? templates.find((t) => t.id === selectedId) || null : null;
  const selectedIsActive = selected ? isWiredForDelivery(selected) : false;

  const openTemplate = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setEditing(false);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditSubject(selected.subject || '');
    setEditBody(selected.body_text || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updates = { subject: editSubject, body_text: editBody };
      const res = await fetch(`/api/admin/email-templates/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { push({ message: `Save failed: ${json.error || 'unknown error'}`, variant: 'danger' }); return; }
      setTemplates((prev) => prev.map((t) => t.id === selected.id ? { ...t, ...updates } as EmailTemplate : t));
      push({ message: 'Template saved', variant: 'success' });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const toggleStatus = async (id: string) => {
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl) return;
    const nextActive = !tmpl.is_active;
    // Optimistic
    setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, is_active: nextActive } : t));
    const res = await fetch(`/api/admin/email-templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextActive }),
    });
    if (!res.ok) {
      setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, is_active: tmpl.is_active } : t));
      const json = await res.json().catch(() => ({ error: 'toggle failed' }));
      push({ message: `Toggle failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    push({ message: nextActive ? 'Template enabled' : 'Template disabled', variant: 'success' });
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  const detailBody = selected ? (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[4], flexWrap: 'wrap' }}>
        <Badge variant={selectedIsActive ? 'success' : 'neutral'} dot size="sm">
          {selectedIsActive ? 'Active — sends to users' : 'Inactive — no delivery wired'}
        </Badge>
        <span style={{ fontSize: F.xs, color: C.dim, fontFamily: 'monospace' }}>{selected.key}</span>
      </div>

      {!selectedIsActive && (
        <div style={{
          marginBottom: S[4], padding: S[3], background: C.card, border: `1px solid ${C.divider}`,
          borderRadius: 8, fontSize: F.sm, color: C.dim, lineHeight: 1.5,
        }}>
          This template is parked. Editing the copy is safe, but no cron currently sends it. Kept here for UI parity so the rendered subject + body don&apos;t need to be reconstructed when delivery wires up.
        </div>
      )}

      <div style={{ marginBottom: S[4] }}>
        <label style={lblStyle}>Subject line</label>
        {editing ? (
          <TextInput value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
        ) : (
          <div style={{ padding: S[3], background: C.card, border: `1px solid ${C.divider}`, borderRadius: 8, fontSize: F.md, fontWeight: 500 }}>
            {selected.subject}
          </div>
        )}
      </div>

      <div style={{ marginBottom: S[4] }}>
        <label style={lblStyle}>Body</label>
        {editing ? (
          <Textarea rows={10} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
        ) : (
          <div style={{ padding: S[3], background: C.card, border: `1px solid ${C.divider}`, borderRadius: 8, fontSize: F.base, lineHeight: 1.6, color: C.soft, whiteSpace: 'pre-wrap' }}>
            {selected.body_text}
          </div>
        )}
      </div>

      {Array.isArray(selected.variables) && selected.variables.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          <label style={lblStyle}>Available variables</label>
          <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
            {(selected.variables as string[]).map((v) => (
              <code key={v} style={{
                fontSize: F.xs, padding: `2px ${S[2]}px`, borderRadius: 4,
                background: C.card, border: `1px solid ${C.divider}`, color: C.soft,
              }}>{v}</code>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: S[4], padding: S[3], background: C.card, border: `1px solid ${C.divider}`,
        borderRadius: 8, fontSize: F.sm, color: C.dim, lineHeight: 1.5,
      }}>
        {selectedIsActive
          ? 'The send-emails cron fetches this template, populates variables from user + story data, and sends via Resend. Edits apply immediately without a deploy.'
          : 'No cron path includes this key. Edits save to the row and persist, but the template never reaches a user until delivery is wired.'}
      </div>
    </div>
  ) : null;

  const detailFooter = selected ? (
    <div style={{ display: 'flex', gap: S[2], width: '100%', justifyContent: 'space-between' }}>
      {selectedIsActive ? (
        <Button variant="ghost" onClick={() => toggleStatus(selected.id)}>
          {selected.is_active ? 'Pause sending' : 'Resume sending'}
        </Button>
      ) : (
        <span />
      )}
      <div style={{ display: 'flex', gap: S[2] }}>
        {editing ? (
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveEdit}>Save</Button>
          </>
        ) : (
          <Button variant="primary" onClick={startEdit}>Edit template</Button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <Page>
      <PageHeader
        title="Email templates"
        subtitle={`${activeTemplates.length} active · ${inactiveTemplates.length} inactive · delivered via Resend`}
        actions={
          <div style={{ display: 'flex', gap: S[1] }}>
            {([
              { key: 'active', label: `Active (${activeTemplates.length})` },
              { key: 'inactive', label: `Inactive (${inactiveTemplates.length})` },
            ] as Array<{ key: TabKey; label: string }>).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: `${S[1]}px ${S[3]}px`, borderRadius: 6,
                  border: `1px solid ${tab === t.key ? C.accent : C.divider}`,
                  background: tab === t.key ? C.hover : 'transparent',
                  color: tab === t.key ? C.white : C.soft,
                  fontSize: F.sm, fontWeight: tab === t.key ? 600 : 500,
                  cursor: 'pointer', font: 'inherit',
                }}
              >{t.label}</button>
            ))}
          </div>
        }
      />

      <div style={{
        marginBottom: S[3], padding: S[2], borderRadius: 6,
        background: C.card, border: `1px solid ${C.divider}`,
        fontSize: F.xs, color: C.dim, lineHeight: 1.5,
      }}>
        {tab === 'active'
          ? 'Active — sends to users. The send-emails cron picks these up on its schedule and dispatches via Resend.'
          : 'Not currently sending — UI parity for when delivery wires up. Editing the copy persists to the row but no cron will deliver it.'}
      </div>

      {loadError && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>
          Failed to load templates: {loadError}
        </div>
      )}

      <div style={{ marginBottom: S[4] }}>
        <TextInput type="search" placeholder="Search templates by name, key, or subject" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <PageSection>
        {visible.length === 0 ? (
          <EmptyState
            title={tab === 'active' ? 'No active templates match' : 'No inactive templates match'}
            description={search ? 'Adjust the search.' : tab === 'active' ? 'No templates are currently wired for delivery.' : 'Every template is currently wired for delivery.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            {visible.map((t) => {
              const isSel = selectedId === t.id;
              const wired = isWiredForDelivery(t);
              return (
                <button
                  key={t.id}
                  onClick={() => openTemplate(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: S[3], textAlign: 'left',
                    padding: `${S[2]}px ${S[3]}px`, borderRadius: 8,
                    border: `1px solid ${isSel ? C.accent : C.divider}`,
                    background: isSel ? C.hover : C.bg,
                    cursor: 'pointer', font: 'inherit', color: C.white,
                    transition: 'background 90ms ease, border-color 90ms ease',
                  }}
                  onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = C.hover; }}
                  onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = C.bg; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: 2, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: F.base, fontWeight: 600, color: C.white }}>{t.name}</span>
                      {wired ? (
                        <>
                          <Badge size="xs" variant="success">active</Badge>
                          {!t.is_active && <Badge size="xs" variant="neutral">paused</Badge>}
                        </>
                      ) : (
                        <Badge size="xs" variant="neutral">inactive — no delivery wired</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: F.xs, color: C.dim, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.key}
                    </div>
                  </div>
                  <span style={{ fontSize: F.xs, color: C.muted }}>
                    {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </PageSection>

      {/* Mobile: full-screen modal. Desktop: right drawer. */}
      {isMobile ? (
        <Modal
          open={detailOpen && !!selected}
          onClose={closeDetail}
          title={selected?.name}
          width="lg"
          dirty={editing}
          dirtyMessage="Discard unsaved changes?"
          footer={detailFooter}
        >
          {detailBody}
        </Modal>
      ) : (
        <Drawer
          open={detailOpen && !!selected}
          onClose={closeDetail}
          title={selected?.name}
          width="lg"
          dirty={editing}
          footer={detailFooter}
        >
          {detailBody}
        </Drawer>
      )}
    </Page>
  );
}

const lblStyle: React.CSSProperties = {
  display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
  color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function EmailTemplatesAdmin() {
  return (
    <EmailTemplatesInner />
  );
}
