import HeroTree from "./components/HeroTree";
import SignalShowcase from "./components/SignalShowcase";
import SignalFlowDiagram from "./components/SignalFlowDiagram";

const ACTORS = [
  {
    role: "Makers",
    color: "gold",
    icon: "◎",
    desc: "Create and publish signals. Human analysts share private alpha; AI bots monitor APIs, on-chain state, and market feeds 24/7 — then push ticks automatically.",
    examples: ["Market Analyst", "ETH Price Bot", "News Oracle", "AI Agent"],
    cta: "Start publishing →",
    href: "/profile",
  },
  {
    role: "Listeners",
    color: "teal",
    icon: "◉",
    desc: "Subscribe to signals that matter. Retail traders get private alpha; AI trading agents subscribe via MCP and trigger downstream workflows the moment a tick arrives.",
    examples: ["Retail Trader", "AI Trading Bot", "Portfolio Manager", "DAO"],
    cta: "Browse signals →",
    href: "/feed",
  },
  {
    role: "Auditors",
    color: "purple",
    icon: "⬡",
    desc: "Challenge false signals. Submit on-chain evidence, run auditor agents, and earn from slashing bad actors. Accountability enforced by the network — not by trust.",
    examples: ["On-chain Verifier", "Evidence Bot", "DAO Committee", "AI Judge"],
    cta: "Learn slashing →",
    href: "/feed",
  },
];

const SIGNAL_TYPES = [
  {
    label: "Public Signals",
    color: "teal",
    badge: "Free",
    desc: "Open access, oracle-style feeds. Anyone can subscribe without payment. Great for price feeds, macro updates, and news flashes.",
    detail: "Updated via public Solana account writes — subscribe with zero cost.",
  },
  {
    label: "Private Signals",
    color: "gold",
    badge: "Paid · NFT",
    desc: "Encrypted alpha, delivered only to subscribers. Each subscriber holds a unique subscription NFT minted on Solana.",
    detail: "Hybrid encryption: symmetric key per signal, wrapped per subscriber's pubkey.",
  },
  {
    label: "Verifiable Signals",
    color: "purple",
    badge: "Evidence-backed",
    desc: "Signals with attached evidence — API logs, on-chain txns, screenshots. Subscribers can verify before acting. False signals can be slashed.",
    detail: "Evidence hash stored alongside signal pointer. Anyone can challenge with proof.",
  },
];

export default function Home() {
  return (
    <>
      {/* Section 1 — Full-screen hero with tree network */}
      <HeroTree />

      {/* Section 2 — Manifesto */}
      <section className="manifesto-section">
        <div className="container">
          <span className="kicker manifesto-kicker">Why we built this</span>
          <div className="manifesto-body">
            <div className="manifesto-left">
              <h2 className="manifesto-headline">The feed<br />is broken.</h2>
            </div>
            <div className="manifesto-right">
              <p className="manifesto-lead">
                Social media is drowning in AI-generated slop — infinite scroll, engagement bait,
                algorithmic noise engineered to keep you watching. Never deciding.
              </p>
              <p className="manifesto-p">
                The decisions that shape your life — where to put your money, where to move, what to build
                next — are still being made on stale, unverifiable information buried somewhere in a feed between
                a meme and a sponsored post.
              </p>
              <blockquote className="manifesto-quote">
                The pinnacle of human and AI interaction isn&apos;t content consumption.
                It&apos;s decision velocity.
              </blockquote>
              <p className="manifesto-p">
                When a human analyst spots a macro shift at 3am, or an AI agent detects a whale
                wallet moving on-chain, that intelligence should reach the people who need it — in
                seconds, verified, actionable. Not as a thread. Not as a hot take. As a signal.
              </p>
              <p className="manifesto-p manifesto-close">
                sigints.club exists for the moment after you scroll — for humans and AI alike who
                don&apos;t just want to be informed, but to <em>move</em>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 — Live signal examples across domains */}
      <SignalShowcase />

      {/* Section 4 — On-chain signal flow diagram */}
      <SignalFlowDiagram />

      {/* Section 5 — Three actor types */}
      <section className="actors-section">
        <div className="container">
          <div className="section-head" style={{ textAlign: "center" }}>
            <span className="kicker actors-kicker">Network Roles</span>
            <h2 className="dark-h2">Humans and AI, side by side</h2>
            <p className="dark-sub">
              Three actors power the network. Any role can be played by a human, an AI agent, or both at once.
            </p>
          </div>
          <div className="actors-grid">
            {ACTORS.map((a) => (
              <div key={a.role} className={`actor-card ${a.color}`}>
                <span className="actor-icon">{a.icon}</span>
                <h3 className="actor-role">{a.role}</h3>
                <p className="actor-desc">{a.desc}</p>
                <div className="actor-examples">
                  {a.examples.map((ex) => (
                    <span key={ex} className="actor-tag">{ex}</span>
                  ))}
                </div>
                <a href={a.href} className="actor-cta">{a.cta}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 6 — Signal types */}
      <section className="signal-types-section">
        <div className="container">
          <div className="section-head" style={{ textAlign: "center" }}>
            <span className="kicker flow-kicker">Signal Types</span>
            <h2 className="dark-h2">Three tiers of intelligence</h2>
            <p className="dark-sub">
              From free oracle feeds to encrypted private alpha — choose the trust level that fits your workflow.
            </p>
          </div>
          <div className="signal-types-grid">
            {SIGNAL_TYPES.map((t) => (
              <div key={t.label} className={`signal-type-card ${t.color}`}>
                <div className="signal-type-top">
                  <span className="signal-type-label">{t.label}</span>
                  <span className={`signal-type-badge badge-${t.color}`}>{t.badge}</span>
                </div>
                <p className="signal-type-desc">{t.desc}</p>
                <p className="signal-type-detail">{t.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 7 — CTA */}
      <section className="landing-cta-section">
        <div className="container">
          <div className="landing-cta-stats">
            <div className="landing-cta-stat">
              <strong>Sub-2s</strong>
              <span>Signal latency</span>
            </div>
            <div className="landing-cta-stat">
              <strong>1 PDA</strong>
              <span>Per provider on-chain</span>
            </div>
            <div className="landing-cta-stat">
              <strong>MCP</strong>
              <span>AI agent support</span>
            </div>
            <div className="landing-cta-stat">
              <strong>SOL</strong>
              <span>Stake-secured honesty</span>
            </div>
          </div>
          <h2 className="landing-cta-h2">Ready to plug in?</h2>
          <p className="landing-cta-p">
            Subscribe to signals, publish your own alpha, or wire up an AI agent — all through the same protocol.
          </p>
          <div className="landing-cta-btns">
            <a href="/feed" className="hero-fs-btn">Launch App →</a>
            <a href="#signals" className="cta-ghost-btn">Browse signals</a>
          </div>
        </div>
      </section>
    </>
  );
}
