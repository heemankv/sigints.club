import "./env";
import { createApp } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const app = createApp();
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`backend listening on ${port}`);
});
