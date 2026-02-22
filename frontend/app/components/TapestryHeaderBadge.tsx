"use client";

import { usePathname } from "next/navigation";

export default function TapestryHeaderBadge() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <a
      href="https://www.usetapestry.dev/"
      target="_blank"
      rel="noopener noreferrer"
      className="tapestry-header-badge"
    >
      <span className="tapestry-header-badge-label">Powered by</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://cdn.prod.website-files.com/67814d9fc76ba46748750247/678fe574dc9c8c78bc2af16f_logo_full.svg"
        alt="Tapestry"
        className="tapestry-header-badge-logo"
      />
    </a>
  );
}
