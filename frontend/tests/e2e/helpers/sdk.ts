import { Buffer } from "buffer";
import {
  createBackendClient,
  decryptSignal,
  generateX25519Keypair,
  subscriberIdFromPubkey,
  unwrapKeyForSubscriber,
  type X25519Keypair,
} from "@sigints/sdk";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";
export const backendClient = createBackendClient(backendUrl);

export function createKeypair(): X25519Keypair {
  return generateX25519Keypair();
}

export async function decryptLatestSignal(
  streamId: string,
  walletName: string,
  keys: X25519Keypair
): Promise<string> {
  const latest = await backendClient.fetchLatestSignal<any>(streamId);
  const meta = latest.signal;
  const visibility = meta.visibility ?? "private";
  if (visibility === "public") {
    const pointer = meta.signalPointer as string;
    const sha = pointer.split("/").pop();
    if (!sha) throw new Error("invalid public signal pointer");
    const wallet = await backendClient.getTestWallet(walletName);
    const message = Buffer.from(`sigints:public:${sha}`, "utf8");
    const signature = await backendClient.testWalletSignMessage(
      { messageBase64: message.toString("base64") },
      walletName
    );
    const payload = await backendClient.fetchPublicPayload<{ plaintext: string }>(sha, {
      wallet: wallet.wallet,
      signatureBase64: signature.signatureBase64,
    });
    return Buffer.from(payload.payload.plaintext, "base64").toString("utf8");
  }

  const keyboxPointer = meta.keyboxPointer as string | undefined;
  if (!keyboxPointer) throw new Error("missing keybox pointer");
  const keyboxSha = keyboxPointer.split("/").pop();
  if (!keyboxSha) throw new Error("invalid keybox pointer");

  const wallet = await backendClient.getTestWallet(walletName);
  const message = Buffer.from(`sigints:keybox:${keyboxSha}`, "utf8");
  const signature = await backendClient.testWalletSignMessage(
    { messageBase64: message.toString("base64") },
    walletName
  );
  const wrapped = await backendClient.fetchKeyboxEntry<any>(keyboxSha, {
    wallet: wallet.wallet,
    signatureBase64: signature.signatureBase64,
    encPubKeyDerBase64: keys.publicKeyDerBase64,
    subscriberId: subscriberIdFromPubkey(keys.publicKeyDerBase64),
  });

  const symKey = unwrapKeyForSubscriber(keys.privateKeyDerBase64, wrapped.entry);
  const pointer = meta.signalPointer as string;
  const sha = pointer.split("/").pop();
  if (!sha) throw new Error("invalid ciphertext pointer");
  const payload = await backendClient.fetchCiphertext<any>(sha);
  const plaintext = decryptSignal(payload.payload.ciphertext, symKey, payload.payload.iv, payload.payload.tag);
  return plaintext.toString("utf8");
}

export async function waitForOnchainSubscription(
  streamId: string,
  walletName: string,
  timeoutMs = 60_000
): Promise<void> {
  const wallet = await backendClient.getTestWallet(walletName);
  const stream = await backendClient.fetchStream<any>(streamId);
  const streamPubkey = stream.onchainAddress ?? stream.onchain_address ?? null;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const subs = await backendClient.fetchOnchainSubscriptions<any>(wallet.wallet, { fresh: true });
    const found = (subs.subscriptions ?? []).find((s: any) =>
      streamPubkey ? s.stream === streamPubkey : s.streamId === streamId
    );
    if (found) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Subscription for ${streamId} not found on-chain for ${walletName}`);
}
