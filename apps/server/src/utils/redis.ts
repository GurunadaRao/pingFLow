import { Redis } from "@upstash/redis";

import { env } from "../config/env";

let redis: Redis | null = null;
let enabled = false;

if (env.upstashRedisUrl && env.upstashRedisToken) {
  redis = new Redis({ url: env.upstashRedisUrl, token: env.upstashRedisToken });
  enabled = true;
} else if (env.redisUrl) {
  // @upstash/redis also accepts a plain redis url without token for compatible providers
  redis = new Redis({ url: env.redisUrl });
  enabled = true;
}

export function isRedisEnabled(): boolean {
  return enabled && redis !== null;
}

export async function blacklistRefreshToken(
  jti: string,
  ttlSeconds: number,
): Promise<void> {
  if (!redis) return;
  const key = `blacklist:refresh:${jti}`;
  try {
    await redis.set(key, "1", { ex: ttlSeconds });
  } catch (err) {
    // log but don't throw - blacklist failure shouldn't break rotation
    // eslint-disable-next-line no-console
    console.error("Failed to write refresh token blacklist to Redis", err);
  }
}

export async function isRefreshTokenBlacklisted(jti: string): Promise<boolean> {
  if (!redis) return false;
  const key = `blacklist:refresh:${jti}`;
  try {
    const v = await redis.get(key);
    return v !== null && v !== undefined;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to read refresh token blacklist from Redis", err);
    return false;
  }
}
