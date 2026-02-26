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
  buildBlinkInspectorUrl,
  formatTradeIntent,
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
  const [publicPanelOpen, setPublicPanelOpen] = useState(false);
  const [latestMeta, setLatestMeta] = useState<{
    signalPointer: string;
    visibility?: "public" | "private";
  } | null>(null);
  const [latestMetaState, setLatestMetaState] = useState<"idle" | "loading" | "loaded" | "empty" | "error">("idle");
  const [publicStatus, setPublicStatus] = useState<{
    state: "idle" | "loading" | "loaded" | "error";
    message?: string;
  }>({ state: "idle" });
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

  const tradeInspectorUrl = useMemo(() => {
    if (!tradeActionUrl) return null;
    const inspectorBase = (process.env.NEXT_PUBLIC_BLINK_INSPECTOR_URL ?? "").trim();
    return buildBlinkInspectorUrl(tradeActionUrl, inspectorBase);
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

  useEffect(() => {
    let active = true;
    if (!isPublicStream) return;
    setLatestMetaState("loading");
    fetchLatestSignal<{
      signalPointer: string;
      visibility?: "public" | "private";
    }>(streamId)
      .then((res) => {
        if (!active) return;
        setLatestMeta(res.signal ?? null);
        setLatestMetaState(res.signal ? "loaded" : "empty");
      })
      .catch((err: any) => {
        if (!active) return;
        const msg = typeof err?.message === "string" ? err.message : "";
        if (msg.includes("(404)") || msg.includes("no signals")) {
          setLatestMetaState("empty");
        } else {
          setLatestMetaState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [isPublicStream, streamId]);

  async function loadLatestPublicSignal() {
    if (!publicKey) {
      toast("Connect wallet to access public stream signals", "warn");
      setPublicStatus({ state: "error", message: "Connect wallet to load the latest signal." });
      return;
    }
    if (!signMessage) {
      toast("Wallet does not support message signing", "warn");
      setPublicStatus({ state: "error", message: "Wallet does not support message signing." });
      return;
    }
    setPublicStatus({ state: "loading", message: "Awaiting wallet signature…" });
    setPlaintext(null);
    try {
      let meta = latestMeta;
      if (!meta) {
        setPublicStatus({ state: "loading", message: "Fetching latest signal…" });
        const latest = await fetchLatestSignal<{
          signalPointer: string;
          visibility?: "public" | "private";
        }>(streamId);
        meta = latest.signal;
      }
      if (!meta?.signalPointer) {
        toast("No signals available", "warn");
        setPublicStatus({ state: "error", message: "No signals available yet." });
        return;
      }
      if ((meta.visibility ?? "public") !== "public") {
        toast("Latest signal is not public", "warn");
        setPublicStatus({ state: "error", message: "Latest signal is not public." });
        return;
      }
      const signalSha = meta.signalPointer.split("/").pop();
      if (!signalSha) {
        toast("Invalid signal pointer", "warn");
        setPublicStatus({ state: "error", message: "Invalid signal pointer." });
        return;
      }
      const message = buildPublicPayloadMessage(signalSha);
      setPublicStatus({ state: "loading", message: "Awaiting wallet signature…" });
      const signature = await signMessage(message);
      const signatureBase64 = Buffer.from(signature).toString("base64");
      setPublicStatus({ state: "loading", message: "Decrypting signal…" });
      const signalRes = await fetchPublicPayload<{ plaintext: string }>(signalSha, {
        wallet: publicKey.toBase58(),
        signatureBase64,
      });
      setPlaintext(atob(signalRes.payload.plaintext));
      setPublicStatus({ state: "loaded" });
    } catch (err: any) {
      toast(err.message ?? "Failed to load public signal", "error");
      const msg = typeof err?.message === "string" ? err.message : "Failed to load public signal.";
      const friendly = msg.includes("active subscription required")
        ? "Active subscription required to access this stream."
        : msg;
      setPublicStatus({ state: "error", message: friendly });
    } finally {
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

  return (
    <div className="decrypt-panel">
      <h3 className="stream-access-block-title">
        {isPublicStream ? "Latest Signal" : "Decrypt Latest Signal"}
      </h3>
      <p className="subtext">
        {isPublicStream
          ? "Public signals are gated by your subscription. Expand below to view details."
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
      {isPublicStream && (
        <div className="data-card intent-card" style={{ marginTop: 16 }}>
          <div className="data-card__body">
            <div className="intent-card__header">
              <div>
                <div className="data-card__title">
                  <h3>Trade Intent</h3>
                </div>
                <p className="subtext" style={{ margin: 0 }}>
                  {latestMetaState === "loading" && "Checking latest signal…"}
                  {latestMetaState === "empty" && "No signals yet."}
                  {latestMetaState === "error" && "Unable to check the latest signal."}
                  {latestMetaState === "loaded" && !tradeIntent && "Latest signal available. Expand to check for trade intent."}
                  {tradeIntent && "New trade available. Expand to review details."}
                </p>
              </div>
              <div className="intent-card__actions">
                {tradeBlinkUrl && (
                  <button className="button ghost" onClick={copyBlink}>
                    {blinkCopied ? "Copied" : "Copy Link"}
                  </button>
                )}
                <button
                  className="intent-card__toggle"
                  onClick={() => setPublicPanelOpen((prev) => !prev)}
                  aria-expanded={publicPanelOpen}
                >
                  {publicPanelOpen ? "▴" : "▾"}
                </button>
              </div>
            </div>
            {publicPanelOpen && (
              <div className="intent-card__details">
                {(publicStatus.state === "idle" || publicStatus.state === "error") && (
                  <button className="button ghost" onClick={() => void loadLatestPublicSignal()}>
                    {publicStatus.state === "error" ? "Retry Loading Signal" : "Reveal Latest Signal"}
                  </button>
                )}
                {publicStatus.state === "loading" && (
                  <p className="subtext" style={{ margin: 0 }}>{publicStatus.message ?? "Loading latest signal…"}</p>
                )}
                {publicStatus.state === "error" && (
                  <p className="subtext" style={{ margin: 0 }}>{publicStatus.message ?? "Unable to load latest signal."}</p>
                )}
                {plaintext && (
                  <p className="decrypt-result">Decrypted: {plaintext}</p>
                )}
                {tradeIntent && tradeBlinkUrl && (
                  <>
                    <p className="subtext" style={{ margin: 0 }}>
                      {formatTradeIntent(tradeIntent)}
                    </p>
                    <p className="subtext" style={{ margin: 0 }}>
                      Swap {tradeIntent.amountUi} {tradeIntent.inputSymbol} → {tradeIntent.outputSymbol} via Jupiter (OrbitFlare).
                    </p>
                    <div className="data-card__actions" style={{ marginTop: 6 }}>
                      <button
                        className="button primary"
                        onClick={() => window.open(tradeInspectorUrl ?? tradeBlinkUrl, "_blank")}
                      >
                        {tradeInspectorUrl ? "Open Trade (Inspector)" : "Open Trade Blink"}
                      </button>
                    </div>
                  </>
                )}
                {publicStatus.state === "loaded" && !tradeIntent && (
                  <p className="subtext" style={{ margin: 0 }}>
                    No trade intent detected in the latest signal.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
