import CursorDot from "./CursorDot";

const STARS = [
  { x: 120,  y: 80,  r: 1.4, o: 0.45 }, { x: 350,  y: 45,  r: 0.8, o: 0.30 },
  { x: 580,  y: 120, r: 1.2, o: 0.40 }, { x: 720,  y: 62,  r: 0.9, o: 0.35 },
  { x: 900,  y: 95,  r: 1.5, o: 0.50 }, { x: 1100, y: 40,  r: 0.8, o: 0.30 },
  { x: 1320, y: 110, r: 1.3, o: 0.42 }, { x: 200,  y: 150, r: 0.7, o: 0.28 },
  { x: 480,  y: 180, r: 1.1, o: 0.38 }, { x: 660,  y: 130, r: 0.9, o: 0.32 },
  { x: 840,  y: 170, r: 1.4, o: 0.48 }, { x: 1050, y: 90,  r: 0.8, o: 0.30 },
  { x: 1250, y: 155, r: 1.2, o: 0.40 }, { x: 80,   y: 220, r: 0.7, o: 0.25 },
  { x: 430,  y: 240, r: 1.0, o: 0.35 }, { x: 750,  y: 200, r: 1.6, o: 0.55 },
  { x: 1000, y: 230, r: 0.9, o: 0.32 }, { x: 1380, y: 185, r: 1.1, o: 0.38 },
  { x: 300,  y: 300, r: 0.8, o: 0.28 }, { x: 620,  y: 280, r: 1.3, o: 0.44 },
  { x: 950,  y: 310, r: 0.7, o: 0.25 }, { x: 1180, y: 270, r: 1.0, o: 0.36 },
  { x: 160,  y: 350, r: 1.2, o: 0.40 }, { x: 800,  y: 340, r: 0.8, o: 0.30 },
  { x: 1350, y: 330, r: 1.4, o: 0.46 }, { x: 500,  y: 60,  r: 1.0, o: 0.35 },
  { x: 1150, y: 150, r: 0.9, o: 0.32 }, { x: 260,  y: 100, r: 1.3, o: 0.42 },
  { x: 970,  y: 50,  r: 0.8, o: 0.28 }, { x: 1360, y: 200, r: 1.1, o: 0.38 },
];

type TreeProps = { cx: number; baseY: number; h: number; w: number; opacity?: number };

function Tree({ cx: x, baseY: b, h, w, opacity = 0.88 }: TreeProps) {
  const pts = (arr: [number, number][]) => arr.map(([px, py]) => `${px},${py}`).join(" ");
  return (
    <g opacity={opacity} fill="url(#tree-fill)">
      <rect x={x - w * 0.045} y={b} width={w * 0.09} height={h * 0.1} fill="#08153A" />
      <polygon points={pts([[x, b - h * 0.4], [x - w * 0.5, b], [x + w * 0.5, b]])} />
      <polygon points={pts([[x, b - h * 0.68], [x - w * 0.3, b - h * 0.28], [x + w * 0.3, b - h * 0.28]])} />
      <polygon points={pts([[x, b - h], [x - w * 0.175, b - h * 0.52], [x + w * 0.175, b - h * 0.52]])} />
    </g>
  );
}

const MAIN_TREES: TreeProps[] = [
  { cx: 130,  baseY: 720, h: 130, w: 95  },
  { cx: 320,  baseY: 745, h: 105, w: 78  },
  { cx: 500,  baseY: 710, h: 145, w: 105 },
  { cx: 720,  baseY: 728, h: 125, w: 92  },
  { cx: 940,  baseY: 708, h: 148, w: 108 },
  { cx: 1120, baseY: 742, h: 108, w: 80  },
  { cx: 1310, baseY: 718, h: 135, w: 98  },
];

const BG_TREES: TreeProps[] = [
  { cx: 50,   baseY: 770, h: 65, w: 48, opacity: 0.2  },
  { cx: 230,  baseY: 775, h: 58, w: 42, opacity: 0.18 },
  { cx: 420,  baseY: 772, h: 70, w: 52, opacity: 0.2  },
  { cx: 615,  baseY: 776, h: 62, w: 46, opacity: 0.17 },
  { cx: 830,  baseY: 774, h: 68, w: 50, opacity: 0.2  },
  { cx: 1030, baseY: 775, h: 60, w: 44, opacity: 0.18 },
  { cx: 1210, baseY: 770, h: 72, w: 54, opacity: 0.2  },
  { cx: 1395, baseY: 773, h: 65, w: 48, opacity: 0.18 },
];

const ROOTS = [
  { id: "r1", d: "M130,720 C195,792 262,796 320,745",         w: 1.5, da: "5 3", o: 0.65 },
  { id: "r2", d: "M320,745 C388,808 448,810 500,710",         w: 1.5, da: "5 3", o: 0.65 },
  { id: "r3", d: "M500,710 C568,792 645,794 720,728",         w: 1.5, da: "5 3", o: 0.65 },
  { id: "r4", d: "M720,728 C798,800 868,802 940,708",         w: 1.5, da: "5 3", o: 0.65 },
  { id: "r5", d: "M940,708 C1002,784 1062,790 1120,742",      w: 1.5, da: "5 3", o: 0.65 },
  { id: "r6", d: "M1120,742 C1192,808 1248,804 1310,718",     w: 1.5, da: "5 3", o: 0.65 },
  { id: "r7", d: "M130,720 C255,838 392,840 500,710",         w: 1.0, da: "3 5", o: 0.35 },
  { id: "r8", d: "M500,710 C635,842 812,844 940,708",         w: 1.0, da: "3 5", o: 0.35 },
  { id: "r9", d: "M940,708 C1075,842 1198,840 1310,718",      w: 1.0, da: "3 5", o: 0.35 },
];

const PULSES = [
  { path: "#r1", dur: "3.0s", begin: "0s",    r: 5,   o: 1.0,  rev: false },
  { path: "#r2", dur: "3.2s", begin: "-1.1s", r: 5,   o: 1.0,  rev: true  },
  { path: "#r3", dur: "2.8s", begin: "-0.5s", r: 5,   o: 1.0,  rev: false },
  { path: "#r4", dur: "3.5s", begin: "-2.0s", r: 5,   o: 1.0,  rev: true  },
  { path: "#r5", dur: "3.0s", begin: "-0.8s", r: 5,   o: 1.0,  rev: false },
  { path: "#r6", dur: "2.6s", begin: "-1.5s", r: 5,   o: 1.0,  rev: true  },
  { path: "#r7", dur: "5.0s", begin: "-2.5s", r: 3.5, o: 0.75, rev: true  },
  { path: "#r8", dur: "5.5s", begin: "-1.0s", r: 3.5, o: 0.75, rev: false },
  { path: "#r9", dur: "5.2s", begin: "-3.0s", r: 3.5, o: 0.75, rev: true  },
];

export default function HeroTree() {
  return (
    <div className="hero-fullscreen">
      {/* Tree network SVG */}
      <svg
        className="hero-tree-svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#020810" />
            <stop offset="55%"  stopColor="#080F2A" />
            <stop offset="100%" stopColor="#0D1A4A" />
          </linearGradient>
          <linearGradient id="ground-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0A1535" stopOpacity="0" />
            <stop offset="100%" stopColor="#010509" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="tree-fill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stopColor="#13268A" />
            <stop offset="100%" stopColor="#1E3CB5" />
          </linearGradient>
          <filter id="glow-gold" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-sm" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Sky */}
        <rect width="1440" height="900" fill="url(#sky-grad)" />

        {/* Stars */}
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o} />
        ))}

        {/* Ground */}
        <rect x="0" y="730" width="1440" height="170" fill="url(#ground-grad)" />

        {/* Root network */}
        {ROOTS.map((r) => (
          <path
            key={r.id}
            id={r.id}
            d={r.d}
            stroke="#D98F00"
            strokeWidth={r.w}
            fill="none"
            strokeDasharray={r.da}
            className="root-line"
            opacity={r.o}
          />
        ))}

        {/* Background trees */}
        {BG_TREES.map((t, i) => <Tree key={`bg-${i}`} {...t} />)}

        {/* Main trees */}
        {MAIN_TREES.map((t, i) => <Tree key={`t-${i}`} {...t} />)}

        {/* Glow nodes at tree bases */}
        {MAIN_TREES.map((t, i) => (
          <ellipse
            key={`gn-${i}`}
            cx={t.cx} cy={t.baseY + 6}
            rx="20" ry="7"
            fill="#D98F00"
            opacity="0.22"
            filter="url(#glow-sm)"
          />
        ))}

        {/* Signal pulses */}
        {PULSES.map((p, i) => (
          <circle key={i} r={p.r} fill="#F5C000" filter="url(#glow-gold)" opacity={p.o}>
            <animateMotion
              dur={p.dur}
              repeatCount="indefinite"
              begin={p.begin}
              keyPoints={p.rev ? "1;0" : "0;1"}
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href={p.path} />
            </animateMotion>
          </circle>
        ))}
      </svg>

      {/* Centered content */}
      <div className="hero-fs-content">
        <span className="hero-fs-eyebrow">Signals Intelligence</span>
        <h1 className="hero-fs-title">sigints.club</h1>
        <p className="hero-fs-desc">
          A living network where humans and AI share verifiable alpha.
          Every signal flows through shared roots to those who need it most.
        </p>
        <div className="hero-badges-row">
          <div className="hero-tapestry-badge">
            <svg width="14" height="14" viewBox="0 0 33 34" fill="none" aria-hidden="true">
              <path d="M29.07 17.6291C31.0782 17.6291 32.7053 16.0019 32.7053 13.9937C32.7053 11.9856 31.0782 10.3584 29.07 10.3584C27.8583 10.3584 26.7901 10.9518 26.128 11.8638V11.8575C24.4603 14.153 21.1685 14.203 19.4227 12.0168C18.2547 9.69633 19.2322 7.73813 21.8619 7.22594C23.5359 6.90113 24.8038 5.42702 24.8038 3.65933C24.8038 1.65116 23.1767 0.0240173 21.1685 0.0240173C19.1604 0.0240173 17.5332 1.65116 17.5332 3.65933C17.5332 4.29957 17.7019 4.90234 17.9923 5.4239C19.3321 7.83807 18.3702 9.89933 15.6625 10.4271C14.7411 10.6052 13.9479 11.133 13.4138 11.8638V11.8575C11.7055 14.2092 8.28565 14.2092 6.5773 11.8575V11.8638C5.91519 10.9549 4.84709 10.3584 3.63532 10.3584C1.62715 10.3584 0 11.9856 0 13.9937C0 16.0019 1.62715 17.6291 3.63532 17.6291C4.84709 17.6291 5.91519 17.0357 6.5773 16.1237V16.13C8.23568 13.847 11.4993 13.7876 13.2545 15.9363C14.3539 18.6753 10.806 25.9584 8.02018 26.4706H8.0233C6.32745 26.7798 5.04384 28.2633 5.04384 30.0466C5.04384 32.0548 6.67099 33.6819 8.67916 33.6819C10.6873 33.6819 12.3145 32.0548 12.3145 30.0466C12.3145 29.4188 12.1552 28.8255 11.8741 28.3101C10.4968 25.7461 14.1602 18.0975 17.0179 17.5697H17.0148C17.9517 17.398 18.7637 16.867 19.3009 16.1268V16.1331C21.0092 13.7814 24.4291 13.7814 26.1374 16.1331V16.1268C26.7995 17.0357 27.8676 17.6322 29.0794 17.6322L29.07 17.6291Z" fill="#ff6b35" />
            </svg>
            Built on Tapestry
          </div>
          <div className="hero-solana-badge">
            <svg width="14" height="14" viewBox="0 0 128 128" fill="none" aria-hidden="true">
              <circle cx="64" cy="64" r="64" fill="#9945FF" opacity="0.15" />
              <path d="M26 85.5h76l-14.5 15H26L26 85.5z" fill="#9945FF" opacity="0.8" />
              <path d="M26 55.5h76L87.5 70.5H26V55.5z" fill="#9945FF" opacity="0.6" />
              <path d="M26 27.5h76L87.5 42.5H26V27.5z" fill="#9945FF" opacity="0.4" />
            </svg>
            Built on Solana
          </div>
        </div>
        <span className="hero-fs-btn" style={{ opacity: 0.6, cursor: "default" }}>Coming Soon</span>
      </div>

      <CursorDot />

      {/* Scroll hint */}
      <div className="hero-scroll-hint" aria-hidden="true">
        <span>Scroll to explore</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v9M3 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
