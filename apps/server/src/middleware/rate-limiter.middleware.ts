import { Request, Response, NextFunction } from "express";
import { getRedis } from "../lib/redis";
import { Redis as UpstashRedis } from "@upstash/redis";

let upstashClient: UpstashRedis | null = null;
function getUpstashClient(): UpstashRedis | null {
  if (upstashClient) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      upstashClient = new UpstashRedis({ url, token });
      return upstashClient;
    } catch (e) {
      console.error("❌ Failed to initialize Upstash REST Client in Rate Limiter:", e);
    }
  }
  return null;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.auth?.userId;
    if (!userId) {
      return next();
    }

    const key = `ratelimit:${options.keyPrefix}:${userId}`;
    const now = Date.now();
    const windowStart = now - options.windowMs;

    try {
      const ioredis = getRedis();
      if (ioredis) {
        const pipeline = ioredis.pipeline();
        pipeline.zremrangebyscore(key, 0, windowStart);
        pipeline.zadd(key, now, now.toString());
        pipeline.zcard(key);
        pipeline.expire(key, Math.ceil(options.windowMs / 1000) * 2);

        const results = await pipeline.exec();
        if (results) {
          const count = results[2] ? (results[2][1] as number) : 0;
          res.setHeader("X-RateLimit-Limit", options.max.toString());
          res.setHeader("X-RateLimit-Remaining", Math.max(0, options.max - count).toString());

          if (count > options.max) {
            return res.status(429).json({
              error: "Too many requests, please try again later.",
            });
          }
        }
        return next();
      }

      const upstash = getUpstashClient();
      if (upstash) {
        const p = upstash.pipeline();
        p.zremrangebyscore(key, 0, windowStart);
        p.zadd(key, { score: now, member: now.toString() });
        p.zcard(key);
        p.expire(key, Math.ceil(options.windowMs / 1000) * 2);

        const results = await p.exec();
        if (results) {
          const count = results[2] as number;
          res.setHeader("X-RateLimit-Limit", options.max.toString());
          res.setHeader("X-RateLimit-Remaining", Math.max(0, options.max - count).toString());

          if (count > options.max) {
            return res.status(429).json({
              error: "Too many requests, please try again later.",
            });
          }
        }
        return next();
      }

      // Local fail-open fallback
      next();
    } catch (error) {
      console.error("❌ Rate Limiter Error:", error);
      next();
    }
  };
}
