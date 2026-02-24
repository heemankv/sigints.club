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
              <span className="logo">sigints.club</span>
              <span className="tag">Signals intelligence network</span>
            </a>
            <div className="nav-actions">
              <a href="https://app.sigints.club" className="button primary" style={{ fontSize: 14, padding: "8px 18px" }}>
                Launch App →
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
