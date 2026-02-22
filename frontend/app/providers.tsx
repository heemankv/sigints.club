"use client";

import { useEffect, useMemo } from "react";
import { ConnectionProvider, useWallet } from "@solana/wallet-adapter-react";
import { UnifiedWalletProvider } from "@jup-ag/wallet-adapter";
import { type WalletName } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { TestWalletAdapter } from "./lib/TestWalletAdapter";

export default function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet"),
    []
  );
  const testWallet = process.env.NEXT_PUBLIC_TEST_WALLET;
  const wallets = useMemo(() => {
    if (testWallet) {
      return [new TestWalletAdapter(testWallet)];
    }
    // Wallet Standard wallets (Backpack, Phantom, Solflare, etc.) are auto-detected
    return [];
  }, [testWallet]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <UnifiedWalletProvider
        wallets={wallets}
        config={{
          autoConnect: false,
          env: "devnet",
          metadata: {
            name: "sigints.club",
            url: "https://sigints.club",
            description: "Verifiable Social Intelligence Protocol",
            iconUrls: [],
          },
          theme: "light",
        }}
      >
        {testWallet && <TestWalletAutoConnect walletName={"TestWallet" as WalletName} />}
        {children}
      </UnifiedWalletProvider>
    </ConnectionProvider>
  );
}

function TestWalletAutoConnect({ walletName }: { walletName: WalletName }) {
  const { wallet, connected, connecting, select, connect } = useWallet();

  useEffect(() => {
    if (!walletName) return;
    if (wallet?.adapter.name !== walletName) {
      select(walletName);
      return;
    }
    if (!connected && !connecting) {
      connect().catch(() => {});
    }
  }, [walletName, wallet, connected, connecting, select, connect]);

  return null;
}
