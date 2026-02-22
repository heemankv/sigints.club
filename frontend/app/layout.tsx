import "./styles.css";
import { Suspense } from "react";
import NetworkBanner from "./components/NetworkBanner";
import Providers from "./providers";
import WalletConnect from "./components/WalletConnect";
import SearchBar from "./components/SearchBar";
import NetworkOnboarding from "./components/NetworkOnboarding";
import Footer from "./components/Footer";

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
              <div className="brand">
                <span className="logo">sigints.club</span>
                <span className="tag">Signals intelligence network</span>
              </div>
              <nav className="nav-links">
                <a href="/feed">Feed</a>
                <a href="/">Discover</a>
                <a href="/signals">Signals</a>
                <a href="/profile">Profile</a>
              </nav>
              <div className="nav-actions">
                <Suspense fallback={<div className="nav-search nav-search--placeholder" />}>
                  <SearchBar />
                </Suspense>
                <div className="wallet-shell">
                  <WalletConnect />
                </div>
              </div>
            </div>
          </header>
          <NetworkOnboarding />
          <main className="container">
            <NetworkBanner />
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
