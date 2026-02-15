import { ListenerService } from "../services/ListenerService";
import { BackendStorage } from "../storage/providers/BackendStorage";

const API = process.env.API_URL ?? "http://localhost:3001";

async function fetchSignals(personaId: string) {
  const res = await fetch(`${API}/signals?personaId=${encodeURIComponent(personaId)}`);
  return res.json();
}

async function main() {
  const personaId = process.env.PERSONA_ID ?? "persona-eth";
  const privKey = process.env.PRIVKEY_BASE64;
  const pubKey = process.env.PUBKEY_BASE64;
  if (!privKey || !pubKey) {
    throw new Error("Set PRIVKEY_BASE64 and PUBKEY_BASE64 env vars");
  }

  const { signals } = await fetchSignals(personaId);
  if (!signals || signals.length === 0) {
    console.log("No signals");
    return;
  }

  const storage = new BackendStorage();
  const listener = new ListenerService(storage);
  const latest = signals[signals.length - 1];
  const decrypted = await listener.decryptLatestSignal(latest, {
    privateKeyDerBase64: privKey,
    publicKeyDerBase64: pubKey,
  });

  console.log("Decrypted:", decrypted.toString("utf8"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
