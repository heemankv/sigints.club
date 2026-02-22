"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { backendUrl } from "../lib/api";

export default function WalletConnect() {
  const pathname = usePathname();
  const { wallets, wallet, select, connect, disconnect, connected, connecting, publicKey } =
    useWallet();
  const [open, setOpen] = useState(false);
  const pendingConnect = useRef(false);

  // Connect after wallet adapter state has updated following select()
  useEffect(() => {
    if (!pendingConnect.current || !wallet || connected || connecting) return;
    pendingConnect.current = false;
    connect().catch(console.error);
  }, [wallet, connected, connecting]);

  // Login on connect
  useEffect(() => {
    if (!publicKey) return;
    fetch(`${backendUrl()}/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: publicKey.toBase58() }),
    }).catch(() => null);
  }, [publicKey]);

  if (pathname === "/") return null;

  const detected = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable
  );

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    return (
      <button className="button ghost wallet-address-btn" onClick={() => disconnect()}>
        <span className="wallet-dot" />
        {addr.slice(0, 4)}…{addr.slice(-4)}
      </button>
    );
  }

  return (
    <>
      <button className="button primary" onClick={() => setOpen(true)} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>

      {open && createPortal(
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-card wallet-modal" onClick={(e) => e.stopPropagation()}>
            <button className="wallet-modal-close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
            <span className="kicker">Solana</span>
            <h2>Connect a wallet</h2>
            <p className="subtext">Choose an installed wallet to continue.</p>

            <div className="wallet-list">
              {detected.length === 0 ? (
                <p className="subtext wallet-none">
                  No wallets detected. Install{" "}
                  <a href="https://backpack.app" target="_blank" rel="noopener noreferrer">Backpack</a>
                  ,{" "}
                  <a href="https://phantom.app" target="_blank" rel="noopener noreferrer">Phantom</a>
                  , or{" "}
                  <a href="https://solflare.com" target="_blank" rel="noopener noreferrer">Solflare</a>
                  .
                </p>
              ) : (
                detected.map((w) => (
                  <button
                    key={w.adapter.name}
                    className="wallet-option"
                    onClick={() => {
                      setOpen(false);
                      if (wallet?.adapter.name === w.adapter.name) {
                        // Already selected — adapter is ready, connect directly
                        connect().catch(console.error);
                      } else {
                        // New selection — wait for adapter state to update then connect via useEffect
                        pendingConnect.current = true;
                        select(w.adapter.name);
                      }
                    }}
                  >
                    <img src={w.adapter.icon} alt="" width={36} height={36} />
                    <span>{w.adapter.name}</span>
                    <span className="wallet-option-badge">Detected</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
