import { getTapestryClient } from "../tapestry";

async function main() {
  const startId = process.env.START_ID;
  const endId = process.env.END_ID;
  if (!startId || !endId) {
    throw new Error("Set START_ID and END_ID env vars");
  }

  const client = getTapestryClient();
  const res = await client.follow({
    startId,
    endId,
    execution: "FAST_UNCONFIRMED",
  });
  console.log(res);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
