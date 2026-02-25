"use client";

import { toast } from "../lib/toast";

export default function SignalTxToast({ tx }: { tx: string }) {
  return (
    <button
      type="button"
      className="signal-tx-toast"
      onClick={() => toast(`On-chain tx ${tx.slice(0, 8)}…`, "success")}
    >
      On-chain tx {tx.slice(0, 8)}…
    </button>
  );
}
