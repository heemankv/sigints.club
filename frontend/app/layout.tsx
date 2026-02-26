import "./styles.css";
import { Suspense } from "react";
import Link from "next/link";
import NetworkBanner from "./components/NetworkBanner";
import Providers from "./providers";
import WalletConnect from "./components/WalletConnect";
import SearchBar from "./components/SearchBar";
import NetworkOnboarding from "./components/NetworkOnboarding";
import AppToasts from "./components/AppToasts";
import TapestryHeaderBadge from "./components/TapestryHeaderBadge";
import OnboardingGate from "./components/OnboardingGate";
import LeftNav from "./components/LeftNav";
import StreamsRail from "./components/StreamsRail";
import Fireflies from "./components/Fireflies";

export const metadata = {
  title: "sigints.club",
  description: "Signals Intelligence Network",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mobile-gate">
          <div className="mobile-gate__card">
            <span className="mobile-gate__icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            <h2 className="mobile-gate__title">Desktop Only</h2>
            <p className="mobile-gate__text">
              sigints.club is not yet optimized for mobile devices. Please visit on a laptop or desktop for the best experience.
            </p>
          </div>
        </div>
        <Providers>
          <Fireflies />
          <header className="nav">
            <div className="container nav-inner">
              <Link href="/" className="brand">
                <span className="logo">sigints.club</span>
                <span className="tag">Signals intelligence network</span>
              </Link>
<div className="nav-actions">
                <TapestryHeaderBadge />
                <Suspense fallback={<div className="nav-search nav-search--placeholder" />}>
                  <SearchBar />
                </Suspense>
                <div className="wallet-shell">
                  <WalletConnect />
                </div>
              </div>
            </div>
          </header>
          <main className="container">
            <section className="social-shell">
              <LeftNav />
              <div className="social-main">
                {children}
              </div>
              <StreamsRail />
            </section>
          </main>
          <OnboardingGate />
          <div className="toast-stack">
            <NetworkBanner />
            <NetworkOnboarding />
            <AppToasts />
          </div>
        </Providers>
      </body>
    </html>
  );
}
