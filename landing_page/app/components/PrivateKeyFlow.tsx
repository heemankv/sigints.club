const STEPS = [
  {
    num: "01",
    title: "Subscribe",
    desc: "Subscriber pays SOL → Solana program mints a unique subscription NFT to their wallet.",
  },
  {
    num: "02",
    title: "Encrypt",
    desc: "Maker generates a fresh AES-256 key, encrypts the signal payload once. The payload is stored off-chain.",
  },
  {
    num: "03",
    title: "Wrap per subscriber",
    desc: "The AES key is wrapped individually for each subscriber's ed25519 pubkey. One unique wrapping per NFT holder.",
  },
  {
    num: "04",
    title: "Decrypt",
    desc: "Subscriber uses their wallet keypair to unwrap the AES key and read the signal. No wallet key = no access.",
  },
];

export default function PrivateKeyFlow() {
  return (
    <section className="private-key-section">
      <div className="container">
        <div className="section-head" style={{ textAlign: "center" }}>
          <span className="kicker private-key-kicker">Private Streams</span>
          <h2 className="dark-h2">One signal. A key for every subscriber.</h2>
          <p className="dark-sub">
            Private streams encrypt the payload once with AES-256. Each subscriber gets a unique
            wrapped key — unlockable only by the wallet that holds their subscription NFT.
            No NFT, no key. No key, no alpha.
          </p>
        </div>

        <div className="private-key-steps">
          {STEPS.map((s) => (
            <div key={s.num} className="private-key-step">
              <span className="private-key-num">STEP {s.num}</span>
              <p className="private-key-step-title">{s.title}</p>
              <p className="private-key-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="private-key-diagram-wrap">
          <svg
            viewBox="0 0 860 305"
            className="private-key-svg"
            aria-label="Private stream fan-out: Maker encrypts once, payload distributed to NFT subscribers with individual key wrapping"
          >
            <defs>
              <marker id="pk-arr-gold" markerWidth="8" markerHeight="7" refX="7" refY="3.5" orient="auto">
                <path d="M0,0 L8,3.5 L0,7 Z" fill="rgba(240,165,0,0.75)" />
              </marker>
              <marker id="pk-arr-purple" markerWidth="8" markerHeight="7" refX="7" refY="3.5" orient="auto">
                <path d="M0,0 L8,3.5 L0,7 Z" fill="rgba(155,135,245,0.7)" />
              </marker>
              <filter id="payload-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* NFT Subscribers region highlight */}
            <rect
              x="700" y="22" width="144" height="252" rx="12"
              fill="rgba(29,176,166,0.04)"
              stroke="rgba(29,176,166,0.32)"
              strokeWidth="1"
              strokeDasharray="5 3"
            />
            <text
              x="772" y="14"
              textAnchor="middle"
              fontSize="8.5"
              fill="rgba(29,176,166,0.65)"
              letterSpacing="2.2"
              fontFamily="Sora, sans-serif"
              fontWeight="500"
            >
              NFT SUBSCRIBERS
            </text>

            {/* ── Maker node ── */}
            <circle cx="75" cy="135" r="30" fill="rgba(240,165,0,0.08)" stroke="rgba(240,165,0,0.5)" strokeWidth="1.5" />
            <text x="75" y="131" textAnchor="middle" fontSize="11" fontWeight="700" fill="#F0A500" fontFamily="Space Grotesk, sans-serif">Maker</text>
            <text x="75" y="145" textAnchor="middle" fontSize="9" fill="rgba(240,165,0,0.5)" fontFamily="Sora, sans-serif">publisher</text>

            {/* Arrow: Maker → Payload */}
            <line
              x1="105" y1="135" x2="280" y2="135"
              stroke="rgba(240,165,0,0.55)" strokeWidth="1.5"
              markerEnd="url(#pk-arr-gold)"
            />
            <text x="192" y="125" textAnchor="middle" fontSize="9" fill="rgba(240,165,0,0.5)" fontFamily="Sora, sans-serif">publishes encrypted signal</text>

            {/* ── Encrypted Payload node (glowing) ── */}
            <rect
              x="285" y="88" width="165" height="94" rx="12"
              fill="rgba(155,135,245,0.1)"
              stroke="rgba(155,135,245,0.55)"
              strokeWidth="1.5"
              filter="url(#payload-glow)"
            />
            <text x="367" y="130" textAnchor="middle" fontSize="12" fontWeight="700" fill="#c4b5fd" fontFamily="Space Grotesk, sans-serif">Encrypted</text>
            <text x="367" y="146" textAnchor="middle" fontSize="12" fontWeight="700" fill="#c4b5fd" fontFamily="Space Grotesk, sans-serif">Payload</text>
            <text x="367" y="162" textAnchor="middle" fontSize="9" fill="rgba(155,135,245,0.5)" fontFamily="Sora, sans-serif">AES-256 · off-chain</text>

            {/* Arrow: Payload → Sub A */}
            <line
              x1="450" y1="118" x2="720" y2="57"
              stroke="rgba(155,135,245,0.45)" strokeWidth="1.5"
              strokeDasharray="5 3"
              markerEnd="url(#pk-arr-purple)"
            />
            <text x="588" y="75" textAnchor="middle" fontSize="8.5" fill="rgba(155,135,245,0.45)" fontFamily="Sora, sans-serif">wrap(key, pubA)</text>

            {/* Arrow: Payload → Sub B */}
            <line
              x1="450" y1="135" x2="720" y2="135"
              stroke="rgba(155,135,245,0.45)" strokeWidth="1.5"
              strokeDasharray="5 3"
              markerEnd="url(#pk-arr-purple)"
            />
            <text x="585" y="128" textAnchor="middle" fontSize="8.5" fill="rgba(155,135,245,0.45)" fontFamily="Sora, sans-serif">wrap(key, pubB)</text>

            {/* Arrow: Payload → Sub C */}
            <line
              x1="450" y1="152" x2="720" y2="213"
              stroke="rgba(155,135,245,0.45)" strokeWidth="1.5"
              strokeDasharray="5 3"
              markerEnd="url(#pk-arr-purple)"
            />
            <text x="588" y="198" textAnchor="middle" fontSize="8.5" fill="rgba(155,135,245,0.45)" fontFamily="Sora, sans-serif">wrap(key, pubC)</text>

            {/* ── Subscriber A ── */}
            <circle cx="772" cy="55" r="26" fill="rgba(29,176,166,0.08)" stroke="rgba(29,176,166,0.42)" strokeWidth="1.5" />
            <text x="772" y="51" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1db0a6" fontFamily="Space Grotesk, sans-serif">Sub A</text>
            <text x="772" y="64" textAnchor="middle" fontSize="8" fill="rgba(29,176,166,0.5)" fontFamily="Sora, sans-serif">NFT holder</text>

            {/* ── Subscriber B ── */}
            <circle cx="772" cy="135" r="26" fill="rgba(29,176,166,0.08)" stroke="rgba(29,176,166,0.42)" strokeWidth="1.5" />
            <text x="772" y="131" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1db0a6" fontFamily="Space Grotesk, sans-serif">Sub B</text>
            <text x="772" y="144" textAnchor="middle" fontSize="8" fill="rgba(29,176,166,0.5)" fontFamily="Sora, sans-serif">NFT holder</text>

            {/* ── Subscriber C ── */}
            <circle cx="772" cy="215" r="26" fill="rgba(29,176,166,0.08)" stroke="rgba(29,176,166,0.42)" strokeWidth="1.5" />
            <text x="772" y="211" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1db0a6" fontFamily="Space Grotesk, sans-serif">Sub C</text>
            <text x="772" y="224" textAnchor="middle" fontSize="8" fill="rgba(29,176,166,0.5)" fontFamily="Sora, sans-serif">NFT holder</text>

            {/* ── Step labels below nodes ── */}
            <text x="75" y="180" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.2)" fontFamily="Sora, sans-serif">① encrypts once</text>
            <text x="367" y="200" textAnchor="middle" fontSize="9" fill="rgba(155,135,245,0.38)" fontFamily="Sora, sans-serif">② one payload · N wrapped keys</text>
            <text x="772" y="292" textAnchor="middle" fontSize="9" fill="rgba(29,176,166,0.45)" fontFamily="Sora, sans-serif">③ each decrypts with wallet key</text>
          </svg>
        </div>

        <div className="flow-pills">
          <div className="flow-pill">
            <span className="flow-pill-dot gold" />
            <span>AES-256 symmetric encryption — signal content encrypted once, never duplicated on-chain</span>
          </div>
          <div className="flow-pill">
            <span className="flow-pill-dot purple" />
            <span>ed25519 key wrapping — each subscriber&apos;s wrapped key is stored alongside the signal pointer</span>
          </div>
          <div className="flow-pill">
            <span className="flow-pill-dot teal" />
            <span>NFT gating — your subscription NFT on Solana is proof of payment and key derivation material</span>
          </div>
        </div>
      </div>
    </section>
  );
}
