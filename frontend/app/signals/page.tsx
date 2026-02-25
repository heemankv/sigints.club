import { fetchSignals } from "../lib/sdkBackend";

export default async function SignalsPage() {
  let signals: Array<{
    streamId: string;
    signalHash: string;
    createdAt: number;
    tierId: string;
    visibility?: "public" | "private";
    onchainTx?: string;
  }> = [];
  try {
    const data = await fetchSignals<{
      streamId: string;
      signalHash: string;
      createdAt: number;
      tierId: string;
      visibility?: "public" | "private";
      onchainTx?: string;
    }>("stream-eth");
    signals = data.signals;
  } catch {
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="kicker">Telemetry</span>
        <h1>Signals Feed</h1>
        <p>Recent signal outputs across the network.</p>
      </div>
      <div className="stream">
        {signals.map((s) => (
          <div className="stream-item" key={s.signalHash}>
            <div>
              <strong>{s.streamId}</strong>
              <div className="subtext">Signal hash {s.signalHash.slice(0, 10)}…</div>
              <div className="subtext">Tier: {s.tierId}</div>
              <div className="subtext">Visibility: {s.visibility ?? "private"}</div>
              {s.onchainTx && (
                <div className="subtext">
                  On-chain tx {s.onchainTx.slice(0, 8)}…
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
