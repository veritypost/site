'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const CATEGORIES = ['All', 'Transactional', 'Onboarding', 'Marketing', 'Retention'];

export default function EmailTemplatesAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [catFilter, setCatFilter] = useState('All');
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editPreview, setEditPreview] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);

      if (!profile || !['owner', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      const { data } = await supabase
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true });

      setTemplates(data || []);
      setLoading(false);
    }
    init();
  }, []);

  const filtered = templates.filter(t => catFilter === 'All' || t.category === catFilter);
  const sel = selected ? templates.find(t => t.id === selected) : null;

  const startEdit = () => {
    if (!sel) return;
    setEditSubject(sel.subject || '');
    setEditPreview(sel.body_text || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    const updates = {
      subject: editSubject,
      body_text: editPreview,
    };
    const { error } = await supabase.from('email_templates').update(updates).eq('id', selected);
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === selected ? { ...t, ...updates } : t));
    }
    setEditing(false);
  };

  const toggleStatus = async (id) => {
    const tmpl = templates.find(t => t.id === id);
    if (!tmpl) return;
    const nextActive = !tmpl.is_active;
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'email_template.toggle',
      p_target_table: 'email_templates',
      p_target_id: id,
      p_reason: null,
      p_old_value: { is_active: !!tmpl.is_active },
      p_new_value: { is_active: nextActive },
    });
    if (auditErr) { alert(`Audit log write failed: ${auditErr.message}`); return; }
    const { error } = await supabase.from('email_templates').update({ is_active: nextActive }).eq('id', id);
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: nextActive } : t));
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex' }}>
      {/* List */}
      <div style={{ width: 340, borderRight: `1px solid ${C.border}`, flexShrink: 0, height: '100vh', overflowY: 'auto', position: 'sticky', top: 0 }}>
        <div style={{ padding: '16px 14px 8px' }}>
          <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px', letterSpacing: '-0.02em' }}>Email Templates</h1>
          <p style={{ fontSize: 11, color: C.dim, margin: '0 0 10px' }}>{templates.length} templates | Sent via Resend</p>
          <div style={{ display: 'flex', gap: 3, marginBottom: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCatFilter(c)} style={{
                padding: '4px 8px', borderRadius: 4, border: 'none', fontSize: 9, fontWeight: catFilter === c ? 700 : 500,
                background: catFilter === c ? C.white : 'transparent', color: catFilter === c ? C.bg : C.dim, cursor: 'pointer',
              }}>{c}</button>
            ))}
          </div>
        </div>
        <div>
          {filtered.map(t => {
            const lastEdited = t.last_edited || t.lastEdited || t.updated_at?.split('T')[0] || '';
            return (
              <button key={t.id} onClick={() => { setSelected(t.id); setEditing(false); }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                borderLeft: `2px solid ${selected === t.id ? C.white : 'transparent'}`,
                background: selected === t.id ? C.card : 'transparent', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: selected === t.id ? C.white : C.soft }}>{t.name}</span>
                  <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: t.is_active ? C.success + '18' : C.muted + '18', color: t.is_active ? C.success : C.muted, fontWeight: 600 }}>{t.is_active ? 'active' : 'disabled'}</span>
                </div>
                <div style={{ fontSize: 9, color: C.muted }}>{t.category} | Last edited {lastEdited}</div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: C.dim, fontSize: 11 }}>No templates found</div>
          )}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, padding: '24px 28px 80px', maxWidth: 700 }}>
        {sel ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{sel.name}</h2>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                  {sel.category} | Last edited {sel.last_edited || sel.lastEdited || sel.updated_at?.split('T')[0] || ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => toggleStatus(sel.id)} style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${sel.is_active ? C.danger + '44' : C.success + '44'}`, background: 'none', color: sel.is_active ? C.danger : C.success, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {sel.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>

            {/* Subject */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', marginBottom: 4 }}>Subject Line</div>
              {editing ? (
                <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.accent}44`, background: C.card, color: C.white, fontSize: 14, outline: 'none' }} />
              ) : (
                <div style={{ padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontWeight: 500 }}>{sel.subject}</div>
              )}
            </div>

            {/* Body preview */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', marginBottom: 4 }}>Body Preview</div>
              {editing ? (
                <textarea value={editPreview} onChange={e => setEditPreview(e.target.value)} rows={6}
                  style={{ width: '100%', padding: '12px', borderRadius: 8, border: `1px solid ${C.accent}44`, background: C.card, color: C.white, fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.6 }} />
              ) : (
                <div style={{ padding: '16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, lineHeight: 1.6, color: C.soft }}>{sel.body_text}</div>
              )}
            </div>

            {/* Variables */}
            {sel.variables && sel.variables.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', marginBottom: 6 }}>Available Variables</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {sel.variables.map(v => (
                    <span key={v} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: C.accent + '12', border: `1px solid ${C.accent}22`, color: C.accent, fontFamily: 'monospace' }}>{v}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Edit / Save */}
            <div style={{ display: 'flex', gap: 8 }}>
              {editing ? (
                <>
                  <button onClick={saveEdit} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: C.success, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save Changes</button>
                  <button onClick={() => setEditing(false)} style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </>
              ) : (
                <button onClick={startEdit} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: C.white, color: C.bg, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit Template</button>
              )}
            </div>

            {/* Info */}
            <div style={{ marginTop: 20, padding: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 11, color: C.dim }}>
              Backend fetches this template, populates variables from user/story data, and sends via Resend. Changes apply immediately without a code deploy.
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>Select a template</div>
            <div style={{ fontSize: 13 }}>Choose a template to preview and edit</div>
          </div>
        )}
      </div>
    </div>
  );
}
