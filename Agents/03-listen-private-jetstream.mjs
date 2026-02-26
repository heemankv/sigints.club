import { SigintsClient } from "@heemankv/sigints-sdk";
import { loadEnv, parseArgs, getArg, requireArg } from "./agent-utils.mjs";

loadEnv();
const args = parseArgs();

const backendUrl = getArg(args, "backend-url", process.env.SIGINTS_BACKEND_URL ?? "http://127.0.0.1:3001");
const streamId = requireArg(args, "stream-id", process.env.SIGINTS_STREAM_ID, "SIGINTS_STREAM_ID");
const streamPubkey = requireArg(args, "stream-pubkey", process.env.SIGINTS_STREAM_PUBKEY, "SIGINTS_STREAM_PUBKEY");

const orbitflare = {
  rpcUrl: requireArg(args, "rpc-url", process.env.ORBITFLARE_RPC_URL, "ORBITFLARE_RPC_URL"),
  jetstreamEndpoint: requireArg(
    args,
    "jetstream-endpoint",
    process.env.ORBITFLARE_JETSTREAM_ENDPOINT,
    "ORBITFLARE_JETSTREAM_ENDPOINT"
  ),
  apiKey: requireArg(args, "api-key", process.env.ORBITFLARE_API_KEY, "ORBITFLARE_API_KEY"),
  apiKeyHeader: requireArg(
    args,
    "api-key-header",
    process.env.ORBITFLARE_API_KEY_HEADER,
    "ORBITFLARE_API_KEY_HEADER"
  ),
};

const subscriberPublic = requireArg(
  args,
  "subscriber-public-key",
  process.env.SIGINTS_SUBSCRIBER_PUBLIC_KEY_DER_BASE64,
  "SIGINTS_SUBSCRIBER_PUBLIC_KEY_DER_BASE64"
);
const subscriberPrivate = requireArg(
  args,
  "subscriber-private-key",
  process.env.SIGINTS_SUBSCRIBER_PRIVATE_KEY_DER_BASE64,
  "SIGINTS_SUBSCRIBER_PRIVATE_KEY_DER_BASE64"
);
const subscriberKeys = {
  publicKeyDerBase64: subscriberPublic,
  privateKeyDerBase64: subscriberPrivate,
};

const listenMs = Number(getArg(args, "listen-ms", process.env.SIGINTS_LISTEN_MS ?? "60000"));

console.log("[sigints] backend:", backendUrl);
console.log("[sigints] stream:", streamId);
console.log("[sigints] visibility: private");
console.log("[sigints] transport: jetstream");

const client = await SigintsClient.fromBackend(backendUrl, { orbitflare });

const stop = await client.listenForSignals({
  streamId,
  streamPubkey,
  subscriberKeys,
  transport: "jetstream",
  includeBlockTime: true,
  onSignal: (signal) => {
    console.log("\n--- signal ---");
    console.log("hash:", signal.signalHash);
    console.log("plaintext:", signal.plaintext);
    console.log("createdAt:", new Date(signal.createdAt).toISOString());
    console.log("blockTime:", signal.blockTime ?? null);
  },
  onError: (error) => {
    console.error("listen error:", error?.message ?? error);
  },
});

const timer = setTimeout(() => {
  stop();
  process.exit(0);
}, listenMs);

timer.unref();

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
