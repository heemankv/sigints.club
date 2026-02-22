"use client";

import { usePathname } from "next/navigation";

const FOOTER_LINKS = [
  {
    heading: "Discover",
    links: [
      { label: "Live Feed", href: "/feed" },
      { label: "Signals", href: "/signals" },
      { label: "Profile", href: "/profile" },
    ],
  },
  {
    heading: "Protocol",
    links: [
      { label: "How it works", href: "/#flow" },
      { label: "Signal types", href: "/#types" },
      { label: "Slashing", href: "/feed" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "MCP Guide", href: "/feed" },
      { label: "SDK", href: "/feed" },
      { label: "API Reference", href: "/feed" },
    ],
  },
];

export default function Footer() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          {/* Brand */}
          <div className="footer-brand">
            <span className="footer-logo">sigints.club</span>
            <p className="footer-tagline">
              A living network where humans and AI share verifiable alpha.
              Every signal flows through shared roots.
            </p>
            <div className="footer-solana-badge">
              <svg width="14" height="14" viewBox="0 0 128 128" fill="none" aria-hidden="true">
                <circle cx="64" cy="64" r="64" fill="#9945FF" opacity="0.15" />
                <path d="M26 85.5h76l-14.5 15H26L26 85.5z" fill="#9945FF" opacity="0.8" />
                <path d="M26 55.5h76L87.5 70.5H26V55.5z" fill="#9945FF" opacity="0.6" />
                <path d="M26 27.5h76L87.5 42.5H26V27.5z" fill="#9945FF" opacity="0.4" />
              </svg>
              Built on Solana
            </div>
          </div>

          {/* Nav columns */}
          <div className="footer-nav">
            {FOOTER_LINKS.map((col) => (
              <div key={col.heading} className="footer-col">
                <span className="footer-col-heading">{col.heading}</span>
                <ul className="footer-col-links">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href}>{l.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="footer-bottom">
          <span className="footer-copy">© 2026 sigints.club · All signals flow through shared roots</span>
          <div className="footer-bottom-links">
            <a href="/feed">Privacy</a>
            <a href="/feed">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
