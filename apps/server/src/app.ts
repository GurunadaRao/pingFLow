import express from "express";
import cors from "cors";

import pool from "./lib/pg";
import { getRedis } from "./lib/redis";
import { env } from "./config/env";
import mongoose from "mongoose";
import { authRouter } from "./routes/auth.routes";
import { channelRouter } from "./routes/channel.routes";

export function createApp() {
  const app = express();

  // enable CORS for localhost development
  app.use(
    cors({
      origin: [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
      ],
      credentials: true,
    }),
  );

  app.use(express.json());

  // health check at root for quick checks
  app.get("/health", async (_req, res) => {
    const healthStatus: Record<string, string> = {
      status: "healthy",
      timestamp: new Date().toISOString(),
    };

    try {
      await pool.query("SELECT 1");
      healthStatus.postgres = "connected";
    } catch (err) {
      healthStatus.status = "unhealthy";
      healthStatus.postgres = `error: ${String(err)}`;
    }

    try {
      const mongoState = mongoose.connection.readyState;
      healthStatus.mongodb =
        mongoState === 1 ? "connected" : `state: ${mongoState}`;
    } catch (err) {
      healthStatus.status = "unhealthy";
      healthStatus.mongodb = `error: ${String(err)}`;
    }

    try {
      const redis = getRedis();
      if (redis) {
        healthStatus.redis =
          redis.status === "ready" || redis.status === "connect"
            ? "connected"
            : redis.status;
      } else {
        healthStatus.redis =
          env.upstashRedisUrl && env.upstashRedisToken
            ? "connected (Upstash REST)"
            : "not configured";
      }
    } catch (err) {
      healthStatus.status = "unhealthy";
      healthStatus.redis = `error: ${String(err)}`;
    }

    res
      .status(healthStatus.status === "healthy" ? 200 : 500)
      .json(healthStatus);
  });

  // mount versioned API routes under /api/:version
  const apiBase = `/api/${env.apiVersion}`;
  app.use(`${apiBase}/auth`, authRouter);
  app.use(`${apiBase}/channels`, channelRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  return app;
}
