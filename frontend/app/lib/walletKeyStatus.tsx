"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { hasRegisteredWalletKey, resolveProgramId } from "./solana";

export type WalletKeyStatus = "unknown" | "checking" | "registered" | "missing";

type WalletKeyStatusValue = {
  status: WalletKeyStatus;
  needsWalletKey: boolean;
  refresh: () => Promise<void>;
};

const WalletKeyStatusContext = createContext<WalletKeyStatusValue | null>(null);

export function WalletKeyStatusProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<WalletKeyStatus>("unknown");
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const key = publicKey;
    if (!key) {
      setStatus("unknown");
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("checking");
    try {
      const programId = resolveProgramId();
      const registered = await hasRegisteredWalletKey(connection, programId, key);
      if (requestIdRef.current !== requestId) return;
      setStatus(registered ? "registered" : "missing");
    } catch {
      if (requestIdRef.current !== requestId) return;
      setStatus("unknown");
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WalletKeyStatusValue>(() => {
    return {
      status,
      needsWalletKey: status === "missing",
      refresh,
    };
  }, [status, refresh]);

  return (
    <WalletKeyStatusContext.Provider value={value}>
      {children}
    </WalletKeyStatusContext.Provider>
  );
}

export function useWalletKeyStatus(): WalletKeyStatusValue {
  const ctx = useContext(WalletKeyStatusContext);
  if (!ctx) {
    throw new Error("useWalletKeyStatus must be used within WalletKeyStatusProvider");
  }
  return ctx;
}
