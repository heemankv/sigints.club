"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { describeEndpoint, getWalletRpcEndpoint, isSameNetwork } from "../lib/network";

export default function NetworkOnboarding() {
  const pathname = usePathname();
  const { connection } = useConnection();
  const { connected } = useWallet();

  const [status, setStatus] = useState<string | null>(null);
  const [forceCheck, setForceCheck] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const check = useMemo(() => {
    const requiredEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? connection.rpcEndpoint;
    const walletEndpoint = getWalletRpcEndpoint();
    const required = describeEndpoint(requiredEndpoint);
    const current = describeEndpoint(walletEndpoint ?? connection.rpcEndpoint);
    const mismatch = walletEndpoint
      ? !isSameNetwork(required, describeEndpoint(walletEndpoint))
      : false;
    return {
      required,
      current,
      mismatch,
      needsAttention: mismatch,
      currentLabel: walletEndpoint ? current.label : "Unknown",
      requiredLabel: required.label,
    };
  }, [connection.rpcEndpoint, forceCheck]);

  // Reset dismissed when the mismatch state changes
  useEffect(() => {
    if (!check.needsAttention) setDismissed(false);
  }, [check.needsAttention]);

  if (pathname === "/" || !connected || !check.needsAttention || dismissed) return null;

  function confirm() {
    setForceCheck((prev) => prev + 1);
    if (!check.needsAttention) {
      setStatus(null);
      setDismissed(true);
    } else {
      setStatus("Still on the wrong network.");
    }
  }

  return (
    <div className="net-toast danger">
      <div className="net-toast-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className="net-toast-body">
        <div className="net-toast-title">Wrong network</div>
        <div className="net-toast-msg">
          Need <strong>{check.requiredLabel}</strong> — on {check.currentLabel}
        </div>
        <button className="net-toast-action" onClick={confirm}>
          I switched, check again
        </button>
        {status && <div className="net-toast-status">{status}</div>}
      </div>
      <button className="net-toast-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
