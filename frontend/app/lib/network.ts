"use client";

export type NetworkDescriptor = {
  id: "localnet" | "devnet" | "testnet" | "mainnet" | "custom" | "unknown";
  label: string;
  endpoint: string;
  isLocal: boolean;
};

export function describeEndpoint(endpoint: string | null | undefined): NetworkDescriptor {
  if (!endpoint) {
    return { id: "unknown", label: "Unknown", endpoint: "", isLocal: false };
  }
  const normalized = endpoint.toLowerCase();
  const isLocal = normalized.includes("127.0.0.1") || normalized.includes("localhost");
  if (isLocal) {
    return { id: "localnet", label: "Localnet", endpoint, isLocal: true };
  }
  if (normalized.includes("devnet")) {
    return { id: "devnet", label: "Devnet", endpoint, isLocal: false };
  }
  if (normalized.includes("testnet")) {
    return { id: "testnet", label: "Testnet", endpoint, isLocal: false };
  }
  if (normalized.includes("mainnet") || normalized.includes("mainnet-beta")) {
    return { id: "mainnet", label: "Mainnet", endpoint, isLocal: false };
  }
  return { id: "custom", label: "Custom RPC", endpoint, isLocal: false };
}

export function getWalletRpcEndpoint(): string | null {
  if (typeof window === "undefined") return null;
  const anyWindow = window as any;
  return anyWindow?.solana?.connection?.rpcEndpoint ?? anyWindow?.solana?.rpcEndpoint ?? null;
}

export function isSameNetwork(a: NetworkDescriptor, b: NetworkDescriptor): boolean {
  if (a.id === "unknown" || b.id === "unknown") return false;
  if (a.id === b.id) return true;
  return normalizeEndpoint(a.endpoint) === normalizeEndpoint(b.endpoint);
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}
