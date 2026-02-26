"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { followProfile } from "../../lib/api/social";
import { toast } from "../../lib/toast";

export default function FollowMaker({ targetProfileId }: { targetProfileId?: string }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  if (!targetProfileId) {
    return null;
  }

  async function follow() {
    if (!wallet) {
      toast("Connect your wallet to follow.", "warn");
      return;
    }
    setStatus("loading");
    try {
      await followProfile(wallet, targetProfileId!);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (err: any) {
      toast(err.message ?? "Follow failed", "error");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 1500);
    }
  }

  const label =
    status === "done" ? "Following!" : status === "error" ? "Follow failed" : "Follow Maker";

  return (
    <button className="stream-card-copy-blink" onClick={follow} disabled={status === "loading"}>
      {status === "loading" ? "Following…" : label}
    </button>
  );
}
