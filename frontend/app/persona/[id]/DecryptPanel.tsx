"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import { decryptAesGcm, deriveSharedKey, fromBase64, importX25519PrivateKey, importX25519PublicKey, subscriberIdFromPubkey } from "../../lib/crypto";

const storageKey = (personaId: string) => `persona.keys.${personaId}`;

export default function DecryptPanel({ personaId }: { personaId: string }) {
  const [pubKey, setPubKey] = useState("");
  const [privKey, setPrivKey] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(personaId));
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setPubKey(data.publicKeyBase64 ?? "");
      setPrivKey(data.privateKeyBase64 ?? "");
    } catch {
      // ignore
    }
  }, [personaId]);

  async function decrypt() {
    setStatus(null);
    setPlaintext(null);
    try {
      const { signals } = await fetchJson<{ signals: Array<{ signalHash: string; keyboxPointer: string; signalPointer: string }> }>(`/signals?personaId=${personaId}`);
      if (!signals.length) {
        setStatus("No signals available");
        return;
      }
      const latest = signals[signals.length - 1];

      const keyboxSha = latest.keyboxPointer.split("/").pop();
      const signalSha = latest.signalPointer.split("/").pop();

      const keyboxRes = await fetchJson<{ payloadBase64: string }>(`/storage/keybox/${keyboxSha}`);
      const keybox = JSON.parse(atob(keyboxRes.payloadBase64)) as Array<{ subscriberId: string; epk: string; encKey: string; iv: string; tag: string }>;

      const subId = await subscriberIdFromPubkey(pubKey);
      const entry = keybox.find((k) => k.subscriberId === subId);
      if (!entry) {
        setStatus("Subscriber key not found in keybox");
        return;
      }

      const priv = await importX25519PrivateKey(privKey);
      const epk = await importX25519PublicKey(entry.epk);
      const shared = await deriveSharedKey(priv, epk);
      const encKey = fromBase64(entry.encKey);
      const iv = fromBase64(entry.iv);
      const tag = fromBase64(entry.tag);
      const symKeyRaw = await decryptAesGcm(shared, iv, encKey, tag);

      const signalRes = await fetchJson<{ payloadBase64: string }>(`/storage/ciphertext/${signalSha}`);
      const payload = JSON.parse(atob(signalRes.payloadBase64)) as { iv: string; tag: string; ciphertext: string };

      const symKey = await crypto.subtle.importKey(
        "raw",
        symKeyRaw.buffer.slice(symKeyRaw.byteOffset, symKeyRaw.byteOffset + symKeyRaw.byteLength) as ArrayBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      const ivSignal = fromBase64(payload.iv);
      const ctSignal = fromBase64(payload.ciphertext);
      const tagSignal = fromBase64(payload.tag);
      const plain = await decryptAesGcm(symKey, ivSignal, ctSignal, tagSignal);

      setPlaintext(new TextDecoder().decode(plain));
    } catch (err: any) {
      setStatus(err.message ?? "Failed");
    }
  }

  return (
    <div className="card">
      <div className="hud-corners" />
      <h3>Decrypt Latest Signal</h3>
      <p>Paste your keys to decrypt the latest signal (client-side).</p>
      <div className="field">
        <label>Public Key (base64)</label>
        <textarea value={pubKey} onChange={(e) => setPubKey(e.target.value)} />
      </div>
      <div className="field">
        <label>Private Key (base64)</label>
        <textarea value={privKey} onChange={(e) => setPrivKey(e.target.value)} />
      </div>
      <button className="button primary" onClick={decrypt} disabled={!pubKey || !privKey}>
        Decrypt
      </button>
      {status && <p className="subtext">{status}</p>}
      {plaintext && <p className="subtext">Decrypted: {plaintext}</p>}
    </div>
  );
}
