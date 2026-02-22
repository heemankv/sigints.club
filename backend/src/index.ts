import "./env";
import { createApp } from "./app";
import { maybeSeedDemoData } from "./seed/demo";

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

async function start() {
  await maybeSeedDemoData();
  const app = createApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`backend listening on ${port}`);
  });
}

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection:", reason);
});

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Backend failed to start:", error);
  process.exit(1);
});
