"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { followProfile } from "../../lib/api/social";

export default function FollowMaker({ targetProfileId }: { targetProfileId?: string }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
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
      await followProfile(wallet, targetProfileId!);
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
