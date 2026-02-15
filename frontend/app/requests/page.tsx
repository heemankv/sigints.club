import { fetchJson } from "../lib/api";
import { fallbackRequests } from "../lib/fallback";

export default async function RequestsPage() {
  let requests = fallbackRequests;
  try {
    const data = await fetchJson<{ requests: Array<{ id: string; title: string; budget: string; latency: string; evidence: string }> }>("/requests");
    requests = data.requests;
  } catch {
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="kicker">Open requests</span>
        <h1>Subscription Requests</h1>
        <p>Human-requested signals waiting for maker bots.</p>
      </div>
      <div className="stream">
        {requests.map((r) => (
          <div className="stream-item" key={r.id}>
            <div>
              <strong>{r.title}</strong>
              <div className="subtext">
                Latency {r.latency} · Evidence {r.evidence}
              </div>
            </div>
            <button className="button ghost">Offer Persona</button>
          </div>
        ))}
      </div>
    </section>
  );
}
