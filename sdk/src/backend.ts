import { Buffer } from "buffer";
import type { PrepareSignalInput, PrepareSignalResponse } from "./publish";

export type SubscribeResponse = {
  subscriberId: string | null;
  public?: boolean;
  bypass?: boolean;
};

export type SyncWalletKeyResponse = {
  subscriberId: string;
  updated?: number;
  bypass?: boolean;
  walletKeyRegisteredAt?: number;
  walletKeyPublicKey?: string;
};

export type LoginUserResponse = {
  user: {
    wallet: string;
    displayName?: string;
    bio?: string;
    tapestryProfileId?: string;
  };
};

export type SolanaConfigResponse = {
  subscriptionProgramId: string;
  streamRegistryProgramId: string;
  rpcUrl: string;
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

export async function patchJson<T>(backendUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(buildUrl(backendUrl, path), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`backend PATCH ${path} failed (${res.status}): ${text}`);
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

export async function fetchSolanaConfig(backendUrl: string): Promise<SolanaConfigResponse> {
  return getJson<SolanaConfigResponse>(backendUrl, "/config/solana");
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
  subscriber: string,
  opts?: { fresh?: boolean }
): Promise<{ subscriptions: T[] }> {
  const fresh = opts?.fresh ? "&fresh=true" : "";
  return getJson<{ subscriptions: T[] }>(
    backendUrl,
    `/subscriptions/onchain?subscriber=${encodeURIComponent(subscriber)}${fresh}`
  );
}

export async function fetchSignals<T = any>(backendUrl: string, streamId: string): Promise<{ signals: T[] }> {
  return getJson<{ signals: T[] }>(backendUrl, `/signals?streamId=${encodeURIComponent(streamId)}`);
}

export async function fetchSignalEvents<T = any>(
  backendUrl: string,
  params: { streamId?: string; limit?: number; after?: number }
): Promise<{ events: T[] }> {
  const query = new URLSearchParams();
  if (params.streamId) query.set("streamId", params.streamId);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  if (typeof params.after === "number") query.set("after", String(params.after));
  const suffix = query.toString();
  return getJson<{ events: T[] }>(backendUrl, `/signals/events${suffix ? `?${suffix}` : ""}`);
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

export async function fetchFollowCounts(
  backendUrl: string,
  wallet: string
): Promise<{ counts: { followers: number; following: number } }> {
  return getJson<{ counts: { followers: number; following: number } }>(
    backendUrl,
    `/social/follow-counts?wallet=${encodeURIComponent(wallet)}`
  );
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

export async function deleteComment(
  backendUrl: string,
  wallet: string,
  commentId: string
): Promise<void> {
  await deleteJson(backendUrl, `/social/comments/${encodeURIComponent(commentId)}`, { wallet });
}

export async function followProfile(
  backendUrl: string,
  wallet: string,
  targetProfileId: string
): Promise<void> {
  await postJson(backendUrl, "/social/follow", { wallet, targetProfileId });
}

export async function deletePost(
  backendUrl: string,
  wallet: string,
  contentId: string
): Promise<void> {
  await deleteJson(backendUrl, `/social/posts/${encodeURIComponent(contentId)}`, { wallet });
}

export async function searchAgents<T = any>(backendUrl: string, query: string): Promise<T> {
  return getJson<T>(backendUrl, `/agents?search=${encodeURIComponent(query)}`);
}

export async function fetchAgents<T = any>(
  backendUrl: string,
  params: { owner?: string; role?: string; streamId?: string; search?: string }
): Promise<T> {
  const query = new URLSearchParams();
  if (params.owner) query.set("owner", params.owner);
  if (params.role) query.set("role", params.role);
  if (params.streamId) query.set("streamId", params.streamId);
  if (params.search) query.set("search", params.search);
  const suffix = query.toString();
  return getJson<T>(backendUrl, `/agents${suffix ? `?${suffix}` : ""}`);
}

export async function createAgent<T = any>(backendUrl: string, payload: unknown): Promise<T> {
  return postJson<T>(backendUrl, "/agents", payload);
}

export async function createAgentSubscription<T = any>(
  backendUrl: string,
  payload: unknown
): Promise<T> {
  return postJson<T>(backendUrl, "/agent-subscriptions", payload);
}

export async function fetchAgentSubscriptions<T = any>(
  backendUrl: string,
  params: { owner?: string; agentId?: string; streamId?: string }
): Promise<T> {
  const query = new URLSearchParams();
  if (params.owner) query.set("owner", params.owner);
  if (params.agentId) query.set("agentId", params.agentId);
  if (params.streamId) query.set("streamId", params.streamId);
  const suffix = query.toString();
  return getJson<T>(backendUrl, `/agent-subscriptions${suffix ? `?${suffix}` : ""}`);
}

export async function deleteAgentSubscription<T = any>(backendUrl: string, id: string): Promise<T> {
  return deleteJson<T>(backendUrl, `/agent-subscriptions/${encodeURIComponent(id)}`, {});
}

export async function fetchUserProfile<T = any>(backendUrl: string, wallet: string): Promise<T> {
  return getJson<T>(backendUrl, `/users/${encodeURIComponent(wallet)}`);
}

export async function updateUserProfile<T = any>(
  backendUrl: string,
  wallet: string,
  payload: { displayName?: string; bio?: string }
): Promise<T> {
  return patchJson<T>(backendUrl, `/users/${encodeURIComponent(wallet)}`, payload);
}

export async function loginUser(
  backendUrl: string,
  wallet: string,
  opts?: { displayName?: string; bio?: string }
): Promise<LoginUserResponse> {
  return postJson<LoginUserResponse>(backendUrl, "/users/login", { wallet, ...opts });
}

export async function prepareSignal(
  backendUrl: string,
  input: PrepareSignalInput
): Promise<PrepareSignalResponse["metadata"]> {
  const payload = {
    streamId: input.streamId,
    tierId: input.tierId,
    visibility: input.visibility ?? "private",
    plaintextBase64: Buffer.from(input.plaintext, "utf8").toString("base64"),
  };
  const res = await postJson<PrepareSignalResponse>(backendUrl, "/signals/prepare", payload);
  return res.metadata;
}

export function createBackendClient(backendUrl: string) {
  const url = normalizeBackendUrl(backendUrl);
  if (!url) {
    throw new Error("backendUrl is required");
  }
  return {
    getJson: <T>(path: string) => getJson<T>(url, path),
    postJson: <T>(path: string, body: unknown) => postJson<T>(url, path, body),
    patchJson: <T>(path: string, body: unknown) => patchJson<T>(url, path, body),
    deleteJson: <T>(path: string, body: unknown) => deleteJson<T>(url, path, body),
    registerSubscription: (input: { streamId: string; subscriberWallet: string }) =>
      registerSubscription(url, input),
    fetchSolanaConfig: () => fetchSolanaConfig(url),
    syncWalletKey: (input: { wallet: string; streamId?: string; encPubKeyDerBase64?: string }) =>
      syncWalletKey(url, input),
    fetchStream: <T = any>(streamId: string) => fetchStream<T>(url, streamId),
    fetchStreams: <T = any>(includeTiers?: boolean) => fetchStreams<T>(url, includeTiers),
    fetchStreamSubscribers: (streamId: string) => fetchStreamSubscribers(url, streamId),
    createStream: <T = any>(payload: unknown) => createStream<T>(url, payload),
    fetchOnchainSubscriptions: <T = any>(subscriber: string, opts?: { fresh?: boolean }) =>
      fetchOnchainSubscriptions<T>(url, subscriber, opts),
    fetchSignals: <T = any>(streamId: string) => fetchSignals<T>(url, streamId),
    fetchSignalEvents: <T = any>(params: { streamId?: string; limit?: number; after?: number }) =>
      fetchSignalEvents<T>(url, params),
    fetchLatestSignal: <T = any>(streamId: string) => fetchLatestSignal<T>(url, streamId),
    fetchSignalByHash: <T = any>(signalHash: string) => fetchSignalByHash<T>(url, signalHash),
    fetchCiphertext: <T = any>(sha: string) => fetchCiphertext<T>(url, sha),
    fetchPublicPayload: <T = any>(sha: string) => fetchPublicPayload<T>(url, sha),
    fetchKeyboxEntry: <T = any>(sha: string, params: { wallet: string; signatureBase64: string; encPubKeyDerBase64: string; subscriberId?: string }) =>
      fetchKeyboxEntry<T>(url, sha, params),
    fetchHealth: () => fetchHealth(url),
    getTestWallet: (walletName?: string) => getTestWallet(url, walletName),
    testWalletSend: (payload: { transactionBase64: string; skipPreflight?: boolean }, walletName?: string) =>
      testWalletSend(url, payload, walletName),
    testWalletSignMessage: (payload: { messageBase64: string }, walletName?: string) =>
      testWalletSignMessage(url, payload, walletName),
    fetchFeed: <T = any>(type?: "intent" | "slash") => fetchFeed<T>(url, type),
    fetchFollowingFeed: <T = any>(wallet: string, type?: "intent" | "slash") => fetchFollowingFeed<T>(url, wallet, type),
    fetchTrendingFeed: <T = any>(limit = 6) => fetchTrendingFeed<T>(url, limit),
    fetchPost: <T = any>(contentId: string) => fetchPost<T>(url, contentId),
    prepareSignal: (input: PrepareSignalInput) => prepareSignal(url, input),
    createIntent: (params: { wallet: string; content: string; topic?: string; tags?: string[] }) =>
      createIntent(url, params),
    createSlashReport: (params: { wallet: string; content: string; streamId?: string; makerWallet?: string; challengeTx?: string }) =>
      createSlashReport(url, params),
    addLike: (wallet: string, contentId: string) => addLike(url, wallet, contentId),
    removeLike: (wallet: string, contentId: string) => removeLike(url, wallet, contentId),
    fetchLikeCount: (contentId: string) => fetchLikeCount(url, contentId),
    fetchFollowCounts: (wallet: string) => fetchFollowCounts(url, wallet),
    fetchComments: <T = any>(contentId: string, page = 1, pageSize = 3) =>
      fetchComments<T>(url, contentId, page, pageSize),
    addComment: (wallet: string, contentId: string, comment: string) =>
      addComment(url, wallet, contentId, comment),
    deleteComment: (wallet: string, commentId: string) =>
      deleteComment(url, wallet, commentId),
    followProfile: (wallet: string, targetProfileId: string) => followProfile(url, wallet, targetProfileId),
    deletePost: (wallet: string, contentId: string) =>
      deletePost(url, wallet, contentId),
    searchAgents: <T = any>(query: string) => searchAgents<T>(url, query),
    fetchAgents: <T = any>(params: { owner?: string; role?: string; streamId?: string; search?: string }) =>
      fetchAgents<T>(url, params),
    createAgent: <T = any>(payload: unknown) => createAgent<T>(url, payload),
    createAgentSubscription: <T = any>(payload: unknown) => createAgentSubscription<T>(url, payload),
    fetchAgentSubscriptions: <T = any>(params: { owner?: string; agentId?: string; streamId?: string }) =>
      fetchAgentSubscriptions<T>(url, params),
    deleteAgentSubscription: <T = any>(id: string) => deleteAgentSubscription<T>(url, id),
    fetchUserProfile: <T = any>(wallet: string) => fetchUserProfile<T>(url, wallet),
    updateUserProfile: <T = any>(wallet: string, payload: { displayName?: string; bio?: string }) =>
      updateUserProfile<T>(url, wallet, payload),
    loginUser: (wallet: string, opts?: { displayName?: string; bio?: string }) =>
      loginUser(url, wallet, opts),
  };
}
