import SubscribeForm from "./SubscribeForm";
import KeyManager from "./KeyManager";
import PublishSignal from "./PublishSignal";
import DecryptPanel from "./DecryptPanel";
import FollowMaker from "./FollowMaker";
import { fetchStream } from "../../lib/api/streams";
import { getFallbackStream, StreamDetail as FallbackStreamDetail } from "../../lib/fallback";
import type { StreamDetail } from "../../lib/types";

export default async function StreamPage({ params }: { params: { id: string } }) {
  let stream: StreamDetail | FallbackStreamDetail | null = null;
  try {
    const data = await fetchStream(params.id);
    stream = data.stream;
  } catch {
    stream = getFallbackStream(params.id);
  }

  if (!stream) {
    return (
      <section>
        <h1 className="section-title">Stream not found</h1>
        <p className="subtext">Try another stream from the discovery page.</p>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="kicker">Stream dossier</span>
        <h1>{stream.name}</h1>
        <p>{stream.description}</p>
        {"tapestryProfileId" in stream && (
          <FollowMaker targetProfileId={stream.tapestryProfileId} />
        )}
      </div>
      <div className="badges">
        <span className="badge">Accuracy {stream.accuracy}</span>
        <span className="badge">Latency {stream.latency}</span>
        <span className="badge">Domain {stream.domain}</span>
      </div>

      <div className="split">
        <div className="module accent-teal">
          <div className="hud-corners" />
          <h3>Maker Operations</h3>
          <p>Publish, encrypt, and broadcast this stream’s signals.</p>
          <PublishSignal streamId={stream.id} tierId={stream.tiers[0]?.tierId ?? "tier"} />
        </div>
        <div className="module accent-orange">
          <div className="hud-corners" />
          <h3>Listener Tools</h3>
          <p>Manage keys and decrypt messages you subscribe to.</p>
          <KeyManager />
          <DecryptPanel streamId={stream.id} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="kicker">Subscription tiers</span>
          <h2>Maker Tiers</h2>
          <p>Choose a pricing tier and subscribe on or off-chain.</p>
        </div>
        <div className="module-grid">
          {stream.tiers.map((tier) => (
            <div className="module" key={tier.tierId}>
              <div className="hud-corners" />
              <h3>{tier.tierId}</h3>
              <p>Pricing: {tier.pricingType === "subscription_unlimited" ? "monthly subscription" : tier.pricingType}</p>
              <p>Price: {tier.price}</p>
              {tier.quota && <p>Quota: {tier.quota}</p>}
              <p>Evidence: {tier.evidenceLevel}</p>
              <SubscribeForm
                streamId={stream.id}
                tierId={tier.tierId}
                pricingType={tier.pricingType}
                evidenceLevel={tier.evidenceLevel}
                price={tier.price}
                quota={tier.quota}
                streamOnchainAddress={"onchainAddress" in stream ? stream.onchainAddress : undefined}
                streamAuthority={"authority" in stream ? stream.authority : undefined}
                streamDao={"dao" in stream ? stream.dao : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
