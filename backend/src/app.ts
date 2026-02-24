import "express-async-errors";
import express from "express";
import router from "./routes";

export function createApp() {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PATCH,DELETE");
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(router);
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("Unhandled backend error:", err);
    const message = err?.message ?? "internal server error";
    res.status(500).json({ error: message });
  });
  return app;
}
