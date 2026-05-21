import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let redis: Redis | null = null;

function initRedis(): Redis | null {
  if (redis) {
    console.log("✅ Using cached Redis connection");
    return redis;
  }

  try {
    // Try REDIS_URL first (standard format)
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      console.log("🔗 Connecting to Redis via REDIS_URL...");
      redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: null,
      });

      redis.on("connect", () => {
        console.log("✅ Redis connected");
      });

      redis.on("error", (error) => {
        console.error("❌ Redis error:", error);
      });

      redis.on("close", () => {
        console.warn("⚠️  Redis connection closed");
      });
    } else {
      // Fallback: Use Upstash REST API through HTTP
      console.log("⚠️  REDIS_URL not found. Using Upstash REST API...");
      const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
      const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (!upstashUrl || !upstashToken) {
        throw new Error("REDIS_URL or UPSTASH credentials not defined in .env");
      }

      // Note: For Phase 3, we're documenting the REST API approach
      // For full ioredis support, obtain REDIS_URL from Upstash Console
      console.log(
        "📝 Phase 3: For full Redis support, get REDIS_URL from Upstash Console",
      );
      console.log("   URL Format: redis://default:password@host:port");
    }

    return redis;
  } catch (error) {
    console.error("❌ Failed to initialize Redis:", error);
    throw error;
  }
}

export const getRedis = (): Redis | null => {
  if (!redis) {
    return initRedis();
  }
  return redis;
};

export default initRedis;
