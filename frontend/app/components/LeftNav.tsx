"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    href: "/register-agent",
    label: "Register Agent",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <circle cx="15" cy="10" r="1.5" />
        <path d="M9 15h6" />
        <line x1="9" y1="2" x2="9" y2="4" />
        <line x1="15" y1="2" x2="15" y2="4" />
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

const PROFILE_SUB_ITEMS = [
  { href: "/profile/subscriptions", label: "My Subscriptions", tab: "subscriptions" },
  { href: "/profile/streams", label: "My Streams", tab: "streams" },
  { href: "/profile/agents", label: "My Agents", tab: "agents" },
  { href: "/profile/actions", label: "Actions", tab: "actions" },
];

export default function LeftNav() {
  const pathname = usePathname();

  const isProfileSection = pathname.startsWith("/profile");
  const profileSegment = pathname.split("/")[2];
  const currentTab = (profileSegment === "streams" || profileSegment === "agents" || profileSegment === "actions")
    ? profileSegment
    : "subscriptions";

  return (
    <aside className="x-sidebar">
      <nav className="x-nav">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const baseHref = href.split("?")[0];
          const isActive = baseHref === "/profile"
            ? isProfileSection
            : pathname === baseHref;
          return (
            <div key={href} className="x-nav-group">
              <Link
                href={href}
                className={`x-nav-item${isActive ? " x-nav-item--active" : ""}`}
              >
                {icon}
                <span className="x-nav-label">
                  {label}
                </span>
              </Link>

              {baseHref === "/profile" && (
                <div className="x-subnav">
                  {PROFILE_SUB_ITEMS.map((item) => {
                    return (
                    <Link
                      key={item.tab}
                      href={item.href}
                      className={`x-subnav-item${currentTab === item.tab ? " x-subnav-item--active" : ""}`}
                    >
                      <span className="x-subnav-label">
                        {item.label}
                      </span>
                    </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-badges">
        <a
          href="https://www.usetapestry.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-tapestry-badge"
        >
          <svg width="14" height="14" viewBox="0 0 33 34" fill="none" aria-hidden="true">
            <path d="M29.07 17.6291C31.0782 17.6291 32.7053 16.0019 32.7053 13.9937C32.7053 11.9856 31.0782 10.3584 29.07 10.3584C27.8583 10.3584 26.7901 10.9518 26.128 11.8638V11.8575C24.4603 14.153 21.1685 14.203 19.4227 12.0168C18.2547 9.69633 19.2322 7.73813 21.8619 7.22594C23.5359 6.90113 24.8038 5.42702 24.8038 3.65933C24.8038 1.65116 23.1767 0.0240173 21.1685 0.0240173C19.1604 0.0240173 17.5332 1.65116 17.5332 3.65933C17.5332 4.29957 17.7019 4.90234 17.9923 5.4239C19.3321 7.83807 18.3702 9.89933 15.6625 10.4271C14.7411 10.6052 13.9479 11.133 13.4138 11.8638V11.8575C11.7055 14.2092 8.28565 14.2092 6.5773 11.8575V11.8638C5.91519 10.9549 4.84709 10.3584 3.63532 10.3584C1.62715 10.3584 0 11.9856 0 13.9937C0 16.0019 1.62715 17.6291 3.63532 17.6291C4.84709 17.6291 5.91519 17.0357 6.5773 16.1237V16.13C8.23568 13.847 11.4993 13.7876 13.2545 15.9363C14.3539 18.6753 10.806 25.9584 8.02018 26.4706H8.0233C6.32745 26.7798 5.04384 28.2633 5.04384 30.0466C5.04384 32.0548 6.67099 33.6819 8.67916 33.6819C10.6873 33.6819 12.3145 32.0548 12.3145 30.0466C12.3145 29.4188 12.1552 28.8255 11.8741 28.3101C10.4968 25.7461 14.1602 18.0975 17.0179 17.5697H17.0148C17.9517 17.398 18.7637 16.867 19.3009 16.1268V16.1331C21.0092 13.7814 24.4291 13.7814 26.1374 16.1331V16.1268C26.7995 17.0357 27.8676 17.6322 29.0794 17.6322L29.07 17.6291Z" fill="#ff6b35" />
          </svg>
          Built on Tapestry
        </a>
        <a
          href="https://solana.com"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-solana-badge"
        >
          <svg width="14" height="14" viewBox="0 0 128 128" fill="none" aria-hidden="true">
            <circle cx="64" cy="64" r="64" fill="#9945FF" opacity="0.15" />
            <path d="M26 85.5h76l-14.5 15H26L26 85.5z" fill="#9945FF" opacity="0.8" />
            <path d="M26 55.5h76L87.5 70.5H26V55.5z" fill="#9945FF" opacity="0.6" />
            <path d="M26 27.5h76L87.5 42.5H26V27.5z" fill="#9945FF" opacity="0.4" />
          </svg>
          Built on Solana
        </a>
      </div>
    </aside>
  );
}
