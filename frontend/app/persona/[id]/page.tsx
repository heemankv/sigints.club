import SubscribeForm from "./SubscribeForm";
import KeyManager from "./KeyManager";
import PublishSignal from "./PublishSignal";
import DecryptPanel from "./DecryptPanel";
import FollowMaker from "./FollowMaker";
import { fetchJson } from "../../lib/api";
import { getFallbackPersona, PersonaDetail as FallbackPersonaDetail } from "../../lib/fallback";

type PersonaDetail = {
  id: string;
  name: string;
  domain: string;
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  description: string;
  onchainAddress?: string;
  authority?: string;
  dao?: string;
  tapestryProfileId?: string;
  tiers: Array<{
    tierId: string;
    pricingType: string;
    price: string;
    quota?: string;
    evidenceLevel: string;
  }>;
};

export default async function PersonaPage({ params }: { params: { id: string } }) {
  let persona: PersonaDetail | FallbackPersonaDetail | null = null;
  try {
    const data = await fetchJson<{ persona: PersonaDetail }>(`/personas/${params.id}`);
    persona = data.persona;
  } catch {
    persona = getFallbackPersona(params.id);
  }

  if (!persona) {
    return (
      <section>
        <h1 className="section-title">Persona not found</h1>
        <p className="subtext">Try another persona from the discovery page.</p>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="kicker">Persona dossier</span>
        <h1>{persona.name}</h1>
        <p>{persona.description}</p>
        {"tapestryProfileId" in persona && (
          <FollowMaker targetProfileId={persona.tapestryProfileId} />
        )}
      </div>
      <div className="badges">
        <span className="badge">Accuracy {persona.accuracy}</span>
        <span className="badge">Latency {persona.latency}</span>
        <span className="badge">Domain {persona.domain}</span>
      </div>

      <div className="split">
        <div className="module accent-teal">
          <div className="hud-corners" />
          <h3>Maker Operations</h3>
          <p>Publish, encrypt, and broadcast this persona’s signals.</p>
          <PublishSignal personaId={persona.id} tierId={persona.tiers[0]?.tierId ?? "tier"} />
        </div>
        <div className="module accent-orange">
          <div className="hud-corners" />
          <h3>Listener Tools</h3>
          <p>Manage keys and decrypt messages you subscribe to.</p>
          <KeyManager personaId={persona.id} personaOnchainAddress={"onchainAddress" in persona ? persona.onchainAddress : undefined} />
          <DecryptPanel personaId={persona.id} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="kicker">Subscription tiers</span>
          <h2>Maker Tiers</h2>
          <p>Choose a pricing tier and subscribe on or off-chain.</p>
        </div>
        <div className="module-grid">
          {persona.tiers.map((tier) => (
            <div className="module" key={tier.tierId}>
              <div className="hud-corners" />
              <h3>{tier.tierId}</h3>
              <p>Pricing: {tier.pricingType}</p>
              <p>Price: {tier.price}</p>
              {tier.quota && <p>Quota: {tier.quota}</p>}
              <p>Evidence: {tier.evidenceLevel}</p>
              <SubscribeForm
                personaId={persona.id}
                tierId={tier.tierId}
                pricingType={tier.pricingType}
                evidenceLevel={tier.evidenceLevel}
                price={tier.price}
                quota={tier.quota}
                personaOnchainAddress={"onchainAddress" in persona ? persona.onchainAddress : undefined}
                personaAuthority={"authority" in persona ? persona.authority : undefined}
                personaDao={"dao" in persona ? persona.dao : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
