import { getRedis } from "../lib/redis";
import { Redis as UpstashRedis } from "@upstash/redis";
import { MessageBucket } from "../models/message-bucket.model";
import crypto from "crypto";

// Unified upstash cache connection
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
      console.error("❌ Failed to initialize Upstash REST Client:", e);
    }
  }
  return null;
}

// In-Memory fail-safe cache fallback
const inMemoryLocks = new Map<string, { token: string; expires: number }>();
const inMemorySeqs = new Map<string, number>();

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SequenceService {
  /**
   * Safely acquires a distributed lock in Redis with retry capabilities.
   * Lock duration is 500ms.
   */
  private static async acquireLock(
    channelId: string,
    token: string,
    retryCount = 40,
    retryDelayMs = 50,
  ): Promise<boolean> {
    const lockKey = `msg:lock:${channelId}`;
    const ioredis = getRedis();

    for (let i = 0; i < retryCount; i++) {
      if (ioredis) {
        // SET key value PX 2000 NX
        const result = await ioredis.set(lockKey, token, "PX", 2000, "NX");
        if (result === "OK") return true;
      } else {
        const upstash = getUpstashClient();
        if (upstash) {
          const result = await upstash.set(lockKey, token, {
            px: 2000,
            nx: true,
          });
          if (result === "OK") return true;
        } else {
          // Local memory lock
          const now = Date.now();
          const active = inMemoryLocks.get(lockKey);
          if (!active || active.expires < now) {
            inMemoryLocks.set(lockKey, { token, expires: now + 2000 });
            return true;
          }
        }
      }
      await sleep(retryDelayMs);
    }
    return false;
  }

  /**
   * Releases a distributed lock atomically only if token matches.
   */
  static async releaseLock(channelId: string, token: string): Promise<void> {
    const lockKey = `msg:lock:${channelId}`;
    const ioredis = getRedis();

    if (ioredis) {
      // Use Lua script to ensure release is atomic and owns the lock
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await ioredis.eval(luaScript, 1, lockKey, token);
      return;
    }

    const upstash = getUpstashClient();
    if (upstash) {
      const currentVal = await upstash.get(lockKey);
      if (currentVal === token) {
        await upstash.del(lockKey);
      }
      return;
    }

    // In-memory cleanup
    const active = inMemoryLocks.get(lockKey);
    if (active && active.token === token) {
      inMemoryLocks.delete(lockKey);
    }
  }

  /**
   * Seeds the sequence key from the database if not present in cache.
   */
  private static async seedSequenceFromDB(channelId: string): Promise<number> {
    // Find the highest seqMax from MongoDB buckets
    const highestBucket = await MessageBucket.findOne({ channelId })
      .sort({ seqMax: -1 })
      .exec();

    const maxSeq = highestBucket ? highestBucket.seqMax : 0;
    return maxSeq;
  }

  /**
   * Safely claims the next monotonically increasing sequence number under lock.
   */
  static async getNextSequence(channelId: string): Promise<number> {
    const token = crypto.randomUUID();
    const lockAcquired = await this.acquireLock(channelId, token);

    if (!lockAcquired) {
      throw new Error(
        `Failed to acquire distributed lock for channel ${channelId}`,
      );
    }

    try {
      const seqKey = `seq:${channelId}`;
      const ioredis = getRedis();

      if (ioredis) {
        let exists = await ioredis.exists(seqKey);
        if (exists === 0) {
          const seeded = await this.seedSequenceFromDB(channelId);
          // Set if not exists (atomically fallback)
          await ioredis.setnx(seqKey, seeded.toString());
        }
        const nextSeq = await ioredis.incr(seqKey);
        return nextSeq;
      }

      const upstash = getUpstashClient();
      if (upstash) {
        let exists = await upstash.exists(seqKey);
        if (exists === 0) {
          const seeded = await this.seedSequenceFromDB(channelId);
          await upstash.set(seqKey, seeded.toString(), { nx: true });
        }
        const nextSeq = await upstash.incr(seqKey);
        return nextSeq;
      }

      // In-memory fallback
      if (!inMemorySeqs.has(channelId)) {
        const seeded = await this.seedSequenceFromDB(channelId);
        inMemorySeqs.set(channelId, seeded);
      }
      const nextSeq = inMemorySeqs.get(channelId)! + 1;
      inMemorySeqs.set(channelId, nextSeq);
      return nextSeq;
    } finally {
      // Always release the lock
      await this.releaseLock(channelId, token);
    }
  }
}
