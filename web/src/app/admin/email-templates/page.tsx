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
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type EmailTemplate = Tables<'email_templates'>;

const STATUS_FILTERS: Array<'All' | 'Active' | 'Disabled'> = ['All', 'Active', 'Disabled'];

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
  const [catFilter, setCatFilter] = useState<'All' | 'Active' | 'Disabled'>('All');
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

  const filtered = templates.filter((t) => {
    if (catFilter === 'Active' && !t.is_active) return false;
    if (catFilter === 'Disabled' && t.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(t.name?.toLowerCase().includes(q) || t.key?.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const selected = selectedId ? templates.find((t) => t.id === selectedId) || null : null;

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
        <Badge variant={selected.is_active ? 'success' : 'neutral'} dot size="sm">
          {selected.is_active ? 'Active' : 'Disabled'}
        </Badge>
        <span style={{ fontSize: F.xs, color: C.dim, fontFamily: 'monospace' }}>{selected.key}</span>
      </div>

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
        Backend fetches this template, populates variables from user + story data, and sends via Resend. Changes apply immediately without a deploy.
      </div>
    </div>
  ) : null;

  const detailFooter = selected ? (
    <div style={{ display: 'flex', gap: S[2], width: '100%', justifyContent: 'space-between' }}>
      <Button variant="ghost" onClick={() => toggleStatus(selected.id)}>
        {selected.is_active ? 'Disable' : 'Enable'}
      </Button>
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
        subtitle={`${templates.length} templates · delivered via Resend`}
        actions={
          <div style={{ display: 'flex', gap: S[1] }}>
            {STATUS_FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                style={{
                  padding: `${S[1]}px ${S[3]}px`, borderRadius: 6,
                  border: `1px solid ${catFilter === c ? C.accent : C.divider}`,
                  background: catFilter === c ? C.hover : 'transparent',
                  color: catFilter === c ? C.white : C.soft,
                  fontSize: F.sm, fontWeight: catFilter === c ? 600 : 500,
                  cursor: 'pointer', font: 'inherit',
                }}
              >{c}</button>
            ))}
          </div>
        }
      />

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
        {filtered.length === 0 ? (
          <EmptyState title="No templates match" description="Adjust the filter or search." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            {filtered.map((t) => {
              const isSel = selectedId === t.id;
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: 2 }}>
                      <span style={{ fontSize: F.base, fontWeight: 600, color: C.white }}>{t.name}</span>
                      <Badge size="xs" variant={t.is_active ? 'success' : 'neutral'}>
                        {t.is_active ? 'active' : 'disabled'}
                      </Badge>
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
    <ToastProvider>
      <EmailTemplatesInner />
    </ToastProvider>
  );
}
