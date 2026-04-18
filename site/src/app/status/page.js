const services = [
  { name: 'Website', status: 'operational', uptime: '99.99%' },
  { name: 'API', status: 'operational', uptime: '99.98%' },
  { name: 'Database', status: 'operational', uptime: '99.99%' },
  { name: 'Push Notifications', status: 'degraded', uptime: '99.82%' },
  { name: 'Email', status: 'operational', uptime: '99.95%' },
  { name: 'RSS Ingestion', status: 'operational', uptime: '99.91%' },
];

const incidents = [
  { date: 'Apr 9, 2026', title: 'Push notification delays', severity: 'minor', description: 'Some users experienced delayed push notifications for approximately 45 minutes. The issue was identified as a queue backlog and has been resolved.', resolved: true },
  { date: 'Apr 6, 2026', title: 'Elevated API response times', severity: 'minor', description: 'API response times were elevated for 20 minutes during a scheduled database migration. No data loss occurred.', resolved: true },
];

export default function StatusPage() {
  const statusColor = (s) => s === 'operational' ? '#16a34a' : s === 'degraded' ? '#f59e0b' : '#dc2626';
  const statusLabel = (s) => s === 'operational' ? 'Operational' : s === 'degraded' ? 'Degraded' : 'Down';

  const allOperational = services.every((s) => s.status === 'operational');

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#111111', letterSpacing: '-0.5px' }}>Verity Post</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111111', margin: '16px 0 0' }}>System Status</h1>
        </div>

        <div style={{ background: allOperational ? '#dcfce7' : '#fffbeb', border: '1px solid ' + (allOperational ? '#bbf7d0' : '#fcd34d'), borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: allOperational ? '#16a34a' : '#f59e0b' }} />
            <span style={{ fontSize: '16px', fontWeight: '700', color: allOperational ? '#16a34a' : '#92400e' }}>
              {allOperational ? 'All Systems Operational' : 'Some Systems Experiencing Issues'}
            </span>
          </div>
        </div>

        <div style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: '10px', marginBottom: '32px', overflow: 'hidden' }}>
          {services.map((s, i) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: i < services.length - 1 ? '1px solid #e5e5e5' : 'none' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#111111' }}>{s.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#666666' }}>{s.uptime}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor(s.status) }} />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: statusColor(s.status) }}>{statusLabel(s.status)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111111', marginBottom: '16px' }}>Incident History (Last 7 Days)</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {incidents.map((inc, i) => (
            <div key={i} style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#111111' }}>{inc.title}</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: inc.severity === 'minor' ? '#fffbeb' : '#fee2e2', color: inc.severity === 'minor' ? '#92400e' : '#dc2626', fontWeight: '600' }}>{inc.severity}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#666666', marginBottom: '6px' }}>{inc.date}</div>
              <div style={{ fontSize: '13px', color: '#666666', lineHeight: '1.5' }}>{inc.description}</div>
              {inc.resolved && <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600', marginTop: '8px' }}>Resolved</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
