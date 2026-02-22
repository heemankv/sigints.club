"use client";

import { useCallback, useEffect, useState } from "react";
import { setToastHandler, type ToastVariant } from "../lib/toast";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;
};

let nextId = 0;
const DISPLAY_MS = 4700;
const LEAVE_MS = 300;

export default function AppToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const startLeave = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, variant, leaving: false }]);
      setTimeout(() => startLeave(id), DISPLAY_MS);
    },
    [startLeave],
  );

  useEffect(() => {
    setToastHandler(addToast);
  }, [addToast]);

  return (
    <>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`net-toast${t.variant === "error" ? " danger" : ""}${t.leaving ? " net-toast--leaving" : ""}`}
        >
          <div className="net-toast-icon">
            {t.variant === "error" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="net-toast-body">
            <div className="net-toast-title">{t.variant === "error" ? "Error" : "Warning"}</div>
            <div className="net-toast-msg">{t.message}</div>
          </div>
          <button className="net-toast-close" onClick={() => startLeave(t.id)} aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </>
  );
}
