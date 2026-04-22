// TODO: swap to real App Store URL once app is published
export default function KidsAppLanding() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '560px', width: '100%' }}>
        <h1 style={{ fontSize: '40px', fontWeight: 700, color: '#111111', margin: '0 0 12px' }}>
          Verity Post Kids
        </h1>
        <p style={{ fontSize: '16px', color: '#666666', lineHeight: 1.6, margin: '0 0 32px' }}>
          A separate iOS app for kid readers. Parents create profiles from their Verity Post
          account; kids read, quiz, and earn streaks on their own device.
        </p>

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 32px',
            textAlign: 'left',
            display: 'inline-block',
          }}
        >
          <li style={{ fontSize: '15px', color: '#111111', lineHeight: 1.8, padding: '4px 0' }}>
            &middot; Safe kid-only content
          </li>
          <li style={{ fontSize: '15px', color: '#111111', lineHeight: 1.8, padding: '4px 0' }}>
            &middot; Per-kid category permissions + reading time limits
          </li>
          <li style={{ fontSize: '15px', color: '#111111', lineHeight: 1.8, padding: '4px 0' }}>
            &middot; Verified experts answer kid questions
          </li>
        </ul>

        <div style={{ fontSize: '14px', color: '#666666', margin: '0 0 32px' }}>
          Coming to the App Store soon.
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="/"
            style={{
              padding: '12px 24px',
              background: '#111111',
              color: '#ffffff',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to home
          </a>
          <a
            href="/login"
            style={{
              padding: '12px 24px',
              background: '#ffffff',
              color: '#111111',
              border: '1px solid #111111',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Parent account sign-in
          </a>
        </div>
      </div>
    </div>
  );
}
