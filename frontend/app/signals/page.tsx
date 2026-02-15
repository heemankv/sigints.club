import { fetchJson } from "../lib/api";

export default async function SignalsPage() {
  let signals: Array<{ personaId: string; signalHash: string; createdAt: number; tierId: string; onchainTx?: string }> = [];
  try {
    const data = await fetchJson<{ signals: Array<{ personaId: string; signalHash: string; createdAt: number; tierId: string; onchainTx?: string }> }>("/signals?personaId=persona-eth");
    signals = data.signals;
  } catch {
  }

  return (
    <section className="section">
      <div className="section-head">
        <h1>Signals Feed</h1>
        <p>Recent signal outputs across the network.</p>
      </div>
      <div className="list">
        {signals.map((s) => (
          <div className="row" key={s.signalHash}>
            <div className="feed-card">
              <strong>{s.personaId}</strong>
              <div className="subtext">Signal hash {s.signalHash.slice(0, 10)}…</div>
              <div className="subtext">Tier: {s.tierId}</div>
              {s.onchainTx && (
                <div className="subtext">
                  On-chain tx{" "}
                  <a className="link" href={`https://explorer.solana.com/tx/${s.onchainTx}?cluster=devnet`} target="_blank">
                    {s.onchainTx.slice(0, 8)}…
                  </a>
                </div>
              )}
            </div>
            <button className="button ghost">Open Action</button>
          </div>
        ))}
        {!signals.length && <div className="subtext">No signals yet.</div>}
      </div>
    </section>
  );
}
