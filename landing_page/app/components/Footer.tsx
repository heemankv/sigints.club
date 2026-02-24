const APP_URL = "https://app.sigints.club";

const FOOTER_LINKS = [
  {
    heading: "Discover",
    links: [
      { label: "Live Feed", href: APP_URL },
      { label: "Signals", href: `${APP_URL}/signals` },
      { label: "Profile", href: `${APP_URL}/profile` },
    ],
  },
  {
    heading: "Protocol",
    links: [
      { label: "How it works", href: "#flow" },
      { label: "Signal types", href: "#types" },
      { label: "Slashing", href: APP_URL },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "MCP Guide", href: APP_URL },
      { label: "SDK", href: APP_URL },
      { label: "API Reference", href: APP_URL },
    ],
  },
];

export default function Footer() {
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
            <div className="footer-badges-row">
              <div className="footer-tapestry-badge">
                <svg width="14" height="14" viewBox="0 0 33 34" fill="none" aria-hidden="true">
                  <path d="M29.07 17.6291C31.0782 17.6291 32.7053 16.0019 32.7053 13.9937C32.7053 11.9856 31.0782 10.3584 29.07 10.3584C27.8583 10.3584 26.7901 10.9518 26.128 11.8638V11.8575C24.4603 14.153 21.1685 14.203 19.4227 12.0168C18.2547 9.69633 19.2322 7.73813 21.8619 7.22594C23.5359 6.90113 24.8038 5.42702 24.8038 3.65933C24.8038 1.65116 23.1767 0.0240173 21.1685 0.0240173C19.1604 0.0240173 17.5332 1.65116 17.5332 3.65933C17.5332 4.29957 17.7019 4.90234 17.9923 5.4239C19.3321 7.83807 18.3702 9.89933 15.6625 10.4271C14.7411 10.6052 13.9479 11.133 13.4138 11.8638V11.8575C11.7055 14.2092 8.28565 14.2092 6.5773 11.8575V11.8638C5.91519 10.9549 4.84709 10.3584 3.63532 10.3584C1.62715 10.3584 0 11.9856 0 13.9937C0 16.0019 1.62715 17.6291 3.63532 17.6291C4.84709 17.6291 5.91519 17.0357 6.5773 16.1237V16.13C8.23568 13.847 11.4993 13.7876 13.2545 15.9363C14.3539 18.6753 10.806 25.9584 8.02018 26.4706H8.0233C6.32745 26.7798 5.04384 28.2633 5.04384 30.0466C5.04384 32.0548 6.67099 33.6819 8.67916 33.6819C10.6873 33.6819 12.3145 32.0548 12.3145 30.0466C12.3145 29.4188 12.1552 28.8255 11.8741 28.3101C10.4968 25.7461 14.1602 18.0975 17.0179 17.5697H17.0148C17.9517 17.398 18.7637 16.867 19.3009 16.1268V16.1331C21.0092 13.7814 24.4291 13.7814 26.1374 16.1331V16.1268C26.7995 17.0357 27.8676 17.6322 29.0794 17.6322L29.07 17.6291Z" fill="#ff6b35" />
                </svg>
                Built on Tapestry
              </div>
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
            <a href={APP_URL}>Privacy</a>
            <a href={APP_URL}>Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
