import {
  fetchAgents as sdkFetchAgents,
  fetchAgentSubscriptions as sdkFetchAgentSubscriptions,
} from "../sdkBackend";
import type { AgentProfile, AgentSubscription } from "../types";

const AGENTS_CACHE_KEY = "agents_cache_v1";
const AGENT_SUBS_CACHE_KEY = "agent_subs_cache_v1";
const CACHE_TTL_MS = 30_000;

// ─── Agents ──────────────────────────────────────────────────────────────────

export function readAgentsCache(wallet: string): AgentProfile[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AGENTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.wallet !== wallet || Date.now() > parsed.expiresAt) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeAgentsCache(wallet: string, data: AgentProfile[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AGENTS_CACHE_KEY,
      JSON.stringify({ wallet, data, expiresAt: Date.now() + CACHE_TTL_MS })
    );
  } catch {}
}

export async function fetchAgents(params: {
  owner?: string;
  role?: string;
  streamId?: string;
  search?: string;
}): Promise<{ agents: AgentProfile[] }> {
  const res = await sdkFetchAgents<{ agents: AgentProfile[] }>(params);
  if (params.owner) writeAgentsCache(params.owner, res.agents ?? []);
  return res;
}

// ─── Agent Subscriptions ─────────────────────────────────────────────────────

export function readAgentSubsCache(wallet: string): AgentSubscription[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AGENT_SUBS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.wallet !== wallet || Date.now() > parsed.expiresAt) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeAgentSubsCache(wallet: string, data: AgentSubscription[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AGENT_SUBS_CACHE_KEY,
      JSON.stringify({ wallet, data, expiresAt: Date.now() + CACHE_TTL_MS })
    );
  } catch {}
}

export async function fetchAgentSubscriptions(params: {
  owner?: string;
  agentId?: string;
  streamId?: string;
}): Promise<{ agentSubscriptions: AgentSubscription[] }> {
  const res = await sdkFetchAgentSubscriptions<{ agentSubscriptions: AgentSubscription[] }>(params);
  if (params.owner) writeAgentSubsCache(params.owner, res.agentSubscriptions ?? []);
  return res;
}
