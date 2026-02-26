import { SigintsClient } from "@heemankv/sigints-sdk";
import { createBackendClient } from "@heemankv/sigints-sdk/backend";
import { buildRecordSignalTransaction } from "@heemankv/sigints-sdk/transactions";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { loadEnv, parseArgs, getArg, requireArg } from "./agent-utils.mjs";

loadEnv();
const args = parseArgs();

const backendUrl = getArg(args, "backend-url", process.env.SIGINTS_BACKEND_URL ?? "http://127.0.0.1:3001");
const streamId = requireArg(args, "stream-id", process.env.SIGINTS_STREAM_ID, "SIGINTS_STREAM_ID");
const tierId = requireArg(args, "tier-id", process.env.SIGINTS_TIER_ID, "SIGINTS_TIER_ID");
const plaintext = getArg(args, "plaintext", process.env.SIGINTS_PLAINTEXT ?? "public signal: price=2000");
const publisherSecret = requireArg(
  args,
  "publisher-secret",
  process.env.SIGINTS_PUBLISHER_SECRET_KEY_BASE58,
  "SIGINTS_PUBLISHER_SECRET_KEY_BASE58"
);

const backend = createBackendClient(backendUrl);
const solanaConfig = await backend.fetchSolanaConfig();
const rpcUrl = getArg(args, "rpc-url", process.env.ORBITFLARE_RPC_URL ?? solanaConfig.rpcUrl);

const connection = new Connection(rpcUrl, "confirmed");
const publisher = Keypair.fromSecretKey(bs58.decode(publisherSecret));

const client = await SigintsClient.fromBackend(backendUrl);

console.log("[sigints] backend:", backendUrl);
console.log("[sigints] stream:", streamId);
console.log("[sigints] visibility: public");

const metadata = await client.prepareSignal({
  streamId,
  tierId,
  plaintext,
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
await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

console.log("published public signal:", signature);
