import AgentPageClient from "./AgentPageClient";
import { fetchAgent } from "../../lib/api/agents";

export default async function AgentPage({ params }: { params: { id: string } }) {
  let agent = null;
  try {
    agent = await fetchAgent(params.id);
  } catch {
    agent = null;
  }

  if (!agent) {
    return (
      <>
        <h1 className="section-title">Agent not found</h1>
        <p className="subtext">Try another agent from your profile.</p>
      </>
    );
  }

  return <AgentPageClient agent={agent} />;
}
