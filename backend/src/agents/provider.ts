import { Keypair } from "@solana/web3.js";
import { generateX25519Keypair } from "../crypto/hybrid";

const API = process.env.API_URL ?? "http://localhost:3001";

async function registerSubscriber(
  streamId: string,
  encPubKeyDerBase64: string,
  subscriberWallet: string
) {
  const res = await fetch(`${API}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streamId, encPubKeyDerBase64, subscriberWallet }),
  });
  return res.json();
}

async function publishSignal(streamId: string, tierId: string, plaintext: string) {
  const res = await fetch(`${API}/signals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      streamId,
      tierId,
      plaintextBase64: Buffer.from(plaintext, "utf8").toString("base64"),
    }),
  });
  return res.json();
}

async function main() {
  const streamId = process.env.STREAM_ID ?? "stream-eth";
  const tierId = process.env.TIER_ID ?? "tier-trust";

  // Simulate 2 subscribers for demo
  const s1 = generateX25519Keypair();
  const s2 = generateX25519Keypair();
  const wallet1 = process.env.SUBSCRIBER_WALLET_1 ?? Keypair.generate().publicKey.toBase58();
  const wallet2 = process.env.SUBSCRIBER_WALLET_2 ?? Keypair.generate().publicKey.toBase58();
  if (!process.env.SUBSCRIBER_WALLET_1 || !process.env.SUBSCRIBER_WALLET_2) {
    console.log("Generated demo subscriber wallets (requires test bypass or on-chain subscriptions).");
    console.log("Subscriber wallet 1:", wallet1);
    console.log("Subscriber wallet 2:", wallet2);
  }
  await registerSubscriber(streamId, s1.publicKey.toString("base64"), wallet1);
  await registerSubscriber(streamId, s2.publicKey.toString("base64"), wallet2);

  const result = await publishSignal(streamId, tierId, "ETH best price at Venue X");
  console.log("Published:", result);
  console.log("Subscriber1 pubkey:", s1.publicKey.toString("base64"));
  console.log("Subscriber1 privkey:", s1.privateKey.toString("base64"));
  console.log("Subscriber2 pubkey:", s2.publicKey.toString("base64"));
  console.log("Subscriber2 privkey:", s2.privateKey.toString("base64"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
