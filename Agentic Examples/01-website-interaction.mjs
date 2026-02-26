import { SigintsClient } from "@heemankv/sigints-sdk";
import { createBackendClient } from "@heemankv/sigints-sdk/backend";

const backendUrl = process.env.SIGINTS_BACKEND_URL ?? "http://127.0.0.1:3001";
const wallet = process.env.SIGINTS_WALLET ?? "";
const allowWrite = process.env.SIGINTS_ALLOW_WRITE === "true";

const backend = createBackendClient(backendUrl);

console.log("[sigints] backend:", backendUrl);

const { streams } = await backend.fetchStreams(true);
console.log(`streams: ${streams.length}`);

const preview = streams.slice(0, 5).map((stream) => ({
  id: stream.id,
  name: stream.name,
  visibility: stream.visibility,
  latency: stream.latency,
  tiers: Array.isArray(stream.tiers) ? stream.tiers.length : 0,
}));
console.log("stream preview:\n", JSON.stringify(preview, null, 2));

const feed = await backend.fetchFeed("intent");
console.log("intent feed (raw):\n", JSON.stringify(feed, null, 2));

if (streams[0]) {
  const client = await SigintsClient.fromBackend(backendUrl);
  try {
    const latest = await client.fetchLatestSignal(streams[0].id);
    console.log("latest signal metadata:\n", JSON.stringify(latest, null, 2));
  } catch (error) {
    console.log("no latest signal yet (or not available):", error?.message ?? error);
  }
}

if (allowWrite && wallet) {
  const profile = await backend.loginUser(wallet, {
    displayName: "Agentic Example",
    bio: "Created by an SDK example script",
  });
  console.log("updated profile:\n", JSON.stringify(profile, null, 2));

  const post = await backend.createIntent({
    wallet,
    content: "Looking for fresh signals on SOL/USDC with tight latency.",
    topic: "solana",
    tags: ["signals", "intent"],
  });
  console.log("created intent post:\n", JSON.stringify(post, null, 2));
} else {
  console.log("writes disabled. Set SIGINTS_ALLOW_WRITE=true and SIGINTS_WALLET to enable.");
}
