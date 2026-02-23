"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SolanaBadge from "./SolanaBadge";
import { useWalletKeyStatus } from "../lib/walletKeyStatus";

const NAV_ITEMS = [
  {
    href: "/feed",
    label: "Feed",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/streams",
    label: "Streams",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    href: "/register-stream",
    label: "Register Stream",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function LeftNav() {
  const pathname = usePathname();
  const { needsWalletKey } = useWalletKeyStatus();

  return (
    <aside className="x-sidebar">
      <nav className="x-nav">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const baseHref = href.split("?")[0];
          const isActive = pathname === baseHref;
          const showDot = needsWalletKey && baseHref === "/profile";
          return (
            <Link
              key={href}
              href={href}
              className={`x-nav-item${isActive ? " x-nav-item--active" : ""}`}
            >
              {icon}
              <span className="x-nav-label">
                {label}
                {showDot && <span className="status-dot" aria-label="Wallet key missing" />}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-badges">
        <a
          href="https://www.usetapestry.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-logo-link"
          aria-label="Tapestry"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.prod.website-files.com/67814d9fc76ba46748750247/678fe574dc9c8c78bc2af16f_logo_full.svg"
            alt="Tapestry"
            className="sidebar-logo-img"
          />
        </a>
        <SolanaBadge />
      </div>
    </aside>
  );
}
