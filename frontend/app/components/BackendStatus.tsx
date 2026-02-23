"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/sdkBackend";

export default function BackendStatus() {
  const [status, setStatus] = useState<"unknown" | "online" | "offline">("unknown");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetchHealth();
        if (!cancelled) {
          setStatus(res.ok ? "online" : "offline");
        }
      } catch {
        if (!cancelled) {
          setStatus("offline");
        }
      }
    }
    check();
    const interval = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (status === "online") {
    return null;
  }

  return (
    <div className="banner warning">
      Backend offline. Some views are running on cached demo data.
    </div>
  );
}
