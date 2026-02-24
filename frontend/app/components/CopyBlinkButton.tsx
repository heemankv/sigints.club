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

  async function copy() {
    setLoading(true);
    setStatus("idle");
    try {
      const res = await fetchBlinkLink(streamId);
      const url = res.blinkUrl || res.streamUrl;
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      try {
        const fallback = `${window.location.origin}/stream/${streamId}`;
        await navigator.clipboard.writeText(fallback);
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
