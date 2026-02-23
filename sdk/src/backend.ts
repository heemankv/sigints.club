export type SubscribeResponse = {
  subscriberId: string | null;
  public?: boolean;
  bypass?: boolean;
};

export type SyncWalletKeyResponse = {
  subscriberId: string;
  updated?: number;
  bypass?: boolean;
};

export async function registerSubscription(
  backendUrl: string,
  input: { streamId: string; subscriberWallet: string }
): Promise<SubscribeResponse> {
  const res = await fetch(`${backendUrl.replace(/\/$/, "")}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`backend subscribe failed (${res.status}): ${text}`);
  }
  return (await res.json()) as SubscribeResponse;
}

export async function syncWalletKey(
  backendUrl: string,
  input: { wallet: string; streamId?: string; encPubKeyDerBase64?: string }
): Promise<SyncWalletKeyResponse> {
  const res = await fetch(`${backendUrl.replace(/\/$/, "")}/wallet-key/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`wallet key sync failed (${res.status}): ${text}`);
  }
  return (await res.json()) as SyncWalletKeyResponse;
}

export async function fetchStream<T = any>(backendUrl: string, streamId: string): Promise<T> {
  const res = await fetch(`${backendUrl.replace(/\/$/, "")}/streams/${encodeURIComponent(streamId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`stream fetch failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { stream: T };
  return data.stream;
}
