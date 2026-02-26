"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  fetchSignals,
  fetchLatestSignal,
  fetchPublicPayload,
  fetchKeyboxEntry,
  fetchCiphertext,
  buildPublicPayloadMessage,
  parseTradeIntent,
  buildTradeActionUrl,
  buildTradeBlinkUrl,
} from "../../lib/sdkBackend";
import { decryptAesGcm, deriveSharedKey, fromBase64, importX25519PrivateKey, importX25519PublicKey, subscriberIdFromPubkey } from "../../lib/crypto";
import { toast } from "../../lib/toast";

const storageKey = (streamId: string) => `stream.keys.${streamId}`;

export default function DecryptPanel({
  streamId,
  visibility,
}: {
  streamId: string;
  visibility?: "public" | "private";
}) {
  const [pubKey, setPubKey] = useState("");
  const [privKey, setPrivKey] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [blinkCopied, setBlinkCopied] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const { publicKey, signMessage } = useWallet();
  const isPublicStream = visibility === "public";

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

  const tradeIntent = useMemo(() => {
    if (!plaintext || !isPublicStream) return null;
    return parseTradeIntent(plaintext);
  }, [plaintext, isPublicStream]);

  const tradeActionUrl = useMemo(() => {
    if (!tradeIntent) return null;
    const apiBase =
      (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").trim() ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!apiBase) return null;
    return buildTradeActionUrl(tradeIntent, apiBase);
  }, [tradeIntent]);

  const tradeBlinkUrl = useMemo(() => {
    if (!tradeActionUrl) return null;
    const appBase = typeof window !== "undefined" ? window.location.origin : "";
    if (!appBase) return null;
    return buildTradeBlinkUrl(tradeActionUrl, appBase);
  }, [tradeActionUrl]);

  function copyBlink() {
    if (!tradeBlinkUrl) return;
    navigator.clipboard.writeText(tradeBlinkUrl).then(
      () => {
        setBlinkCopied(true);
        setTimeout(() => setBlinkCopied(false), 1500);
      },
      () => {
        toast("Copy failed", "warn");
      }
    );
  }

  async function loadLatestPublicSignal() {
    if (!publicKey) {
      toast("Connect wallet to access public stream signals", "warn");
      return;
    }
    if (!signMessage) {
      toast("Wallet does not support message signing", "warn");
      return;
    }
    setLoadingPublic(true);
    setPlaintext(null);
    try {
      const latest = await fetchLatestSignal<{
        signalPointer: string;
        visibility?: "public" | "private";
      }>(streamId);
      const meta = latest.signal;
      if (!meta?.signalPointer) {
        toast("No signals available", "warn");
        return;
      }
      if ((meta.visibility ?? "public") !== "public") {
        toast("Latest signal is not public", "warn");
        return;
      }
      const signalSha = meta.signalPointer.split("/").pop();
      if (!signalSha) {
        toast("Invalid signal pointer", "warn");
        return;
      }
      const message = buildPublicPayloadMessage(signalSha);
      const signature = await signMessage(message);
      const signatureBase64 = Buffer.from(signature).toString("base64");
      const signalRes = await fetchPublicPayload<{ plaintext: string }>(signalSha, {
        wallet: publicKey.toBase58(),
        signatureBase64,
      });
      setPlaintext(atob(signalRes.payload.plaintext));
    } catch (err: any) {
      toast(err.message ?? "Failed to load public signal", "error");
    } finally {
      setLoadingPublic(false);
    }
  }

  async function decrypt() {
    setPlaintext(null);
    try {
      const { signals } = await fetchSignals<{
        signalHash: string;
        signalPointer: string;
        keyboxPointer?: string | null;
        visibility?: "public" | "private";
      }>(streamId);
      if (!signals.length) {
        toast("No signals available", "warn");
        return;
      }
      const latest = signals[signals.length - 1];

      if (latest.visibility === "public") {
        await loadLatestPublicSignal();
        return;
      }

      if (!pubKey || !privKey) {
        toast("Keys required for private stream signals", "warn");
        return;
      }
      if (!publicKey) {
        toast("Connect wallet to decrypt private stream signals", "warn");
        return;
      }
      if (!signMessage) {
        toast("Wallet does not support message signing", "warn");
        return;
      }

      const keyboxSha = latest.keyboxPointer?.split("/").pop();
      const signalSha = latest.signalPointer.split("/").pop();
      if (!keyboxSha) {
        toast("Missing keybox pointer for private stream signal", "warn");
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
      toast(err.message ?? "Decryption failed", "error");
    }
  }

  useEffect(() => {
    if (!isPublicStream) return;
    if (!publicKey || !signMessage) return;
    void loadLatestPublicSignal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublicStream, streamId, publicKey?.toBase58(), Boolean(signMessage)]);

  return (
    <div className="decrypt-panel">
      <h3 className="stream-access-block-title">
        {isPublicStream ? "Load Latest Signal" : "Decrypt Latest Signal"}
      </h3>
      <p className="subtext">
        {isPublicStream
          ? "Fetch the latest signal (requires an active subscription)."
          : "Paste your keys to decrypt the latest signal (client-side)."}
      </p>
      {!isPublicStream && (
        <>
          <div className="field">
            <label>Public Key (base64)</label>
            <textarea value={pubKey} onChange={(e) => setPubKey(e.target.value)} />
          </div>
          <div className="field">
            <label>Private Key (base64)</label>
            <textarea value={privKey} onChange={(e) => setPrivKey(e.target.value)} />
          </div>
        </>
      )}
      {!isPublicStream && (
        <button className="button primary" onClick={decrypt}>
          Decrypt
        </button>
      )}
      {isPublicStream && loadingPublic && (
        <p className="subtext" style={{ marginTop: 12 }}>
          Loading latest signal…
        </p>
      )}
      {plaintext && <p className="decrypt-result">Decrypted: {plaintext}</p>}
      {tradeIntent && tradeBlinkUrl && (
        <div className="data-card" style={{ marginTop: 16 }}>
          <div className="data-card__body">
            <div className="data-card__title">
              <h3>Trade Intent Detected</h3>
            </div>
            <p className="subtext" style={{ margin: 0 }}>
              Swap {tradeIntent.amountUi} {tradeIntent.inputSymbol} → {tradeIntent.outputSymbol} via Jupiter (OrbitFlare).
            </p>
          </div>
          <div className="data-card__actions">
            <button
              className="button primary"
              onClick={() => window.open(tradeBlinkUrl, "_blank")}
            >
              Open Trade Blink
            </button>
            <button className="button ghost" onClick={copyBlink}>
              {blinkCopied ? "Copied" : "Copy Blink"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
