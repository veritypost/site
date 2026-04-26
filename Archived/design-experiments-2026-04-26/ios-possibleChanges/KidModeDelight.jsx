import { useState, useEffect, useRef } from "react";

// ── Theme ──────────────────────────────────────────────────────────────
const THEME = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  text: "#1A1A1A",
  dim: "#8E8E93",
  border: "#E5E5EA",
  accent: "#000000",
  // Kid theme colors (per-kid, we demo "Lila" in teal)
  kid: "#2DD4BF",
  kidWarm: "#5EEAD4",
  kidLight: "#CCFBF1",
  kidDark: "#0D9488",
  // Status
  success: "#22C55E",
  error: "#EF4444",
  gold: "#F59E0B",
  silver: "#9CA3AF",
  bronze: "#D97706",
};

const ROUNDED = "'SF Pro Rounded', 'SF Pro Display', -apple-system, system-ui, sans-serif";
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

// ── App Shell ──────────────────────────────────────────────────────────
export default function KidModeDelight() {
  const [activeDemo, setActiveDemo] = useState(null);
  const [tabIndex, setTabIndex] = useState(0);

  const demos = [
    { id: "greeting", label: "Greeting Band", icon: "sun" },
    { id: "streak", label: "Streak +1", icon: "flame" },
    { id: "quiz", label: "Quiz Pass", icon: "check" },
    { id: "badge", label: "Badge Unlock", icon: "star" },
    { id: "category", label: "Category Trail", icon: "grid" },
    { id: "expert", label: "Expert Session", icon: "bubble" },
    { id: "pin", label: "PIN Handoff", icon: "lock" },
  ];

  return (
    <div style={{
      fontFamily: ROUNDED,
      background: "#F0FDFA",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "24px 16px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: THEME.text,
          margin: 0,
          letterSpacing: -0.5,
        }}>Kid Mode Delight</h1>
        <p style={{
          fontSize: 15,
          color: THEME.dim,
          margin: "6px 0 0",
          fontWeight: 500,
        }}>Tap a moment to see the choreography</p>
      </div>

      {/* Demo Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        width: "100%",
        maxWidth: 500,
        marginBottom: 24,
      }}>
        {demos.map(d => (
          <button
            key={d.id}
            onClick={() => setActiveDemo(d.id)}
            style={{
              background: activeDemo === d.id ? THEME.kid : THEME.card,
              color: activeDemo === d.id ? "#FFF" : THEME.text,
              border: `2px solid ${activeDemo === d.id ? THEME.kid : THEME.border}`,
              borderRadius: 16,
              padding: "16px 12px",
              cursor: "pointer",
              fontFamily: ROUNDED,
              fontWeight: 700,
              fontSize: 13,
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <DemoIcon name={d.icon} active={activeDemo === d.id} />
            {d.label}
          </button>
        ))}
      </div>

      {/* Phone Frame */}
      <div style={{
        width: 375,
        height: 700,
        background: THEME.bg,
        borderRadius: 40,
        border: `3px solid ${THEME.border}`,
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 25px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06)",
      }}>
        {/* Status bar */}
        <div style={{
          height: 54,
          background: THEME.kidLight,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: 6,
        }}>
          <div style={{ width: 120, height: 28, borderRadius: 14, background: THEME.text, opacity: 0.9 }} />
        </div>

        {/* Demo content area */}
        <div style={{ height: 580, overflow: "hidden", position: "relative" }}>
          {!activeDemo && <IdleState />}
          {activeDemo === "greeting" && <GreetingBandDemo />}
          {activeDemo === "streak" && <StreakDemo />}
          {activeDemo === "quiz" && <QuizPassDemo />}
          {activeDemo === "badge" && <BadgeUnlockDemo />}
          {activeDemo === "category" && <CategoryTrailDemo />}
          {activeDemo === "expert" && <ExpertSessionDemo />}
          {activeDemo === "pin" && <PinHandoffDemo />}
        </div>

        {/* Kid Tab Bar */}
        <KidTabBar activeTab={tabIndex} onTabChange={setTabIndex} />
      </div>
    </div>
  );
}

// ── Icons (simple SVG) ─────────────────────────────────────────────────
function DemoIcon({ name, active }) {
  const color = active ? "#FFF" : THEME.kid;
  const size = 24;
  const icons = {
    sun: <circle cx="12" cy="12" r="5" fill={color} />,
    flame: <path d="M12 2C12 2 7 8 7 13a5 5 0 0010 0c0-5-5-11-5-11z" fill={color} />,
    check: <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />,
    star: <path d="M12 2l2.9 6.3L22 9.2l-5 4.8L18.2 22 12 18.3 5.8 22 7 14l-5-4.8 7.1-.9z" fill={color} />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" fill={color}/><rect x="14" y="3" width="7" height="7" rx="2" fill={color} opacity="0.5"/><rect x="3" y="14" width="7" height="7" rx="2" fill={color} opacity="0.5"/><rect x="14" y="14" width="7" height="7" rx="2" fill={color} opacity="0.3"/></>,
    bubble: <><rect x="3" y="4" width="18" height="12" rx="4" fill={color}/><path d="M8 16l-2 4 5-4" fill={color}/></>,
    lock: <><rect x="6" y="11" width="12" height="9" rx="3" fill={color}/><path d="M9 11V8a3 3 0 016 0v3" stroke={color} strokeWidth="2" fill="none"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{icons[name]}</svg>;
}

// ── Idle ────────────────────────────────────────────────────────────────
function IdleState() {
  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
      textAlign: "center",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: THEME.kidLight,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 20,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24">
          <path d="M12 2C12 2 7 8 7 13a5 5 0 0010 0c0-5-5-11-5-11z" fill={THEME.kid} />
        </svg>
      </div>
      <p style={{ fontSize: 17, fontWeight: 700, color: THEME.text, margin: 0 }}>
        Pick a moment above
      </p>
      <p style={{ fontSize: 13, color: THEME.dim, marginTop: 6, fontWeight: 500 }}>
        Each one shows the proposed choreography
      </p>
    </div>
  );
}

// ── 1. GREETING BAND ───────────────────────────────────────────────────
function GreetingBandDemo() {
  const [phase, setPhase] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const name = "Lila";

  useEffect(() => {
    setPhase(0);
    setCharIndex(0);
    const t1 = setTimeout(() => setPhase(1), 300);   // band slides in
    const t2 = setTimeout(() => setPhase(2), 700);   // icon bounces
    const t3 = setTimeout(() => setPhase(3), 900);   // name types
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    if (phase >= 3 && charIndex < name.length) {
      const t = setTimeout(() => setCharIndex(i => i + 1), 50);
      return () => clearTimeout(t);
    }
  }, [phase, charIndex]);

  const bandY = phase >= 1 ? 0 : -100;
  const iconScale = phase >= 2 ? 1 : 0;
  const underlineWidth = phase >= 3 ? "100%" : "0%";
  const showGreeting = phase >= 2;

  return (
    <div style={{ height: "100%", background: THEME.bg }}>
      {/* Greeting Band */}
      <div style={{
        background: `linear-gradient(135deg, ${THEME.kid}, ${THEME.kidDark})`,
        padding: "28px 24px 24px",
        transform: `translateY(${bandY}px)`,
        transition: `transform 0.6s ${SPRING}`,
        borderRadius: "0 0 24px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Time-of-day icon */}
          <div style={{
            width: 44, height: 44,
            borderRadius: 22,
            background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transform: `scale(${iconScale})`,
            transition: `transform 0.5s ${SPRING}`,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="5" fill="#FFF" />
              {[0,45,90,135,180,225,270,315].map(a => (
                <line key={a} x1="12" y1="3" x2="12" y2="1" stroke="#FFF" strokeWidth="2" strokeLinecap="round"
                  transform={`rotate(${a} 12 12)`} />
              ))}
            </svg>
          </div>

          <div>
            <p style={{
              fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)",
              margin: 0,
              opacity: showGreeting ? 1 : 0,
              transition: "opacity 0.3s ease",
            }}>Good morning</p>
            <div style={{ position: "relative" }}>
              <p style={{
                fontSize: 28, fontWeight: 800, color: "#FFF",
                margin: 0, letterSpacing: -0.5,
              }}>
                {name.slice(0, charIndex)}
                {charIndex < name.length && (
                  <span style={{
                    display: "inline-block",
                    width: 2, height: 28,
                    background: "#FFF",
                    marginLeft: 1,
                    animation: "blink 0.8s infinite",
                  }} />
                )}
              </p>
              {/* Underline trim */}
              <div style={{
                height: 3, borderRadius: 2,
                background: "rgba(255,255,255,0.5)",
                width: underlineWidth,
                transition: "width 0.4s ease-out",
                marginTop: 4,
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Breathing icon indicator */}
      {phase >= 3 && (
        <div style={{
          display: "flex", justifyContent: "center", marginTop: 40,
        }}>
          <div style={{
            padding: "12px 20px",
            background: THEME.kidLight,
            borderRadius: 12,
            display: "flex", alignItems: "center", gap: 8,
            animation: "breathe 3s ease-in-out infinite",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="5" fill={THEME.kid} />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.kidDark }}>
              Icon breathes while on screen
            </span>
          </div>
        </div>
      )}

      {/* Replay */}
      <ReplayButton onReplay={() => { setPhase(0); setCharIndex(0); setTimeout(() => { setPhase(1); setTimeout(() => setPhase(2), 400); setTimeout(() => setPhase(3), 600); }, 300); }} />

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        @keyframes breathe { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.02) } }
      `}</style>
    </div>
  );
}

// ── 2. STREAK +1 ───────────────────────────────────────────────────────
function StreakDemo() {
  const [streakVal, setStreakVal] = useState(6);
  const [phase, setPhase] = useState(0);
  const [particles, setParticles] = useState([]);

  function fire() {
    setPhase(0);
    setTimeout(() => {
      setPhase(1); // number rolls
      setStreakVal(7);
    }, 300);
    setTimeout(() => setPhase(2), 500); // flame ignites
    setTimeout(() => {
      setPhase(3); // burst
      setParticles(Array.from({ length: 8 }, (_, i) => ({
        id: i,
        angle: (i * 45) * (Math.PI / 180),
        color: [THEME.kid, THEME.kidWarm, THEME.gold, "#FFF"][i % 4],
      })));
    }, 700);
    setTimeout(() => setPhase(4), 2000); // settle
  }

  useEffect(() => { fire(); }, []);

  const isMilestone = streakVal === 7;

  return (
    <div style={{
      height: "100%", background: THEME.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
    }}>
      {/* Milestone takeover background */}
      {isMilestone && phase >= 3 && (
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(circle at center, ${THEME.kidLight} 0%, ${THEME.bg} 70%)`,
          opacity: phase >= 3 ? 1 : 0,
          transition: "opacity 0.6s ease",
        }} />
      )}

      {/* Flame + Number */}
      <div style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center",
        zIndex: 2,
      }}>
        {/* Flame */}
        <div style={{
          width: 80, height: 80,
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: phase >= 2 ? "scale(1)" : "scale(0.6)",
          transition: `transform 0.5s ${SPRING}`,
          position: "relative",
        }}>
          <svg width="64" height="64" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="flameGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={THEME.kidDark} />
                <stop offset="50%" stopColor={THEME.kid} />
                <stop offset="100%" stopColor="#FFF" />
              </linearGradient>
            </defs>
            <path d="M12 2C12 2 6 9 6 14a6 6 0 0012 0c0-5-6-12-6-12z" fill="url(#flameGrad)">
              {phase >= 2 && (
                <animateTransform attributeName="transform" type="scale" values="1;1.05;1" dur="1.5s" repeatCount="3" additive="sum" />
              )}
            </path>
          </svg>

          {/* Variable color cycling overlay */}
          {phase >= 2 && (
            <div style={{
              position: "absolute", inset: 0,
              borderRadius: "50%",
              animation: "pulseGlow 0.5s ease-in-out 3",
            }} />
          )}
        </div>

        {/* Rolling number */}
        <div style={{
          fontSize: 56, fontWeight: 900,
          color: THEME.text,
          position: "relative",
          overflow: "hidden",
          height: 68,
          lineHeight: "68px",
        }}>
          <div style={{
            transform: phase >= 1 ? "translateY(0)" : "translateY(68px)",
            transition: `transform 0.4s ${SPRING}`,
          }}>
            {streakVal}
          </div>
        </div>

        <p style={{
          fontSize: 15, fontWeight: 700,
          color: THEME.dim,
          margin: "4px 0 0",
        }}>day streak</p>
      </div>

      {/* Radial burst particles */}
      {phase >= 3 && particles.map(p => (
        <div key={p.id} style={{
          position: "absolute",
          left: "50%", top: "45%",
          width: 4, height: 20,
          borderRadius: 2,
          background: p.color,
          transform: `rotate(${p.angle * 180 / Math.PI}deg) translateY(-60px)`,
          opacity: phase >= 4 ? 0 : 1,
          transition: "opacity 0.8s ease-out",
          animation: `burstOut 0.6s ${SPRING} forwards`,
          animationDelay: `${p.id * 30}ms`,
        }} />
      ))}

      {/* Milestone banner */}
      {isMilestone && phase >= 3 && (
        <div style={{
          marginTop: 32,
          background: THEME.card,
          borderRadius: 20,
          padding: "20px 28px",
          textAlign: "center",
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          transform: phase >= 3 ? "translateY(0) scale(1)" : "translateY(20px) scale(0.95)",
          opacity: phase >= 3 ? 1 : 0,
          transition: `all 0.5s ${SPRING}`,
          transitionDelay: "0.3s",
          zIndex: 2,
        }}>
          {/* Shield + flame crest */}
          <div style={{
            width: 48, height: 48, margin: "0 auto 12px",
            background: THEME.kidLight,
            borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px solid ${THEME.kid}`,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M12 2l-8 4v5c0 5.5 3.4 10.7 8 12 4.6-1.3 8-6.5 8-12V6l-8-4z" fill={THEME.kid} />
              <path d="M12 8c0 0-2 3-2 5a2 2 0 004 0c0-2-2-5-2-5z" fill="#FFF" />
            </svg>
          </div>
          <p style={{
            fontSize: 17, fontWeight: 800, color: THEME.text, margin: 0,
          }}>You've read news for seven days straight.</p>
          <p style={{
            fontSize: 13, fontWeight: 500, color: THEME.dim, margin: "8px 0 0",
          }}>That's a real habit.</p>

          {/* Share card */}
          <button style={{
            marginTop: 16, padding: "10px 24px",
            background: THEME.kid, color: "#FFF",
            border: "none", borderRadius: 100,
            fontFamily: ROUNDED, fontWeight: 700, fontSize: 14,
            cursor: "pointer",
          }}>Share this</button>
        </div>
      )}

      <ReplayButton onReplay={() => { setStreakVal(6); setPhase(0); setParticles([]); setTimeout(fire, 200); }} />

      <style>{`
        @keyframes burstOut {
          from { transform: rotate(var(--angle)) translateY(0); opacity: 1 }
          to { transform: rotate(var(--angle)) translateY(-80px); opacity: 0 }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 transparent }
          50% { box-shadow: 0 0 30px 10px ${THEME.kidLight} }
        }
      `}</style>
    </div>
  );
}

// ── 3. QUIZ PASS ───────────────────────────────────────────────────────
function QuizPassDemo() {
  const [phase, setPhase] = useState(0);
  const [score, setScore] = useState(72);
  const [ringPct, setRingPct] = useState(0);

  function fire() {
    setPhase(0); setScore(72); setRingPct(0);
    setTimeout(() => setPhase(1), 400);  // correct chip scales
    setTimeout(() => setPhase(2), 900);  // radial fill
    setTimeout(() => {
      setPhase(3); // result card slides up
      // Animate score roll
      let current = 72;
      const target = 84;
      const step = () => {
        current += 1;
        setScore(current);
        if (current < target) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // Animate ring
      let r = 0;
      const ringStep = () => {
        r += 0.8;
        setRingPct(Math.min(r, 84));
        if (r < 84) requestAnimationFrame(ringStep);
      };
      setTimeout(ringStep, 300);
    }, 1400);
  }

  useEffect(() => { fire(); }, []);

  return (
    <div style={{
      height: "100%", background: THEME.bg,
      position: "relative", overflow: "hidden",
    }}>
      {/* Question area (faded in background) */}
      <div style={{
        padding: "24px 20px",
        opacity: phase >= 3 ? 0.15 : 1,
        transition: "opacity 0.4s ease",
        filter: phase >= 2 ? "saturate(0.97)" : "none",
      }}>
        <div style={{
          display: "flex", gap: 6, marginBottom: 16, justifyContent: "center",
        }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 4,
              background: i <= 4 ? THEME.kid : (i === 5 && phase >= 0 ? THEME.kid : THEME.border),
              transition: "all 0.3s ease",
              transform: i === 5 && phase === 0 ? "scale(1.3)" : "scale(1)",
              animation: i === 5 && phase === 0 ? "dotPulse 0.6s ease-in-out 3" : "none",
            }} />
          ))}
        </div>

        <p style={{
          fontSize: 13, fontWeight: 600, color: THEME.dim,
          textAlign: "center", margin: "0 0 8px",
          textTransform: "uppercase", letterSpacing: 0.8,
        }}>Question 5 of 5</p>

        <p style={{
          fontSize: 17, fontWeight: 700, color: THEME.text,
          textAlign: "center", margin: "0 0 20px",
          lineHeight: 1.4,
        }}>Which headline uses a loaded word to influence the reader?</p>

        {/* Answer chips */}
        {[
          { text: '"City announces new park plans"', correct: false },
          { text: '"Mayor slams opposition in heated debate"', correct: true },
          { text: '"School board reviews budget proposal"', correct: false },
          { text: '"Weather expected to change this week"', correct: false },
        ].map((a, i) => (
          <div key={i} style={{
            padding: "14px 16px",
            background: a.correct && phase >= 1 ? THEME.kidLight : THEME.card,
            border: `2px solid ${a.correct && phase >= 1 ? THEME.kid : THEME.border}`,
            borderRadius: 14,
            marginBottom: 8,
            fontSize: 15,
            fontWeight: 600,
            color: THEME.text,
            transform: a.correct && phase === 1 ? "scale(1.03)" : "scale(1)",
            transition: `all 0.35s ${SPRING}`,
            position: "relative",
            overflow: "hidden",
          }}>
            {a.text}
            {/* Radial fill sweep */}
            {a.correct && phase >= 2 && (
              <div style={{
                position: "absolute", inset: 0,
                background: `radial-gradient(circle at center, ${THEME.kidLight} 0%, transparent 70%)`,
                animation: "radialFill 0.5s ease-out forwards",
                borderRadius: 12,
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Result card overlay */}
      {phase >= 3 && (
        <div style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          background: THEME.card,
          borderRadius: "24px 24px 0 0",
          padding: "32px 24px 40px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.1)",
          transform: phase >= 3 ? "translateY(0)" : "translateY(100%)",
          transition: `transform 0.5s ${EASE_OUT}`,
          textAlign: "center",
        }}>
          <p style={{
            fontSize: 13, fontWeight: 700, color: THEME.kid,
            textTransform: "uppercase", letterSpacing: 1,
            margin: "0 0 16px",
          }}>Quiz passed</p>

          {/* Progress ring */}
          <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 20px" }}>
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="60" cy="60" r="52" fill="none" stroke={THEME.border} strokeWidth="8" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={THEME.kid} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - ringPct / 100)}`}
                style={{ transition: "stroke-dashoffset 0.05s linear" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                fontSize: 32, fontWeight: 900, color: THEME.text,
              }}>{score}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: THEME.dim }}>Verity Score</span>
            </div>
          </div>

          {/* Summary bars */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
            {[
              { label: "Correct", val: "5/5", color: THEME.kid },
              { label: "Time", val: "42s", color: THEME.dim },
              { label: "Delta", val: "+12", color: THEME.success },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, padding: "10px 8px",
                background: THEME.bg, borderRadius: 10,
                textAlign: "center",
              }}>
                <p style={{ fontSize: 17, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: THEME.dim, margin: "2px 0 0" }}>{s.label}</p>
              </div>
            ))}
          </div>

          <p style={{
            fontSize: 15, fontWeight: 600, color: THEME.text, margin: "0 0 16px",
          }}>You spotted a loaded headline on the first try.</p>

          <button style={{
            padding: "12px 32px", background: THEME.kid, color: "#FFF",
            border: "none", borderRadius: 100,
            fontFamily: ROUNDED, fontWeight: 700, fontSize: 15,
            cursor: "pointer",
          }}>Share result</button>
        </div>
      )}

      <ReplayButton onReplay={() => fire()} />

      <style>{`
        @keyframes dotPulse {
          0%, 100% { transform: scale(1) }
          50% { transform: scale(1.6) }
        }
        @keyframes radialFill {
          from { transform: scale(0); opacity: 0.8 }
          to { transform: scale(3); opacity: 0 }
        }
      `}</style>
    </div>
  );
}

// ── 4. BADGE UNLOCK ────────────────────────────────────────────────────
function BadgeUnlockDemo() {
  const [phase, setPhase] = useState(0);

  function fire() {
    setPhase(0);
    setTimeout(() => setPhase(1), 300);  // dim background
    setTimeout(() => setPhase(2), 500);  // badge enters
    setTimeout(() => setPhase(3), 1000); // shimmer
    setTimeout(() => setPhase(4), 1600); // text + buttons
  }

  useEffect(() => { fire(); }, []);

  return (
    <div style={{
      height: "100%", position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Dimmed background */}
      <div style={{
        position: "absolute", inset: 0,
        background: THEME.bg,
      }}>
        {/* Fake content behind */}
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            margin: "12px 20px", height: 60, borderRadius: 12,
            background: THEME.card, border: `1px solid ${THEME.border}`,
          }} />
        ))}
      </div>

      {/* Overlay dim */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.5)",
        opacity: phase >= 1 ? 1 : 0,
        transition: "opacity 0.3s ease",
      }} />

      {/* Badge */}
      <div style={{
        position: "relative", zIndex: 2,
        display: "flex", flexDirection: "column", alignItems: "center",
        transform: phase >= 2 ? "scale(1)" : "scale(0.3)",
        opacity: phase >= 2 ? 1 : 0,
        transition: `transform 0.6s ${SPRING}, opacity 0.3s ease`,
      }}>
        {/* Badge shape */}
        <div style={{
          width: 120, height: 120,
          borderRadius: 28,
          background: `linear-gradient(135deg, ${THEME.gold}, #FDE68A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(245, 158, 11, 0.3)",
        }}>
          {/* Conic shimmer */}
          {phase >= 3 && (
            <div style={{
              position: "absolute", inset: -60,
              background: "conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.4) 10%, transparent 20%)",
              animation: "shimmerSpin 0.9s linear 1",
            }} />
          )}

          <svg width="56" height="56" viewBox="0 0 24 24" style={{ position: "relative", zIndex: 1 }}>
            <path d="M12 2l2.9 6.3L22 9.2l-5 4.8L18.2 22 12 18.3 5.8 22 7 14l-5-4.8 7.1-.9z" fill="#FFF" />
          </svg>

          {/* Gold ring */}
          <div style={{
            position: "absolute", inset: -3,
            borderRadius: 31,
            border: `3px solid ${THEME.gold}`,
            opacity: phase >= 3 ? 1 : 0,
            animation: phase >= 3 ? "ringPulse 0.4s ease-in-out 2" : "none",
          }} />
        </div>

        {/* Text */}
        <div style={{
          marginTop: 24,
          textAlign: "center",
          opacity: phase >= 4 ? 1 : 0,
          transform: phase >= 4 ? "translateY(0)" : "translateY(10px)",
          transition: `all 0.4s ${EASE_OUT}`,
          transitionDelay: "0.1s",
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: THEME.gold,
            textTransform: "uppercase", letterSpacing: 1.2,
            margin: "0 0 6px",
          }}>Gold badge</p>
          <p style={{
            fontSize: 20, fontWeight: 800, color: "#FFF",
            margin: "0 0 8px",
          }}>You spotted a biased headline five times.</p>
          <p style={{
            fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)",
            margin: 0,
          }}>Bias Detection -- Level 3</p>
        </div>

        {/* Buttons */}
        <div style={{
          display: "flex", gap: 12, marginTop: 24,
          opacity: phase >= 4 ? 1 : 0,
          transform: phase >= 4 ? "translateY(0)" : "translateY(15px)",
          transition: `all 0.4s ${EASE_OUT}`,
          transitionDelay: "0.25s",
        }}>
          <button style={{
            padding: "12px 28px", background: THEME.kid, color: "#FFF",
            border: "none", borderRadius: 100,
            fontFamily: ROUNDED, fontWeight: 700, fontSize: 14,
            cursor: "pointer",
          }}>Share</button>
          <button style={{
            padding: "12px 28px", background: "rgba(255,255,255,0.15)", color: "#FFF",
            border: "1px solid rgba(255,255,255,0.3)", borderRadius: 100,
            fontFamily: ROUNDED, fontWeight: 600, fontSize: 14,
            cursor: "pointer",
          }}>Dismiss</button>
        </div>
      </div>

      <ReplayButton onReplay={() => fire()} light />

      <style>{`
        @keyframes shimmerSpin {
          from { transform: rotate(0deg) }
          to { transform: rotate(360deg) }
        }
        @keyframes ringPulse {
          0%, 100% { transform: scale(1); opacity: 1 }
          50% { transform: scale(1.08); opacity: 0.6 }
        }
      `}</style>
    </div>
  );
}

// ── 5. CATEGORY TRAIL ──────────────────────────────────────────────────
function CategoryTrailDemo() {
  const [phase, setPhase] = useState(0);
  const [filledNodes, setFilledNodes] = useState(2);

  function fire() {
    setPhase(0); setFilledNodes(2);
    setTimeout(() => setPhase(1), 400);  // tile bounces
    setTimeout(() => {
      setPhase(2); // new nodes fill
      let count = 2;
      const fill = setInterval(() => {
        count++;
        setFilledNodes(count);
        if (count >= 4) clearInterval(fill);
      }, 150);
    }, 800);
    setTimeout(() => setPhase(3), 1400); // settled
  }

  useEffect(() => { fire(); }, []);

  const categories = [
    { name: "Science", progress: 4, total: 5, color: "#8B5CF6" },
    { name: "World News", progress: 2, total: 5, color: THEME.kid },
    { name: "Sports", progress: 0, total: 5, color: "#F59E0B" },
    { name: "Technology", progress: 3, total: 5, color: "#3B82F6" },
  ];

  return (
    <div style={{ height: "100%", background: THEME.bg, padding: "20px 16px" }}>
      <p style={{
        fontSize: 13, fontWeight: 700, color: THEME.dim,
        textTransform: "uppercase", letterSpacing: 0.8,
        margin: "0 0 16px 4px",
      }}>Categories</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {categories.map((cat, i) => {
          const isActive = i === 1; // "World News" is the one we animate
          const currentProgress = isActive ? filledNodes : cat.progress;

          return (
            <div key={cat.name} style={{
              background: THEME.card,
              borderRadius: 16,
              padding: 16,
              border: `2px solid ${isActive && phase >= 1 ? cat.color + "40" : THEME.border}`,
              transform: isActive && phase === 1 ? "scale(1.03)" : "scale(1)",
              transition: `all 0.4s ${SPRING}`,
            }}>
              {/* Icon placeholder */}
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: cat.color + "20",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 10,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6,
                  background: cat.color,
                  transform: isActive && phase === 1 ? "scale(1.2) rotate(10deg)" : "scale(1)",
                  transition: `transform 0.5s ${SPRING}`,
                }} />
              </div>

              <p style={{
                fontSize: 15, fontWeight: 700, color: THEME.text,
                margin: "0 0 10px",
              }}>{cat.name}</p>

              {/* Progress trail */}
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: cat.total }, (_, j) => (
                  <div key={j} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: j < currentProgress ? cat.color : THEME.border,
                    transition: `background 0.15s ease ${j * 100}ms`,
                    transform: isActive && phase === 2 && j >= 2 && j < currentProgress ? "scaleY(1.8)" : "scaleY(1)",
                    transitionProperty: "background, transform",
                  }} />
                ))}
              </div>

              <p style={{
                fontSize: 11, fontWeight: 600, color: THEME.dim,
                margin: "6px 0 0",
              }}>{currentProgress} of {cat.total}</p>
            </div>
          );
        })}
      </div>

      {/* Wayfinding preview */}
      {phase >= 3 && (
        <div style={{
          marginTop: 20, padding: 16,
          background: THEME.card, borderRadius: 16,
          border: `1px solid ${THEME.border}`,
        }}>
          <p style={{
            fontSize: 13, fontWeight: 700, color: THEME.dim,
            textTransform: "uppercase", letterSpacing: 0.8,
            margin: "0 0 12px",
          }}>Inside category: wayfinding trail</p>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {[1,2,3,4,5].map(n => (
              <div key={n} style={{ display: "flex", alignItems: "center" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: n <= 4 ? THEME.kid : THEME.border,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: n === 4 ? `2px solid ${THEME.kidDark}` : "none",
                  animation: n === 4 ? "currentPulse 2s ease-in-out infinite" : "none",
                }}>
                  {n <= 3 && (
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" stroke="#FFF" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                  )}
                  {n === 4 && <div style={{ width: 8, height: 8, borderRadius: 4, background: "#FFF" }} />}
                </div>
                {n < 5 && (
                  <div style={{
                    width: 24, height: 3, borderRadius: 1.5,
                    background: n <= 3 ? THEME.kid : THEME.border,
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ReplayButton onReplay={() => fire()} />

      <style>{`
        @keyframes currentPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${THEME.kid}40 }
          50% { box-shadow: 0 0 0 6px ${THEME.kid}00 }
        }
      `}</style>
    </div>
  );
}

// ── 6. EXPERT SESSION ──────────────────────────────────────────────────
function ExpertSessionDemo() {
  const [hasNew, setHasNew] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setTimeout(() => setHasNew(true), 800);
  }, []);

  return (
    <div style={{ height: "100%", background: THEME.bg, padding: "20px 16px" }}>
      <p style={{
        fontSize: 13, fontWeight: 700, color: THEME.dim,
        textTransform: "uppercase", letterSpacing: 0.8,
        margin: "0 0 16px 4px",
      }}>Expert Q&A</p>

      {/* Idle card */}
      <div
        onClick={() => { if (hasNew) setExpanded(!expanded); }}
        style={{
          background: THEME.card,
          borderRadius: 16,
          padding: 16,
          border: `2px solid ${hasNew ? THEME.kid : THEME.border}`,
          cursor: hasNew ? "pointer" : "default",
          transition: "all 0.3s ease",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Pulsing ring when new */}
        {hasNew && !expanded && (
          <div style={{
            position: "absolute", inset: -2,
            borderRadius: 18,
            border: `2px solid ${THEME.kid}`,
            animation: "expertRing 2s ease-in-out infinite",
          }} />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          {/* Icon */}
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: hasNew ? THEME.kidLight : THEME.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.3s ease",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24">
              {hasNew ? (
                <>
                  <rect x="2" y="4" width="9" height="10" rx="3" fill={THEME.kid} />
                  <rect x="13" y="6" width="9" height="10" rx="3" fill={THEME.kidDark} />
                  <path d="M7 14l-2 3 4-3" fill={THEME.kid} />
                  <path d="M18 16l2 3-4-3" fill={THEME.kidDark} />
                </>
              ) : (
                <>
                  <circle cx="12" cy="10" r="6" fill={THEME.dim} opacity="0.3" />
                  <text x="12" y="14" textAnchor="middle" fontSize="10" fill={THEME.dim}>?</text>
                </>
              )}
            </svg>
          </div>

          <div style={{ flex: 1 }}>
            <p style={{
              fontSize: 15, fontWeight: 700, color: THEME.text, margin: 0,
            }}>Dr. Sarah Chen</p>
            <p style={{
              fontSize: 13, fontWeight: 500,
              color: hasNew ? THEME.kid : THEME.dim,
              margin: "2px 0 0",
            }}>
              {hasNew ? "New answer waiting" : "Waiting for response..."}
            </p>
          </div>

          {hasNew && !expanded && (
            <div style={{
              width: 10, height: 10, borderRadius: 5,
              background: THEME.kid,
              animation: "dotBreathe 1.5s ease-in-out infinite",
            }} />
          )}
        </div>

        {/* Expanded answer */}
        {expanded && (
          <div style={{
            marginTop: 16, paddingTop: 16,
            borderTop: `1px solid ${THEME.border}`,
            animation: "fadeSlideUp 0.3s ease-out",
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: THEME.dim, margin: "0 0 6px" }}>
              Your question:
            </p>
            <p style={{ fontSize: 14, fontWeight: 500, color: THEME.text, margin: "0 0 12px" }}>
              "Why do some news sites use different headlines for the same story?"
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: THEME.kid, margin: "0 0 6px" }}>
              Dr. Chen's answer:
            </p>
            <p style={{ fontSize: 14, fontWeight: 500, color: THEME.text, margin: 0, lineHeight: 1.5 }}>
              Great question! Different news organizations choose headlines based on what they think their readers
              care about most. One paper might focus on the "who" while another emphasizes the "why."
              This is called editorial framing, and it's one of the most important things to notice...
            </p>
          </div>
        )}
      </div>

      {/* Annotation */}
      <div style={{
        marginTop: 16, padding: 12,
        background: THEME.kidLight, borderRadius: 12,
        fontSize: 12, fontWeight: 600, color: THEME.kidDark,
        lineHeight: 1.5,
      }}>
        The "new answer" cue persists until tapped. It survives scroll-past. The icon swaps from a
        question mark to a conversation bubble using symbol replace transition. The ring pulses at half speed.
      </div>

      <style>{`
        @keyframes expertRing {
          0%, 100% { opacity: 0.3 }
          50% { opacity: 0.8 }
        }
        @keyframes dotBreathe {
          0%, 100% { transform: scale(1); opacity: 1 }
          50% { transform: scale(1.3); opacity: 0.7 }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </div>
  );
}

// ── 7. PIN HANDOFF ─────────────────────────────────────────────────────
function PinHandoffDemo() {
  const [phase, setPhase] = useState(0);
  const [dots, setDots] = useState([false, false, false, false]);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  function fire() {
    setPhase(0); setDots([false,false,false,false]); setError(false); setSuccess(false);
    setTimeout(() => setPhase(1), 500);   // sheet slides up
    setTimeout(() => setDots([true,false,false,false]), 1500);
    setTimeout(() => setDots([true,true,false,false]), 1800);
    setTimeout(() => setDots([true,true,true,false]), 2100);
    setTimeout(() => {
      setDots([true,true,true,true]);
      // Wrong PIN first
      setTimeout(() => {
        setError(true);
        setTimeout(() => {
          setError(false);
          setDots([false,false,false,false]);
          // Correct PIN
          setTimeout(() => setDots([true,false,false,false]), 400);
          setTimeout(() => setDots([true,true,false,false]), 600);
          setTimeout(() => setDots([true,true,true,false]), 800);
          setTimeout(() => {
            setDots([true,true,true,true]);
            setTimeout(() => setSuccess(true), 300);
          }, 1000);
        }, 600);
      }, 400);
    }, 2400);
  }

  useEffect(() => { fire(); }, []);

  return (
    <div style={{
      height: "100%", position: "relative",
      background: THEME.bg,
    }}>
      {/* Kid content behind */}
      <div style={{
        padding: 20,
        opacity: phase >= 1 ? 0.3 : 1,
        transition: "opacity 0.45s ease",
        filter: phase >= 1 ? `saturate(${success ? 0 : 0.5})` : "none",
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${THEME.kid}, ${THEME.kidDark})`,
          borderRadius: 20, padding: 20, marginBottom: 12,
        }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: "#FFF", margin: 0 }}>Lila's space</p>
        </div>
        {[0,1].map(i => (
          <div key={i} style={{
            height: 60, borderRadius: 12,
            background: THEME.card, marginBottom: 8,
            border: `1px solid ${THEME.border}`,
          }} />
        ))}
      </div>

      {/* Success dissolve to parent area */}
      {success && (
        <div style={{
          position: "absolute", inset: 0,
          background: THEME.bg,
          animation: "dissolveIn 0.6s ease-out forwards",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          zIndex: 5,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: THEME.bg,
            border: `2px solid ${THEME.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" stroke={THEME.text} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: THEME.text, margin: 0 }}>Welcome back</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: THEME.dim, marginTop: 4 }}>Parent mode</p>
        </div>
      )}

      {/* PIN Sheet */}
      {phase >= 1 && !success && (
        <div style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          background: THEME.card,
          borderRadius: "24px 24px 0 0",
          padding: "32px 24px 48px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.1)",
          transform: phase >= 1 ? "translateY(0)" : "translateY(100%)",
          transition: `transform 0.45s ${EASE_OUT}`,
          textAlign: "center",
          zIndex: 3,
        }}>
          <p style={{
            fontSize: 17, fontWeight: 800, color: THEME.text,
            margin: "0 0 6px",
          }}>Pass the phone to a grown-up</p>
          <p style={{
            fontSize: 13, fontWeight: 500, color: THEME.dim,
            margin: "0 0 28px",
          }}>Enter your family PIN to continue</p>

          {/* PIN dots */}
          <div style={{
            display: "flex", gap: 16, justifyContent: "center",
            marginBottom: 32,
          }}>
            {dots.map((filled, i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: 8,
                background: filled ? (error ? THEME.error : THEME.text) : "transparent",
                border: `2px solid ${error ? THEME.error : (filled ? THEME.text : THEME.border)}`,
                transition: `all 0.2s ${SPRING}`,
                transform: error ? `translateX(${i % 2 === 0 ? -4 : 4}px)` : "translateX(0)",
              }} />
            ))}
          </div>

          {/* Error state */}
          {error && (
            <div style={{
              padding: "8px 16px",
              background: THEME.error + "15",
              borderRadius: 8,
              border: `1px solid ${THEME.kid}20`,
              marginBottom: 16,
              animation: "shake 0.4s ease-in-out",
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: THEME.error, margin: 0 }}>
                That's not right. Try again.
              </p>
            </div>
          )}

          {/* Fake numpad */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8, maxWidth: 240, margin: "0 auto",
          }}>
            {[1,2,3,4,5,6,7,8,9,null,0,null].map((n, i) => (
              <div key={i} style={{
                height: 48, borderRadius: 12,
                background: n !== null ? THEME.bg : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 700, color: THEME.text,
              }}>
                {n !== null ? n : ""}
              </div>
            ))}
          </div>

          {/* Kid theme accent on error */}
          {error && (
            <div style={{
              position: "absolute",
              top: 0, left: 0, right: 0, height: 3,
              background: THEME.kid,
              borderRadius: "24px 24px 0 0",
              animation: "flashKid 0.6s ease-out forwards",
            }} />
          )}
        </div>
      )}

      <ReplayButton onReplay={() => fire()} />

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) }
          25% { transform: translateX(-6px) }
          75% { transform: translateX(6px) }
        }
        @keyframes flashKid {
          from { opacity: 1 }
          to { opacity: 0 }
        }
        @keyframes dissolveIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
      `}</style>
    </div>
  );
}

// ── Kid Tab Bar ────────────────────────────────────────────────────────
function KidTabBar({ activeTab, onTabChange }) {
  const tabs = [
    { label: "Home", icon: "house" },
    { label: "Explore", icon: "search" },
    { label: "Profile", icon: "person" },
  ];

  return (
    <div style={{
      height: 66,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: THEME.bg,
      borderTop: `1px solid ${THEME.border}`,
      padding: "0 24px",
      gap: 8,
    }}>
      {tabs.map((tab, i) => (
        <button
          key={tab.label}
          onClick={() => onTabChange(i)}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            background: activeTab === i
              ? THEME.kid
              : "transparent",
            border: "none",
            borderRadius: 100,
            padding: "8px 0",
            cursor: "pointer",
            transition: `all 0.3s ${SPRING}`,
          }}
        >
          <TabIcon name={tab.icon} active={activeTab === i} />
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: activeTab === i ? "#FFF" : THEME.dim,
          }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function TabIcon({ name, active }) {
  const color = active ? "#FFF" : THEME.dim;
  const icons = {
    house: <path d="M3 12l9-8 9 8v8a1 1 0 01-1 1h-4v-5h-8v5H4a1 1 0 01-1-1v-8z" fill={color} />,
    search: <><circle cx="10" cy="10" r="6" stroke={color} strokeWidth="2" fill="none"/><line x1="14.5" y1="14.5" x2="20" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/></>,
    person: <><circle cx="12" cy="8" r="4" fill={color}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill={color}/></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24">{icons[name]}</svg>;
}

// ── Replay Button ──────────────────────────────────────────────────────
function ReplayButton({ onReplay, light }) {
  return (
    <button
      onClick={onReplay}
      style={{
        position: "absolute",
        bottom: 72, right: 16,
        width: 40, height: 40,
        borderRadius: 20,
        background: light ? "rgba(255,255,255,0.2)" : THEME.bg,
        border: `1px solid ${light ? "rgba(255,255,255,0.3)" : THEME.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 10,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path d="M3 12a9 9 0 019-9m0 0l-3 3m3-3l3 3" stroke={light ? "#FFF" : THEME.dim}
          strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M21 12a9 9 0 01-9 9" stroke={light ? "#FFF" : THEME.dim}
          strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}
