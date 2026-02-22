"use client";

import { useState } from "react";
import { postJson } from "../../lib/api";
import { useWallet } from "@solana/wallet-adapter-react";

export default function FollowMaker({ targetProfileId }: { targetProfileId?: string }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? process.env.NEXT_PUBLIC_TEST_WALLET;
  const [status, setStatus] = useState<string | null>(null);

  if (!targetProfileId) {
    return null;
  }

  async function follow() {
    setStatus(null);
    if (!wallet) {
      setStatus("Connect your wallet to follow.");
      return;
    }
    try {
      await postJson("/social/follow", {
        wallet,
        targetProfileId,
      });
      setStatus("Following maker on Tapestry.");
    } catch (err: any) {
      setStatus(err.message ?? "Follow failed");
    }
  }

  return (
    <div className="follow-card">
      <button className="button ghost" onClick={follow}>
        Follow Maker
      </button>
      {status && <p className="subtext">{status}</p>}
    </div>
  );
}
