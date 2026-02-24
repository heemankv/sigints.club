"use client";

// Centralised wallet connect logic.
// Owns the select → connect → login sequence and exposes detected wallets.
// Detects new users (no displayName) and exposes onboarding state.

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { loginUser } from "../lib/api/social";
import type { LoginUserResponse } from "../lib/sdkBackend";

const TEST_WALLET_NAME = "TestWallet" as WalletName;
const TEST_WALLET_FLAG = process.env.NEXT_PUBLIC_TEST_WALLET === "true";

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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Step 2 of the two-step select → connect sequence.
  // After select() updates the adapter state, connect() is called here.
  useEffect(() => {
    if (!pendingConnect.current || !wallet || connected || connecting) return;
    pendingConnect.current = false;
    connect().catch(() => {});
  }, [wallet, connected, connecting, connect]);

  // Login on wallet connect and detect new users.
  useEffect(() => {
    if (!publicKey) {
      setNeedsOnboarding(false);
      return;
    }
    loginUser(publicKey.toBase58())
      .then((res: LoginUserResponse) => {
        if (!res.user.displayName) {
          setNeedsOnboarding(true);
        }
      })
      .catch(() => {});
  }, [publicKey]);

  const completeOnboarding = useCallback(
    async (data: { displayName: string; bio?: string }) => {
      if (!publicKey) throw new Error("Wallet not connected");
      await loginUser(publicKey.toBase58(), data);
      setNeedsOnboarding(false);
    },
    [publicKey]
  );

  const detectedWallets = wallets.filter(
    (w) =>
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable
  );

  const attemptedTestWallet = useRef(false);
  useEffect(() => {
    if (!TEST_WALLET_FLAG || attemptedTestWallet.current) return;
    const testWallet = detectedWallets.find((w) => w.adapter.name === TEST_WALLET_NAME);
    if (!testWallet) return;
    attemptedTestWallet.current = true;
    if (wallet?.adapter.name !== TEST_WALLET_NAME) {
      pendingConnect.current = true;
      select(TEST_WALLET_NAME);
      return;
    }
    if (!connected && !connecting) {
      connect().catch(() => {});
    }
  }, [detectedWallets, wallet, connected, connecting, select, connect]);

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
    needsOnboarding,
    completeOnboarding,
  };
}
