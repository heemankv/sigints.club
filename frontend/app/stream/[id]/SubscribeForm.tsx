"use client";

import { useState } from "react";
import { postJson } from "../../lib/api";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  buildSubscribeInstruction,
  defaultExpiryMs,
  resolveEvidenceLevel,
  resolveStreamPubkey,
  resolvePricingType,
  resolveProgramId,
} from "../../lib/solana";
import { parseSolLamports } from "../../lib/pricing";
import { explorerTx } from "../../lib/constants";
import { parseQuota } from "../../lib/utils";

export default function SubscribeForm({
  streamId,
  tierId,
  pricingType,
  evidenceLevel,
  price,
  quota,
  streamOnchainAddress,
  streamAuthority,
  streamDao,
}: {
  streamId: string;
  tierId: string;
  pricingType: string;
  evidenceLevel: string;
  price: string;
  quota?: string;
  streamOnchainAddress?: string;
  streamAuthority?: string;
  streamDao?: string;
}) {
  const [pubKey, setPubKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [chainTx, setChainTx] = useState<string | null>(null);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  async function submit() {
    setLoading(true);
    setStatus(null);
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      const data = await postJson<{ subscriberId: string }>("/subscribe", {
        streamId,
        ...(pubKey ? { encPubKeyDerBase64: pubKey } : {}),
        subscriberWallet: publicKey.toBase58(),
      });
      setStatus(`Subscribed. Subscriber ID: ${data.subscriberId}`);
    } catch (err: any) {
      setStatus(err.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitOnchain() {
    setLoading(true);
    setChainStatus(null);
    setChainTx(null);
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (!streamOnchainAddress || !streamAuthority || !streamDao) {
        throw new Error("On-chain stream or payout accounts not configured.");
      }
      const programId = resolveProgramId();
      const streamPubkey = resolveStreamPubkey(streamOnchainAddress);
      const ix = await buildSubscribeInstruction({
        programId,
        stream: streamPubkey,
        subscriber: publicKey,
        tierId,
        pricingType: resolvePricingType(pricingType),
        evidenceLevel: resolveEvidenceLevel(evidenceLevel),
        expiresAtMs: defaultExpiryMs(),
        quotaRemaining: parseQuota(quota) ?? 0,
        priceLamports: parseSolLamports(price),
        maker: new PublicKey(streamAuthority),
        treasury: new PublicKey(streamDao),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      setChainTx(signature);
      setChainStatus("On-chain subscription submitted.");
    } catch (err: any) {
      setChainStatus(err.message ?? "On-chain subscribe failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="hud-corners" />
      <h3>Subscribe to {tierId}</h3>
      <p>Paste your encryption public key (base64) or leave blank to use your wallet key.</p>
      <input
        value={pubKey}
        onChange={(e) => setPubKey(e.target.value)}
        placeholder="Base64 X25519 public key"
        className="input"
      />
      <button className="button primary" onClick={submit} disabled={loading}>
        {loading ? "Subscribing…" : "Subscribe"}
      </button>
      {status && <p className="subtext">{status}</p>}
      <div className="divider" />
      <p className="subtext">
        On-chain subscription mints a 1-of-1 NFT to your wallet.
      </p>
      <button
        className="button ghost"
        onClick={submitOnchain}
        disabled={loading || !streamOnchainAddress || !streamAuthority || !streamDao}
      >
        {loading ? "Submitting…" : "Subscribe on-chain"}
      </button>
      {(!streamOnchainAddress || !streamAuthority || !streamDao) && (
        <p className="subtext">On-chain stream or payout accounts not configured.</p>
      )}
      {chainStatus && <p className="subtext">{chainStatus}</p>}
      {chainTx && (
        <p className="subtext">
          Explorer{" "}
          <a className="link" href={explorerTx(chainTx)} target="_blank">
            {chainTx.slice(0, 10)}…
          </a>
        </p>
      )}
    </div>
  );
}
