'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

function Sw({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <div style={{ width: 32, height: 18, borderRadius: 9, background: on ? C.accent : '#333', position: 'relative', transition: 'background 0.15s' }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: on ? '#fff' : '#666', position: 'absolute', top: 2, left: on ? 16 : 2, transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
      </div>
    </button>
  );
}

const numInputStyle = {
  width: 50, padding: '4px 6px', borderRadius: 4,
  border: `1px solid ${C.border}`, background: C.bg, color: C.white,
  fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none',
};

const TRANSPARENCY_KEYS = ['transparency_page', 'show_source_count', 'show_source_consensus', 'show_ai_label', 'show_correction_history', 'show_editorial_cost', 'show_user_counts', 'show_moderation_stats'];
const MONITORING_KEYS = ['sentry_enabled', 'vercel_analytics', 'db_backup_auto', 'uptime_monitoring', 'api_logging', 'anomaly_alerts'];

const TRANSPARENCY_SETTINGS = [
  { k: 'transparency_page', l: 'Public transparency page', desc: 'Show /transparency page with platform stats' },
  { k: 'show_source_count', l: 'Source count on articles', desc: 'Show "4 sources" in article meta' },
  { k: 'show_source_consensus', l: 'Source consensus indicator', desc: 'Show how many sources agree on key facts' },
  { k: 'show_ai_label', l: 'AI-generated label', desc: 'Label articles as AI-synthesized from wire sources' },
  { k: 'show_correction_history', l: 'Correction history', desc: 'Show when and what was corrected on updated stories' },
  { k: 'show_editorial_cost', l: 'Per-story AI cost', desc: 'Show AI generation cost on admin story view' },
  { k: 'show_user_counts', l: 'User statistics', desc: 'Show total users, active users on transparency page' },
  { k: 'show_moderation_stats', l: 'Moderation statistics', desc: 'Show reports resolved, comments moderated on transparency page' },
];

const MONITORING_SETTINGS = [
  { k: 'sentry_enabled', l: 'Sentry error tracking', desc: 'Track and alert on frontend/backend errors' },
  { k: 'vercel_analytics', l: 'Vercel Analytics', desc: 'Page load performance and Web Vitals' },
  { k: 'db_backup_auto', l: 'Automatic DB backups', desc: 'Daily automated database backups' },
  { k: 'uptime_monitoring', l: 'Uptime monitoring', desc: 'Alert if site goes down (external service)' },
  { k: 'api_logging', l: 'API call logging', desc: 'Log every AI API call with model, tokens, cost, latency' },
  { k: 'anomaly_alerts', l: 'Anomaly detection alerts', desc: 'Email when nightly anomaly scan finds suspicious activity' },
];

const RATE_LIMIT_DEFAULTS = [
  { endpoint: 'Comment posting', count: 1, window: 30, windowUnit: 'seconds', per: 'user', enabled: true, note: null },
  { endpoint: 'Quiz attempts', count: 10, window: 1, windowUnit: 'hours', per: 'user', enabled: true, note: 'per story' },
  { endpoint: 'Access code requests', count: 5, window: 5, windowUnit: 'minutes', per: 'IP', enabled: true, note: null },
  { endpoint: 'Username lookups', count: 10, window: 60, windowUnit: 'seconds', per: 'IP', enabled: true, note: null },
  { endpoint: 'Login attempts', count: 5, window: 5, windowUnit: 'minutes', per: 'IP', enabled: true, note: null },
  { endpoint: 'API general', count: 100, window: 1, windowUnit: 'minutes', per: 'user', enabled: true, note: null },
  { endpoint: 'Search queries', count: 30, window: 1, windowUnit: 'minutes', per: 'user', enabled: true, note: null },
  { endpoint: 'Upvotes', count: 60, window: 1, windowUnit: 'hours', per: 'user', enabled: true, note: null },
  { endpoint: 'Report submission', count: 5, window: 1, windowUnit: 'hours', per: 'user', enabled: true, note: null },
  { endpoint: 'Profile updates', count: 10, window: 1, windowUnit: 'hours', per: 'user', enabled: false, note: null },
];

export default function SystemAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('rate-limits');
  const [limits, setLimits] = useState(RATE_LIMIT_DEFAULTS);
  const [config, setConfig] = useState({});

  // Feed thresholds
  const [staleFeedHours, setStaleFeedHours] = useState(6);
  const [brokenFeedFailures, setBrokenFeedFailures] = useState(10);

  // Rate limit overrides
  const [whitelist, setWhitelist] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [whiteInput, setWhiteInput] = useState('');
  const [blackInput, setBlackInput] = useState('');

  // Audit trail
  const [auditLog, setAuditLog] = useState([]);
  const [auditFilter, setAuditFilter] = useState('all');

  useEffect(() => {
    async function init() {
      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      // Role check
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) {
        router.push('/');
        return;
      }

      // Load settings from Supabase
      const { data: settingsData } = await supabase
        .from('settings')
        .select('*');

      const settingsMap = {};
      (settingsData || []).forEach(s => { settingsMap[s.key] = s.value; });

      // Build config state from DB, falling back to defaults
      const defaultConfig = {};
      [...TRANSPARENCY_SETTINGS, ...MONITORING_SETTINGS].forEach(item => {
        const raw = settingsMap[item.k];
        defaultConfig[item.k] = raw !== undefined ? raw === 'true' || raw === true : false;
      });
      setConfig(defaultConfig);

      // Load numeric settings
      if (settingsMap['stale_feed_hours']) setStaleFeedHours(parseInt(settingsMap['stale_feed_hours']) || 6);
      if (settingsMap['broken_feed_failures']) setBrokenFeedFailures(parseInt(settingsMap['broken_feed_failures']) || 10);

      // Load rate limits from DB (if stored), otherwise keep defaults
      const { data: rateLimitsData } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('type', 'rate_limit');
      if (rateLimitsData && rateLimitsData.length > 0) {
        // Map DB rate limits over defaults by endpoint
        const dbMap = {};
        rateLimitsData.forEach(r => { dbMap[r.name] = r; });
        setLimits(prev => prev.map(l => {
          const db = dbMap[l.endpoint];
          if (db && db.metadata) {
            const m = typeof db.metadata === 'string' ? JSON.parse(db.metadata) : db.metadata;
            return { ...l, ...m, enabled: db.enabled ?? l.enabled };
          }
          return l;
        }));
      }

      // Load whitelist / blacklist from settings
      const wl = settingsMap['rate_limit_whitelist'];
      const bl = settingsMap['rate_limit_blacklist'];
      if (wl) setWhitelist(JSON.parse(wl));
      if (bl) setBlacklist(JSON.parse(bl));

      // Load admin audit trail (migration 055 — record_admin_action writes here)
      const { data: auditData } = await supabase
        .from('admin_audit_log')
        .select('id, action, target_table, target_id, reason, old_value, new_value, actor_user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      setAuditLog(auditData || []);

      setLoading(false);
    }
    init();
  }, []);

  const saveSetting = async (key, value) => {
    await supabase
      .from('settings')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
  };

  const toggleLimit = async (i) => {
    const next = limits.map((l, idx) => idx === i ? { ...l, enabled: !l.enabled } : l);
    setLimits(next);
    const l = next[i];
    await supabase
      .from('feature_flags')
      .upsert({ name: l.endpoint, type: 'rate_limit', enabled: l.enabled, metadata: { count: l.count, window: l.window, windowUnit: l.windowUnit, per: l.per, note: l.note } }, { onConflict: 'name' });
  };

  const updateLimitField = (i, field, value) => {
    setLimits(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const saveLimitChange = async (i) => {
    const l = limits[i];
    await supabase
      .from('feature_flags')
      .upsert({ name: l.endpoint, type: 'rate_limit', enabled: l.enabled, metadata: { count: l.count, window: l.window, windowUnit: l.windowUnit, per: l.per, note: l.note } }, { onConflict: 'name' });
  };

  const toggle = async (k) => {
    const newVal = !config[k];
    setConfig(prev => ({ ...prev, [k]: newVal }));
    await saveSetting(k, newVal);
  };

  const addToWhitelist = async () => {
    const val = whiteInput.trim();
    if (!val || whitelist.includes(val)) return;
    const next = [...whitelist, val];
    setWhitelist(next);
    setWhiteInput('');
    await saveSetting('rate_limit_whitelist', JSON.stringify(next));
  };

  const removeFromWhitelist = async (entry) => {
    const next = whitelist.filter(e => e !== entry);
    setWhitelist(next);
    await saveSetting('rate_limit_whitelist', JSON.stringify(next));
  };

  const addToBlacklist = async () => {
    const val = blackInput.trim();
    if (!val || blacklist.includes(val)) return;
    const next = [...blacklist, val];
    setBlacklist(next);
    setBlackInput('');
    await saveSetting('rate_limit_blacklist', JSON.stringify(next));
  };

  const removeFromBlacklist = async (entry) => {
    const next = blacklist.filter(e => e !== entry);
    setBlacklist(next);
    await saveSetting('rate_limit_blacklist', JSON.stringify(next));
  };

  const today = new Date().toISOString().slice(0, 10);
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const filteredAudit = auditLog.filter(e => {
    if (auditFilter === 'today') return e.created_at?.startsWith(today);
    if (auditFilter === 'week') return e.created_at >= oneWeekAgo;
    return true;
  });

  const renderGroup = (title, items) => (
    <div style={{ marginBottom: 20 }}>
      {title && <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <div key={item.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i === items.length - 1 ? 'none' : `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{item.l}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
            </div>
            <Sw on={!!config[item.k]} onClick={() => toggle(item.k)} />
          </div>
        ))}
      </div>
    </div>
  );

  const renderOverrideList = ({ title, color, entries, onRemove, inputVal, onInputChange, onAdd, placeholder }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
        {entries.length === 0 && (
          <div style={{ padding: '10px 14px', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>No entries</div>
        )}
        {entries.map((entry, i) => (
          <div key={entry} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ fontSize: 12, color: C.white, fontFamily: 'monospace' }}>{entry}</span>
            <button
              onClick={() => onRemove(entry)}
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, color: C.danger, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}
            >Remove</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={inputVal}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAdd()}
          placeholder={placeholder}
          style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 12, color: C.white, outline: 'none', fontFamily: 'monospace' }}
        />
        <button
          onClick={onAdd}
          style={{ background: color, border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
        >Add</button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 800, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 24, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>System & Infrastructure</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Rate limiting, transparency, monitoring, and infrastructure config</p>
      </div>

      {/* Owner-only permission banner */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { k: 'rate-limits', l: 'Rate Limits' },
          { k: 'transparency', l: 'Transparency' },
          { k: 'monitoring', l: 'Monitoring' },
          { k: 'audit', l: 'Audit Trail' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'rate-limits' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 2.4fr 0.5fr', gap: 8, padding: '7px 14px', borderBottom: `1px solid ${C.border}`, background: '#0d0d10', alignItems: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Endpoint</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Limit</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Active</div>
            </div>
            {limits.map((limit, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 2.4fr 0.5fr', gap: 8, padding: '10px 14px', borderBottom: i < limits.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{limit.endpoint}</div>
                  {limit.note && <div style={{ fontSize: 9, color: C.warn, marginTop: 2 }}>{limit.note}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={1}
                    value={limit.count}
                    onChange={e => updateLimitField(i, 'count', Math.max(1, parseInt(e.target.value) || 1))}
                    onBlur={() => saveLimitChange(i)}
                    style={numInputStyle}
                  />
                  <span style={{ fontSize: 11, color: C.dim }}>per</span>
                  <input
                    type="number"
                    min={1}
                    value={limit.window}
                    onChange={e => updateLimitField(i, 'window', Math.max(1, parseInt(e.target.value) || 1))}
                    onBlur={() => saveLimitChange(i)}
                    style={numInputStyle}
                  />
                  <select
                    value={limit.windowUnit}
                    onChange={e => {
                      updateLimitField(i, 'windowUnit', e.target.value);
                      saveLimitChange(i);
                    }}
                    style={{
                      padding: '4px 6px', borderRadius: 4,
                      border: `1px solid ${C.border}`, background: C.bg, color: C.white,
                      fontSize: 11, fontWeight: 600, outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                  </select>
                  <span style={{ fontSize: 11, color: C.dim }}>per</span>
                  <span style={{ fontSize: 11, color: limit.per === 'IP' ? C.warn : C.accent, fontWeight: 600 }}>{limit.per}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Sw on={limit.enabled} onClick={() => toggleLimit(i)} />
                </div>
              </div>
            ))}
          </div>

          {/* Feed thresholds */}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 14 }}>Feed Health Thresholds</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>Stale feed threshold</div>
                <div style={{ fontSize: 10, color: C.muted }}>Mark feed as stale after this many hours without new content</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  value={staleFeedHours}
                  onChange={e => setStaleFeedHours(Math.max(1, parseInt(e.target.value) || 1))}
                  onBlur={() => saveSetting('stale_feed_hours', staleFeedHours)}
                  style={numInputStyle}
                />
                <span style={{ fontSize: 11, color: C.dim }}>hours</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>Broken feed threshold</div>
                <div style={{ fontSize: 10, color: C.muted }}>Mark feed as broken after this many consecutive failures</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  value={brokenFeedFailures}
                  onChange={e => setBrokenFeedFailures(Math.max(1, parseInt(e.target.value) || 1))}
                  onBlur={() => saveSetting('broken_feed_failures', brokenFeedFailures)}
                  style={numInputStyle}
                />
                <span style={{ fontSize: 11, color: C.dim }}>failures</span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 14 }}>Rate Limit Overrides</div>

          {renderOverrideList({
            title: 'Whitelist \u2014 bypass rate limits',
            color: C.success,
            entries: whitelist,
            onRemove: removeFromWhitelist,
            inputVal: whiteInput,
            onInputChange: setWhiteInput,
            onAdd: addToWhitelist,
            placeholder: 'username or IP address',
          })}

          {renderOverrideList({
            title: 'Blacklist \u2014 stricter limits',
            color: C.danger,
            entries: blacklist,
            onRemove: removeFromBlacklist,
            inputVal: blackInput,
            onInputChange: setBlackInput,
            onAdd: addToBlacklist,
            placeholder: 'username or IP address',
          })}
        </div>
      )}

      {tab === 'transparency' && renderGroup(null, TRANSPARENCY_SETTINGS)}
      {tab === 'monitoring' && renderGroup(null, MONITORING_SETTINGS)}

      {tab === 'audit' && (
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {[{ k: 'all', l: 'All' }, { k: 'today', l: 'Today' }, { k: 'week', l: 'This Week' }].map(f => (
              <button key={f.k} onClick={() => setAuditFilter(f.k)} style={{
                padding: '5px 14px', borderRadius: 6, border: `1px solid ${auditFilter === f.k ? C.accent : C.border}`,
                fontSize: 11, fontWeight: auditFilter === f.k ? 700 : 400,
                background: auditFilter === f.k ? 'rgba(129,140,248,0.12)' : 'transparent',
                color: auditFilter === f.k ? C.accent : C.dim, cursor: 'pointer',
              }}>{f.l}</button>
            ))}
          </div>

          {filteredAudit.length === 0 ? (
            <div style={{ padding: '20px 0', fontSize: 12, color: C.dim, textAlign: 'center' }}>No entries for this period</div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.4fr', gap: 8, padding: '7px 14px', borderBottom: `1px solid ${C.border}`, background: '#0d0d10' }}>
                {['Setting', 'Before', 'After', 'By', 'Time'].map(h => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                ))}
              </div>
              {filteredAudit.map((entry, i) => (
                <div key={entry.id || i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.4fr', gap: 8, padding: '9px 14px', borderBottom: i < filteredAudit.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.white, fontFamily: 'monospace', wordBreak: 'break-all' }}>{entry.action}</div>
                  <div style={{ fontSize: 11, color: C.danger, fontFamily: 'monospace', wordBreak: 'break-all' }}>{entry.old_value != null ? JSON.stringify(entry.old_value) : '—'}</div>
                  <div style={{ fontSize: 11, color: C.success, fontFamily: 'monospace', wordBreak: 'break-all' }}>{entry.new_value != null ? JSON.stringify(entry.new_value) : '—'}</div>
                  <div style={{ fontSize: 11, color: C.soft, fontFamily: 'monospace' }}>{entry.actor_user_id ? entry.actor_user_id.slice(0, 8) : '—'}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
