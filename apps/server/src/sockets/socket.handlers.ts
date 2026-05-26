import { AuthenticatedSocket } from "../lib/socket";
import { ChannelService } from "../services/channel.service";
import { RedisService } from "../services/redis.service";
import { getRedis } from "../lib/redis";
import { Server } from "socket.io";

export function registerSocketHandlers(socket: AuthenticatedSocket) {
  const userId = socket.userId;
  const displayName = socket.displayName || "Unknown User";

  if (!userId) {
    console.error("❌ Socket unregistered: userId is missing on socket");
    return;
  }

  // Get io instance from socket
  const io = socket.server as Server;

  // On connection, set presence to online and add to active sessions
  (async () => {
    try {
      await RedisService.setPresence(userId, "online");
      const ioredis = getRedis();
      if (ioredis) {
        await ioredis.sadd(`session:${userId}`, socket.id);
      }
    } catch (err) {
      console.error("❌ Error setting initial presence/session:", err);
    }
  })();

  // Handle joining a channel room
  socket.on("join_channel", async (payload: { channelId: string }) => {
    try {
      const { channelId } = payload;
      if (!channelId) {
        socket.emit("error", { message: "channelId is required" });
        return;
      }

      // Assert channel membership in Postgres
      await ChannelService.assertChannelMembership(channelId, userId);

      // Join the socket room
      const roomName = `chat:${channelId}`;
      socket.join(roomName);

      // Broadcast user_joined event to the room
      io.to(roomName).emit("user_joined", {
        user_id: userId,
        display_name: displayName,
      });

      console.log(`👤 User ${userId} joined room ${roomName}`);
    } catch (err: any) {
      console.error(`❌ Error in join_channel:`, err);
      socket.emit("error", { message: err.message || "Failed to join channel" });
    }
  });

  // Handle leaving a channel room
  socket.on("leave_channel", async (payload: { channelId: string }) => {
    try {
      const { channelId } = payload;
      if (!channelId) {
        socket.emit("error", { message: "channelId is required" });
        return;
      }

      const roomName = `chat:${channelId}`;
      socket.leave(roomName);

      // Broadcast user_left event to the room
      io.to(roomName).emit("user_left", {
        user_id: userId,
      });

      console.log(`👤 User ${userId} left room ${roomName}`);
    } catch (err: any) {
      console.error(`❌ Error in leave_channel:`, err);
      socket.emit("error", { message: err.message || "Failed to leave channel" });
    }
  });

  // Handle presence heartbeat
  socket.on("heartbeat", async () => {
    try {
      await RedisService.setPresence(userId, "online");
    } catch (err) {
      console.error(`❌ Error in presence heartbeat for user ${userId}:`, err);
    }
  });

  // Handle typing start
  socket.on("typing_start", async (payload: { channelId: string }) => {
    try {
      const { channelId } = payload;
      if (!channelId) return;

      await RedisService.startTyping(userId, channelId, displayName);
      const typingUsers = await RedisService.getTypingUsers(channelId);

      io.to(`chat:${channelId}`).emit("typing_update", {
        channelId,
        typing_users: typingUsers.map(name => ({ display_name: name })),
      });
    } catch (err) {
      console.error(`❌ Error in typing_start for user ${userId}:`, err);
    }
  });

  // Handle typing stop
  socket.on("typing_stop", async (payload: { channelId: string }) => {
    try {
      const { channelId } = payload;
      if (!channelId) return;

      await RedisService.stopTyping(userId, channelId, displayName);
      const typingUsers = await RedisService.getTypingUsers(channelId);

      io.to(`chat:${channelId}`).emit("typing_update", {
        channelId,
        typing_users: typingUsers.map(name => ({ display_name: name })),
      });
    } catch (err) {
      console.error(`❌ Error in typing_stop for user ${userId}:`, err);
    }
  });

  // Clean up on disconnect
  socket.on("disconnect", async () => {
    try {
      await RedisService.setPresence(userId, "offline");
      const ioredis = getRedis();
      if (ioredis) {
        await ioredis.srem(`session:${userId}`, socket.id);
      }
    } catch (err) {
      console.error(`❌ Error during socket disconnect cleanup for user ${userId}:`, err);
    }
  });
}
