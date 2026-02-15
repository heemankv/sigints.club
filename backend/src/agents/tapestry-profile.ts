import { getTapestryClient } from "../tapestry";

async function main() {
  const wallet = process.env.WALLET_ADDRESS;
  const username = process.env.USERNAME;
  if (!wallet || !username) {
    throw new Error("Set WALLET_ADDRESS and USERNAME env vars");
  }

  const client = getTapestryClient();
  const res = await client.createProfile({
    walletAddress: wallet,
    username,
    bio: process.env.BIO,
    id: process.env.PROFILE_ID,
    execution: "FAST_UNCONFIRMED",
  });
  console.log(res);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
