"use client";

// Reusable wallet selection modal.
// Used by WalletConnect (header) and any component that needs to gate on wallet.

import { createPortal } from "react-dom";
import { useWalletConnect } from "../hooks/useWalletConnect";

type Props = {
  onClose: () => void;
  /** Optional contextual message shown above the wallet list. */
  reason?: string;
};

export default function WalletModal({ onClose, reason }: Props) {
  const { detectedWallets, selectWallet } = useWalletConnect();

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card wallet-modal" onClick={(e) => e.stopPropagation()}>
        <button className="wallet-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <span className="kicker">Solana</span>
        <h2>Connect a wallet</h2>
        <p className="subtext">
          {reason ?? "Choose an installed wallet to continue."}
        </p>

        <div className="wallet-list">
          {detectedWallets.length === 0 ? (
            <p className="subtext wallet-none">
              No wallets detected. Install{" "}
              <a href="https://backpack.app" target="_blank" rel="noopener noreferrer">
                Backpack
              </a>
              ,{" "}
              <a href="https://phantom.app" target="_blank" rel="noopener noreferrer">
                Phantom
              </a>
              , or{" "}
              <a href="https://solflare.com" target="_blank" rel="noopener noreferrer">
                Solflare
              </a>
              .
            </p>
          ) : (
            detectedWallets.map((w) => (
              <button
                key={w.adapter.name}
                className="wallet-option"
                onClick={() => {
                  selectWallet(w.adapter.name);
                  onClose();
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
  );
}
