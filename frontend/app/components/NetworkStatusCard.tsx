"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { describeEndpoint, getWalletRpcEndpoint, isSameNetwork } from "../lib/network";

export default function NetworkStatusCard() {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const requiredEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? connection.rpcEndpoint;
  const walletEndpoint = getWalletRpcEndpoint();

  const required = describeEndpoint(requiredEndpoint);
  const wallet = describeEndpoint(walletEndpoint ?? connection.rpcEndpoint);
  const mismatch = walletEndpoint ? !isSameNetwork(required, describeEndpoint(walletEndpoint)) : required.isLocal;

  if (!connected) {
    return (
      <div className="banner warning">
        <span>Wallet not connected.</span>
        <span>Connect to verify network status.</span>
      </div>
    );
  }

  return (
    <div className={`banner ${mismatch ? "warning" : ""}`}>
      <span>Required network: {required.label}</span>
      <span>
        Wallet network: {walletEndpoint ? wallet.label : "Unknown (wallet hides RPC)"}
      </span>
      <span className="mono">{walletEndpoint ?? "Wallet RPC not exposed"}</span>
    </div>
  );
}
