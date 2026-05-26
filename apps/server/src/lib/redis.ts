import Redis from "ioredis";
import dotenv from "dotenv";
import { env } from "../config/env";

dotenv.config();

let redis: Redis | null = null;

function initRedis(): Redis | null {
  if (redis) {
    console.log("✅ Using cached Redis connection");
    return redis;
  }

  // Prefer REDIS_URL (Docker) if provided
  const redisUrl = env.redisUrl;
  if (redisUrl) {
    try {
      console.log(`⚡️ Connecting to Redis at ${redisUrl}`);
      redis = new Redis(redisUrl);
      console.log("✅ Redis connection established via REDIS_URL");
      return redis;
    } catch (err) {
      console.error("❌ Failed to connect to Redis via REDIS_URL:", err);
      // fall through to Upstash or null
    }
  }

  // Fallback to Upstash REST API (no ioredis support)
  console.log("⚠️  Using Upstash REST API via environment variables...");
  const upstashUrl = env.upstashRedisUrl;
  const upstashToken = env.upstashRedisToken;

  if (!upstashUrl || !upstashToken) {
    console.warn(
      "⚠️  Upstash Redis credentials not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env",
    );
    return null;
  }

  // Note: ioredis bridge for Upstash is not available in this setup
  // Services should use @upstash/redis directly for REST API access
  console.log("📝 Upstash REST credentials loaded from environment");
  return null;
}

export const getRedis = (): Redis | null => {
  if (!redis) {
    return initRedis();
  }
  return redis;
};

export default initRedis;
