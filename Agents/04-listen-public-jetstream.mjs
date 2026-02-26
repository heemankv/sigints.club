import { SigintsClient, __testing } from "@heemankv/sigints-sdk";
import { createBackendClient } from "@heemankv/sigints-sdk/backend";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { loadEnv, parseArgs, getArg, requireArg } from "./agent-utils.mjs";
import { loadKeypairFromFile } from "./agent-utils.mjs";
import bs58 from "bs58";
import nacl from "tweetnacl";

loadEnv();
const args = parseArgs();

const backendUrl = getArg(args, "backend-url", process.env.SIGINTS_BACKEND_URL ?? "http://127.0.0.1:3001");
const streamIdArg = getArg(args, "stream-id", process.env.SIGINTS_STREAM_ID);
const streamPubkeyArg = getArg(args, "stream-pubkey", process.env.SIGINTS_STREAM_PUBKEY);

const rpcUrl = requireArg(args, "rpc-url", process.env.ORBITFLARE_RPC_URL, "ORBITFLARE_RPC_URL");
const jetstreamEndpoint = getArg(args, "jetstream-endpoint", process.env.ORBITFLARE_JETSTREAM_ENDPOINT);

const orbitflare = {
  rpcUrl,
  jetstreamEndpoint,
  apiKey: getArg(args, "api-key", process.env.ORBITFLARE_API_KEY),
  apiKeyHeader: getArg(args, "api-key-header", process.env.ORBITFLARE_API_KEY_HEADER),
};

const listenMs = Number(getArg(args, "listen-ms", process.env.SIGINTS_LISTEN_MS ?? "0"));
const pollMs = Number(getArg(args, "poll-ms", process.env.SIGINTS_POLL_MS ?? "5000"));

const backend = createBackendClient(backendUrl);
let streamId = streamIdArg ?? null;
let streamPubkey = streamPubkeyArg ?? null;

const authKeypairPath = getArg(args, "auth-keypair", process.env.SIGINTS_PUBLIC_AUTH_KEYPAIR_PATH);
const authSecret = getArg(args, "auth-secret", process.env.SIGINTS_PUBLIC_AUTH_SECRET_KEY_BASE58);
let keyboxAuth = undefined;
if (authKeypairPath || authSecret) {
  const kp = authKeypairPath
    ? await loadKeypairFromFile(authKeypairPath)
    : Keypair.fromSecretKey(bs58.decode(authSecret));
  keyboxAuth = {
    walletPubkey: kp.publicKey.toBase58(),
    signMessage: (message) => nacl.sign.detached(message, kp.secretKey),
  };
}

if (!streamPubkey && streamId) {
  const stream = await backend.fetchStream(streamId);
  streamPubkey = stream?.onchainAddress ?? null;
}

if (!streamId && streamPubkey) {
  streamId = streamPubkey;
}

console.log("[sigints] backend:", backendUrl);
console.log("[sigints] stream:", streamId);
console.log("[sigints] visibility: public");
const useJetstream = Boolean(jetstreamEndpoint);
console.log("[sigints] transport:", useJetstream ? "jetstream" : "jetstream");

const client = await SigintsClient.fromBackend(backendUrl, { orbitflare, keyboxAuth });

if (streamId) {
  try {
    const latest = await client.decryptLatestSignal(streamId);
    console.log("\n--- latest signal ---");
    console.log("plaintext:", latest);
  } catch (error) {
    console.error("latest signal fetch failed:", error?.message ?? error);
    if (!keyboxAuth) {
      console.error("public payloads require auth. Provide --auth-keypair or --auth-secret.");
    }
  }
}

if (streamPubkey && useJetstream) {
  const stop = await client.listenForSignals({
    streamId,
    streamPubkey,
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

  if (listenMs > 0) {
    const timer = setTimeout(() => {
      stop();
      process.exit(0);
    }, listenMs);
    timer.unref();
  }

  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
}

if (!useJetstream) {
  const connection = new Connection(rpcUrl, "confirmed");
  const solanaConfig = await backend.fetchSolanaConfig();
  const programId = new PublicKey(solanaConfig.subscriptionProgramId);
  const seen = new Set();
  const { decodeSignalRecord } = __testing;

  async function pollStream(stream) {
    if (!stream?.onchainAddress) return;
    const streamKey = new PublicKey(stream.onchainAddress);
    const [signalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signal_latest"), streamKey.toBuffer()],
      programId
    );
    const account = await connection.getAccountInfo(signalPda, "confirmed");
    if (!account) return;
    const decoded = decodeSignalRecord(account.data);
    if (!decoded) return;
    const dedupeKey = `${decoded.stream}:${decoded.signalHash}:${decoded.createdAt}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    try {
      const meta = await client.fetchSignalByHash(decoded.signalHash);
      const plaintext = await client.decryptSignal(meta);
      console.log("\n--- signal ---");
      console.log("stream:", stream.id ?? streamId ?? decoded.stream);
      console.log("hash:", decoded.signalHash);
      console.log("plaintext:", plaintext);
      console.log("createdAt:", new Date(meta.createdAt).toISOString());
    } catch (error) {
      const message = error?.message ?? String(error);
      if (message.includes("signal not found") || message.includes("404")) {
        return;
      }
      console.error("poll error:", message);
    }
  }

  async function pollOnce() {
    if (streamPubkey && streamId) {
      await pollStream({ id: streamId, onchainAddress: streamPubkey });
      return;
    }
    const { streams } = await backend.fetchStreams(true);
    for (const stream of streams) {
      await pollStream(stream);
    }
  }

  const start = Date.now();
  while (listenMs <= 0 || Date.now() - start < listenMs) {
    await pollOnce();
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
