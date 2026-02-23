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

const normalizeBackendUrl = (backendUrl: string) => backendUrl.replace(/\/$/, "");

function buildUrl(backendUrl: string, path: string) {
  return `${normalizeBackendUrl(backendUrl)}${path}`;
}

export async function getJson<T>(backendUrl: string, path: string): Promise<T> {
  const res = await fetch(buildUrl(backendUrl, path), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`backend GET ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

export async function postJson<T>(backendUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(buildUrl(backendUrl, path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`backend POST ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

export async function deleteJson<T>(backendUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(buildUrl(backendUrl, path), {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`backend DELETE ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

export async function registerSubscription(
  backendUrl: string,
  input: { streamId: string; subscriberWallet: string }
): Promise<SubscribeResponse> {
  return postJson<SubscribeResponse>(backendUrl, "/subscribe", input);
}

export async function syncWalletKey(
  backendUrl: string,
  input: { wallet: string; streamId?: string; encPubKeyDerBase64?: string }
): Promise<SyncWalletKeyResponse> {
  return postJson<SyncWalletKeyResponse>(backendUrl, "/wallet-key/sync", input);
}

export async function fetchStream<T = any>(backendUrl: string, streamId: string): Promise<T> {
  const data = await getJson<{ stream: T }>(
    backendUrl,
    `/streams/${encodeURIComponent(streamId)}`
  );
  return data.stream;
}

export async function fetchStreams<T = any>(backendUrl: string, includeTiers?: boolean): Promise<{ streams: T[] }> {
  const query = includeTiers ? "?includeTiers=true" : "";
  return getJson<{ streams: T[] }>(backendUrl, `/streams${query}`);
}

export async function fetchStreamSubscribers(
  backendUrl: string,
  streamId: string
): Promise<{ count: number }> {
  return getJson<{ count: number }>(
    backendUrl,
    `/streams/${encodeURIComponent(streamId)}/subscribers`
  );
}

export async function createStream<T = any>(backendUrl: string, payload: unknown): Promise<{ stream: T }> {
  return postJson<{ stream: T }>(backendUrl, "/streams", payload);
}

export async function fetchOnchainSubscriptions<T = any>(
  backendUrl: string,
  subscriber: string
): Promise<{ subscriptions: T[] }> {
  return getJson<{ subscriptions: T[] }>(
    backendUrl,
    `/subscriptions/onchain?subscriber=${encodeURIComponent(subscriber)}`
  );
}

export async function fetchSignals<T = any>(backendUrl: string, streamId: string): Promise<{ signals: T[] }> {
  return getJson<{ signals: T[] }>(backendUrl, `/signals?streamId=${encodeURIComponent(streamId)}`);
}

export async function fetchLatestSignal<T = any>(backendUrl: string, streamId: string): Promise<{ signal: T }> {
  return getJson<{ signal: T }>(
    backendUrl,
    `/signals/latest?streamId=${encodeURIComponent(streamId)}`
  );
}

export async function fetchSignalByHash<T = any>(
  backendUrl: string,
  signalHash: string
): Promise<{ signal: T }> {
  return getJson<{ signal: T }>(
    backendUrl,
    `/signals/by-hash/${encodeURIComponent(signalHash)}`
  );
}

export async function fetchCiphertext<T = any>(backendUrl: string, sha: string): Promise<{ payload: T }> {
  return getJson<{ payload: T }>(backendUrl, `/storage/ciphertext/${encodeURIComponent(sha)}`);
}

export async function fetchPublicPayload<T = any>(backendUrl: string, sha: string): Promise<{ payload: T }> {
  return getJson<{ payload: T }>(backendUrl, `/storage/public/${encodeURIComponent(sha)}`);
}

export async function fetchKeyboxEntry<T = any>(
  backendUrl: string,
  sha: string,
  params: { wallet: string; signatureBase64: string; encPubKeyDerBase64: string; subscriberId?: string }
): Promise<{ entry: T }> {
  const query =
    `?wallet=${encodeURIComponent(params.wallet)}` +
    `&signature=${encodeURIComponent(params.signatureBase64)}` +
    `&encPubKeyDerBase64=${encodeURIComponent(params.encPubKeyDerBase64)}` +
    (params.subscriberId ? `&subscriberId=${encodeURIComponent(params.subscriberId)}` : "");
  return getJson<{ entry: T }>(backendUrl, `/storage/keybox/${encodeURIComponent(sha)}${query}`);
}

export async function fetchHealth(backendUrl: string): Promise<{ ok: boolean; timestamp: number }> {
  return getJson<{ ok: boolean; timestamp: number }>(backendUrl, "/health");
}

export async function getTestWallet(
  backendUrl: string,
  walletName?: string
): Promise<{ wallet: string }> {
  const query = walletName ? `?wallet=${encodeURIComponent(walletName)}` : "";
  return getJson<{ wallet: string }>(backendUrl, `/test-wallet${query}`);
}

export async function testWalletSend(
  backendUrl: string,
  payload: { transactionBase64: string; skipPreflight?: boolean },
  walletName?: string
): Promise<{ signature: string }> {
  const query = walletName ? `?wallet=${encodeURIComponent(walletName)}` : "";
  return postJson<{ signature: string }>(backendUrl, `/test-wallet/send${query}`, payload);
}

export async function testWalletSignMessage(
  backendUrl: string,
  payload: { messageBase64: string },
  walletName?: string
): Promise<{ signatureBase64: string }> {
  const query = walletName ? `?wallet=${encodeURIComponent(walletName)}` : "";
  return postJson<{ signatureBase64: string }>(backendUrl, `/test-wallet/sign-message${query}`, payload);
}

export async function fetchFeed<T = any>(
  backendUrl: string,
  type?: "intent" | "slash"
): Promise<T> {
  const query = type ? `?type=${type}` : "";
  return getJson<T>(backendUrl, `/social/feed${query}`);
}

export async function fetchFollowingFeed<T = any>(
  backendUrl: string,
  wallet: string,
  type?: "intent" | "slash"
): Promise<T> {
  const query = type ? `&type=${type}` : "";
  return getJson<T>(
    backendUrl,
    `/social/feed?scope=following&wallet=${encodeURIComponent(wallet)}${query}`
  );
}

export async function fetchTrendingFeed<T = any>(backendUrl: string, limit = 6): Promise<T> {
  return getJson<T>(backendUrl, `/social/feed/trending?limit=${limit}`);
}

export async function fetchPost<T = any>(backendUrl: string, contentId: string): Promise<T> {
  return getJson<T>(backendUrl, `/social/posts/${encodeURIComponent(contentId)}`);
}

export async function createIntent(backendUrl: string, params: {
  wallet: string;
  content: string;
  topic?: string;
  tags?: string[];
}): Promise<void> {
  await postJson(backendUrl, "/social/intents", params);
}

export async function createSlashReport(backendUrl: string, params: {
  wallet: string;
  content: string;
  streamId?: string;
  makerWallet?: string;
  challengeTx?: string;
}): Promise<void> {
  await postJson(backendUrl, "/social/slash", params);
}

export async function addLike(backendUrl: string, wallet: string, contentId: string): Promise<void> {
  await postJson(backendUrl, "/social/likes", { wallet, contentId });
}

export async function removeLike(backendUrl: string, wallet: string, contentId: string): Promise<void> {
  await deleteJson(backendUrl, "/social/likes", { wallet, contentId });
}

export async function fetchLikeCount(backendUrl: string, contentId: string): Promise<number> {
  const data = await getJson<{ count: number }>(
    backendUrl,
    `/social/likes?contentId=${encodeURIComponent(contentId)}`
  );
  return data.count;
}

export async function fetchComments<T = any>(
  backendUrl: string,
  contentId: string,
  page = 1,
  pageSize = 3
): Promise<T> {
  return getJson<T>(
    backendUrl,
    `/social/comments?contentId=${encodeURIComponent(contentId)}&page=${page}&pageSize=${pageSize}`
  );
}

export async function addComment(
  backendUrl: string,
  wallet: string,
  contentId: string,
  comment: string
): Promise<void> {
  await postJson(backendUrl, "/social/comments", { wallet, contentId, comment });
}

export async function followProfile(
  backendUrl: string,
  wallet: string,
  targetProfileId: string
): Promise<void> {
  await postJson(backendUrl, "/social/follow", { wallet, targetProfileId });
}

export async function searchBots<T = any>(backendUrl: string, query: string): Promise<T> {
  return getJson<T>(backendUrl, `/bots?search=${encodeURIComponent(query)}`);
}

export async function fetchBots<T = any>(
  backendUrl: string,
  params: { owner?: string; role?: string; search?: string }
): Promise<T> {
  const query = new URLSearchParams();
  if (params.owner) query.set("owner", params.owner);
  if (params.role) query.set("role", params.role);
  if (params.search) query.set("search", params.search);
  const suffix = query.toString();
  return getJson<T>(backendUrl, `/bots${suffix ? `?${suffix}` : ""}`);
}

export async function createBot<T = any>(backendUrl: string, payload: unknown): Promise<T> {
  return postJson<T>(backendUrl, "/bots", payload);
}

export async function fetchUserProfile<T = any>(backendUrl: string, wallet: string): Promise<T> {
  return getJson<T>(backendUrl, `/users/${encodeURIComponent(wallet)}`);
}

export async function loginUser(backendUrl: string, wallet: string): Promise<void> {
  await postJson(backendUrl, "/users/login", { wallet });
}
