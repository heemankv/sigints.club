"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  fetchSignals,
  fetchPublicPayload,
  fetchKeyboxEntry,
  fetchCiphertext,
  buildPublicPayloadMessage,
} from "../../lib/sdkBackend";
import { decryptAesGcm, deriveSharedKey, fromBase64, importX25519PrivateKey, importX25519PublicKey, subscriberIdFromPubkey } from "../../lib/crypto";

const storageKey = (streamId: string) => `stream.keys.${streamId}`;

export default function DecryptPanel({ streamId }: { streamId: string }) {
  const [pubKey, setPubKey] = useState("");
  const [privKey, setPrivKey] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { publicKey, signMessage } = useWallet();

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(streamId));
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setPubKey(data.publicKeyBase64 ?? "");
      setPrivKey(data.privateKeyBase64 ?? "");
    } catch {
      // ignore
    }
  }, [streamId]);

  async function decrypt() {
    setStatus(null);
    setPlaintext(null);
    try {
      const { signals } = await fetchSignals<{
        signalHash: string;
        signalPointer: string;
        keyboxPointer?: string | null;
        visibility?: "public" | "private";
      }>(streamId);
      if (!signals.length) {
        setStatus("No signals available");
        return;
      }
      const latest = signals[signals.length - 1];

      if (latest.visibility === "public") {
        const signalSha = latest.signalPointer.split("/").pop();
        if (!publicKey) {
          setStatus("Connect wallet to access public stream signals");
          return;
        }
        if (!signMessage) {
          setStatus("Wallet does not support message signing");
          return;
        }
        const message = buildPublicPayloadMessage(signalSha!);
        const signature = await signMessage(message);
        const signatureBase64 = Buffer.from(signature).toString("base64");
        const signalRes = await fetchPublicPayload<{ plaintext: string }>(signalSha!, {
          wallet: publicKey.toBase58(),
          signatureBase64,
        });
        setPlaintext(atob(signalRes.payload.plaintext));
        return;
      }

      if (!pubKey || !privKey) {
        setStatus("Keys required for private stream signals");
        return;
      }
      if (!publicKey) {
        setStatus("Connect wallet to decrypt private stream signals");
        return;
      }
      if (!signMessage) {
        setStatus("Wallet does not support message signing");
        return;
      }

      const keyboxSha = latest.keyboxPointer?.split("/").pop();
      const signalSha = latest.signalPointer.split("/").pop();
      if (!keyboxSha) {
        setStatus("Missing keybox pointer for private stream signal");
        return;
      }

      const message = new TextEncoder().encode(`sigints:keybox:${keyboxSha}`);
      const signature = await signMessage(message);
      const signatureBase64 = Buffer.from(signature).toString("base64");
      const subId = await subscriberIdFromPubkey(pubKey);
      const keyboxRes = await fetchKeyboxEntry<{ subscriberId: string; epk: string; encKey: string; iv: string; tag: string }>(
        keyboxSha,
        {
          wallet: publicKey.toBase58(),
          signatureBase64,
          encPubKeyDerBase64: pubKey,
          subscriberId: subId,
        }
      );
      const entry = keyboxRes.entry;

      const priv = await importX25519PrivateKey(privKey);
      const epk = await importX25519PublicKey(entry.epk);
      const shared = await deriveSharedKey(priv, epk);
      const encKey = fromBase64(entry.encKey);
      const iv = fromBase64(entry.iv);
      const tag = fromBase64(entry.tag);
      const symKeyRaw = await decryptAesGcm(shared, iv, encKey, tag);

      const signalRes = await fetchCiphertext<{ iv: string; tag: string; ciphertext: string }>(signalSha!);
      const payload = signalRes.payload;

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
      <button className="button primary" onClick={decrypt}>
        Decrypt
      </button>
      {status && <p className="subtext">{status}</p>}
      {plaintext && <p className="subtext">Decrypted: {plaintext}</p>}
    </div>
  );
}
