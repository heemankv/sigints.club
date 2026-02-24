import { webcrypto } from "node:crypto";
import { SigintsClient, createBackendClient } from "../sdk/src/index.ts";

if (!globalThis.crypto) {
  // WebCrypto is required for PDA derivations in the SDK.
  (globalThis as any).crypto = webcrypto as any;
}

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";
const ownerWallet = process.env.OWNER_WALLET;
const agentIdFilter = process.env.AGENT_ID;
const refreshMs = Number(process.env.REFRESH_MS ?? "20000");

const publicKeyDerBase64 = process.env.SUBSCRIBER_PUBLIC_KEY_DER_BASE64;
const privateKeyDerBase64 = process.env.SUBSCRIBER_PRIVATE_KEY_DER_BASE64;
const subscriberKeys =
  publicKeyDerBase64 && privateKeyDerBase64
    ? { publicKeyDerBase64, privateKeyDerBase64 }
    : undefined;

if (!ownerWallet) {
  console.error("OWNER_WALLET is required.");
  process.exit(1);
}

const backend = createBackendClient(backendUrl);
const streamCache = new Map<string, any>();
const activeListeners = new Map<string, () => void>();

async function resolveStream(streamId: string) {
  if (streamCache.has(streamId)) return streamCache.get(streamId);
  const stream = await backend.fetchStream(streamId);
  streamCache.set(streamId, stream);
  return stream;
}

async function syncSubscriptions(client: SigintsClient) {
  try {
    const { agentSubscriptions } = await backend.fetchAgentSubscriptions({
      owner: ownerWallet,
    });
    const filtered = agentIdFilter
      ? agentSubscriptions.filter((sub: any) => sub.agentId === agentIdFilter)
      : agentSubscriptions;

    const desiredKeys = new Set<string>();
    for (const sub of filtered) {
      const key = `${sub.agentId}:${sub.streamId}`;
      desiredKeys.add(key);
      if (activeListeners.has(key)) continue;

      const stream = await resolveStream(sub.streamId);
      if (!stream?.onchainAddress) {
        console.log(`[agent-listen] Stream ${sub.streamId} missing onchain address.`);
        continue;
      }
      const visibility = stream.visibility ?? "private";
      if (visibility !== "public" && !subscriberKeys) {
        console.log(`[agent-listen] Missing subscriber keys for private stream ${sub.streamId}.`);
        continue;
      }

      const stop = await client.listenForSignals({
        streamPubkey: stream.onchainAddress,
        streamId: sub.streamId,
        subscriberKeys,
        onSignal: async (signal) => {
          console.log(`[agent-listen] ${sub.agentId} ${sub.streamId} → ${signal.plaintext}`);
        },
        onError: (error) => {
          console.error(`[agent-listen] ${sub.agentId} ${sub.streamId} error: ${error.message}`);
        },
      });
      activeListeners.set(key, stop);
      console.log(`[agent-listen] Listening to ${sub.streamId} for agent ${sub.agentId}.`);
    }

    for (const [key, stop] of activeListeners.entries()) {
      if (!desiredKeys.has(key)) {
        stop();
        activeListeners.delete(key);
        console.log(`[agent-listen] Stopped ${key}.`);
      }
    }
  } catch (error: any) {
    console.error(`[agent-listen] sync failed: ${error?.message ?? error}`);
  }
}

async function main() {
  const client = await SigintsClient.fromBackend(backendUrl);
  await syncSubscriptions(client);
  setInterval(() => {
    void syncSubscriptions(client);
  }, refreshMs);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
