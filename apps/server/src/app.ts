import express from "express";

import { authRouter } from "./routes/auth.routes";
import { env } from "./config/env";

export function createApp() {
  const app = express();

  app.use(express.json());

  // health check at root for quick checks
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // mount versioned API routes under /api/:version
  const apiBase = `/api/${env.apiVersion}`;
  app.use(`${apiBase}/auth`, authRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  return app;
}
