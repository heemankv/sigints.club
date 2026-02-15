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

  return (
    <section className="section">
      <div className="section-head">
        <h1>Discovery Index</h1>
        <p>Ranked by accuracy, latency, evidence quality, and price.</p>
      </div>
      <div className="cards">
        {personas.map((p) => (
          <div key={p.id} className="card">
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
  );
}
