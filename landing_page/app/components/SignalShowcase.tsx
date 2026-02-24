"use client";

import { useState, useEffect } from "react";

type Signal = {
  domain: string;
  emoji: string;
  headline: string;
  action: string;
  type: "public" | "private";
  verified: boolean;
};

const SIGNALS: Signal[] = [
  {
    domain: "Market Signal",
    emoji: "📈",
    headline: "AAPL: Morgan Stanley raises price target to $315 for 2026",
    action: "Long on dips — institutional conviction provides a floor at $240. iPhone 17 Slim driving 20% higher ASP. Apple becomes a true SaaS giant.",
    type: "private",
    verified: true,
  },
  {
    domain: "Global Macro",
    emoji: "🌍",
    headline: "India formally joins the US-led 'Pax Silica' alliance",
    action: "Tech iron curtain is forming. Long US-India semiconductor supply chain plays. Avoid overexposed Chinese tech holdings — a structural realignment is underway.",
    type: "public",
    verified: true,
  },
  {
    domain: "Automotive",
    emoji: "🚗",
    headline: "Toyota leaks solid-state battery achieving 1,000km range for 2027 models",
    action: "Buy TM on the rumor — this is a generational technology shift. Legacy ICE manufacturers face structural decline. EV supply chain plays: lithium, solid-state electrolytes.",
    type: "private",
    verified: true,
  },
  {
    domain: "Infrastructure",
    emoji: "🏗️",
    headline: "Union Budget 2026 allocates ₹12.2 lakh crore to roads and rail",
    action: "Long L&T — massive order book visibility confirmed. India capex supercycle is real. Cement, steel, and engineering services are the secondary plays.",
    type: "public",
    verified: false,
  },
  {
    domain: "Sports",
    emoji: "⚽",
    headline: "Micro-betting now accounts for 60% of sports app volume",
    action: "Sports consumption is fully gamified. Fans watch for data, not just scores. Long sports-data infrastructure and real-time analytics platforms.",
    type: "public",
    verified: false,
  },
  {
    domain: "Medical",
    emoji: "💊",
    headline: "CRISPR gene-editing costs drop below $500 for Thalassemia treatment",
    action: "Genetic cures are moving from million-dollar luxuries to accessible procedures. Buy small-cap biotech partners before Phase 1 human trials. Target: +20% / SL: -10%",
    type: "private",
    verified: true,
  },
  {
    domain: "Social Trends",
    emoji: "📱",
    headline: "Prediction markets hit $10B volume in January alone",
    action: "Public opinion is being priced in real-time — these markets beat news polls consistently. The 'wisdom of crowds' is now a tradeable financial primitive.",
    type: "public",
    verified: true,
  },
  {
    domain: "Crypto",
    emoji: "₿",
    headline: "Bitcoin approaches the $60k liquidation zone with institutional sell pressure",
    action: "Wait for a $59k bounce or short a break of $58,500. Institutional accumulation pattern suggests floor, but retail leverage is at risk. Target: $52k / SL: $61k",
    type: "private",
    verified: true,
  },
];

export default function SignalShowcase() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setActive((prev) => (prev + 1) % SIGNALS.length);
        setVisible(true);
      }, 380);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  const sig = SIGNALS[active];

  return (
    <section className="showcase-section" id="signals">
      <div className="container">
        <div className="section-head">
          <span className="kicker showcase-kicker">Live signal examples</span>
          <h2 className="showcase-h2">Alpha across every domain</h2>
          <p className="showcase-sub">
            From macro geopolitics to niche biotech — signals flow where they&apos;re needed most.
          </p>
        </div>

        <div className="showcase-body">
          {/* Domain sidebar */}
          <div className="showcase-domains">
            {SIGNALS.map((s, i) => (
              <button
                key={i}
                className={`domain-tab ${i === active ? "domain-tab--active" : ""}`}
                onClick={() => { setActive(i); setVisible(true); }}
              >
                <span className="domain-tab-emoji">{s.emoji}</span>
                <span>{s.domain}</span>
              </button>
            ))}
          </div>

          {/* Signal card */}
          <div
            className="showcase-card"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.38s ease" }}
          >
            <div className="showcase-card-top">
              <span className="showcase-emoji">{sig.emoji}</span>
              <div>
                <span className="showcase-domain-label">{sig.domain}</span>
                <div className="showcase-badges">
                  <span className={`badge ${sig.type === "private" ? "badge-private" : "badge-public"}`}>
                    {sig.type === "private" ? "Private" : "Public"}
                  </span>
                  {sig.verified && (
                    <span className="badge badge-verified">✓ Verifiable</span>
                  )}
                </div>
              </div>
            </div>

            <h3 className="showcase-headline">{sig.headline}</h3>
            <p className="showcase-action">{sig.action}</p>

            <div className="showcase-footer">
              <a href="https://app.sigints.club" className="showcase-cta-btn">Subscribe to stream →</a>
              <span className="showcase-meta">Signal updates in real-time · Solana-verified</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
