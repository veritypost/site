'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
};

const NAV = [
  { label: 'Profile', href: '/profile/settings/profile' },
  { label: 'Password', href: '/profile/settings/password' },
  { label: 'Email', href: '/profile/settings/emails' },
  { label: 'Feed Preferences', href: '/profile/settings/feed' },
  { label: 'Login Activity', href: '/profile/settings/login-activity' },
  { label: 'Billing', href: '/profile/settings/billing' },
  { label: 'Data & Privacy', href: '/profile/settings/data' },
];

function SettingsNav({ active }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <a href="/profile/settings" style={{ fontSize: 13, fontWeight: 600, color: '#666666', textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}>← Back to settings</a>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#111111' }}>{active}</h2>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 48, height: 28, borderRadius: 14, border: 'none',
      background: value ? C.accent : C.border,
      position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 22, height: 22, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }} />
    </button>
  );
}

export default function DataPrivacy() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: true,
    showActivity: true,
    showLeaderboard: false,
    allowMessages: false,
    dmReadReceiptsEnabled: true,
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setUserData(data);
        setPrivacySettings({
          profileVisibility: data.profile_visibility ?? true,
          showActivity: data.show_activity ?? true,
          showLeaderboard: data.show_leaderboard ?? false,
          allowMessages: data.allow_messages ?? false,
          dmReadReceiptsEnabled: data.dm_read_receipts_enabled ?? true,
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  const togglePrivacy = async (key) => {
    // Pass 17 / UJ-706: optimistic update with rollback. If the DB write
    // fails or the user has no session, revert the toggle and surface a
    // toast via the flashError-style pattern this page already uses.
    const previous = privacySettings[key];
    const newValue = !previous;
    setPrivacySettings(p => ({ ...p, [key]: newValue }));
    setSubmitError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired. Please sign in again.');

      const dbKey = {
        profileVisibility: 'profile_visibility',
        showActivity: 'show_activity',
        showLeaderboard: 'show_leaderboard',
        allowMessages: 'allow_messages',
        dmReadReceiptsEnabled: 'dm_read_receipts_enabled',
      }[key];

      const { error: updErr } = await supabase
        .from('users')
        .update({ [dbKey]: newValue })
        .eq('id', user.id);
      if (updErr) throw new Error(updErr.message);
    } catch (err) {
      setPrivacySettings(p => ({ ...p, [key]: previous }));
      setSubmitError(`Could not save preference: ${err.message}`);
    }
  };

  const handleRequestExport = async () => {
    setSubmitting(true);
    setSubmitError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitError('You need to be signed in to request an export.');
      setSubmitting(false);
      return;
    }
    // Insert a pending data_requests row so the server pipeline can
    // claim it: /admin/data-requests identity-verifies, the 15-min
    // process-data-exports cron assembles the bundle, data_export_ready
    // fires the email. Matches iOS SettingsView.requestExport shape.
    const { error } = await supabase.from('data_requests').insert({
      user_id: user.id,
      type: 'export',
    });
    if (error) {
      setSubmitError('Could not submit your request. Try again in a moment.');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setSubmitted(true);
  };

  const PRIVACY_ROWS = [
    { key: 'profileVisibility', label: 'Public Profile', desc: 'Allow anyone to view your profile, posts, and Verity Score stats.' },
    { key: 'showActivity', label: 'Show Activity Status', desc: 'Let others see when you were last active on Verity Post.' },
    { key: 'showLeaderboard', label: 'Appear on Leaderboard', desc: 'Show your username and score on the community Verity Score leaderboard.' },
    { key: 'allowMessages', label: 'Allow Messages from Strangers', desc: 'Let users who don\u2019t follow you send you direct messages.' },
    { key: 'dmReadReceiptsEnabled', label: 'DM Read Receipts', desc: 'Let senders see when you\u2019ve read their direct messages. Turn off to read without confirming.' },
  ];

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <SettingsNav active="Data & Privacy" />

        <main style={{  }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 24 }}>Data & Privacy</h2>

            {loading ? (
              <div style={{ color: C.dim, fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading privacy settings...</div>
            ) : (
              <>
                {/* Privacy settings */}
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, marginTop: 0 }}>Privacy Settings</h3>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
                  {PRIVACY_ROWS.map((row, i) => (
                    <div key={row.key} style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px',
                      borderBottom: i < PRIVACY_ROWS.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{row.label}</div>
                        <div style={{ fontSize: 13, color: C.dim, marginTop: 2, lineHeight: 1.5 }}>{row.desc}</div>
                      </div>
                      <Toggle value={privacySettings[row.key]} onChange={() => togglePrivacy(row.key)} />
                    </div>
                  ))}
                </div>

                {/* Request data export */}
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, marginTop: 0 }}>Your Data</h3>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Request a data export</div>
                  <p style={{ fontSize: 14, color: C.dim, margin: '0 0 16px', lineHeight: 1.6 }}>
                    Submit a request for a copy of your profile, comments, reading history, bookmarks, and preferences. We verify your identity, then email you a secure download link. GDPR and CCPA compliant.
                  </p>
                  {userData && (
                    <div style={{ fontSize: 13, color: C.dim, marginBottom: 16 }}>
                      Account created: {userData.created_at ? new Date(userData.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                    </div>
                  )}
                  {submitted ? (
                    <div style={{ padding: '12px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, fontSize: 13, color: '#065f46', lineHeight: 1.6 }}>
                      Your export request has been submitted. We&rsquo;ll email you a secure download link once it&rsquo;s ready (typically within a few days, up to 30 per GDPR).
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={handleRequestExport}
                        disabled={submitting}
                        style={{
                          padding: '10px 24px', borderRadius: 9, border: 'none',
                          background: C.accent,
                          color: '#fff', fontSize: 14, fontWeight: 600,
                          cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
                          transition: 'background 0.2s',
                        }}
                      >{submitting ? 'Submitting\u2026' : 'Request data export'}</button>
                      {submitError && (
                        <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{submitError}</div>
                      )}
                    </>
                  )}
                </div>

                {/* Data retention */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px', marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Data Retention</div>
                  <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
                    <p style={{ margin: '0 0 8px' }}>We retain your personal data for the lifetime of your account. After deletion:</p>
                    <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                      <li>Profile and account data is deleted within 30 days</li>
                      <li>Comments are anonymised and attributed to "Deleted User"</li>
                      <li>Aggregate analytics data is retained (non-identifiable)</li>
                      <li>Backup copies are purged within 90 days</li>
                    </ul>
                  </div>
                  <div style={{ marginTop: 14, padding: '10px 14px', background: '#ede9fe', borderRadius: 8, fontSize: 13, color: C.accent }}>
                    Verity Post is GDPR and CCPA compliant. You have the right to access, correct, or delete your personal data at any time.
                  </div>
                </div>

                {/* Delete account — danger zone */}
                <div style={{ border: '1.5px solid #fca5a5', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ background: '#fef2f2', padding: '14px 22px', borderBottom: '1px solid #fca5a5' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#dc2626' }}>Danger Zone</div>
                  </div>
                  <div style={{ padding: '22px' }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Delete Account</div>
                    <p style={{ fontSize: 14, color: C.dim, margin: '0 0 16px', lineHeight: 1.6 }}>
                      Permanently delete your account and all associated data. You have a <strong style={{ color: C.text }}>30-day grace period</strong> to reactivate by logging back in before everything is erased.
                    </p>

                    {!showDelete ? (
                      <button
                        onClick={() => setShowDelete(true)}
                        style={{
                          padding: '10px 22px', borderRadius: 9, border: 'none',
                          background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}
                      >Delete my account</button>
                    ) : (
                      <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '20px' }}>
                        <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Type DELETE to confirm</div>
                        <input
                          value={deleteConfirm}
                          onChange={e => setDeleteConfirm(e.target.value)}
                          placeholder="Type DELETE"
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 8,
                            border: '1.5px solid #fca5a5', background: C.bg,
                            fontSize: 14, color: C.text, boxSizing: 'border-box', outline: 'none',
                            marginBottom: 12,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={() => { setShowDelete(false); setDeleteConfirm(''); }}
                            style={{
                              padding: '9px 20px', borderRadius: 8, border: `1px solid ${C.border}`,
                              background: C.bg, color: C.text, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                            }}
                          >Cancel</button>
                          <button
                            disabled={deleteConfirm !== 'DELETE'}
                            onClick={async () => {
                              if (deleteConfirm !== 'DELETE') return;
                              const res = await fetch('/api/account/delete', { method: 'POST' });
                              if (!res.ok) {
                                const d = await res.json().catch(() => ({}));
                                alert(d?.error || 'Could not schedule deletion');
                                return;
                              }
                              await supabase.auth.signOut();
                              setLoading(false);
                            }}
                            style={{
                              padding: '9px 20px', borderRadius: 8, border: 'none',
                              background: deleteConfirm === 'DELETE' ? '#dc2626' : '#fca5a5',
                              color: '#fff', fontSize: 14, fontWeight: 600,
                              cursor: deleteConfirm === 'DELETE' ? 'pointer' : 'default',
                            }}
                          >Yes, delete my account</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </main>
      </div>
    </div>
  );
}
