import { getRedis } from "../lib/redis";
import { getIO } from "../lib/socket";

export class EventBroker {
  private static subClient: any = null;

  static async init(): Promise<void> {
    const redis = getRedis();
    if (!redis) {
      console.warn("⚠️  Redis client not available. Event Broker fallback mode enabled.");
      return;
    }

    try {
      console.log("🔌 Initializing Event Broker pattern subscription...");
      this.subClient = redis.duplicate();

      // Subscribe to all chat channels
      await this.subClient.psubscribe("chat:*");

      this.subClient.on("pmessage", (pattern: string, channel: string, message: string) => {
        try {
          // Channel is in the format "chat:{channelId}"
          const channelId = channel.slice("chat:".length);
          const payload = JSON.parse(message);
          
          const io = getIO();
          const eventName = payload.event;
          
          if (!eventName) {
            console.warn(`⚠️  Received event with missing event name on Redis channel ${channel}`);
            return;
          }
          
          console.log(`➡️  Forwarding Redis Pub/Sub Event: Channel: ${channelId}, Event: ${eventName}`);
          io.to(`chat:${channelId}`).emit(eventName, payload);
        } catch (error) {
          console.error("❌ Error parsing or forwarding Redis Pub/Sub message:", error);
        }
      });

      console.log("✅ Event Broker initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Event Broker:", error);
    }
  }

  static async shutdown(): Promise<void> {
    if (this.subClient) {
      try {
        await this.subClient.punsubscribe("chat:*");
        await this.subClient.quit();
        this.subClient = null;
        console.log("🔌 Event Broker shut down cleanly");
      } catch (error) {
        console.error("❌ Error shutting down Event Broker:", error);
      }
    }
  }
}
