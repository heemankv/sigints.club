import { webcrypto } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
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
  createAgent,
  createAgentSubscription,
  fetchStream,
  syncWalletKey,
  loginUser,
} from "../sdk/src/index.ts";
import { generateX25519Keypair } from "../sdk/src/crypto.ts";
import { buildRegisterSubscriptionKeyInstruction, deriveSubscriptionKeyPda } from "../sdk/src/solana/index.ts";

if (!globalThis.crypto) {
  // WebCrypto is required for PDA derivations in the SDK.
  (globalThis as any).crypto = webcrypto as any;
}

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const EXPECTED_SIGNALS = Number(process.env.EXPECTED_SIGNALS ?? "3");
const PUBLISH_INTERVAL_MS = Number(process.env.PUBLISH_INTERVAL_MS ?? "4000");

type TierInput = {
  tierId: string;
  pricingType: "subscription_unlimited";
  price: string;
  quota?: string;
  evidenceLevel: "trust" | "verifier";
};

const X25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);

function x25519DerToRawBase64(base64Der: string): string {
  const bytes = Buffer.from(base64Der, "base64");
  if (bytes.length === 32) return bytes.toString("base64");
  if (bytes.length === 44 && bytes.subarray(0, X25519_SPKI_PREFIX.length).equals(X25519_SPKI_PREFIX)) {
    return bytes.subarray(X25519_SPKI_PREFIX.length).toString("base64");
  }
  throw new Error("Encryption public key must be 32 bytes (base64)");
}

async function readKeypair(name: string): Promise<Keypair> {
  const fs = await import("node:fs/promises");
  const path = new URL(`../accounts/${name}`, import.meta.url);
  const raw = await fs.readFile(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
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

async function waitForAccount(connection: Connection, pubkey: PublicKey, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await connection.getAccountInfo(pubkey, "confirmed");
    if (info) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for account ${pubkey.toBase58()}`);
}

async function setupStream(params: {
  connection: Connection;
  programId: PublicKey;
  streamId: string;
  maker: Keypair;
  tier: TierInput;
  visibility: "public" | "private";
}) {
  const { instruction: createIx, streamPda } = await buildCreateStreamInstruction({
    programId: params.programId,
    authority: params.maker.publicKey,
    streamId: params.streamId,
    tiers: [params.tier],
    dao: params.maker.publicKey.toBase58(),
    visibility: params.visibility,
  });
  await sendTx(params.connection, new Transaction().add(createIx), params.maker);
  await waitForAccount(params.connection, streamPda);

  const upsertIx = await buildUpsertTierInstruction({
    programId: params.programId,
    authority: params.maker.publicKey,
    stream: streamPda,
    tier: params.tier,
    priceLamports: 0,
    quota: 0,
    status: 1,
  });
  await sendTx(params.connection, new Transaction().add(upsertIx), params.maker);

  await createStream(BACKEND_URL, {
    id: params.streamId,
    name: params.visibility === "public" ? "Public Stream" : "Private Stream",
    domain: "automation",
    description: `Test ${params.visibility} stream.`,
    visibility: params.visibility,
    accuracy: "N/A",
    latency: "4s",
    price: "0 SOL/mo",
    evidence: params.tier.evidenceLevel,
    ownerWallet: params.maker.publicKey.toBase58(),
    tiers: [params.tier],
  });

  return streamPda;
}

async function registerSubscriptionKeyIfNeeded(
  connection: Connection,
  programId: PublicKey,
  listener: Keypair,
  stream: PublicKey,
  streamId: string
) {
  const keys = generateX25519Keypair();
  const rawBase64 = x25519DerToRawBase64(keys.publicKeyDerBase64);
  const ix = buildRegisterSubscriptionKeyInstruction({
    programId,
    stream,
    subscriber: listener.publicKey,
    encPubKeyBase64: rawBase64,
  });
  await sendTx(connection, new Transaction().add(ix), listener);
  const subscriptionKeyPda = deriveSubscriptionKeyPda(programId, stream, listener.publicKey);
  await waitForAccount(connection, subscriptionKeyPda);
  await syncWalletKey(BACKEND_URL, { wallet: listener.publicKey.toBase58(), streamId });
  return keys;
}

async function runScenario(visibility: "public" | "private") {
  console.log(`\n=== Running ${visibility.toUpperCase()} stream scenario ===`);
  const config = await fetchSolanaConfig(BACKEND_URL);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const streamRegistryProgramId = new PublicKey(config.streamRegistryProgramId);
  const subscriptionProgramId = new PublicKey(config.subscriptionProgramId);

  const maker = await readKeypair("user01.json");
  const listener = await readKeypair("user02.json");

  await loginUser(BACKEND_URL, maker.publicKey.toBase58());
  await loginUser(BACKEND_URL, listener.publicKey.toBase58());

  const streamId = `stream-${visibility}-${Date.now()}`;
  const tier: TierInput = {
    tierId: `tier-${visibility}`,
    pricingType: "subscription_unlimited",
    price: "0 SOL/mo",
    evidenceLevel: "trust",
  };

  const streamPda = await setupStream({
    connection,
    programId: streamRegistryProgramId,
    streamId,
    maker,
    tier,
    visibility,
  });

  let subscriberKeys: { publicKeyDerBase64: string; privateKeyDerBase64: string } | undefined;
  if (visibility === "private") {
    subscriberKeys = await registerSubscriptionKeyIfNeeded(
      connection,
      subscriptionProgramId,
      listener,
      streamPda,
      streamId
    );
  }

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
  await registerSubscription(BACKEND_URL, {
    streamId,
    subscriberWallet: listener.publicKey.toBase58(),
  });

  const { agent } = await createAgent(BACKEND_URL, {
    ownerWallet: listener.publicKey.toBase58(),
    name: `${visibility} listener`,
    domain: "automation",
    role: "listener",
    evidence: "trust",
  });

  await createAgentSubscription(BACKEND_URL, {
    ownerWallet: listener.publicKey.toBase58(),
    agentId: agent.id,
    streamId,
    tierId: tier.tierId,
    pricingType: tier.pricingType,
    evidenceLevel: tier.evidenceLevel,
    visibility,
  });

  const streamResp = await fetchStream<{ stream: any }>(BACKEND_URL, streamId);
  const streamInfo = streamResp?.stream ?? streamResp;
  if (!streamInfo?.onchainAddress) {
    throw new Error(`Stream ${streamId} missing on-chain address.`);
  }

  const keyboxAuth = {
    walletPubkey: listener.publicKey.toBase58(),
    signMessage: (message: Uint8Array) => nacl.sign.detached(message, listener.secretKey),
  };

  const client = await SigintsClient.fromBackend(BACKEND_URL, { keyboxAuth });

  let received = 0;
  let stopListener: (() => void) | null = null;
  const listenDone = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${EXPECTED_SIGNALS} signals (received ${received})`));
    }, 60_000);

    client.listenForSignals({
      streamPubkey: streamInfo.onchainAddress,
      streamId,
      subscriberKeys,
      onSignal: (signal) => {
        received += 1;
        console.log(`[listener/${visibility}] ${signal.plaintext}`);
        if (received >= EXPECTED_SIGNALS) {
          clearTimeout(timeout);
          resolve();
        }
      },
      onError: (error) => {
        console.error(`[listener/${visibility}] error: ${error.message}`);
      },
    }).then((stop) => {
      stopListener = stop;
    }).catch(reject);
  });

  for (let i = 0; i < EXPECTED_SIGNALS; i += 1) {
    const plaintext = `${visibility} tick=${i + 1} ts=${new Date().toISOString()}`;
    const meta = await client.prepareSignal({
      streamId,
      tierId: tier.tierId,
      plaintext,
      visibility,
    });
    const ix = await client.buildRecordSignalInstruction({
      authority: maker.publicKey,
      streamId,
      metadata: meta,
    });
    await sendTx(connection, new Transaction().add(ix), maker);
    console.log(`[publisher/${visibility}] sent ${plaintext}`);
    await new Promise((resolve) => setTimeout(resolve, PUBLISH_INTERVAL_MS));
  }

  await listenDone;
  if (stopListener) stopListener();
  console.log(`✅ ${visibility} scenario complete.`);
}

async function main() {
  await runScenario("public");
  await runScenario("private");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
