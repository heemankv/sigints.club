"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { describeEndpoint, getWalletRpcEndpoint, isSameNetwork } from "../lib/network";

export default function NetworkOnboarding() {
  const pathname = usePathname();
  const { connection } = useConnection();
  const { connected } = useWallet();

  // All hooks must be declared before any conditional returns.
  const [status, setStatus] = useState<string | null>(null);
  const [forceCheck, setForceCheck] = useState(0);
  const [open, setOpen] = useState(false);

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
      currentLabel: walletEndpoint ? current.label : "Unknown (wallet hides RPC)",
      requiredLabel: required.label,
      detail: walletEndpoint ?? "Wallet RPC not exposed by adapter",
    };
  }, [connection.rpcEndpoint, forceCheck]);

  useEffect(() => {
    if (!connected) {
      setOpen(false);
      setStatus(null);
      return;
    }
    setOpen(connected && check.needsAttention);
  }, [connected, check.needsAttention]);

  if (pathname === "/") return null;

  function confirm() {
    setForceCheck((prev) => prev + 1);
    if (!check.needsAttention) {
      setStatus(null);
      setOpen(false);
    } else {
      setStatus("Still on the wrong network. Try again.");
    }
  }

  const tooltip = `Wrong network. Required: ${check.requiredLabel}. Current: ${check.currentLabel}`;

  return (
    <>
      {connected && check.needsAttention && (
        <div className="network-indicator" title={tooltip} aria-label={tooltip}>
          ✕
        </div>
      )}
      {open && (
        <div className="modal-overlay">
          <div className="modal-card">
            <span className="kicker">Network check</span>
            <h2>Switch your wallet network</h2>
            <p>
              Your wallet appears to be on <strong>{check.currentLabel}</strong>. This app is
              configured for <strong>{check.requiredLabel}</strong>.
            </p>
            <div className="modal-meta">
              <div>
                <span className="subtext">Required RPC</span>
                <div className="mono">{check.required.endpoint || "—"}</div>
              </div>
              <div>
                <span className="subtext">Detected RPC</span>
                <div className="mono">{check.detail}</div>
              </div>
            </div>
            {check.required.id === "localnet" && (
              <div className="modal-tip">
                <strong>Localnet setup:</strong>
                <div className="modal-steps">
                  <div>
                    <span className="subtext">Phantom</span>
                    <ol>
                      <li>Open Phantom → Settings → Developer Settings.</li>
                      <li>Enable "Custom RPC" and set it to <code>http://127.0.0.1:8899</code>.</li>
                      <li>Confirm and reload this page.</li>
                    </ol>
                  </div>
                  <div>
                    <span className="subtext">Solflare</span>
                    <ol>
                      <li>Open Solflare → Settings → Network.</li>
                      <li>Add a custom RPC: <code>http://127.0.0.1:8899</code>.</li>
                      <li>Select it, then reload this page.</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="button primary" onClick={confirm}>
                I switched, check again
              </button>
            </div>
            {status && <p className="subtext">{status}</p>}
            <p className="subtext">
              This modal blocks access until your wallet is on the required network.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
