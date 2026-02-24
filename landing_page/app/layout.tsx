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
              <span className="button primary" style={{ fontSize: 14, padding: "8px 18px", opacity: 0.6, cursor: "default" }}>
                Coming Soon
              </span>
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
