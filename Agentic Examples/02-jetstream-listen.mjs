import { SigintsClient } from "@heemankv/sigints-sdk";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in your environment.`);
  }
  return value;
}

const backendUrl = process.env.SIGINTS_BACKEND_URL ?? "http://127.0.0.1:3001";
const streamId = requireEnv("SIGINTS_STREAM_ID");
const streamPubkey = requireEnv("SIGINTS_STREAM_PUBKEY");

const orbitflare = {
  rpcUrl: requireEnv("ORBITFLARE_RPC_URL"),
  jetstreamEndpoint: requireEnv("ORBITFLARE_JETSTREAM_ENDPOINT"),
  apiKey: requireEnv("ORBITFLARE_API_KEY"),
  apiKeyHeader: requireEnv("ORBITFLARE_API_KEY_HEADER"),
};

const subscriberPublic = process.env.SIGINTS_SUBSCRIBER_PUBLIC_KEY_DER_BASE64 ?? "";
const subscriberPrivate = process.env.SIGINTS_SUBSCRIBER_PRIVATE_KEY_DER_BASE64 ?? "";
const subscriberKeys = subscriberPublic && subscriberPrivate
  ? { publicKeyDerBase64: subscriberPublic, privateKeyDerBase64: subscriberPrivate }
  : undefined;

const listenMs = Number(process.env.SIGINTS_LISTEN_MS ?? "60000");

console.log("[sigints] backend:", backendUrl);
console.log("[sigints] stream:", streamId);
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
