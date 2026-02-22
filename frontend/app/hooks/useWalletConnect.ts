"use client";

// Centralised wallet connect logic.
// Owns the select → connect → login sequence and exposes detected wallets.

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { loginUser } from "../lib/api/social";

export function useWalletConnect() {
  const {
    wallets,
    wallet,
    select,
    connect,
    disconnect,
    connected,
    connecting,
    publicKey,
  } = useWallet();

  const pendingConnect = useRef(false);

  // Step 2 of the two-step select → connect sequence.
  // After select() updates the adapter state, connect() is called here.
  useEffect(() => {
    if (!pendingConnect.current || !wallet || connected || connecting) return;
    pendingConnect.current = false;
    connect().catch(() => {});
  }, [wallet, connected, connecting, connect]);

  // Fire-and-forget login whenever the wallet connects.
  useEffect(() => {
    if (!publicKey) return;
    loginUser(publicKey.toBase58()).catch(() => {});
  }, [publicKey]);

  const detectedWallets = wallets.filter(
    (w) =>
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable
  );

  function selectWallet(name: WalletName) {
    if (wallet?.adapter.name === name) {
      // Adapter already selected — connect directly.
      connect().catch(() => {});
    } else {
      // New selection — useEffect above will connect once adapter updates.
      pendingConnect.current = true;
      select(name);
    }
  }

  return {
    connected,
    connecting,
    publicKey,
    detectedWallets,
    selectWallet,
    disconnect,
  };
}
