"use client";

import { useEffect, useState } from "react";
import { generateX25519Keypair, subscriberIdFromPubkey } from "../../lib/crypto";

const storageKey = (personaId: string) => `persona.keys.${personaId}`;

export default function KeyManager({ personaId }: { personaId: string }) {
  const [pubKey, setPubKey] = useState("");
  const [privKey, setPrivKey] = useState("");
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(personaId));
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setPubKey(data.publicKeyBase64 ?? "");
      setPrivKey(data.privateKeyBase64 ?? "");
      setSubscriberId(data.subscriberId ?? null);
    } catch {
      // ignore
    }
  }, [personaId]);

  async function generate() {
    setStatus(null);
    const data = await generateX25519Keypair();
    const subId = await subscriberIdFromPubkey(data.publicKeyBase64);
    setPubKey(data.publicKeyBase64);
    setPrivKey(data.privateKeyBase64);
    setSubscriberId(subId);
    localStorage.setItem(storageKey(personaId), JSON.stringify({ ...data, subscriberId: subId }));
    setStatus("Generated new keypair. Store your private key safely.");
  }

  return (
    <div className="card">
      <h3>Key Manager</h3>
      <p>Generate an encryption keypair for this Persona.</p>
      <button className="button primary" onClick={generate}>Generate Keypair</button>
      {status && <p className="subtext">{status}</p>}
      <div className="field">
        <label>Public Key (base64)</label>
        <textarea value={pubKey} onChange={(e) => setPubKey(e.target.value)} />
      </div>
      <div className="field">
        <label>Private Key (base64)</label>
        <textarea value={privKey} onChange={(e) => setPrivKey(e.target.value)} />
      </div>
      {subscriberId && <p className="subtext">Subscriber ID: {subscriberId}</p>}
    </div>
  );
}
