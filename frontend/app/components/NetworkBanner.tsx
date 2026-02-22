"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export default function NetworkBanner() {
  const pathname = usePathname();
  const { connection } = useConnection();
  const { connected } = useWallet();

  if (pathname === "/") return null;
  const [genesis, setGenesis] = useState<string | null>(null);
  const endpoint = connection.rpcEndpoint;
  const isLocal = endpoint.includes("127.0.0.1") || endpoint.includes("localhost");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const hash = await connection.getGenesisHash();
        if (mounted) setGenesis(hash);
      } catch {
        if (mounted) setGenesis(null);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [connection]);

  if (!connected || !isLocal) return null;

  return (
    <div className="banner warning">
      <span>Localnet mode detected (RPC {endpoint}).</span>
      <span>
        Make sure Phantom is set to a custom RPC (http://127.0.0.1:8899). The wallet UI may still
        show devnet, but transactions are sent to localnet.
      </span>
      {genesis && <span>Genesis {genesis.slice(0, 10)}…</span>}
    </div>
  );
}
