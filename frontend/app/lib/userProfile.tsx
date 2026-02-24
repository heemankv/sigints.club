"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchUserProfile } from "./sdkBackend";

export type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
  tapestryProfileId?: string;
  walletKeyRegisteredAt?: number;
  walletKeyPublicKey?: string;
};

type UserProfileContextValue = {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const wallet = publicKey?.toBase58();
    if (!wallet) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUserProfile<{ user: UserProfile }>(wallet);
      if (requestIdRef.current !== requestId) return;
      setProfile(res.user);
    } catch (err: any) {
      if (requestIdRef.current !== requestId) return;
      setProfile({ wallet });
      setError(err?.message ?? "Failed to load profile");
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<UserProfileContextValue>(() => {
    return {
      profile,
      loading,
      error,
      refresh,
      setProfile,
    };
  }, [profile, loading, error, refresh]);

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error("useUserProfile must be used within UserProfileProvider");
  }
  return ctx;
}
