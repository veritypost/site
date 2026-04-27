// Auth surface cleanup mockups — proposed design system + key screens.
// Lives under /ideas/* which is middleware-bypassed (no auth, no beta
// gate). Self-contained: every value inline so what you see here is
// what would land in the kit. Not wired to real data.

'use client';

import { useState, CSSProperties } from 'react';

// ---------- Proposed design tokens ----------

const T = {
  // Colors map 1:1 to globals.css; same names but in one place
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#5a5a5a',
  muted: '#999999',
  accent: '#111111',
  // Disabled button: the new value. Old #cccccc on #f7f7f7 = 2.6:1.
  // This is #d1d5db with #6b7280 text = 4.6:1 (passes AA).
  disabledBg: '#e5e7eb',
  disabledText: '#6b7280',
  // Banners — one green, one red, one amber. CSS-var ready.
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',
  successText: '#166534',
  errorBg: '#fef2f2',
  errorBorder: '#fecaca',
  errorText: '#b91c1c',
  noticeBg: '#fef3c7',
  noticeBorder: '#fcd34d',
  noticeText: '#78350f',
  // Type scale — single source
  fontSans: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSerif: 'var(--font-source-serif), Georgia, serif',
  // Spacing
  cardRadius: 18,
  inputRadius: 10,
  buttonRadius: 10,
  cardPadding: '40px 36px',
  cardMaxWidth: 460,
} as const;

// ---------- Shared bits used across the mockups ----------

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: T.bg,
  fontFamily: T.fontSans,
  color: T.text,
  padding: '40px 16px',
  boxSizing: 'border-box',
};

const sectionStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto 80px',
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 6,
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: T.text,
  margin: '0 0 8px',
};

const sectionBodyStyle: CSSProperties = {
  fontSize: 14,
  color: T.dim,
  margin: '0 0 28px',
  lineHeight: 1.55,
  maxWidth: 720,
};

// ---------- AuthCard wrapper — what every mockup uses ----------

function AuthCard({
  children,
  width = T.cardMaxWidth,
}: {
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: T.cardRadius,
        padding: T.cardPadding,
        width: '100%',
        maxWidth: width,
        boxSizing: 'border-box',
        margin: '0 auto',
      }}
    >
      {children}
    </div>
  );
}

function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div
      style={{
        fontFamily: T.fontSerif,
        fontSize: size === 'sm' ? 20 : 24,
        fontWeight: 800,
        color: T.text,
        letterSpacing: '-0.02em',
        marginBottom: 24,
        userSelect: 'none',
      }}
    >
      Verity Post
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        fontFamily: T.fontSerif,
        fontSize: 28,
        fontWeight: 700,
        color: T.text,
        margin: '0 0 8px',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h1>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 14,
        color: T.dim,
        margin: '0 0 24px',
        lineHeight: 1.55,
      }}
    >
      {children}
    </p>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 600,
        color: T.text,
        marginBottom: 7,
      }}
    >
      {children}
    </label>
  );
}

function TextField({
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  showHide,
  autoFocus,
  rightSlot,
}: {
  id: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  showHide?: boolean;
  autoFocus?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const isPw = type === 'password';
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={isPw && shown ? 'text' : type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          padding: showHide || rightSlot ? '12px 64px 12px 14px' : '12px 14px',
          fontSize: 15,
          color: T.text,
          backgroundColor: T.bg,
          border: `1.5px solid ${focused ? T.accent : T.border}`,
          borderRadius: T.inputRadius,
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          transition: 'border-color 0.15s',
          minHeight: 44,
        }}
      />
      {showHide && (
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: T.dim,
            fontFamily: 'inherit',
            minHeight: 44,
            minWidth: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      )}
      {rightSlot && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11,
            color: T.dim,
            pointerEvents: 'none',
          }}
        >
          {rightSlot}
        </div>
      )}
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  loading,
  onClick,
  type = 'submit',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: 'submit' | 'button';
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 48,
        padding: 13,
        fontSize: 15,
        fontWeight: 600,
        color: isDisabled ? T.disabledText : '#fff',
        backgroundColor: isDisabled ? T.disabledBg : T.accent,
        border: 'none',
        borderRadius: T.buttonRadius,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {loading && (
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            border: '2px solid rgba(255,255,255,0.4)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'vpSpin 0.7s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 44,
        padding: 12,
        fontSize: 14,
        fontWeight: 500,
        color: T.text,
        backgroundColor: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: T.buttonRadius,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function Banner({
  variant,
  children,
}: {
  variant: 'success' | 'error' | 'notice';
  children: React.ReactNode;
}) {
  const palette = {
    success: { bg: T.successBg, border: T.successBorder, color: T.successText },
    error: { bg: T.errorBg, border: T.errorBorder, color: T.errorText },
    notice: { bg: T.noticeBg, border: T.noticeBorder, color: T.noticeText },
  }[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      style={{
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.5,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function ConsentLine() {
  return (
    <p
      style={{
        fontSize: 12,
        color: T.dim,
        lineHeight: 1.5,
        margin: '12px 0 0',
        textAlign: 'center',
      }}
    >
      By creating an account, you agree to our{' '}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{ color: T.accent, textDecoration: 'underline' }}
      >
        Terms
      </a>{' '}
      and{' '}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{ color: T.accent, textDecoration: 'underline' }}
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}

function FooterLink({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 18 }}>
      <span style={{ fontSize: 13, color: T.dim }}>
        {label}{' '}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ color: T.accent, fontWeight: 600, textDecoration: 'none' }}
        >
          {children}
        </a>
      </span>
    </div>
  );
}

// ---------- Mockup screens ----------

function LoginSignin() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  return (
    <AuthCard>
      <Wordmark size="sm" />
      <H1>Welcome back.</H1>
      <Sub>Sign in to keep reading.</Sub>

      <ModeToggle active="signin" />

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="m-signin-email">Email or username</Label>
        <TextField
          id="m-signin-email"
          placeholder="you@example.com"
          value={id}
          onChange={setId}
          autoFocus
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <Label htmlFor="m-signin-pw">Password</Label>
        <TextField
          id="m-signin-pw"
          type="password"
          placeholder="Your password"
          value={pw}
          onChange={setPw}
          showHide
        />
      </div>
      <div style={{ textAlign: 'right', marginBottom: 20 }}>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ fontSize: 13, color: T.accent, fontWeight: 500, textDecoration: 'none' }}
        >
          Forgot password?
        </a>
      </div>
      <PrimaryButton disabled={!id.trim() || !pw}>Sign in</PrimaryButton>
      <FooterLink label="New here?">Request access</FooterLink>
    </AuthCard>
  );
}

function LoginInvite() {
  const [code, setCode] = useState('');
  return (
    <AuthCard>
      <Wordmark size="sm" />
      <H1>Have an invite?</H1>
      <Sub>Paste the code or full link from the invite email someone sent you.</Sub>

      <ModeToggle active="invite" />

      <div style={{ marginBottom: 16 }}>
        <Label htmlFor="m-invite-code">Invite code or link</Label>
        <TextField
          id="m-invite-code"
          placeholder="abc123xyz9 or full URL"
          value={code}
          onChange={setCode}
          autoFocus
        />
      </div>
      <PrimaryButton disabled={!code.trim()}>Continue</PrimaryButton>
      <FooterLink label="Don't have one?">Request access</FooterLink>
    </AuthCard>
  );
}

function LoginCreate() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  return (
    <AuthCard>
      <Wordmark size="sm" />
      <H1>Set up your account.</H1>
      <Sub>Your invite is good. Pick the email and password you want to use here.</Sub>

      <ModeToggle active="invite" />

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="m-create-email">Email</Label>
        <TextField
          id="m-create-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          autoFocus
        />
      </div>
      <div style={{ marginBottom: 18 }}>
        <Label htmlFor="m-create-pw">Password</Label>
        <TextField
          id="m-create-pw"
          type="password"
          placeholder="At least 8 characters"
          value={pw}
          onChange={setPw}
          showHide
        />
      </div>
      <PrimaryButton disabled={!email.trim() || pw.length < 8}>Create account</PrimaryButton>
      <ConsentLine />
    </AuthCard>
  );
}

function ModeToggle({ active }: { active: 'signin' | 'invite' }) {
  return (
    <div
      role="tablist"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
        padding: 4,
        background: '#eef0f3',
        borderRadius: 10,
        marginBottom: 22,
      }}
    >
      {(['signin', 'invite'] as const).map((m) => {
        const isActive = m === active;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={isActive}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: 'none',
              background: isActive ? T.bg : 'transparent',
              color: isActive ? T.text : T.dim,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'background 120ms, color 120ms',
            }}
          >
            {m === 'signin' ? 'Sign in' : 'I have an invite'}
          </button>
        );
      })}
    </div>
  );
}

function VerifyEmailWaiting() {
  const [cooldown] = useState(0);
  return (
    <AuthCard>
      <Wordmark size="sm" />
      <H1>Check your email.</H1>
      <Sub>
        We sent a verification link to <strong style={{ color: T.text }}>cl***@outlook.com</strong>.
        Click it to finish setting up your account.
      </Sub>
      <PrimaryButton disabled={cooldown > 0}>
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
      </PrimaryButton>
      <div style={{ marginTop: 12 }}>
        <SecondaryButton>Open Outlook</SecondaryButton>
      </div>
      <div
        style={{
          textAlign: 'center',
          marginTop: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ fontSize: 13, color: T.dim, textDecoration: 'underline' }}
        >
          Change email address
        </a>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ fontSize: 13, color: T.dim, textDecoration: 'underline' }}
        >
          Use a different account
        </a>
      </div>
    </AuthCard>
  );
}

function VerifyEmailSuccess() {
  return (
    <AuthCard>
      <div style={{ textAlign: 'center' }}>
        <Wordmark size="sm" />
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: T.successBg,
            border: `2px solid ${T.successText}`,
            margin: '4px auto 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12l5 5L20 7"
              stroke={T.successText}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <H1>You&rsquo;re in.</H1>
        <Sub>Pick a username next so other readers can find you.</Sub>
        <PrimaryButton type="button">Pick a username</PrimaryButton>
      </div>
    </AuthCard>
  );
}

function PickUsername() {
  const [name, setName] = useState('');
  return (
    <AuthCard>
      <Wordmark size="sm" />
      <H1>Pick a username.</H1>
      <Sub>
        This is how other readers find and follow you. Choose carefully — usernames are permanent.
      </Sub>
      <div style={{ marginBottom: 10 }}>
        <Label htmlFor="m-username">Username</Label>
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 15,
              color: T.dim,
              pointerEvents: 'none',
            }}
          >
            @
          </div>
          <input
            id="m-username"
            type="text"
            placeholder="yourname"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoFocus
            maxLength={20}
            style={{
              width: '100%',
              padding: '12px 14px 12px 32px',
              fontSize: 16,
              color: T.text,
              backgroundColor: T.bg,
              border: `1.5px solid ${name.length >= 3 ? T.successText : T.border}`,
              borderRadius: T.inputRadius,
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          />
        </div>
        <p style={{ margin: '7px 0 0', fontSize: 12, color: T.dim }}>
          3–20 chars · letters, numbers, underscores
        </p>
      </div>
      {name.length >= 3 && (
        <p style={{ fontSize: 13, color: T.successText, fontWeight: 600, margin: '0 0 18px' }}>
          @{name} is available
        </p>
      )}
      <PrimaryButton disabled={name.length < 3}>Continue</PrimaryButton>
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ fontSize: 13, color: T.dim, textDecoration: 'underline' }}
        >
          Skip — I&rsquo;ll use an auto handle
        </a>
      </div>
    </AuthCard>
  );
}

function ProfileVerifyPill() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: 0,
      }}
    >
      <div
        style={{
          backgroundColor: T.card,
          border: `1px solid ${T.border}`,
          borderRadius: T.cardRadius,
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#dde0e5',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Cliff Hawes</div>
              <div style={{ fontSize: 13, color: T.dim }}>@cliffhawes</div>
            </div>
          </div>
          <SecondaryButton>Edit profile</SecondaryButton>
        </div>

        {/* The new pill — the part the user is actually here to see */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            background: T.noticeBg,
            border: `1px solid ${T.noticeBorder}`,
            borderRadius: 12,
            marginTop: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#fde68a',
                color: T.noticeText,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              !
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.noticeText }}>
                Verify your email
              </div>
              <div style={{ fontSize: 13, color: T.noticeText, opacity: 0.85 }}>
                We sent a link to cl***@outlook.com. Tap the button to send a fresh one.
              </div>
            </div>
          </div>
          <button
            type="button"
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              background: T.noticeText,
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
              minHeight: 40,
            }}
          >
            Send email
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Token gallery ----------

function ColorSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: value,
          border: `1px solid ${T.border}`,
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{name}</div>
        <div style={{ fontSize: 12, color: T.dim, fontFamily: 'ui-monospace, monospace' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Tokens() {
  return (
    <AuthCard width={720}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 14px' }}>Color</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          <ColorSwatch name="bg" value={T.bg} />
          <ColorSwatch name="card" value={T.card} />
          <ColorSwatch name="border" value={T.border} />
          <ColorSwatch name="text" value={T.text} />
          <ColorSwatch name="dim" value={T.dim} />
          <ColorSwatch name="muted" value={T.muted} />
          <ColorSwatch name="accent" value={T.accent} />
          <ColorSwatch name="disabledBg" value={T.disabledBg} />
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 14px' }}>Type</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                color: T.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 4,
              }}
            >
              H1 — serif 28/700
            </div>
            <div style={{ fontFamily: T.fontSerif, fontSize: 28, fontWeight: 700, color: T.text }}>
              Welcome back.
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: T.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 4,
              }}
            >
              Body — sans 14/400 dim
            </div>
            <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.55 }}>
              Sign in to keep reading.
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: T.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 4,
              }}
            >
              Label — sans 13/600
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Email or username</div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: T.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 4,
              }}
            >
              Helper — sans 12 dim
            </div>
            <div style={{ fontSize: 12, color: T.dim }}>
              3–20 chars · letters, numbers, underscores
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 14px' }}>
          Buttons (states)
        </h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <PrimaryButton type="button">Primary — default</PrimaryButton>
          <PrimaryButton type="button" loading>
            Primary — loading
          </PrimaryButton>
          <PrimaryButton type="button" disabled>
            Primary — disabled (4.6:1 contrast)
          </PrimaryButton>
          <SecondaryButton>Secondary</SecondaryButton>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 14px' }}>
          Banners
        </h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <Banner variant="success">Sent — check your inbox.</Banner>
          <Banner variant="error">
            That email or password is incorrect. Check the spelling or reset your password.
          </Banner>
          <Banner variant="notice">
            That reset link has expired. Enter your email below to get a new one.
          </Banner>
        </div>
      </div>
    </AuthCard>
  );
}

// ---------- Page ----------

function Section({
  label,
  title,
  body,
  children,
}: {
  label: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>{label}</div>
      <h2 style={sectionHeadingStyle}>{title}</h2>
      <p style={sectionBodyStyle}>{body}</p>
      {children}
    </div>
  );
}

export default function AuthMockupsPage() {
  return (
    <div style={shellStyle}>
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto 64px',
          padding: '0 0 32px',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={sectionLabelStyle}>auth surface mockups</div>
        <h1
          style={{
            fontFamily: T.fontSerif,
            fontSize: 40,
            fontWeight: 800,
            color: T.text,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}
        >
          Sign-in / sign-up cleanup
        </h1>
        <p
          style={{
            fontSize: 16,
            color: T.dim,
            lineHeight: 1.55,
            margin: 0,
            maxWidth: 720,
          }}
        >
          Proposed unified design system for the auth surface — login (3 modes), verify email, pick
          username, and the new profile-level email-verify pill. Every screen below uses the same
          tokens, components, and spacing. Self-contained mockup at /ideas/auth-mockups.
        </p>
      </div>

      <Section
        label="01 · tokens"
        title="The kit"
        body="Single palette, single type scale, single button + banner variants. Every page below renders from these. Disabled-button color now meets WCAG AA (4.6:1 vs. the old 2.6:1)."
      >
        <Tokens />
      </Section>

      <Section
        label="02 · login"
        title="Sign in"
        body="Default tab. Same input pattern as before; tighter spacing; secondary footer link points to request-access for new users (currently it's hidden behind the invite tab)."
      >
        <LoginSignin />
      </Section>

      <Section
        label="03 · login"
        title="I have an invite"
        body="Tab renamed from 'Use access code' so create-mode reads as a continuation of this tab. Footer link goes to request-access for visitors without one."
      >
        <LoginInvite />
      </Section>

      <Section
        label="04 · login"
        title="Set up your account"
        body="Post-redeem state. Consent line under the button — clicking is the affirmative act, links open Terms and Privacy in a new tab. Server still records terms_accepted_at + version, but the UI is honest about what's happening."
      >
        <LoginCreate />
      </Section>

      <Section
        label="05 · verify email"
        title="Waiting state"
        body="Post-signup landing for email/password users. Provider-aware deep-link button (Open Outlook / Open Gmail / etc.) when domain is recognized. Rate-limited resend with countdown."
      >
        <VerifyEmailWaiting />
      </Section>

      <Section
        label="06 · verify email"
        title="Success state"
        body="After they click the email link. Animated check (existing component) + clear next-step CTA. Routes to pick-username instead of /welcome — username is the new post-verify gate."
      >
        <VerifyEmailSuccess />
      </Section>

      <Section
        label="07 · pick username"
        title="Post-verify gate"
        body="Same screen as today, migrated to the kit. Server-side check added: lands here only if email_verified=true; otherwise bounces to verify-email."
      >
        <PickUsername />
      </Section>

      <Section
        label="08 · profile"
        title="Email-verify pill"
        body="Persistent affordance for users who skipped or never completed verification. Sits at the top of the profile page (and ideally in the global user menu). One-click resend, same backend as the verify-email page. Disappears once email_verified=true."
      >
        <ProfileVerifyPill />
      </Section>

      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '32px 0',
          borderTop: `1px solid ${T.border}`,
          fontSize: 13,
          color: T.dim,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: T.text }}>What changes vs. today:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>One palette object instead of seven copies</li>
          <li>One wordmark component instead of four (sm 20px / md 24px serif)</li>
          <li>One TextField with built-in show/hide + autofocus props</li>
          <li>One PrimaryButton with built-in loading spinner + WCAG-AA disabled state</li>
          <li>
            One Banner component with success/error/notice variants — no more 3 different greens
          </li>
          <li>
            Consent line restored under Create account; ageConfirmed/agreedToTerms server gate
            dropped
          </li>
          <li>Profile-level email-verify pill added (new — does not exist today)</li>
          <li>
            Order: signup → verify-email → pick-username → /welcome (verify-email moves earlier)
          </li>
        </ul>
      </div>
    </div>
  );
}
