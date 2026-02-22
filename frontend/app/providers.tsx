"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { type WalletName } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { TestWalletAdapter } from "./lib/TestWalletAdapter";
import { backendUrl } from "./lib/api";

const TEST_WALLET_NAME = "TestWallet" as WalletName;
const TEST_WALLET_FLAG = process.env.NEXT_PUBLIC_TEST_WALLET === "true";

if (TEST_WALLET_FLAG && typeof window !== "undefined") {
  try {
    const current = localStorage.getItem("walletName");
    const next = JSON.stringify(TEST_WALLET_NAME);
    if (current !== next) {
      localStorage.setItem("walletName", next);
    }
  } catch {
    // ignore
  }
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet"),
    []
  );
  const testWalletFlag = TEST_WALLET_FLAG;
  const envTestWalletPubkey = process.env.NEXT_PUBLIC_TEST_WALLET_PUBKEY ?? null;
  const [testWalletPubkey, setTestWalletPubkey] = useState<string | null>(
    envTestWalletPubkey
  );
  const [testWalletActive, setTestWalletActive] = useState(
    testWalletFlag || Boolean(envTestWalletPubkey)
  );
  const [providerKey, setProviderKey] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (envTestWalletPubkey) {
      setTestWalletPubkey(envTestWalletPubkey);
      setTestWalletActive(true);
      return;
    }
    let cancelled = false;
    fetch(`${backendUrl()}/test-wallet`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Test wallet unavailable"))))
      .then((data: { wallet?: string }) => {
        if (cancelled) return;
        setTestWalletPubkey(data.wallet ?? null);
        setTestWalletActive(Boolean(data.wallet));
      })
      .catch(() => {
        if (cancelled) return;
        setTestWalletPubkey(null);
        if (!testWalletFlag) {
          setTestWalletActive(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [testWalletFlag, envTestWalletPubkey]);
  const [testAdapter, setTestAdapter] = useState<TestWalletAdapter | null>(null);

  useEffect(() => {
    if (!testWalletActive || !testWalletPubkey) {
      setTestAdapter(null);
      return;
    }
    setTestAdapter((prev) => {
      if (prev && prev.publicKey?.toBase58() === testWalletPubkey) {
        return prev;
      }
      return new TestWalletAdapter(testWalletPubkey);
    });
  }, [testWalletActive, testWalletPubkey]);

  useEffect(() => {
    if (!testAdapter) return;
    if (!testAdapter.connected) {
      testAdapter.connect().catch(() => {});
    }
  }, [testAdapter]);

  const wallets = useMemo(() => {
    if (testWalletActive && testAdapter) {
      return [testAdapter];
    }
    // Wallet Standard wallets (Backpack, Phantom, Solflare, etc.) are auto-detected
    return [];
  }, [testWalletActive, testAdapter]);

  useEffect(() => {
    if (!testWalletActive || !testWalletPubkey) return;
    try {
      const key = "walletName";
      const existing = localStorage.getItem(key);
      if (existing !== JSON.stringify("TestWallet")) {
        localStorage.setItem(key, JSON.stringify("TestWallet"));
        setProviderKey((prev) => prev + 1);
      }
    } catch {
      // ignore
    }
  }, [testWalletActive, testWalletPubkey]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider key={providerKey} wallets={wallets} autoConnect={testWalletActive}>
        {testWalletActive && testWalletPubkey && (
          <TestWalletAutoConnect walletName={"TestWallet" as WalletName} />
        )}
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

function TestWalletAutoConnect({ walletName }: { walletName: WalletName }) {
  const { wallet, connected, connecting, select, connect } = useWallet();

  useEffect(() => {
    if (!walletName) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = () => {
      if (cancelled) return;
      attempts += 1;
      if (wallet?.adapter.name !== walletName) {
        select(walletName);
        return;
      }
      if (!connected && !connecting) {
        connect().catch(() => {});
      }
      if (connected || attempts > 20) {
        if (timer) {
          clearInterval(timer);
        }
      }
    };
    poll();
    timer = setInterval(poll, 500);
    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [walletName, wallet, connected, connecting, select, connect]);

  return null;
}
