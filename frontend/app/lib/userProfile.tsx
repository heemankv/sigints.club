"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchUserProfile } from "./sdkBackend";
import { fetchFollowCounts } from "./api/social";

export type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
  tapestryProfileId?: string;
  walletKeyRegisteredAt?: number;
  walletKeyPublicKey?: string;
};

type FollowCounts = {
  followers: number;
  following: number;
};

type UserProfileContextValue = {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  followCounts: FollowCounts | null;
  followCountsLoading: boolean;
  refresh: () => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

const FOLLOW_COUNTS_CACHE_KEY = "follow_counts_cache_v1";
const FOLLOW_COUNTS_TTL_MS = 30_000;

function readFollowCountsCache(wallet: string): { data: FollowCounts; expiresAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FOLLOW_COUNTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.wallet !== wallet) return null;
    if (!parsed.data || typeof parsed.expiresAt !== "number") return null;
    return { data: parsed.data, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeFollowCountsCache(wallet: string, data: FollowCounts) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FOLLOW_COUNTS_CACHE_KEY,
      JSON.stringify({ wallet, data, expiresAt: Date.now() + FOLLOW_COUNTS_TTL_MS })
    );
  } catch {}
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followCounts, setFollowCounts] = useState<FollowCounts | null>(null);
  const [followCountsLoading, setFollowCountsLoading] = useState(false);
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

  useEffect(() => {
    const wallet = publicKey?.toBase58();
    if (!wallet) {
      setFollowCounts(null);
      setFollowCountsLoading(false);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cached = readFollowCountsCache(wallet);
    if (cached?.data) {
      setFollowCounts(cached.data);
    }
    const shouldFetch = !cached || Date.now() > cached.expiresAt;

    const fetchNow = async () => {
      setFollowCountsLoading(true);
      try {
        const res = await fetchFollowCounts(wallet);
        if (!active) return;
        setFollowCounts(res.counts);
        writeFollowCountsCache(wallet, res.counts);
      } catch {
        if (!active) return;
      } finally {
        if (active) setFollowCountsLoading(false);
      }
    };

    if (shouldFetch) {
      void fetchNow();
    }

    const scheduleNext = () => {
      if (!active) return;
      timer = setTimeout(async () => {
        await fetchNow();
        scheduleNext();
      }, FOLLOW_COUNTS_TTL_MS);
    };
    scheduleNext();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [publicKey]);

  const value = useMemo<UserProfileContextValue>(() => {
    return {
      profile,
      loading,
      error,
      followCounts,
      followCountsLoading,
      refresh,
      setProfile,
    };
  }, [profile, loading, error, followCounts, followCountsLoading, refresh]);

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
