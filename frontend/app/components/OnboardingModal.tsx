"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "../lib/toast";

type Props = {
  onComplete: (data: { displayName: string; bio?: string }) => Promise<void>;
};

export default function OnboardingModal({ onComplete }: Props) {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = username.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onComplete({ displayName: trimmed, bio: bio.trim() || undefined });
    } catch (err: any) {
      toast(err?.message ?? "Something went wrong. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <span className="kicker">Welcome</span>
        <h2>Set up your profile</h2>
        <p className="subtext">Choose a username to get started.</p>

        <div className="md-field">
          <label className="md-label">Username *</label>
          <input
            className="md-input"
            type="text"
            placeholder="e.g. satoshi"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            autoFocus
          />
        </div>

        <div className="md-field">
          <label className="md-label">Bio</label>
          <textarea
            className="md-textarea"
            placeholder="Tell us about yourself (optional)"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
          />
        </div>

        <div className="modal-actions">
          <button
            className="button primary"
            disabled={!username.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
