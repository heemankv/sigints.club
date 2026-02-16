import "./styles.css";
import { Suspense } from "react";
import BackendStatus from "./components/BackendStatus";
import NetworkBanner from "./components/NetworkBanner";
import Providers from "./providers";
import WalletConnect from "./components/WalletConnect";
import SearchBar from "./components/SearchBar";

export const metadata = {
  title: "Persona.fun",
  description: "Verifiable Social Intelligence Protocol",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="ambient" />
        <div className="scanlines" />
        <Providers>
          <header className="nav">
            <div className="container nav-inner">
              <div className="brand">
                <span className="logo">Persona.fun</span>
                <span className="tag">Social intelligence network</span>
              </div>
              <nav className="nav-links">
                <a href="/feed">Feed</a>
                <a href="/">Discovery</a>
                <a href="/requests">Social</a>
                <a href="/signals">Signals</a>
                <a href="/profile">Profile</a>
              </nav>
              <div className="nav-actions">
                <Suspense fallback={<div className="nav-search nav-search--placeholder" />}>
                  <SearchBar />
                </Suspense>
                <WalletConnect />
              </div>
            </div>
          </header>
          <main className="container">
            <NetworkBanner />
            <BackendStatus />
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
