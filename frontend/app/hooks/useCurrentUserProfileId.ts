"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { loginUser } from "../lib/api/social";

export function useCurrentUserProfileId(): string | null {
  const { publicKey } = useWallet();
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setProfileId(null);
      return;
    }
    let active = true;
    loginUser(publicKey.toBase58())
      .then((res) => {
        if (!active) return;
        setProfileId(res.user.tapestryProfileId ?? null);
      })
      .catch(() => {
        if (!active) return;
        setProfileId(null);
      });
    return () => {
      active = false;
    };
  }, [publicKey]);

  return profileId;
}
