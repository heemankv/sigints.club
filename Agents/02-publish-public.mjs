import { SigintsClient } from "@heemankv/sigints-sdk";
import { createBackendClient } from "@heemankv/sigints-sdk/backend";
import { buildRecordSignalTransaction } from "@heemankv/sigints-sdk/transactions";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { loadEnv, parseArgs, getArg, requireArg, loadKeypairFromFile, confirmSignaturePolling } from "./agent-utils.mjs";

loadEnv();
const args = parseArgs();

const backendUrl = getArg(args, "backend-url", process.env.SIGINTS_BACKEND_URL ?? "http://127.0.0.1:3001");
const streamId = requireArg(args, "stream-id", process.env.SIGINTS_STREAM_ID, "SIGINTS_STREAM_ID");
const tierId = requireArg(args, "tier-id", process.env.SIGINTS_TIER_ID, "SIGINTS_TIER_ID");
const plaintext = getArg(args, "plaintext", process.env.SIGINTS_PLAINTEXT ?? "public signal: price=2000");
const publisherKeypairPath = getArg(
  args,
  "publisher-keypair",
  process.env.SIGINTS_PUBLISHER_KEYPAIR_PATH
);
const publisherSecret = publisherKeypairPath
  ? null
  : requireArg(
      args,
      "publisher-secret",
      process.env.SIGINTS_PUBLISHER_SECRET_KEY_BASE58,
      "SIGINTS_PUBLISHER_SECRET_KEY_BASE58"
    );

const backend = createBackendClient(backendUrl);
const solanaConfig = await backend.fetchSolanaConfig();
const rpcUrl = getArg(args, "rpc-url", process.env.ORBITFLARE_RPC_URL ?? solanaConfig.rpcUrl);

const connection = new Connection(rpcUrl, "confirmed");
const publisher = publisherKeypairPath
  ? await loadKeypairFromFile(publisherKeypairPath)
  : Keypair.fromSecretKey(bs58.decode(publisherSecret));

const client = await SigintsClient.fromBackend(backendUrl);

console.log("[sigints] backend:", backendUrl);
console.log("[sigints] stream:", streamId);
console.log("[sigints] visibility: public");

const intervalMs = Number(getArg(args, "interval-ms", process.env.SIGINTS_PUBLISH_INTERVAL_MS ?? "10000"));

let running = true;
process.on("SIGINT", () => {
  running = false;
});

async function publishOnce() {
  const randomValue = (80 + Math.random() * 20).toFixed(2);
  const payload = `${plaintext}${randomValue}`;
  const metadata = await client.prepareSignal({
    streamId,
    tierId,
    plaintext: payload,
    visibility: "public",
  });

  const { transaction, latestBlockhash } = await buildRecordSignalTransaction({
    connection,
    programId: solanaConfig.subscriptionProgramId,
    streamRegistryProgramId: solanaConfig.streamRegistryProgramId,
    authority: publisher.publicKey,
    streamId,
    metadata,
  });

  transaction.sign(publisher);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
  await confirmSignaturePolling(connection, signature);
  console.log("published public signal:", signature);
}

while (running) {
  try {
    await publishOnce();
  } catch (error) {
    console.error("publish failed:", error?.message ?? error);
  }
  if (!running) break;
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
