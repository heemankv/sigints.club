"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import WalletModal from "./WalletModal";
import { useWalletConnect } from "../hooks/useWalletConnect";

export default function WalletConnect() {
  const pathname = usePathname();
  const { connected, connecting, publicKey, disconnect } = useWalletConnect();
  const [open, setOpen] = useState(false);

  // Not shown on the landing page.
  if (pathname === "/") return null;

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
      {open && <WalletModal onClose={() => setOpen(false)} />}
    </>
  );
}
