import "./globals.css";
import type { Metadata } from "next";
import Footer from "./components/Footer";

export const metadata: Metadata = {
  title: "sigints.club",
  description: "Signals Intelligence Network",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <div className="container nav-inner">
            <a href="/" className="brand">
              <span className="logo">
                <svg className="brand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path id="signal-path" d="M2 12l4 0 3-9 6 18 3-9 4 0" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle r="2" fill="#ff6b35">
                    <animateMotion dur="5s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear">
                      <mpath href="#signal-path"/>
                    </animateMotion>
                  </circle>
                  <circle r="3.5" fill="#ff6b35" opacity="0.25">
                    <animateMotion dur="5s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear">
                      <mpath href="#signal-path"/>
                    </animateMotion>
                  </circle>
                </svg>
                sigints.club
              </span>
              <span className="tag">Signals intelligence network</span>
            </a>
            <div className="nav-actions">
              <a href="https://app.sigints.club" target="_blank" rel="noopener noreferrer" className="button primary" style={{ fontSize: 14, padding: "8px 18px" }}>
                Launch App
              </a>
            </div>
          </div>
        </header>
        <main>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
