"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  fetchLatestSignal,
  fetchPublicPayload,
  buildPublicPayloadMessage,
  parseTradeIntent,
  buildTradeActionUrl,
  buildTradeBlinkUrl,
  buildBlinkInspectorUrl,
  formatTradeIntent,
} from "../../lib/sdkBackend";
import { toast } from "../../lib/toast";

export default function TradeSignalCard({ streamId }: { streamId: string }) {
  const { publicKey, signMessage } = useWallet();
  const [metaState, setMetaState] = useState<"loading" | "empty" | "found" | "no-trade">("loading");
  const [signalMeta, setSignalMeta] = useState<{ signalPointer: string } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [tradeText, setTradeText] = useState<string | null>(null);
  const [tradeIntent, setTradeIntent] = useState<any | null>(null);
  const [tradeLinks, setTradeLinks] = useState<{ blinkUrl: string | null; inspectorUrl?: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cachedTradeRef = useRef<{ plaintext: string; intent: any } | null>(null);

  // Auto-fetch metadata only — no wallet interaction
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let active = true;
    setMetaState("loading");
    fetchLatestSignal<{ signalPointer: string; visibility?: string }>(streamId)
      .then((res) => {
        if (!active) return;
        if (res.signal) {
          setSignalMeta(res.signal);
          setMetaState("found");
        } else {
          setMetaState("empty");
        }
      })
      .catch(() => {
        if (active) setMetaState("empty");
      });
    return () => { active = false; };
  }, [streamId]);

  // Decrypt + parse trade intent (only called on user click)
  async function decryptAndParse(): Promise<{ plaintext: string; intent: any } | null> {
    if (cachedTradeRef.current) return cachedTradeRef.current;
    if (!publicKey || !signMessage || !signalMeta) return null;
    const signalSha = signalMeta.signalPointer.split("/").pop();
    if (!signalSha) return null;
    const message = buildPublicPayloadMessage(signalSha);
    const signature = await signMessage(message);
    const signatureBase64 = Buffer.from(signature).toString("base64");
    const res = await fetchPublicPayload<{ plaintext: string }>(signalSha, {
      wallet: publicKey.toBase58(),
      signatureBase64,
    });
    const text = atob(res.payload.plaintext);
    const intent = parseTradeIntent(text);
    const result = { plaintext: text, intent };
    cachedTradeRef.current = result;
    return result;
  }

  function buildUrls(intent: any) {
    const apiBase =
      (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").trim() ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const actionUrl = apiBase ? buildTradeActionUrl(intent, apiBase) : null;
    if (!actionUrl) return null;
    const appBase = typeof window !== "undefined" ? window.location.origin : "";
    const blinkUrl = appBase ? buildTradeBlinkUrl(actionUrl, appBase) : null;
    const inspectorBase = (process.env.NEXT_PUBLIC_BLINK_INSPECTOR_URL ?? "").trim();
    const inspectorUrl = buildBlinkInspectorUrl(actionUrl, inspectorBase);
    return { blinkUrl, inspectorUrl };
  }

  async function handleExecute() {
    setExecuting(true);
    try {
      const result = await decryptAndParse();
      if (!result?.intent) {
        setMetaState("no-trade");
        return;
      }
      const urls = buildUrls(result.intent);
      if (urls) {
        setTradeText(result.plaintext);
        setTradeIntent(result.intent);
        setTradeLinks(urls);
        window.open(urls.inspectorUrl ?? urls.blinkUrl!, "_blank");
      }
    } catch (err: any) {
      toast(err.message ?? "Failed to load signal", "error");
    } finally {
      setExecuting(false);
    }
  }

  async function handleReveal() {
    setExecuting(true);
    try {
      const result = await decryptAndParse();
      if (!result?.intent) {
        setMetaState("no-trade");
        return;
      }
      const urls = buildUrls(result.intent);
      if (urls) {
        setTradeText(result.plaintext);
        setTradeIntent(result.intent);
        setTradeLinks(urls);
        setShowModal(true);
      }
    } catch (err: any) {
      toast(err.message ?? "Failed to load signal", "error");
    } finally {
      setExecuting(false);
    }
  }

  function copyTrade() {
    if (!tradeLinks?.blinkUrl) return;
    navigator.clipboard.writeText(tradeLinks.blinkUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        toast("Copy failed", "warn");
      }
    );
  }

  if (metaState === "loading") {
    return (
      <div className="stream-detail-section stream-step stream-step--compact">
        <div className="stream-step-header stream-step-header--inline">
          <span className="stream-detail-section-title">Trade Signal:</span>
          <span className="subtext">Checking Latest Signal…</span>
        </div>
      </div>
    );
  }

  if (metaState === "empty" || metaState === "no-trade") {
    return (
      <div className="stream-detail-section stream-step stream-step--compact">
        <div className="stream-step-header stream-step-header--inline">
          <span className="stream-detail-section-title">Trade Signal:</span>
          <span className="subtext">No Trade Signal Available</span>
        </div>
      </div>
    );
  }

  // Signal exists — show action buttons (wallet signature only on click)
  return (
    <>
      <div className="stream-detail-section stream-step stream-step--compact trade-signal-card">
        <div className="trade-signal-card__left">
          <span className="stream-detail-section-title">Trade Signal:</span>
          <span className="subtext">
            {tradeLinks ? "Trade signal available." : "Check for latest signal."}
          </span>
        </div>
        <div className="trade-signal-card__actions">
          {!tradeLinks && (
            <button
              className="button ghost"
              disabled={executing}
              onClick={() => void handleReveal()}
            >
              {executing ? "Loading…" : "Check"}
            </button>
          )}
          {tradeLinks && (
            <button
              className="button primary"
              onClick={() => setShowModal(true)}
            >
              Execute Trade
            </button>
          )}
        </div>
      </div>
      {showModal && tradeLinks && mounted && createPortal(
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card trade-signal-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>
              ×
            </button>
            <h3>Trade Ready</h3>
            <p className="subtext" style={{ marginTop: 10 }}>
              {tradeIntent ? formatTradeIntent(tradeIntent) : tradeText}
            </p>
            {tradeIntent && (
              <p className="subtext">
                Swap {tradeIntent.amountUi} {tradeIntent.inputSymbol} → {tradeIntent.outputSymbol} via Jupiter (OrbitFlare).
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button primary"
                onClick={() => {
                  const target = tradeLinks.inspectorUrl ?? tradeLinks.blinkUrl;
                  if (target) {
                    window.open(target, "_blank");
                  }
                }}
              >
                Execute Trade
              </button>
              <button className="button ghost" onClick={copyTrade}>
                {copied ? "Copied" : "Copy Trade Blink"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
