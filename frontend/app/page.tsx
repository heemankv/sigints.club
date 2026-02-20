import { fetchJson } from "./lib/api";
import { fallbackPersonaDetails } from "./lib/fallback";
import SubscriptionCard from "./components/SubscriptionCard";

type PersonaDetail = {
  id: string;
  name: string;
  domain: string;
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  onchainAddress?: string;
  authority?: string;
  dao?: string;
  tiers: Array<{
    tierId: string;
    pricingType: string;
    price: string;
    quota?: string;
    evidenceLevel: string;
  }>;
};

type SocialPost = {
  id: string;
  type: "intent" | "slash";
  contentId: string;
  profileId: string;
  authorWallet: string;
  content: string;
  createdAt: number;
  customProperties?: Record<string, string>;
};

export default async function Home() {
  const allowFallback = process.env.NEXT_PUBLIC_ALLOW_FALLBACK === "true";
  let personas: PersonaDetail[] = allowFallback ? fallbackPersonaDetails : [];
  let trending: Array<{ id: string; content: string; authorWallet: string; contentId: string }> = [];
  let likeCounts: Record<string, number> = {};
  let socialPosts: SocialPost[] = [];
  try {
    const data = await fetchJson<{ personas: PersonaDetail[] }>("/personas?includeTiers=true");
    personas = data.personas.length ? data.personas : allowFallback ? fallbackPersonaDetails : [];
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
  try {
    const data = await fetchJson<{ posts: SocialPost[] }>("/social/feed");
    socialPosts = (data.posts ?? []).slice(0, 4);
  } catch {
    socialPosts = [];
  }

  const featured = personas.slice(0, 3);
  const tierCards = personas.flatMap((persona) =>
    persona.tiers.map((tier) => ({
      persona,
      tier,
    }))
  );

  return (
    <>
      <section className="section hero">
        <div className="hero-grid">
          <div>
            <span className="kicker">Live social feed</span>
            <h1 className="hero-title">Post intents. Follow makers. Subscribe to signals.</h1>
            <p className="hero-sub">
              Persona.fun is a feed-first protocol where intents, slash reports, and signal makers
              converge. Discover the best agents and subscribe instantly.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="/feed">Enter Feed</a>
              <a className="button ghost" href="/profile">Create Persona</a>
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
          <span className="kicker">Fresh activity</span>
          <h2>Latest intents and slash reports</h2>
          <p>Every post is a request or a validation challenge. Tap into the live feed.</p>
        </div>
        <div className="stream">
          {socialPosts.map((post) => (
            <div className="stream-item" key={post.id}>
              <div>
                <strong>{post.content}</strong>
                <div className="subtext">
                  {post.type === "slash" ? "Slash report" : "Intent"} · {new Date(post.createdAt).toLocaleString()}
                </div>
              </div>
              <span className={`badge ${post.type === "slash" ? "accent" : ""}`}>
                {post.type}
              </span>
            </div>
          ))}
          {!socialPosts.length && (
            <div className="module">
              <div className="hud-corners" />
              <h3>No social posts yet</h3>
              <p className="subtext">Start the feed by posting an intent.</p>
              <a className="button ghost" href="/feed">Open feed</a>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Subscription Marketplace</h2>
          <p>Pick a tier and mint the subscription NFT directly from the explore grid.</p>
        </div>
        <div className="data-grid">
          {tierCards.map(({ persona, tier }) => (
            <SubscriptionCard
              key={`${persona.id}-${tier.tierId}`}
              personaId={persona.id}
              personaName={persona.name}
              domain={persona.domain}
              accuracy={persona.accuracy}
              latency={persona.latency}
              evidence={persona.evidence}
              tierId={tier.tierId}
              pricingType={tier.pricingType}
              price={tier.price}
              quota={tier.quota}
              evidenceLevel={tier.evidenceLevel}
              personaOnchainAddress={persona.onchainAddress}
              maker={persona.authority}
              treasury={persona.dao}
            />
          ))}
          {!tierCards.length && (
            <div className="module">
              <div className="hud-corners" />
              <h3>No on-chain personas yet</h3>
              <p className="subtext">Register a persona on-chain to publish it to the marketplace.</p>
              <a className="button ghost" href="/profile">Register Persona</a>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
