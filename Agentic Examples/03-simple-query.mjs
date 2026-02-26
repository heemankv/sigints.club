import { createBackendClient } from "@heemankv/sigints-sdk/backend";

const backendUrl = process.env.SIGINTS_BACKEND_URL ?? "http://127.0.0.1:3001";
const backend = createBackendClient(backendUrl);

console.log("[sigints] backend:", backendUrl);

const { streams } = await backend.fetchStreams(true);
console.log(`streams: ${streams.length}`);
console.log(JSON.stringify(streams, null, 2));

const wallet = process.env.SIGINTS_USER_WALLET;
if (wallet) {
  try {
    const profile = await backend.fetchUserProfile(wallet);
    console.log("\nuser profile:\n", JSON.stringify(profile, null, 2));
  } catch (error) {
    console.error("\nuser profile fetch failed:", error?.message ?? error);
  }
} else {
  console.log("\nset SIGINTS_USER_WALLET to fetch a profile.");
}
