import {
  createBackendClient,
  buildPublicPayloadMessage as sdkBuildPublicPayloadMessage,
  type SubscribeResponse,
  type BlinkLinkResponse,
  type SyncWalletKeyResponse,
  type LoginUserResponse,
} from "../../../sdk/src/backend";

type BackendClient = ReturnType<typeof createBackendClient>;

let client: BackendClient | null = null;

export function configureBackend(url?: string): BackendClient {
  const backendUrl = (url ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "").trim();
  client = createBackendClient(backendUrl);
  return client;
}

function getClient(): BackendClient {
  if (!client) {
    configureBackend();
  }
  if (!client) {
    throw new Error("Backend client not configured");
  }
  return client;
}

export function registerSubscription(input: { streamId: string; subscriberWallet: string }): Promise<SubscribeResponse> {
  return getClient().registerSubscription(input);
}

export function syncWalletKey(input: { wallet: string; streamId: string; encPubKeyDerBase64?: string }): Promise<SyncWalletKeyResponse> {
  return getClient().syncWalletKey(input);
}

export function fetchStream<T = any>(streamId: string): Promise<T> {
  return getClient().fetchStream<T>(streamId);
}

export function fetchStreams<T = any>(includeTiers?: boolean): Promise<{ streams: T[] }> {
  return getClient().fetchStreams<T>(includeTiers);
}

export function fetchStreamSubscribers(streamId: string): Promise<{ count: number }> {
  return getClient().fetchStreamSubscribers(streamId);
}

export function fetchBlinkLink(streamId: string): Promise<BlinkLinkResponse> {
  return getClient().fetchBlinkLink(streamId);
}

export function createStream<T = any>(payload: unknown): Promise<{ stream: T }> {
  return getClient().createStream<T>(payload);
}

export function fetchOnchainSubscriptions<T = any>(
  subscriber: string,
  opts?: { fresh?: boolean }
): Promise<{ subscriptions: T[] }> {
  return getClient().fetchOnchainSubscriptions<T>(subscriber, opts);
}

export function fetchSignals<T = any>(streamId: string): Promise<{ signals: T[] }> {
  return getClient().fetchSignals<T>(streamId);
}

export function fetchSignalEvents<T = any>(params: { streamId?: string; limit?: number; after?: number }): Promise<{ events: T[] }> {
  return getClient().fetchSignalEvents<T>(params);
}

export function fetchLatestSignal<T = any>(streamId: string): Promise<{ signal: T }> {
  return getClient().fetchLatestSignal<T>(streamId);
}

export function fetchSignalByHash<T = any>(signalHash: string): Promise<{ signal: T }> {
  return getClient().fetchSignalByHash<T>(signalHash);
}

export function fetchCiphertext<T = any>(sha: string): Promise<{ payload: T }> {
  return getClient().fetchCiphertext<T>(sha);
}

export function fetchPublicPayload<T = any>(
  sha: string,
  auth?: { wallet: string; signatureBase64: string } | { agentId: string; signatureBase64: string }
): Promise<{ payload: T }> {
  return getClient().fetchPublicPayload<T>(sha, auth);
}

export function buildPublicPayloadMessage(sha: string): Uint8Array {
  return sdkBuildPublicPayloadMessage(sha);
}

export function fetchKeyboxEntry<T = any>(sha: string, params: { wallet: string; signatureBase64: string; encPubKeyDerBase64: string; subscriberId?: string }): Promise<{ entry: T }> {
  return getClient().fetchKeyboxEntry<T>(sha, params);
}

export function fetchHealth(): Promise<{ ok: boolean; timestamp: number }> {
  return getClient().fetchHealth();
}

export function getTestWallet(walletName?: string): Promise<{ wallet: string }> {
  return getClient().getTestWallet(walletName);
}

export function testWalletSend(payload: { transactionBase64: string; skipPreflight?: boolean }, walletName?: string): Promise<{ signature: string }> {
  return getClient().testWalletSend(payload, walletName);
}

export function testWalletSignMessage(payload: { messageBase64: string }, walletName?: string): Promise<{ signatureBase64: string }> {
  return getClient().testWalletSignMessage(payload, walletName);
}

export function fetchFeed<T = any>(type?: "intent" | "slash"): Promise<T> {
  return getClient().fetchFeed<T>(type);
}

export function fetchFollowingFeed<T = any>(wallet: string, type?: "intent" | "slash"): Promise<T> {
  return getClient().fetchFollowingFeed<T>(wallet, type);
}

export function fetchTrendingFeed<T = any>(limit = 6): Promise<T> {
  return getClient().fetchTrendingFeed<T>(limit);
}

export function fetchPost<T = any>(contentId: string): Promise<T> {
  return getClient().fetchPost<T>(contentId);
}

export async function prepareSignal(input: { streamId: string; tierId: string; plaintext: string; visibility?: "public" | "private" }) {
  return getClient().prepareSignal(input);
}

export function createIntent(params: { wallet: string; content: string; topic?: string; tags?: string[] }): Promise<void> {
  return getClient().createIntent(params);
}

export function createSlashReport(params: { wallet: string; content: string; streamId?: string; makerWallet?: string; challengeTx?: string }): Promise<void> {
  return getClient().createSlashReport(params);
}

export function addLike(wallet: string, contentId: string): Promise<void> {
  return getClient().addLike(wallet, contentId);
}

export function removeLike(wallet: string, contentId: string): Promise<void> {
  return getClient().removeLike(wallet, contentId);
}

export function fetchLikeCount(contentId: string): Promise<number> {
  return getClient().fetchLikeCount(contentId);
}

export function fetchFollowCounts(wallet: string): Promise<{ counts: { followers: number; following: number } }> {
  return getClient().fetchFollowCounts(wallet);
}

export function fetchFollowingIds(wallet: string): Promise<{ following: string[] }> {
  return getClient().fetchFollowingIds(wallet);
}

export function fetchComments<T = any>(contentId: string, page = 1, pageSize = 3): Promise<T> {
  return getClient().fetchComments<T>(contentId, page, pageSize);
}

export function addComment(wallet: string, contentId: string, comment: string): Promise<void> {
  return getClient().addComment(wallet, contentId, comment);
}

export function deleteComment(wallet: string, commentId: string): Promise<void> {
  return getClient().deleteComment(wallet, commentId);
}

export function followProfile(wallet: string, targetProfileId: string): Promise<void> {
  return getClient().followProfile(wallet, targetProfileId);
}

export function deletePost(wallet: string, contentId: string): Promise<void> {
  return getClient().deletePost(wallet, contentId);
}

export function searchAgents<T = any>(query: string): Promise<T> {
  return getClient().searchAgents<T>(query);
}

export function fetchAgents<T = any>(params: { owner?: string; role?: string; streamId?: string; search?: string }): Promise<T> {
  return getClient().fetchAgents<T>(params);
}

export function createAgent<T = any>(payload: unknown): Promise<T> {
  return getClient().createAgent<T>(payload);
}

export function createAgentSubscription<T = any>(payload: unknown): Promise<T> {
  return getClient().createAgentSubscription<T>(payload);
}

export function fetchAgentSubscriptions<T = any>(params: { owner?: string; agentId?: string; streamId?: string }): Promise<T> {
  return getClient().fetchAgentSubscriptions<T>(params);
}

export function deleteAgentSubscription<T = any>(id: string): Promise<T> {
  return getClient().deleteAgentSubscription<T>(id);
}

export function fetchUserProfile<T = any>(wallet: string): Promise<T> {
  return getClient().fetchUserProfile<T>(wallet);
}

export function updateUserProfile<T = any>(
  wallet: string,
  payload: { displayName?: string; bio?: string }
): Promise<T> {
  return getClient().updateUserProfile<T>(wallet, payload);
}

export function loginUser(
  wallet: string,
  opts?: { displayName?: string; bio?: string }
): Promise<LoginUserResponse> {
  return getClient().loginUser(wallet, opts);
}

export type { SubscribeResponse, SyncWalletKeyResponse, LoginUserResponse };
