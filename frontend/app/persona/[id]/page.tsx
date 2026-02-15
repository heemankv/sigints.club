import SubscribeForm from "./SubscribeForm";
import KeyManager from "./KeyManager";
import PublishSignal from "./PublishSignal";
import DecryptPanel from "./DecryptPanel";
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
        <h1>{persona.name}</h1>
        <p>{persona.description}</p>
      </div>
      <div className="badges">
        <span className="badge">Accuracy {persona.accuracy}</span>
        <span className="badge">Latency {persona.latency}</span>
        <span className="badge">Domain {persona.domain}</span>
      </div>

      <div className="split">
        <div className="card">
          <h3>Maker Operations</h3>
          <p>Publish, encrypt, and broadcast this persona’s signals.</p>
          <PublishSignal personaId={persona.id} tierId={persona.tiers[0]?.tierId ?? "tier"} />
        </div>
        <div className="card">
          <h3>Listener Tools</h3>
          <p>Manage keys and decrypt messages you subscribe to.</p>
          <KeyManager personaId={persona.id} />
          <DecryptPanel personaId={persona.id} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Maker Tiers</h2>
          <p>Choose a pricing tier and subscribe on or off-chain.</p>
        </div>
        <div className="cards">
          {persona.tiers.map((tier) => (
            <div className="card" key={tier.tierId}>
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
                quota={tier.quota}
                personaOnchainAddress={"onchainAddress" in persona ? persona.onchainAddress : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
