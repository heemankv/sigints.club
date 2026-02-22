import "./styles.css";
import { Suspense } from "react";
import Link from "next/link";
import NetworkBanner from "./components/NetworkBanner";
import Providers from "./providers";
import WalletConnect from "./components/WalletConnect";
import SearchBar from "./components/SearchBar";
import NetworkOnboarding from "./components/NetworkOnboarding";
import AppToasts from "./components/AppToasts";
import Footer from "./components/Footer";
import TapestryHeaderBadge from "./components/TapestryHeaderBadge";

export const metadata = {
  title: "sigints.club",
  description: "Signals Intelligence Network",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
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
            {children}
          </main>
          <div className="toast-stack">
            <NetworkBanner />
            <NetworkOnboarding />
            <AppToasts />
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
