"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { type WalletName } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { TestWalletAdapter } from "./lib/TestWalletAdapter";
import { configureBackend, getTestWallet } from "./lib/sdkBackend";
import { WalletKeyStatusProvider } from "./lib/walletKeyStatus";
import { UserProfileProvider } from "./lib/userProfile";
import WalletPrefetch from "./components/WalletPrefetch";

const TEST_WALLET_NAME = "TestWallet" as WalletName;
const TEST_WALLET_FLAG = process.env.NEXT_PUBLIC_TEST_WALLET === "true";
const TEST_WALLET_ACCOUNT_KEY = "testWalletAccount";
const DEFAULT_TEST_WALLET_ACCOUNT = process.env.NEXT_PUBLIC_TEST_WALLET_ACCOUNT ?? "taker";

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
  const [testWalletAccount, setTestWalletAccount] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TEST_WALLET_ACCOUNT;
    try {
      const stored = localStorage.getItem(TEST_WALLET_ACCOUNT_KEY);
      if (stored) return stored;
    } catch {
      // ignore
    }
    return DEFAULT_TEST_WALLET_ACCOUNT;
  });
  const [providerKey, setProviderKey] = useState(0);

  useEffect(() => {
    configureBackend(process.env.NEXT_PUBLIC_BACKEND_URL);
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(TEST_WALLET_ACCOUNT_KEY);
      if (!stored) {
        localStorage.setItem(TEST_WALLET_ACCOUNT_KEY, DEFAULT_TEST_WALLET_ACCOUNT);
      }
    } catch {
      // ignore
    }
    if (envTestWalletPubkey) {
      setTestWalletActive(true);
    }
    let cancelled = false;
    getTestWallet(testWalletAccount)
      .then((data) => {
        if (cancelled) return;
        setTestWalletPubkey(data.wallet ?? null);
        setTestWalletActive(Boolean(data.wallet));
      })
      .catch(() => {
        if (cancelled) return;
        if (envTestWalletPubkey) {
          setTestWalletPubkey(envTestWalletPubkey);
          setTestWalletActive(true);
          return;
        }
        setTestWalletPubkey(null);
        if (!testWalletFlag) {
          setTestWalletActive(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [testWalletFlag, envTestWalletPubkey, testWalletAccount]);
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
      return new TestWalletAdapter(testWalletPubkey, testWalletAccount);
    });
  }, [testWalletActive, testWalletPubkey, testWalletAccount]);

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
        <WalletKeyStatusProvider>
          <UserProfileProvider>
            <WalletPrefetch />
            {testWalletActive && testWalletPubkey && (
              <TestWalletAutoConnect walletName={"TestWallet" as WalletName} />
            )}
            {children}
          </UserProfileProvider>
        </WalletKeyStatusProvider>
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
