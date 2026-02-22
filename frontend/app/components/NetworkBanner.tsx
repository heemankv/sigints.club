"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

export default function NetworkBanner() {
  const pathname = usePathname();
  const { connection } = useConnection();
  const { connected } = useWallet();
  const [dismissed, setDismissed] = useState(false);

  const endpoint = connection.rpcEndpoint;
  const isLocal = endpoint.includes("127.0.0.1") || endpoint.includes("localhost");

  // Reset dismissed state when endpoint changes
  useEffect(() => { setDismissed(false); }, [endpoint]);

  if (pathname === "/" || !connected || !isLocal || dismissed) return null;

  return (
    <div className="net-toast">
      <div className="net-toast-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="net-toast-body">
        <div className="net-toast-title">Localnet mode</div>
        <div className="net-toast-msg">RPC: {endpoint}</div>
      </div>
      <button className="net-toast-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
