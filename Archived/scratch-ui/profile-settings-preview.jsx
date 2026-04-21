import { useState } from "react";
import { ChevronRight, Settings, Share2, Lock, ChevronDown, ArrowLeft, Shield, Mail, KeyRound, Smartphone, CreditCard, Bell, SlidersHorizontal, BadgeCheck, Users, MessageSquare, HelpCircle, Info, Trash2, Database, LogOut, Star, BookOpen, Trophy, Activity, BarChart3 } from "lucide-react";

// ── colour tokens (matching VP.* from the Swift code) ──
const VP = {
  bg: "#f5f5f5",
  card: "#ffffff",
  text: "#111111",
  dim: "#888888",
  soft: "#666666",
  accent: "#818cf8",
  border: "#e5e5e5",
  rule: "#eeeeee",
  wrong: "#ef4444",
  right: "#22c55e",
  purple: "#8b5cf6",
};

// ── mock data ──
const mockUser = {
  username: "verity",
  email: "admin@veritypost.com",
  plan: "verity_pro",
  planDisplay: "Verity Pro",
  memberSince: "Jan 2025",
  verityScore: 1247,
  streak: 42,
  articlesRead: 318,
  comments: 87,
  avatarColor: "#818cf8",
  avatarInitials: "VP",
  isExpert: false,
};

// ── reusable pieces ──
function Avatar({ color = "#818cf8", initials = "VP", size = 48 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}, ${color}dd)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 700, fontSize: size * 0.32, letterSpacing: 0.5,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "10px 4px" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: VP.text }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.4, color: VP.dim, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: VP.rule, width: "100%" }} />;
}

function VertDivider() {
  return <div style={{ width: 1, height: 50, background: VP.border }} />;
}

function NavRow({ icon, label, desc, onClick, destructive, trailing }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "14px 16px", background: VP.card, border: `1px solid ${VP.border}`,
        borderRadius: 10, cursor: "pointer", textAlign: "left",
      }}
    >
      {icon && <span style={{ color: VP.dim, display: "flex" }}>{icon}</span>}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: destructive ? VP.wrong : VP.text }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: VP.dim, marginTop: 1 }}>{desc}</div>}
      </div>
      {trailing || <ChevronRight size={16} color={VP.dim} />}
    </button>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.66, color: VP.dim, padding: "16px 0 8px", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

// ── Settings sub-views ──
function SettingsAccountView({ onBack }) {
  const colors = ["#818cf8","#22c55e","#ef4444","#f59e0b","#3b82f6","#ec4899","#8b5cf6","#14b8a6","#f97316","#6366f1","#0ea5e9","#10b981"];
  const [outer, setOuter] = useState("#818cf8");
  const [inner, setInner] = useState(null);

  return (
    <div>
      <TopBar title="Profile" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Avatar">
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Avatar color={outer} initials="VP" size={72} />
            <div>
              <div style={{ fontSize: 11, color: VP.dim, marginBottom: 4 }}>Up to 3 characters, letters and numbers only.</div>
              <input defaultValue="VP" style={{ ...inputStyle, width: 80 }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: VP.dim, marginTop: 12 }}>Ring color</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {colors.map(c => (
              <div key={c} onClick={() => setOuter(c)} style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: outer === c ? `3px solid ${VP.text}` : "3px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: VP.dim, marginTop: 12 }}>Inner fill</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            <div onClick={() => setInner(null)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", border: inner === null ? `3px solid ${VP.text}` : `1px dashed ${VP.border}`, cursor: "pointer" }} />
            {colors.map(c => (
              <div key={c} onClick={() => setInner(c)} style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: inner === c ? `3px solid ${VP.text}` : "3px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
        </FormSection>
        <FormSection title="Identity">
          <FormField label="Username" defaultValue="verity" />
          <FormField label="Location" defaultValue="" placeholder="City, Country" />
          <FormField label="Website" defaultValue="" placeholder="https://" />
        </FormSection>
        <FormSection title="Bio">
          <textarea placeholder="Tell us about yourself..." style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit" }} />
        </FormSection>
        <button style={{ ...btnPrimary, width: "100%" }}>Save Changes</button>
      </div>
    </div>
  );
}

function SettingsEmailView({ onBack }) {
  return (
    <div>
      <TopBar title="Email" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Current Email">
          <div style={{ fontSize: 14, color: VP.text }}>{mockUser.email}</div>
        </FormSection>
        <FormSection title="Change Email">
          <input placeholder="New email address" style={inputStyle} />
          <button style={{ ...btnPrimary, marginTop: 8 }}>Send verification link</button>
        </FormSection>
        <div style={{ fontSize: 12, color: VP.dim }}>Supabase will send a verification link to your new address. Your email won't change until you click the link.</div>
      </div>
    </div>
  );
}

function SettingsPasswordView({ onBack }) {
  return (
    <div>
      <TopBar title="Password" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="New Password">
          <input type="password" placeholder="New password (min 8 chars)" style={inputStyle} />
          <input type="password" placeholder="Confirm new password" style={{ ...inputStyle, marginTop: 8 }} />
        </FormSection>
        <button style={btnPrimary}>Update password</button>
        <div style={{ fontSize: 12, color: VP.dim }}>Password must be at least 8 characters. Use a passphrase or a password manager — good security starts here.</div>
      </div>
    </div>
  );
}

function SettingsMFAView({ onBack }) {
  return (
    <div>
      <TopBar title="Two-Factor" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Set Up">
          <div style={{ fontSize: 12, color: VP.soft }}>Add an extra layer of security to your account using a TOTP authenticator app.</div>
          <button style={{ ...btnPrimary, marginTop: 8 }}>Generate setup code</button>
        </FormSection>
      </div>
    </div>
  );
}

function SettingsLoginActivityView({ onBack }) {
  const rows = [
    { action: "Login", date: "Apr 17 · 9:23 AM", device: "iPhone 16 · Safari · 73.42.xxx" },
    { action: "Login", date: "Apr 15 · 2:11 PM", device: "MacBook Pro · Chrome · 73.42.xxx" },
    { action: "Login", date: "Apr 12 · 8:05 AM", device: "iPhone 16 · Safari · 73.42.xxx" },
  ];
  return (
    <div>
      <TopBar title="Login Activity" onBack={onBack} />
      <div style={{ padding: 16 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ padding: "12px 0", borderBottom: `1px solid ${VP.rule}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{r.action}</span>
              <span style={{ fontSize: 11, color: VP.dim }}>{r.date}</span>
            </div>
            <div style={{ fontSize: 11, color: VP.dim, marginTop: 2 }}>{r.device}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsSubscriptionView({ onBack }) {
  return (
    <div>
      <TopBar title="Subscription" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Current Plan">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Plan</span><span style={{ color: VP.accent, fontWeight: 600 }}>{mockUser.planDisplay}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span>Status</span><span style={{ color: VP.dim }}>Active</span>
          </div>
        </FormSection>
        <FormSection title="Billing">
          <button style={{ color: VP.accent, fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14 }}>Manage Subscription</button>
          <div style={{ fontSize: 11, color: VP.dim, marginTop: 4 }}>Subscriptions purchased in the app are managed by Apple.</div>
        </FormSection>
        <div style={{ fontSize: 12, color: VP.dim }}>If you purchased your plan on the web, manage it at veritypost.com/profile/settings/billing.</div>
      </div>
    </div>
  );
}

function SettingsNotificationsView({ onBack }) {
  const [toggles, setToggles] = useState({ breaking: true, digest: true, expert: true, comment: true, weekly: true });
  const toggle = (k) => setToggles(p => ({ ...p, [k]: !p[k] }));

  return (
    <div>
      <TopBar title="Notifications" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Push">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>System permission</span><span style={{ fontSize: 12, color: VP.right }}>Allowed</span>
          </div>
        </FormSection>
        <FormSection title="What to send">
          {[
            ["breaking", "Breaking news alerts"],
            ["digest", "Morning digest"],
            ["expert", "Expert answered my question"],
            ["comment", "Replies to my comments"],
            ["weekly", "Weekly recap"],
          ].map(([k, label]) => (
            <ToggleRow key={k} label={label} value={toggles[k]} onToggle={() => toggle(k)} />
          ))}
        </FormSection>
        <button style={btnPrimary}>Save preferences</button>
      </div>
    </div>
  );
}

function SettingsFeedView({ onBack }) {
  const [toggles, setToggles] = useState({ breaking: true, trending: true, recommended: true, lowCred: false, compact: false });
  const toggle = (k) => setToggles(p => ({ ...p, [k]: !p[k] }));

  return (
    <div>
      <TopBar title="Feed Preferences" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Feed">
          <ToggleRow label="Show breaking stories at top" value={toggles.breaking} onToggle={() => toggle("breaking")} />
          <ToggleRow label="Show trending stories" value={toggles.trending} onToggle={() => toggle("trending")} />
          <ToggleRow label="Show recommended stories" value={toggles.recommended} onToggle={() => toggle("recommended")} />
        </FormSection>
        <FormSection title="Filters">
          <ToggleRow label="Hide low-credibility stories" value={toggles.lowCred} onToggle={() => toggle("lowCred")} />
        </FormSection>
        <FormSection title="Display">
          <ToggleRow label="Compact layout" value={toggles.compact} onToggle={() => toggle("compact")} />
        </FormSection>
        <button style={btnPrimary}>Save</button>
      </div>
    </div>
  );
}

function SettingsVerificationView({ onBack }) {
  const [type, setType] = useState("expert");
  return (
    <div>
      <TopBar title="Verification" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Type">
          <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${VP.border}` }}>
            {["expert", "journalist", "public_figure"].map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: "8px 4px", fontSize: 13, fontWeight: type === t ? 600 : 400,
                background: type === t ? VP.accent : VP.card, color: type === t ? "#fff" : VP.text,
                border: "none", cursor: "pointer",
              }}>{t === "public_figure" ? "Public Figure" : t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </FormSection>
        <FormSection title="About You">
          <FormField label="" placeholder="Field / area (e.g. AI policy)" />
          <FormField label="" placeholder="Role / title (e.g. Research Lead)" />
          <FormField label="" placeholder="Organization (optional)" />
          <textarea placeholder="Short bio" style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit", marginTop: 8 }} />
        </FormSection>
        <FormSection title="Links">
          <FormField label="" placeholder="Portfolio URL" />
          <FormField label="" placeholder="LinkedIn" />
        </FormSection>
        <button style={btnPrimary}>Submit application</button>
      </div>
    </div>
  );
}

function SettingsDataPrivacyView({ onBack }) {
  const [dmReceipts, setDmReceipts] = useState(true);
  return (
    <div>
      <TopBar title="Data & Privacy" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <FormSection title="Messages">
          <ToggleRow label="DM read receipts" value={dmReceipts} onToggle={() => setDmReceipts(!dmReceipts)} />
          <div style={{ fontSize: 12, color: VP.dim, marginTop: 4 }}>Let senders see when you've read their direct messages. Turn off to read without confirming.</div>
        </FormSection>
        <FormSection title="Your Data">
          <button style={{ color: VP.accent, fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14 }}>Request data export</button>
        </FormSection>
        <FormSection title="Delete Account">
          <button style={{ color: VP.wrong, fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14 }}>Delete my account</button>
        </FormSection>
        <div style={{ fontSize: 11, color: VP.dim }}>Data requests and deletions are processed via the data_requests queue. This complies with GDPR and CCPA obligations.</div>
      </div>
    </div>
  );
}

// ── helpers ──
function ToggleRow({ label, value, onToggle }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
      <span style={{ fontSize: 14, color: VP.text }}>{label}</span>
      <div onClick={onToggle} style={{
        width: 44, height: 26, borderRadius: 13, padding: 2, cursor: "pointer",
        background: value ? VP.accent : "#ccc", transition: "background 0.2s",
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 11, background: "#fff",
          transform: value ? "translateX(18px)" : "translateX(0)", transition: "transform 0.2s",
        }} />
      </div>
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <div>
      {title && <div style={{ fontSize: 12, fontWeight: 600, color: VP.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>}
      <div style={{ background: VP.card, border: `1px solid ${VP.border}`, borderRadius: 10, padding: 14 }}>{children}</div>
    </div>
  );
}

function FormField({ label, defaultValue, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      {label && <span style={{ fontSize: 14, color: VP.dim, minWidth: 80 }}>{label}</span>}
      <input defaultValue={defaultValue} placeholder={placeholder} style={{ ...inputStyle, flex: 1, textAlign: label ? "right" : "left" }} />
    </div>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
      borderBottom: `1px solid ${VP.border}`, background: VP.card, position: "sticky", top: 0, zIndex: 10,
    }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4, color: VP.accent }}>
        <ArrowLeft size={20} />
      </button>
      <span style={{ fontSize: 16, fontWeight: 600, color: VP.text }}>{title}</span>
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px", borderRadius: 6, border: `1px solid ${VP.border}`,
  fontSize: 14, outline: "none", background: VP.bg, color: VP.text, width: "100%", boxSizing: "border-box",
};

const btnPrimary = {
  padding: "12px 24px", borderRadius: 10, border: "none",
  background: VP.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

// ══════════════════════════════════════════════════
//  MAIN SETTINGS VIEW
// ══════════════════════════════════════════════════

function SettingsHub({ onBack }) {
  const [sub, setSub] = useState(null);

  const subViews = {
    profile: SettingsAccountView,
    email: SettingsEmailView,
    password: SettingsPasswordView,
    mfa: SettingsMFAView,
    loginActivity: SettingsLoginActivityView,
    subscription: SettingsSubscriptionView,
    notifications: SettingsNotificationsView,
    feed: SettingsFeedView,
    verification: SettingsVerificationView,
    dataPrivacy: SettingsDataPrivacyView,
  };

  if (sub && subViews[sub]) {
    const Comp = subViews[sub];
    return <Comp onBack={() => setSub(null)} />;
  }

  return (
    <div>
      <TopBar title="Settings" onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Account header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: VP.card, border: `1px solid ${VP.border}`, borderRadius: 10, marginBottom: 10 }}>
          <Avatar size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{mockUser.username}</div>
            <div style={{ fontSize: 12, color: VP.dim }}>{mockUser.email}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: VP.accent, background: `${VP.accent}18`, padding: "4px 10px", borderRadius: 10 }}>{mockUser.planDisplay}</span>
        </div>

        <SectionHeader>Account</SectionHeader>
        <NavRow label="Profile" desc="Username, avatar, bio" onClick={() => setSub("profile")} />
        <NavRow label="Email" desc="Change your email address" onClick={() => setSub("email")} />
        <NavRow label="Password" desc="Update your password" onClick={() => setSub("password")} />

        <SectionHeader>Security</SectionHeader>
        <NavRow label="Two-Factor Authentication" desc="TOTP authenticator app" onClick={() => setSub("mfa")} />
        <NavRow label="Login Activity" desc="Recent sign-ins and devices" onClick={() => setSub("loginActivity")} />

        <SectionHeader>Messages</SectionHeader>
        <NavRow label="Inbox" desc="Conversations and DMs" onClick={() => {}} />

        <SectionHeader>Subscription</SectionHeader>
        <NavRow label="Manage Plan" desc="Billing and upgrade" onClick={() => setSub("subscription")} />

        <SectionHeader>Preferences</SectionHeader>
        <NavRow label="Notifications" desc="Push, email, and digest settings" onClick={() => setSub("notifications")} />
        <NavRow label="Feed Preferences" desc="Breaking, trending, filters" onClick={() => setSub("feed")} />

        <SectionHeader>Family</SectionHeader>
        <div style={{ fontSize: 12, color: VP.dim, padding: "4px 0 8px" }}>Manage kid profiles from the Kids tab on your profile.</div>

        <SectionHeader>Application</SectionHeader>
        <NavRow label="Verification" desc="Apply as expert, journalist, or public figure" onClick={() => setSub("verification")} />

        <SectionHeader>Help & Info</SectionHeader>
        <NavRow label="Send Feedback" desc="Bug reports and feature requests" onClick={() => {}} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", background: VP.card, border: `1px solid ${VP.border}`, borderRadius: 10 }}>
          <span style={{ fontSize: 14 }}>Version</span>
          <span style={{ fontSize: 14, color: VP.dim }}>2.4.1</span>
        </div>

        <SectionHeader>Data & Privacy</SectionHeader>
        <NavRow label="Export / Delete Data" desc="GDPR, CCPA, DM receipts" onClick={() => setSub("dataPrivacy")} />

        <button style={{ marginTop: 16, padding: "14px", borderRadius: 10, border: `1px solid ${VP.border}`, background: "transparent", color: VP.wrong, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}>
          Log out
        </button>
        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
//  PROFILE VIEW (home screen)
// ══════════════════════════════════════════════════

function ProfileHome({ onOpenSettings }) {
  return (
    <div>
      {/* Identity card */}
      <div style={{ margin: "20px 16px", padding: 20, background: VP.card, border: `1px solid ${VP.border}`, borderRadius: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar size={56} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: VP.text }}>{mockUser.username}</span>
              <BadgeCheck size={14} color={VP.accent} />
            </div>
            <div style={{ fontSize: 12, color: VP.dim }}>{mockUser.planDisplay} · Member since {mockUser.memberSince}</div>
          </div>
          <button style={{ ...iconBtn }}><Share2 size={16} color={VP.dim} /></button>
          <button onClick={onOpenSettings} style={{ ...iconBtn }}><Settings size={16} color={VP.dim} /></button>
        </div>

        {/* Stat grid */}
        <div style={{ display: "flex", marginTop: 16, border: `1px solid ${VP.border}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
          <StatCell label="Verity Score" value={mockUser.verityScore.toLocaleString()} />
          <VertDivider />
          <StatCell label="Day Streak" value={mockUser.streak} />
          <VertDivider />
          <StatCell label="Articles Read" value={mockUser.articlesRead} />
          <VertDivider />
          <StatCell label="Comments" value={mockUser.comments} />
        </div>
      </div>

      {/* Navigation list */}
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        <NavRow icon={<Star size={18} />} label="Profile Card" desc="Your shareable profile card" onClick={() => {}} />
        <NavRow icon={<Activity size={18} />} label="Activity" desc="Reading history, quizzes, and comments" onClick={() => {}} />
        <NavRow icon={<BarChart3 size={18} />} label="Categories" desc="Progress across all categories" onClick={() => {}} />
        <NavRow icon={<Trophy size={18} />} label="Achievements" desc="Badges and milestones" onClick={() => {}} />
        <NavRow icon={<BookOpen size={18} />} label="Bookmarks" desc="Saved articles and collections" onClick={() => {}} />
        <NavRow icon={<MessageSquare size={18} />} label="Messages" desc="Conversations and inbox" onClick={() => {}} />

        <SectionHeader>Help & Settings</SectionHeader>
        <NavRow icon={<HelpCircle size={18} />} label="Contact Us" desc="Get help or send feedback" onClick={() => {}} />
        <NavRow icon={<Settings size={18} />} label="Settings" desc="Profile, billing, security, privacy" onClick={onOpenSettings} />

        {/* Logout */}
        <button style={{
          marginTop: 10, padding: 14, borderRadius: 10, border: `1px solid ${VP.border}`,
          background: "transparent", color: VP.wrong, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%",
        }}>
          Log out
        </button>
        <div style={{ height: 100 }} />
      </div>
    </div>
  );
}

const iconBtn = {
  padding: 8, background: "none", border: `1px solid ${VP.border}`, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

// ══════════════════════════════════════════════════
//  APP SHELL (iPhone frame)
// ══════════════════════════════════════════════════

export default function App() {
  const [screen, setScreen] = useState("profile"); // "profile" | "settings"

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#e8e8ed", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif" }}>
      {/* iPhone frame */}
      <div style={{
        width: 393, height: 852, borderRadius: 44, background: VP.bg, position: "relative",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 0 0 10px #1a1a1a",
        overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        {/* Status bar */}
        <div style={{
          height: 54, padding: "14px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: screen === "settings" ? VP.card : VP.bg, flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>9:41</span>
          <div style={{ width: 126, height: 34, borderRadius: 17, background: "#1a1a1a", position: "absolute", left: "50%", transform: "translateX(-50%)", top: 10 }} />
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <div style={{ width: 16, height: 10, border: "1.5px solid #333", borderRadius: 2, position: "relative" }}>
              <div style={{ position: "absolute", inset: 1, background: "#333", borderRadius: 1 }} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {screen === "profile" ? (
            <ProfileHome onOpenSettings={() => setScreen("settings")} />
          ) : (
            <SettingsHub onBack={() => setScreen("profile")} />
          )}
        </div>

        {/* Home indicator */}
        <div style={{ height: 34, display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0, background: screen === "settings" ? "transparent" : VP.bg }}>
          <div style={{ width: 134, height: 5, borderRadius: 3, background: "#333" }} />
        </div>
      </div>
    </div>
  );
}
