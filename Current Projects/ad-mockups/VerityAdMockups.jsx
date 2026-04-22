import React, { useState } from "react";

// ── Design tokens ──────────────────────────────────────────────────────
const NEUTRAL = {
  900: "#111111",
  800: "#1f1f1f",
  700: "#333333",
  600: "#555555",
  500: "#777777",
  400: "#9e9e9e",
  300: "#d4d4d4",
  200: "#e5e5e5",
  100: "#f5f5f5",
  50: "#fafafa",
  0: "#ffffff",
};

const KID_TEAL = "#0d9488";
const KID_TEAL_LIGHT = "#ccfbf1";
const KID_VIOLET = "#7c3aed";
const ACCENT_RED = "#dc2626";
const ACCENT_YELLOW = "#f59e0b";

const ROUNDED = '"SF Pro Rounded", ui-rounded, system-ui, sans-serif';
const SYSTEM = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

// ── Mini Verity UI snippets for embedding in ads ───────────────────────

function VerityCardMini({ size = "md" }) {
  const scale = size === "sm" ? 0.85 : 1;
  return (
    <div
      style={{
        fontFamily: SYSTEM,
        background: NEUTRAL[0],
        padding: `${20 * scale}px ${18 * scale}px`,
        borderRadius: 10,
        border: `1px solid ${NEUTRAL[200]}`,
      }}
    >
      <div
        style={{
          fontSize: 10 * scale,
          fontWeight: 600,
          letterSpacing: 1.2,
          color: NEUTRAL[500],
          textTransform: "uppercase",
          marginBottom: 8 * scale,
        }}
      >
        Politics · Investigations
      </div>
      <div
        style={{
          fontSize: 17 * scale,
          fontWeight: 700,
          color: NEUTRAL[900],
          lineHeight: 1.2,
          letterSpacing: -0.3,
          marginBottom: 6 * scale,
        }}
      >
        Senate Committee Votes to Subpoena Treasury Records
      </div>
      <div
        style={{
          fontSize: 13 * scale,
          color: NEUTRAL[600],
          lineHeight: 1.4,
          marginBottom: 10 * scale,
        }}
      >
        Bipartisan vote signals expanding scope. What it means for the next round of hearings.
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ fontSize: 11 * scale, fontWeight: 500, color: NEUTRAL[900] }}>
          Elena Martinez
        </div>
        <div
          style={{
            width: 3,
            height: 3,
            borderRadius: 3,
            background: NEUTRAL[300],
          }}
        />
        <div style={{ fontSize: 11 * scale, color: NEUTRAL[500] }}>4 min read</div>
      </div>
    </div>
  );
}

function KidCardMini({ themeColor = KID_TEAL }) {
  return (
    <div
      style={{
        fontFamily: ROUNDED,
        background: NEUTRAL[0],
        padding: 16,
        borderRadius: 20,
        border: `1.5px solid ${NEUTRAL[200]}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: themeColor,
          }}
        />
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: themeColor,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Today's Story
        </div>
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: NEUTRAL[900],
          lineHeight: 1.25,
          marginBottom: 8,
        }}
      >
        Scientists found a new way to recycle plastic using sunlight
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: NEUTRAL[600],
          lineHeight: 1.4,
          marginBottom: 14,
        }}
      >
        A team in Australia made a special material that can break down old plastic bottles into reusable parts — just by putting them in the sun.
      </div>
      <button
        style={{
          background: themeColor,
          color: "white",
          border: "none",
          borderRadius: 100,
          padding: "8px 16px",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: ROUNDED,
        }}
      >
        Read it
      </button>
    </div>
  );
}

function ClickbaitCardMini() {
  return (
    <div
      style={{
        fontFamily: SYSTEM,
        background: "#fffbeb",
        padding: 14,
        borderRadius: 10,
        border: `2px solid ${ACCENT_YELLOW}`,
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: "white",
          background: ACCENT_RED,
          padding: "2px 6px",
          borderRadius: 3,
          display: "inline-block",
          marginBottom: 6,
          letterSpacing: 0.5,
        }}
      >
        SHOCKING
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          color: NEUTRAL[900],
          lineHeight: 1.2,
          marginBottom: 6,
        }}
      >
        You WON'T believe what this senator just did
      </div>
      <div style={{ fontSize: 11, color: NEUTRAL[600], lineHeight: 1.3 }}>
        Number 7 will leave you speechless...
      </div>
    </div>
  );
}

// ── Ad wrapper — Facebook style ────────────────────────────────────────

function FacebookAdFrame({ children, label, cta = "Learn More" }) {
  return (
    <div
      style={{
        width: 340,
        background: "white",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.05)",
        fontFamily: SYSTEM,
      }}
    >
      {/* FB header */}
      <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: NEUTRAL[900],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: -0.5,
          }}
        >
          V
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: NEUTRAL[900] }}>Verity</div>
          <div style={{ fontSize: 11, color: NEUTRAL[500] }}>Sponsored · <span style={{ fontSize: 10 }}>⊙</span></div>
        </div>
        <div style={{ color: NEUTRAL[500], fontSize: 18, cursor: "pointer" }}>···</div>
      </div>

      {/* Ad copy */}
      <div style={{ padding: "0 14px 12px", fontSize: 14, color: NEUTRAL[900], lineHeight: 1.4 }}>
        {label}
      </div>

      {/* Ad visual */}
      <div>{children}</div>

      {/* CTA strip */}
      <div
        style={{
          padding: "10px 14px",
          background: NEUTRAL[100],
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: NEUTRAL[500], textTransform: "uppercase", letterSpacing: 0.5 }}>
            veritypost.com
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: NEUTRAL[900], marginTop: 2 }}>
            Try Verity. Cancel anytime.
          </div>
        </div>
        <button
          style={{
            background: NEUTRAL[200],
            border: "none",
            padding: "7px 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            color: NEUTRAL[900],
            cursor: "pointer",
          }}
        >
          {cta}
        </button>
      </div>

      {/* FB reactions strip */}
      <div
        style={{
          padding: "6px 14px",
          borderTop: `1px solid ${NEUTRAL[200]}`,
          display: "flex",
          gap: 20,
          fontSize: 13,
          color: NEUTRAL[500],
          fontWeight: 500,
        }}
      >
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↗ Share</span>
      </div>
    </div>
  );
}

// ── Ad 1: Guilt angle — kid reading ────────────────────────────────────

function Ad1() {
  return (
    <FacebookAdFrame
      cta="Learn More"
      label={
        <>
          <strong>Your kid deserves better than doomscroll news.</strong>
          <br />
          Real stories. Clear summaries. Zero clickbait. Built for the next generation of readers — with a parent dashboard you'll actually use.
        </>
      }
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${KID_TEAL_LIGHT}, ${NEUTRAL[50]})`,
          padding: "32px 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative shapes */}
        <div
          style={{
            position: "absolute",
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(13,148,136,0.08)",
            top: -40,
            right: -40,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "rgba(13,148,136,0.06)",
            bottom: 20,
            left: -20,
          }}
        />

        <div
          style={{
            fontFamily: ROUNDED,
            fontSize: 26,
            fontWeight: 900,
            color: NEUTRAL[900],
            lineHeight: 1.15,
            letterSpacing: -0.5,
            marginBottom: 18,
            position: "relative",
          }}
        >
          Real news. For real kids.
        </div>
        <div style={{ position: "relative" }}>
          <KidCardMini />
        </div>
      </div>
    </FacebookAdFrame>
  );
}

// ── Ad 2: Contrast — clickbait vs Verity ───────────────────────────────

function Ad2() {
  return (
    <FacebookAdFrame
      cta="Get Verity"
      label={
        <>
          <strong>One of these is news. The other is bait.</strong>
          <br />
          Verity gives your family news without the spin, outrage, or algorithmic manipulation. Just facts — clearly written, for you and your kids.
        </>
      }
    >
      <div
        style={{
          background: NEUTRAL[900],
          padding: "24px 20px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Them
          </div>
          <ClickbaitCardMini />
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,0.8)",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Verity
          </div>
          <VerityCardMini size="sm" />
        </div>
      </div>
    </FacebookAdFrame>
  );
}

// ── Ad 3: Quiet typography ─────────────────────────────────────────────

function Ad3() {
  return (
    <FacebookAdFrame
      cta="Learn More"
      label={
        <>
          <strong>News that respects your time. And your kid's.</strong>
          <br />
          No clickbait. No rage-bait. No outrage feed. Family plans available.
        </>
      }
    >
      <div
        style={{
          background: NEUTRAL[50],
          padding: "40px 28px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: NEUTRAL[500],
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          Verity · News Without the Outrage Feed
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: NEUTRAL[900],
            lineHeight: 1.1,
            letterSpacing: -0.8,
            marginBottom: 22,
          }}
        >
          Finally, a news app that respects you.
        </div>
        <div
          style={{
            width: 40,
            height: 2,
            background: NEUTRAL[900],
            margin: "0 auto 22px",
          }}
        />
        <div
          style={{
            fontSize: 14,
            color: NEUTRAL[700],
            lineHeight: 1.5,
            maxWidth: 260,
            margin: "0 auto",
          }}
        >
          Headlines. Clear summaries. Nothing else. Plus a kids mode parents actually trust.
        </div>
      </div>
    </FacebookAdFrame>
  );
}

// ── Ad 4: Phone mockup — showing the actual app ────────────────────────

function Ad4() {
  return (
    <FacebookAdFrame
      cta="Learn More"
      label={
        <>
          <strong>Finally, something on the phone you won't regret.</strong>
          <br />
          Verity is news without the outrage feed — for you and your kids. Real stories. Clear summaries. No ranking games chasing your attention.
        </>
      }
    >
      <div
        style={{
          background: `linear-gradient(180deg, ${NEUTRAL[100]}, ${NEUTRAL[200]})`,
          padding: "30px 40px 0",
          display: "flex",
          justifyContent: "center",
          overflow: "hidden",
          height: 320,
        }}
      >
        {/* Phone frame */}
        <div
          style={{
            width: 220,
            background: "black",
            borderRadius: 28,
            padding: 6,
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 22,
              overflow: "hidden",
              height: 370,
            }}
          >
            {/* Status bar */}
            <div
              style={{
                height: 24,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0 14px",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <span>9:41</span>
              <span style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <span style={{ fontSize: 8 }}>●●●●</span>
              </span>
            </div>
            {/* Wordmark */}
            <div
              style={{
                padding: "4px 14px 8px",
                borderBottom: `1px solid ${NEUTRAL[100]}`,
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: -0.5,
              }}
            >
              Verity
            </div>
            {/* Ribbon nav */}
            <div
              style={{
                display: "flex",
                gap: 12,
                padding: "8px 14px",
                fontSize: 11,
                fontWeight: 600,
                borderBottom: `1px solid ${NEUTRAL[100]}`,
              }}
            >
              <span style={{ fontWeight: 700, color: NEUTRAL[900], borderBottom: "2px solid black", paddingBottom: 4 }}>Top</span>
              <span style={{ color: NEUTRAL[500] }}>Politics</span>
              <span style={{ color: NEUTRAL[500] }}>World</span>
              <span style={{ color: NEUTRAL[500] }}>Tech</span>
            </div>
            {/* Stories */}
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: NEUTRAL[500], letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                Politics
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NEUTRAL[900], lineHeight: 1.2, marginBottom: 4 }}>
                Senate Committee Votes to Subpoena Treasury Records
              </div>
              <div style={{ fontSize: 10, color: NEUTRAL[600], lineHeight: 1.4, marginBottom: 10 }}>
                Bipartisan vote signals expanding scope. What it means for the next round of hearings.
              </div>
              <div style={{ height: 1, background: NEUTRAL[100], margin: "10px 0" }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: NEUTRAL[500], letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                Economy
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NEUTRAL[900], lineHeight: 1.2, marginBottom: 4 }}>
                Why the Fed's Rate Hold Is Splitting Economists
              </div>
              <div style={{ fontSize: 10, color: NEUTRAL[600], lineHeight: 1.4, marginBottom: 10 }}>
                David Chen explains the bipartisan disagreement in six minutes.
              </div>
              <div style={{ height: 1, background: NEUTRAL[100], margin: "10px 0" }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: NEUTRAL[500], letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                Tech · Breaking
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NEUTRAL[900], lineHeight: 1.2 }}>
                Chipmaker Confirms Production Halt
              </div>
            </div>
          </div>
        </div>
      </div>
    </FacebookAdFrame>
  );
}

// ── Ad 5: Family — adult + kid view side by side ───────────────────────

function Ad5() {
  return (
    <FacebookAdFrame
      cta="See Plans"
      label={
        <>
          <strong>One app. The whole family.</strong>
          <br />
          Verity Family gives parents real news — and gives kids a mode built just for them. For parents and the whole family.
        </>
      }
    >
      <div
        style={{
          background: "white",
          padding: "24px 20px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          borderTop: `1px solid ${NEUTRAL[100]}`,
          borderBottom: `1px solid ${NEUTRAL[100]}`,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: NEUTRAL[500],
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            For parents
          </div>
          <VerityCardMini size="sm" />
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: KID_TEAL,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 8,
              fontFamily: ROUNDED,
            }}
          >
            For kids
          </div>
          <KidCardMini />
        </div>
      </div>
      <div
        style={{
          padding: "16px 20px",
          textAlign: "center",
          background: NEUTRAL[50],
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: NEUTRAL[900] }}>
          Family plan available
        </div>
        <div style={{ fontSize: 12, color: NEUTRAL[500], marginTop: 4 }}>
          Ad-free · Parent dashboard · Cancel anytime
        </div>
      </div>
    </FacebookAdFrame>
  );
}

// ── Ad 6: Big bold typography-only ─────────────────────────────────────

function Ad6() {
  return (
    <FacebookAdFrame
      cta="Learn More"
      label={
        <>
          <strong>What if the news didn't suck?</strong>
          <br />
          Verity is a news app built on a radical idea: tell people what's happening, clearly, and get out of the way.
        </>
      }
    >
      <div
        style={{
          background: NEUTRAL[900],
          padding: "50px 28px",
          color: "white",
        }}
      >
        <div
          style={{
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -1.2,
            marginBottom: 16,
          }}
        >
          No spin.
          <br />
          No bait.
          <br />
          <span style={{ color: KID_TEAL_LIGHT }}>Just news.</span>
        </div>
        <div
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.5,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          Verity. For parents who want more. For kids who deserve better.
        </div>
      </div>
    </FacebookAdFrame>
  );
}

// ── Main ───────────────────────────────────────────────────────────────

export default function VerityAds() {
  const [filter, setFilter] = useState("all");

  const ads = [
    { id: 1, component: <Ad1 />, angle: "Kid-focused" },
    { id: 2, component: <Ad2 />, angle: "Contrast" },
    { id: 3, component: <Ad3 />, angle: "Quiet/editorial" },
    { id: 4, component: <Ad4 />, angle: "Product demo" },
    { id: 5, component: <Ad5 />, angle: "Family plan" },
    { id: 6, component: <Ad6 />, angle: "Bold statement" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: NEUTRAL[100],
        padding: "32px 24px",
        fontFamily: SYSTEM,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: NEUTRAL[500],
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Verity · Facebook Ad Concepts
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: NEUTRAL[900],
              margin: 0,
              letterSpacing: -0.8,
            }}
          >
            Six ads to test with parents.
          </h1>
          <p
            style={{
              color: NEUTRAL[600],
              fontSize: 15,
              lineHeight: 1.5,
              marginTop: 8,
              maxWidth: 640,
            }}
          >
            Each takes a different emotional angle. Run two or three at once with a small budget. Let the click-through rate tell you which message works. Then pour the rest into the winner.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 24,
            justifyItems: "center",
          }}
        >
          {ads.map((ad) => (
            <div key={ad.id}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: NEUTRAL[500],
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 10,
                  paddingLeft: 2,
                }}
              >
                Ad {ad.id} · {ad.angle}
              </div>
              {ad.component}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            padding: 20,
            background: "white",
            borderRadius: 10,
            border: `1px solid ${NEUTRAL[200]}`,
            maxWidth: 720,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: NEUTRAL[900],
              marginBottom: 10,
            }}
          >
            Quick guide to testing
          </div>
          <div style={{ fontSize: 13, color: NEUTRAL[600], lineHeight: 1.6 }}>
            Start with Ads 1, 2, and 5 — they have the clearest parent hook. Run $5/day each for a week. Whichever gets the highest CTR (click-through rate) becomes your main ad. Then test Ad 6 against the winner — it's the highest-risk, highest-reward option. Bold statements either crush or bomb. There's no middle.
          </div>
        </div>
      </div>
    </div>
  );
}
