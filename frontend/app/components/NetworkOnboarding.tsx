"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { describeEndpoint, getWalletRpcEndpoint, isSameNetwork } from "../lib/network";

type NetworkCheck = {
  required: ReturnType<typeof describeEndpoint>;
  current: ReturnType<typeof describeEndpoint>;
  mismatch: boolean;
  needsAttention: boolean;
  currentLabel: string;
  requiredLabel: string;
  detail: string;
};

export default function NetworkOnboarding() {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const [status, setStatus] = useState<string | null>(null);
  const [forceCheck, setForceCheck] = useState(0);

  const check = useMemo<NetworkCheck>(() => {
    const requiredEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? connection.rpcEndpoint;
    const walletEndpoint = getWalletRpcEndpoint();
    const required = describeEndpoint(requiredEndpoint);
    const current = describeEndpoint(walletEndpoint ?? connection.rpcEndpoint);
    const mismatch = walletEndpoint ? !isSameNetwork(required, describeEndpoint(walletEndpoint)) : required.isLocal;
    const needsAttention = mismatch || (!walletEndpoint && required.isLocal);
    const currentLabel = walletEndpoint ? current.label : "Unknown (wallet hides RPC)";
    const requiredLabel = required.label;
    const detail = walletEndpoint ? walletEndpoint : "Wallet RPC not exposed by adapter";
    return { required, current, mismatch, needsAttention, currentLabel, requiredLabel, detail };
  }, [connection.rpcEndpoint, forceCheck]);

  const [open, setOpen] = useState(false);
  const blocking = connected && check.needsAttention;

  useEffect(() => {
    if (!connected) {
      setOpen(false);
      setStatus(null);
      return;
    }
    setOpen(blocking);
  }, [connected, blocking]);

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
      {check.needsAttention && (
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
                      <li>Enable “Custom RPC” and set it to <code>http://127.0.0.1:8899</code>.</li>
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
