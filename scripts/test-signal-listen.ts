import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  SigintsClient,
  buildCreateStreamInstruction,
  buildUpsertTierInstruction,
  buildSubscribeInstruction,
  defaultExpiryMs,
  resolveEvidenceLevel,
  resolvePricingType,
  fetchSolanaConfig,
  createStream,
  registerSubscription,
} from "../sdk/src/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

if (!globalThis.crypto) {
  // WebCrypto is required for PDA derivations in the SDK.
  (globalThis as any).crypto = webcrypto as any;
}

const logPath = process.env.LOG_PATH ?? path.join(ROOT, ".logs", "test-signal-listen.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const logStream = fs.createWriteStream(logPath, { flags: "a" });

function logLine(message: string) {
  const line = message.endsWith("\n") ? message : `${message}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

function logError(message: string) {
  const line = message.endsWith("\n") ? message : `${message}\n`;
  process.stderr.write(line);
  logStream.write(line);
}

process.on("exit", () => {
  logStream.end();
});

type TierInput = {
  tierId: string;
  pricingType: "subscription_unlimited";
  price: string;
  quota?: string;
  evidenceLevel: "trust" | "verifier";
};

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAccount(
  connection: Connection,
  pubkey: PublicKey,
  timeoutMs = 20_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await connection.getAccountInfo(pubkey, "confirmed");
    if (info) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for account ${pubkey.toBase58()}`);
}

async function runPublisher() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";
  const streamId = process.env.STREAM_ID ?? "";
  const tierId = process.env.TIER_ID ?? "tier-basic";
  const makerKey = process.env.MAKER_KEY ?? "user01.json";
  const intervalMs = Number(process.env.INTERVAL_MS ?? "10000");

  if (!streamId) {
    throw new Error("STREAM_ID is required for publisher mode");
  }

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
        visibility: "public",
      });
      const ix = await client.buildRecordSignalInstruction({
        authority: maker.publicKey,
        streamId,
        metadata: meta,
      });
      const tx = new Transaction().add(ix);
      const sig = await sendTx(connection, tx, maker);
      logLine(`[publisher] sent ${plaintext} (${sig.slice(0, 8)}…)`);
    } catch (error: any) {
      logError(`[publisher] failed: ${error?.message ?? error}`);
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

async function runScenario() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";
  const config = await fetchSolanaConfig(backendUrl);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const streamRegistryProgramId = new PublicKey(config.streamRegistryProgramId);
  const subscriptionProgramId = new PublicKey(config.subscriptionProgramId);

  const maker = loadKeypair("user01.json");
  const listener = loadKeypair("user02.json");

  const streamId = `stream-seconds-${Date.now()}`;
  const tier: TierInput = {
    tierId: "tier-basic",
    pricingType: "subscription_unlimited",
    price: "0 SOL/mo",
    evidenceLevel: "trust",
  };
  const tiers = [tier];

  // 1) Create stream on-chain.
  const { instruction: createIx, streamPda } = await buildCreateStreamInstruction({
    programId: streamRegistryProgramId,
    authority: maker.publicKey,
    streamId,
    tiers,
    dao: maker.publicKey.toBase58(),
    visibility: "public",
  });
  await sendTx(connection, new Transaction().add(createIx), maker);
  await waitForAccount(connection, streamPda);

  // 2) Upsert tier on-chain.
  const upsertIx = await buildUpsertTierInstruction({
    programId: streamRegistryProgramId,
    authority: maker.publicKey,
    stream: streamPda,
    tier,
    priceLamports: 0,
    quota: 0,
    status: 1,
  });
  await sendTx(connection, new Transaction().add(upsertIx), maker);

  // 3) Register stream in backend (discovery + metadata).
  await createStream(backendUrl, {
    id: streamId,
    name: "Seconds Counter",
    domain: "utility",
    description: "Emits a signal every 10 seconds.",
    visibility: "public",
    accuracy: "N/A",
    latency: "10s",
    price: "0 SOL/mo",
    evidence: "trust",
    ownerWallet: maker.publicKey.toBase58(),
    tiers,
  });

  // 4) Subscribe on-chain + register in backend.
  const subscribeIx = await buildSubscribeInstruction({
    programId: subscriptionProgramId,
    streamRegistryProgramId,
    stream: streamPda,
    subscriber: listener.publicKey,
    tierId: tier.tierId,
    pricingType: resolvePricingType(tier.pricingType),
    evidenceLevel: resolveEvidenceLevel(tier.evidenceLevel),
    expiresAtMs: defaultExpiryMs(),
    quotaRemaining: 0,
    priceLamports: 0,
    maker: maker.publicKey,
    treasury: maker.publicKey,
  });
  await sendTx(connection, new Transaction().add(subscribeIx), listener);
  await registerSubscription(backendUrl, {
    streamId,
    subscriberWallet: listener.publicKey.toBase58(),
  });

  // 5) Start listener first (on-chain).
  const client = await SigintsClient.fromBackend(backendUrl);
  const expected = Number(process.env.EXPECTED_SIGNALS ?? "3");
  let received = 0;
  let stopListening: (() => void) | null = null;
  let stopRequested = false;

  const listenDone = new Promise<void>((resolve, reject) => {
    const timeoutMs = Number(process.env.LISTEN_TIMEOUT_MS ?? "60000");
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${expected} signals (received ${received})`));
    }, timeoutMs);

    client
      .listenForSignals({
        streamId,
        streamPubkey: streamPda.toBase58(),
        onSignal: (signal) => {
          received += 1;
          logLine(`[listener] ${received}/${expected} ${signal.plaintext}`);
          if (received >= expected) {
            clearTimeout(timeout);
            if (stopListening) stopListening();
            else stopRequested = true;
            resolve();
          }
        },
        onError: (err) => {
          clearTimeout(timeout);
          if (stopListening) {
            stopListening();
          }
          reject(err);
        },
      })
      .then((stop) => {
        stopListening = stop;
        if (stopRequested) stopListening();
      })
      .catch(reject);
  });

  // 6) Start publisher as a side process.
  const tsxBin = path.join(ROOT, "sdk", "node_modules", ".bin", "tsx");
  const publisher = spawn(
    tsxBin,
    [path.join(ROOT, "scripts", "test-signal-listen.ts"), "publisher"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        BACKEND_URL: backendUrl,
        STREAM_ID: streamId,
        TIER_ID: tier.tierId,
        MAKER_KEY: "user01.json",
        INTERVAL_MS: "10000",
      },
    }
  );

  try {
    await listenDone;
    logLine("[assert] listener received signals successfully");
  } finally {
    publisher.kill("SIGTERM");
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "publisher") {
    await runPublisher();
    return;
  }
  await runScenario();
}

main().catch((error) => {
  logError(`test failed: ${error?.message ?? error}`);
  process.exit(1);
});
