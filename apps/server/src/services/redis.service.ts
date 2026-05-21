import { getRedis } from "../lib/redis";
import { Redis as UpstashRedis } from "@upstash/redis";

// Robust unified fallback client support
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

// In-Memory map fallback for absolute fail-safety in restricted environments
const inMemoryPresence = new Map<
  string,
  { status: string; lastSeenAt: string; platform: string }
>();
const inMemoryTyping = new Map<string, Map<string, number>>(); // channelId -> Map<userId:name, expiry>
const inMemoryUnread = new Map<string, number>(); // userId:channelId -> count

export class RedisService {
  // ==========================================
  // PRESENCE
  // ==========================================

  static async setPresence(
    userId: string,
    status: "online" | "away" | "offline",
    platform: string = "web",
  ): Promise<void> {
    const key = `presence:${userId}`;
    const ioredis = getRedis();

    if (ioredis) {
      await ioredis.hset(key, {
        status,
        last_seen_at: new Date().toISOString(),
        platform,
      });
      await ioredis.expire(key, 30);
      return;
    }

    const upstash = getUpstashClient();
    if (upstash) {
      await upstash.hset(key, {
        status,
        last_seen_at: new Date().toISOString(),
        platform,
      });
      await upstash.expire(key, 30);
      return;
    }

    // In-memory fallback
    inMemoryPresence.set(userId, {
      status,
      lastSeenAt: new Date().toISOString(),
      platform,
    });
  }

  static async getPresence(
    userId: string,
  ): Promise<{ status: string; lastSeenAt: string; platform: string } | null> {
    const key = `presence:${userId}`;
    const ioredis = getRedis();

    if (ioredis) {
      const data = await ioredis.hgetall(key);
      if (!data || Object.keys(data).length === 0) return null;
      return {
        status: data.status || "offline",
        lastSeenAt: data.last_seen_at || new Date().toISOString(),
        platform: data.platform || "web",
      };
    }

    const upstash = getUpstashClient();
    if (upstash) {
      const data = await upstash.hgetall<{
        status?: string;
        last_seen_at?: string;
        platform?: string;
      }>(key);
      if (!data || Object.keys(data).length === 0) return null;
      return {
        status: data.status || "offline",
        lastSeenAt: data.last_seen_at || new Date().toISOString(),
        platform: data.platform || "web",
      };
    }

    // In-memory fallback
    const local = inMemoryPresence.get(userId);
    if (!local) return null;
    return {
      status: local.status,
      lastSeenAt: local.lastSeenAt,
      platform: local.platform,
    };
  }

  // ==========================================
  // TYPING INDICATORS
  // ==========================================

  static async startTyping(
    userId: string,
    channelId: string,
    displayName: string,
  ): Promise<void> {
    const key = `typing:${channelId}`;
    const score = Date.now() + 5000; // Typing status expires in 5s
    const member = `${userId}:${displayName}`;

    const ioredis = getRedis();
    if (ioredis) {
      await ioredis.zadd(key, score, member);
      return;
    }

    const upstash = getUpstashClient();
    if (upstash) {
      await upstash.zadd(key, { score, member });
      return;
    }

    // In-memory fallback
    if (!inMemoryTyping.has(channelId)) {
      inMemoryTyping.set(channelId, new Map());
    }
    inMemoryTyping.get(channelId)!.set(member, score);
  }

  static async stopTyping(
    userId: string,
    channelId: string,
    displayName: string,
  ): Promise<void> {
    const key = `typing:${channelId}`;
    const member = `${userId}:${displayName}`;

    const ioredis = getRedis();
    if (ioredis) {
      await ioredis.zrem(key, member);
      return;
    }

    const upstash = getUpstashClient();
    if (upstash) {
      await upstash.zrem(key, member);
      return;
    }

    // In-memory fallback
    const map = inMemoryTyping.get(channelId);
    if (map) {
      map.delete(member);
    }
  }

  static async getTypingUsers(channelId: string): Promise<string[]> {
    const key = `typing:${channelId}`;
    const now = Date.now();
    const ioredis = getRedis();

    if (ioredis) {
      await ioredis.zremrangebyscore(key, 0, now);
      const members = await ioredis.zrange(key, 0, -1);
      return members.map((m) => m.split(":")[1]); // Extract displayNames
    }

    const upstash = getUpstashClient();
    if (upstash) {
      await upstash.zremrangebyscore(key, 0, now);
      const members = await upstash.zrange<string[]>(key, 0, -1);
      return members.map((m) => m.split(":")[1]);
    }

    // In-memory fallback
    const map = inMemoryTyping.get(channelId);
    if (!map) return [];
    const typingList: string[] = [];
    for (const [member, expiry] of map.entries()) {
      if (expiry > now) {
        typingList.push(member.split(":")[1]);
      } else {
        map.delete(member);
      }
    }
    return typingList;
  }

  // ==========================================
  // UNREAD COUNTERS (7-Day TTL)
  // ==========================================

  static async incrementUnread(
    userId: string,
    channelId: string,
  ): Promise<number> {
    const key = `unread:${userId}:${channelId}`;
    const ioredis = getRedis();

    if (ioredis) {
      const count = await ioredis.incr(key);
      await ioredis.expire(key, 604800); // 7 days in seconds
      return count;
    }

    const upstash = getUpstashClient();
    if (upstash) {
      const count = await upstash.incr(key);
      await upstash.expire(key, 604800);
      return count;
    }

    // In-memory fallback
    const combinedKey = `${userId}:${channelId}`;
    const current = inMemoryUnread.get(combinedKey) || 0;
    const nextCount = current + 1;
    inMemoryUnread.set(combinedKey, nextCount);
    return nextCount;
  }

  static async resetUnread(userId: string, channelId: string): Promise<void> {
    const key = `unread:${userId}:${channelId}`;
    const ioredis = getRedis();

    if (ioredis) {
      await ioredis.del(key);
      return;
    }

    const upstash = getUpstashClient();
    if (upstash) {
      await upstash.del(key);
      return;
    }

    // In-memory fallback
    inMemoryUnread.delete(`${userId}:${channelId}`);
  }

  static async getUnreadCounts(
    userId: string,
    channelIds: string[],
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    if (channelIds.length === 0) return result;

    const ioredis = getRedis();
    if (ioredis) {
      const pipeline = ioredis.pipeline();
      channelIds.forEach((cid) => pipeline.get(`unread:${userId}:${cid}`));
      const pipelineResults = await pipeline.exec();

      if (pipelineResults) {
        channelIds.forEach((cid, index) => {
          const errAndVal = pipelineResults[index];
          const val = errAndVal ? errAndVal[1] : null;
          result[cid] = val ? parseInt(val as string, 10) : 0;
        });
      }
      return result;
    }

    const upstash = getUpstashClient();
    if (upstash) {
      const keys = channelIds.map((cid) => `unread:${userId}:${cid}`);
      const values = await upstash.mget<string[]>(...keys);
      channelIds.forEach((cid, index) => {
        const val = values[index];
        result[cid] = val ? parseInt(val, 10) : 0;
      });
      return result;
    }

    // In-memory fallback
    channelIds.forEach((cid) => {
      result[cid] = inMemoryUnread.get(`${userId}:${cid}`) || 0;
    });
    return result;
  }

  static async publishChatEvent(
    channelId: string,
    eventPayload: unknown,
  ): Promise<void> {
    const channel = `chat:${channelId}`;
    const payload = JSON.stringify(eventPayload);

    const ioredis = getRedis();
    if (ioredis) {
      await ioredis.publish(channel, payload);
      return;
    }

    const upstash = getUpstashClient();
    if (upstash && typeof (upstash as any).publish === "function") {
      await (upstash as any).publish(channel, payload);
      return;
    }

    // Local in-memory broadcast fallback when Redis publisher is unavailable
    try {
      const { getIO } = require("../lib/socket");
      const io = getIO();
      if (io) {
        const parsed = typeof eventPayload === "string" ? JSON.parse(eventPayload) : eventPayload;
        if (parsed && (parsed as any).event) {
          console.log(`📡 [Local Fallback] Broadcasting event ${(parsed as any).event} to chat:${channelId}`);
          io.to(`chat:${channelId}`).emit((parsed as any).event, parsed);
        }
      }
    } catch (e) {
      // Socket.IO server might not be initialized or active
    }
  }
}
