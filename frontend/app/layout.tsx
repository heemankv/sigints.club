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
