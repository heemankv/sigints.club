import { InMemorySignalStore } from "../signals";
import { SignalService } from "../services/SignalService";
import { ListenerService } from "../services/ListenerService";
import { generateX25519Keypair } from "../crypto/hybrid";

async function main() {
  const signalStore = new InMemorySignalStore();
  const signalService = new SignalService(signalStore);
  const listenerService = new ListenerService(signalStore);

  const s1 = generateX25519Keypair();
  const s2 = generateX25519Keypair();

  await signalService.publishSignal(
    "stream-eth",
    "tier-trust",
    Buffer.from("ETH best price at Venue X", "utf8"),
    [
      { encPubKeyDerBase64: s1.publicKey.toString("base64") },
      { encPubKeyDerBase64: s2.publicKey.toString("base64") },
    ]
  );

  const signals = await signalStore.listSignals("stream-eth");
  const latest = signals[signals.length - 1];

  const decrypted1 = await listenerService.decryptLatestSignal(latest, {
    privateKeyDerBase64: s1.privateKey.toString("base64"),
    publicKeyDerBase64: s1.publicKey.toString("base64"),
  });

  const decrypted2 = await listenerService.decryptLatestSignal(latest, {
    privateKeyDerBase64: s2.privateKey.toString("base64"),
    publicKeyDerBase64: s2.publicKey.toString("base64"),
  });

  console.log("Listener1:", decrypted1.toString("utf8"));
  console.log("Listener2:", decrypted2.toString("utf8"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
