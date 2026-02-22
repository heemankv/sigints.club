import { fetchJson } from "./lib/api";
import { fallbackPersonaDetails } from "./lib/fallback";
import SubscriptionCard from "./components/SubscriptionCard";
import LiveFeedPreview from "./components/LiveFeedPreview";

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
  let personas: PersonaDetail[] = [];
  let socialPosts: SocialPost[] = [];

  try {
    const data = await fetchJson<{ personas: PersonaDetail[] }>("/personas?includeTiers=true");
    personas = data.personas.length ? data.personas : [];
  } catch {}

  try {
    const data = await fetchJson<{ posts: SocialPost[] }>("/social/feed");
    socialPosts = (data.posts ?? []).slice(0, 4);
  } catch {}

  // Always show demo personas when backend has none
  const featured = (personas.length > 0 ? personas : fallbackPersonaDetails).slice(0, 3);
  const displayCount = personas.length > 0 ? personas.length : fallbackPersonaDetails.length;

  const tierCards = personas.flatMap((persona) =>
    persona.tiers.map((tier) => ({ persona, tier }))
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
                <strong>{displayCount}</strong>
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
                <div key={p.id} className="maker-row">
                  <div className="maker-row-info">
                    <strong>{p.name}</strong>
                    <span className="subtext">{p.domain}</span>
                    <div className="maker-mini-stats">
                      <span>{p.accuracy} accuracy</span>
                      <span>{p.latency} latency</span>
                    </div>
                  </div>
                  <div className="maker-row-right">
                    <span className="badge">{p.evidence}</span>
                    <span className="maker-price">{p.price}</span>
                  </div>
                </div>
              ))}
            </div>

            <LiveFeedPreview />
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
                  {post.type === "slash" ? "Slash report" : "Intent"} ·{" "}
                  {new Date(post.createdAt).toLocaleString()}
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
