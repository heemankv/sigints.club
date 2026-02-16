"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { backendUrl } from "../lib/api";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default function WalletConnect() {
  const { publicKey } = useWallet();

  useEffect(() => {
    if (!publicKey) return;
    const wallet = publicKey.toBase58();
    fetch(`${backendUrl()}/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    }).catch(() => null);
  }, [publicKey]);

  return <WalletMultiButton />;
}
