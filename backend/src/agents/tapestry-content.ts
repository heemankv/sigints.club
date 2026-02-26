import { getTapestryClient } from "../tapestry";

async function main() {
  const profileId = process.env.PROFILE_ID;
  if (!profileId) {
    throw new Error("Set PROFILE_ID env var");
  }

  const client = getTapestryClient();
  const content = process.env.CONTENT ?? "Signal: ETH best price at Venue X";
  const res = await client.createContent({
    profileId,
    properties: [
      { key: "text", value: content },
      { key: "type", value: process.env.TYPE ?? "signal" },
      { key: "domain", value: process.env.DOMAIN ?? "pricing" },
    ],
    execution: "FAST_UNCONFIRMED",
  });

  console.log(res);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
