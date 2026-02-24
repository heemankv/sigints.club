import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { SigintsClient, fetchSolanaConfig } from "../sdk/src/index.ts";

if (!globalThis.crypto) {
  // WebCrypto is required for PDA derivations in the SDK.
  (globalThis as any).crypto = webcrypto as any;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";
const streamId = process.env.STREAM_ID;
const tierId = process.env.TIER_ID ?? "tier-basic";
const makerKey = process.env.MAKER_KEY ?? "user01.json";
const intervalMs = Number(process.env.INTERVAL_MS ?? "10000");
const visibility = (process.env.VISIBILITY ?? "public") as "public" | "private";

if (!streamId) {
  console.error("STREAM_ID is required (e.g. STREAM_ID=stream-foo).");
  process.exit(1);
}

function loadKeypair(name: string): Keypair {
  const keyPath = path.join(ROOT, "accounts", name);
  const raw = fs.readFileSync(keyPath, "utf8");
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
}

async function sendTx(connection: Connection, tx: Transaction, signer: Keypair): Promise<string> {
  tx.feePayer = signer.publicKey;
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.sign(signer);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  return sig;
}

async function main() {
  const maker = loadKeypair(makerKey);
  const config = await fetchSolanaConfig(backendUrl);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const client = await SigintsClient.fromBackend(backendUrl);

  let tick = 0;
  let inFlight = false;

  async function publishOnce() {
    if (inFlight) return;
    inFlight = true;
    try {
      tick += 1;
      const plaintext = `tick=${tick} ts=${new Date().toISOString()}`;
      const meta = await client.prepareSignal({
        streamId,
        tierId,
        plaintext,
        visibility,
      });
      const ix = await client.buildRecordSignalInstruction({
        authority: maker.publicKey,
        streamId,
        metadata: meta,
      });
      const sig = await sendTx(connection, new Transaction().add(ix), maker);
      console.log(`[signal-bot] sent ${plaintext} (${sig.slice(0, 8)}…)`);
    } catch (error: any) {
      console.error(`[signal-bot] failed: ${error?.message ?? error}`);
    } finally {
      inFlight = false;
    }
  }

  await publishOnce();
  const timer = setInterval(publishOnce, intervalMs);

  const shutdown = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await new Promise(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
