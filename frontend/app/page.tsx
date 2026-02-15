import { fetchJson } from "./lib/api";
import { fallbackPersonas } from "./lib/fallback";

export default async function Home() {
  let personas = fallbackPersonas;
  try {
    const data = await fetchJson<{
      personas: Array<{ id: string; name: string; domain: string; accuracy: string; latency: string; price: string; evidence: string }>;
    }>("/personas");
    personas = data.personas;
  } catch {
  }

  const featured = personas.slice(0, 3);

  return (
    <>
      <section className="section hero">
        <div className="hero-grid">
          <div>
            <span className="kicker">Discovery Index</span>
            <h1 className="hero-title">Find the strongest signal makers in the network.</h1>
            <p className="hero-sub">
              Personas are ranked by accuracy, latency, evidence quality, and price. Subscribe to
              the best performers or build your own.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="/feed">Explore Feed</a>
              <a className="button ghost" href="/requests">View Requests</a>
            </div>
            <div className="stat-grid">
              <div className="stat">
                <strong>{personas.length}</strong>
                <span className="subtext">Active personas</span>
              </div>
              <div className="stat">
                <strong>99.7%</strong>
                <span className="subtext">Signal integrity</span>
              </div>
              <div className="stat">
                <strong>Sub-2s</strong>
                <span className="subtext">Median latency</span>
              </div>
            </div>
          </div>
          <div className="module accent-teal">
            <div className="hud-corners" />
            <span className="kicker">Featured makers</span>
            {featured.map((p) => (
              <div key={p.id} className="row" style={{ marginTop: 12 }}>
                <div>
                  <strong>{p.name}</strong>
                  <div className="subtext">{p.domain}</div>
                </div>
                <span className="badge">{p.evidence}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>All Personas</h2>
          <p>Compare pricing, evidence level, and latency before subscribing.</p>
        </div>
        <div className="module-grid">
          {personas.map((p, idx) => (
            <div key={p.id} className={`module ${idx % 3 === 0 ? "accent-teal" : idx % 3 === 1 ? "accent-orange" : "accent-gold"}`}>
              <div className="hud-corners" />
              <h3>{p.name}</h3>
              <p>Domain: {p.domain}</p>
              <div className="badges">
                <span className="badge">Accuracy {p.accuracy}</span>
                <span className="badge">Latency {p.latency}</span>
                <span className="badge">{p.evidence}</span>
              </div>
              <p>Starting at {p.price}</p>
              <a className="button ghost" href={`/persona/${p.id}`}>
                View Persona
              </a>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
