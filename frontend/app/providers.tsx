"use client";

import { useEffect, useMemo } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletAdapterNetwork, type WalletName } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { TestWalletAdapter } from "./lib/TestWalletAdapter";

export default function Providers({ children }: { children: React.ReactNode }) {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl(network),
    []
  );
  const testWallet = process.env.NEXT_PUBLIC_TEST_WALLET;
  const wallets = useMemo(() => {
    if (testWallet) {
      return [new TestWalletAdapter(testWallet)];
    }
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })];
  }, [network, testWallet]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {testWallet && <TestWalletAutoConnect walletName={"TestWallet" as WalletName} />}
          {children}
        </WalletModalProvider>
      </WalletProvider>
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
