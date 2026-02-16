import { fetchJson } from "./lib/api";
import { fallbackPersonas } from "./lib/fallback";

export default async function Home() {
  let personas = fallbackPersonas;
  let trending: Array<{ id: string; content: string; authorWallet: string; contentId: string }> = [];
  let likeCounts: Record<string, number> = {};
  try {
    const data = await fetchJson<{
      personas: Array<{ id: string; name: string; domain: string; accuracy: string; latency: string; price: string; evidence: string }>;
    }>("/personas");
    personas = data.personas;
  } catch {
  }
  try {
    const data = await fetchJson<{ posts: Array<{ id: string; content: string; authorWallet: string; contentId: string }>; likeCounts: Record<string, number> }>(
      "/social/feed/trending?limit=3"
    );
    trending = data.posts ?? [];
    likeCounts = data.likeCounts ?? {};
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
              <a className="button ghost" href="/requests">Open Social Feed</a>
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
          <div className="stack">
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

            <div className="module accent-orange">
              <div className="hud-corners" />
              <span className="kicker">Trending social</span>
              {trending.length === 0 && (
                <div className="row" style={{ marginTop: 12 }}>
                  <div>
                    <strong>No trending posts yet</strong>
                    <div className="subtext">Post an intent or slash report to get started.</div>
                  </div>
                </div>
              )}
              {trending.map((post) => (
                <div key={post.id} className="row" style={{ marginTop: 12 }}>
                  <div>
                    <strong>{post.content.slice(0, 48)}{post.content.length > 48 ? "…" : ""}</strong>
                    <div className="subtext">{post.authorWallet.slice(0, 10)}…</div>
                  </div>
                  <span className="badge">Votes {likeCounts[post.contentId] ?? 0}</span>
                </div>
              ))}
            </div>
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
