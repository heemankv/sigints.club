export default function SignalFlowDiagram() {
  return (
    <section className="flow-section">
      <div className="container">
        <div className="section-head" style={{ textAlign: "center" }}>
          <span className="kicker flow-kicker">Protocol</span>
          <h2 className="flow-h2">How signals flow on-chain</h2>
          <p className="flow-sub">
            Every signal update is a Solana account update. Listeners — human or AI — detect the change
            and decrypt in milliseconds via <code>getAccountChanged</code>.
          </p>
        </div>

        <div className="flow-diagram-wrap">
          <svg
            viewBox="0 0 1060 175"
            className="flow-svg"
            aria-label="Signal flow: Maker → API Layer → Solana Program → SignalLatest PDA → RPC Event → Listener"
          >
            <defs>
              <marker id="arr-default" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="rgba(255,255,255,0.22)" />
              </marker>
              <marker id="arr-purple" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="rgba(155,135,245,0.6)" />
              </marker>
              <marker id="arr-teal" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="rgba(29,176,166,0.6)" />
              </marker>
              <filter id="pda-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* On-chain region highlight */}
            <rect
              x="358" y="55" width="346" height="72" rx="11"
              fill="rgba(155,135,245,0.05)"
              stroke="rgba(155,135,245,0.22)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text x="531" y="46" textAnchor="middle" fontSize="8.5" fill="rgba(155,135,245,0.65)"
              letterSpacing="2.5" fontFamily="Sora, sans-serif" fontWeight="500">ON SOLANA</text>

            {/* ── Arrows ── */}
            {/* 1→2 */}
            <line x1="148" y1="91" x2="177" y2="91"
              stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" markerEnd="url(#arr-default)" />
            {/* 2→3 */}
            <line x1="320" y1="91" x2="364" y2="91"
              stroke="rgba(155,135,245,0.45)" strokeWidth="1.5" markerEnd="url(#arr-purple)" />
            {/* 3→4 (inside on-chain) */}
            <line x1="505" y1="91" x2="549" y2="91"
              stroke="rgba(155,135,245,0.45)" strokeWidth="1.5" markerEnd="url(#arr-purple)" />
            {/* 4→5 */}
            <line x1="704" y1="91" x2="729" y2="91"
              stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" markerEnd="url(#arr-default)" />
            {/* 5→6 */}
            <line x1="868" y1="91" x2="913" y2="91"
              stroke="rgba(29,176,166,0.5)" strokeWidth="1.5" markerEnd="url(#arr-teal)" />

            {/* ── Node 1: Maker ── */}
            <rect x="8" y="63" width="140" height="56" rx="10"
              fill="rgba(240,165,0,0.08)" stroke="rgba(240,165,0,0.38)" strokeWidth="1.2" />
            <text x="78" y="88" textAnchor="middle" fontSize="13" fontWeight="600"
              fill="#F0A500" fontFamily="Space Grotesk, sans-serif">Maker</text>
            <text x="78" y="106" textAnchor="middle" fontSize="10"
              fill="rgba(255,255,255,0.42)" fontFamily="Sora, sans-serif">Human or AI agent</text>

            {/* ── Node 2: API Layer ── */}
            <rect x="178" y="63" width="142" height="56" rx="10"
              fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.11)" strokeWidth="1.2" />
            <text x="249" y="88" textAnchor="middle" fontSize="13" fontWeight="600"
              fill="rgba(255,255,255,0.82)" fontFamily="Space Grotesk, sans-serif">API Layer</text>
            <text x="249" y="106" textAnchor="middle" fontSize="10"
              fill="rgba(255,255,255,0.38)" fontFamily="Sora, sans-serif">Encrypt · hash signal</text>

            {/* ── Node 3: Solana Program ── */}
            <rect x="365" y="63" width="139" height="56" rx="10"
              fill="rgba(155,135,245,0.08)" stroke="rgba(155,135,245,0.32)" strokeWidth="1.2" />
            <text x="434" y="88" textAnchor="middle" fontSize="12" fontWeight="600"
              fill="rgba(185,169,248,0.92)" fontFamily="Space Grotesk, sans-serif">Solana Program</text>
            <text x="434" y="106" textAnchor="middle" fontSize="10"
              fill="rgba(155,135,245,0.52)" fontFamily="Sora, sans-serif">record_signal()</text>

            {/* ── Node 4: SignalLatest PDA (glowing) ── */}
            <rect x="550" y="60" width="153" height="62" rx="10"
              fill="rgba(155,135,245,0.13)" stroke="rgba(155,135,245,0.55)" strokeWidth="1.5"
              filter="url(#pda-glow)" />
            <text x="626" y="88" textAnchor="middle" fontSize="12" fontWeight="700"
              fill="#c4b5fd" fontFamily="Space Grotesk, sans-serif">SignalLatest PDA</text>
            <text x="626" y="106" textAnchor="middle" fontSize="10"
              fill="rgba(196,181,253,0.55)" fontFamily="Sora, sans-serif">On-chain account · hash+ptr</text>

            {/* ── Node 5: RPC Event ── */}
            <rect x="730" y="63" width="138" height="56" rx="10"
              fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.11)" strokeWidth="1.2" />
            <text x="799" y="88" textAnchor="middle" fontSize="13" fontWeight="600"
              fill="rgba(255,255,255,0.82)" fontFamily="Space Grotesk, sans-serif">RPC Event</text>
            <text x="799" y="106" textAnchor="middle" fontSize="10"
              fill="rgba(255,255,255,0.38)" fontFamily="Sora, sans-serif">getAccountChanged</text>

            {/* ── Node 6: Listener ── */}
            <rect x="914" y="63" width="140" height="56" rx="10"
              fill="rgba(29,176,166,0.08)" stroke="rgba(29,176,166,0.38)" strokeWidth="1.2" />
            <text x="984" y="88" textAnchor="middle" fontSize="13" fontWeight="600"
              fill="#1db0a6" fontFamily="Space Grotesk, sans-serif">Listener</text>
            <text x="984" y="106" textAnchor="middle" fontSize="10"
              fill="rgba(29,176,166,0.58)" fontFamily="Sora, sans-serif">Human or AI agent</text>

            {/* ── Step numbers ── */}
            <text x="78"  y="150" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.2)" fontFamily="Sora, sans-serif">① publish signal</text>
            <text x="249" y="150" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.2)" fontFamily="Sora, sans-serif">② encrypt + store</text>
            <text x="434" y="150" textAnchor="middle" fontSize="9" fill="rgba(155,135,245,0.38)" fontFamily="Sora, sans-serif">③ write on-chain</text>
            <text x="626" y="150" textAnchor="middle" fontSize="9" fill="rgba(155,135,245,0.38)" fontFamily="Sora, sans-serif">④ hash · pointer</text>
            <text x="799" y="150" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.2)" fontFamily="Sora, sans-serif">⑤ detect update</text>
            <text x="984" y="150" textAnchor="middle" fontSize="9" fill="rgba(29,176,166,0.45)" fontFamily="Sora, sans-serif">⑥ decrypt + act</text>
          </svg>
        </div>

        <div className="flow-pills">
          <div className="flow-pill">
            <span className="flow-pill-dot gold" />
            <span>Only hashes &amp; pointers live on-chain — signal data stays encrypted off-chain, keeping costs minimal</span>
          </div>
          <div className="flow-pill">
            <span className="flow-pill-dot purple" />
            <span>One PDA per provider. Every signal overwrites it — no history bloat, subscribers always get the latest</span>
          </div>
          <div className="flow-pill">
            <span className="flow-pill-dot teal" />
            <span>AI agents subscribe via MCP — same protocol, zero manual intervention needed</span>
          </div>
        </div>
      </div>
    </section>
  );
}
