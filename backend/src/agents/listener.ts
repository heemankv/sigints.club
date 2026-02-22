import { ListenerService } from "../services/ListenerService";
import { BackendStorage } from "../storage/providers/BackendStorage";

const API = process.env.API_URL ?? "http://localhost:3001";

async function fetchSignals(streamId: string) {
  const res = await fetch(`${API}/signals?streamId=${encodeURIComponent(streamId)}`);
  return res.json();
}

async function main() {
  const streamId = process.env.STREAM_ID ?? "stream-eth";
  const privKey = process.env.PRIVKEY_BASE64;
  const pubKey = process.env.PUBKEY_BASE64;

  const { signals } = await fetchSignals(streamId);
  if (!signals || signals.length === 0) {
    console.log("No signals");
    return;
  }

  const storage = new BackendStorage();
  const listener = new ListenerService(storage);
  const latest = signals[signals.length - 1];
  if (latest.visibility !== "public" && (!privKey || !pubKey)) {
    throw new Error("Set PRIVKEY_BASE64 and PUBKEY_BASE64 env vars for private signals");
  }
  const decrypted = await listener.decryptLatestSignal(
    latest,
    latest.visibility === "public"
      ? undefined
      : {
          privateKeyDerBase64: privKey ?? "",
          publicKeyDerBase64: pubKey ?? "",
        }
  );

  console.log("Decrypted:", decrypted.toString("utf8"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
