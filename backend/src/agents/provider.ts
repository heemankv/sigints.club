import { generateX25519Keypair } from "../crypto/hybrid";

const API = process.env.API_URL ?? "http://localhost:3001";

async function registerSubscriber(personaId: string, encPubKeyDerBase64: string) {
  const res = await fetch(`${API}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ personaId, encPubKeyDerBase64 }),
  });
  return res.json();
}

async function publishSignal(personaId: string, tierId: string, plaintext: string) {
  const res = await fetch(`${API}/signals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      personaId,
      tierId,
      plaintextBase64: Buffer.from(plaintext, "utf8").toString("base64"),
    }),
  });
  return res.json();
}

async function main() {
  const personaId = process.env.PERSONA_ID ?? "persona-eth";
  const tierId = process.env.TIER_ID ?? "tier-trust";

  // Simulate 2 subscribers for demo
  const s1 = generateX25519Keypair();
  const s2 = generateX25519Keypair();
  await registerSubscriber(personaId, s1.publicKey.toString("base64"));
  await registerSubscriber(personaId, s2.publicKey.toString("base64"));

  const result = await publishSignal(personaId, tierId, "ETH best price at Venue X");
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
