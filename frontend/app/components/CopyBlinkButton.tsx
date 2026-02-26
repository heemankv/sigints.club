"use client";

import { useState } from "react";
import { fetchBlinkLink } from "../lib/sdkBackend";

export default function CopyBlinkButton({
  streamId,
  label = "Copy Blink",
  className,
}: {
  streamId: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [loading, setLoading] = useState(false);

  async function copyText(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.setAttribute("readonly", "true");
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) {
      throw new Error("clipboard copy failed");
    }
  }

  async function copy() {
    setLoading(true);
    setStatus("idle");
    try {
      const res = await fetchBlinkLink(streamId);
      const url = res.directBlinkUrl || res.blinkUrl || res.streamUrl;
      await copyText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      try {
        const fallback = `${window.location.origin}/stream/${streamId}`;
        await copyText(fallback);
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel =
    status === "copied" ? "Copied!" : status === "error" ? "Copy failed" : label;

  return (
    <button
      className={className ?? "button ghost"}
      onClick={copy}
      disabled={loading}
      title="Copy Blink link"
      style={{ whiteSpace: "nowrap" }}
    >
      {loading ? "Copying…" : buttonLabel}
    </button>
  );
}
