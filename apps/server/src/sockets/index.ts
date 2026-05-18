import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { MessageModel } from "../models/message.model";
import { ConversationModel } from "../models/conversation.model";

let io: Server | null = null;

export function initSockets(server: HTTPServer) {
  io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN ?? "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/socket.io",
  });

  // simple auth middleware for socket connections using access token
  io.use((socket: Socket, next) => {
    try {
      const token =
        // preferred: provided in handshake auth (client side `io({ auth: { token } })`)
        (socket.handshake.auth && (socket.handshake.auth as any).token) ||
        // fallback: Authorization header `Bearer <token>`
        (socket.handshake.headers &&
          (socket.handshake.headers.authorization as string | undefined)?.split(
            " ",
          )[1]);

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const payload = jwt.verify(token, env.jwtSecret) as {
        sub: string;
        email?: string;
        type?: string;
      };

      // attach user info to socket.data for handlers
      (socket.data as any).user = { id: payload.sub, email: payload.email };

      return next();
    } catch (_err) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    // eslint-disable-next-line no-console
    console.log("Socket connected:", socket.id, (socket.data as any).user?.id);

    socket.on("join", async (conversationId: string) => {
      if (!conversationId) return;

      // join room named after conversation
      socket.join(conversationId);

      // emit to others that a user joined
      socket.to(conversationId).emit("user:joined", {
        userId: (socket.data as any).user?.id,
        socketId: socket.id,
      });

      // optionally: fetch and emit last N messages to the joining user
      try {
        const messages = await MessageModel.find({
          conversationId,
          deletedFor: { $nin: [(socket.data as any).user?.id] },
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        socket.emit("message:history", { messages: messages.reverse() });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch message history:", err);
      }
    });

    socket.on("leave", (conversationId: string) => {
      if (!conversationId) return;
      socket.leave(conversationId);
      socket.to(conversationId).emit("user:left", {
        userId: (socket.data as any).user?.id,
        socketId: socket.id,
      });
    });

    socket.on(
      "message:send",
      async (
        payload: {
          conversationId: string;
          text: string;
          type?: "text" | "image" | "file" | "audio" | "video";
          mediaUrl?: string;
          mediaType?: string;
          replyTo?: string;
        },
        ack?: (arg: unknown) => void,
      ) => {
        try {
          if (!payload || !payload.conversationId || !payload.text) {
            return ack?.({ status: "error", message: "Invalid payload" });
          }

          // save message to MongoDB
          const message = await MessageModel.create({
            conversationId: payload.conversationId,
            senderId: (socket.data as any).user?.id,
            type: payload.type || "text",
            text: payload.text,
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType,
            replyTo: payload.replyTo,
            status: "sent",
            seenBy: [(socket.data as any).user?.id],
          });

          // populate sender info for broadcast
          await message.populate("senderId", "name email avatarUrl");

          // broadcast message to all in room
          io?.to(payload.conversationId).emit("message:received", {
            _id: message._id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            type: message.type,
            text: message.text,
            mediaUrl: message.mediaUrl,
            mediaType: message.mediaType,
            replyTo: message.replyTo,
            status: message.status,
            seenBy: message.seenBy,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          });

          // update conversation last message time
          await ConversationModel.findByIdAndUpdate(payload.conversationId, {
            lastMessageAt: new Date(),
          });

          // acknowledge sender with message ID
          return ack?.({
            status: "ok",
            messageId: message._id,
            createdAt: message.createdAt,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to save message:", err);
          return ack?.({ status: "error", message: "Failed to save message" });
        }
      },
    );

    socket.on(
      "message:delivered",
      async (payload: { conversationId: string; messageId: string }) => {
        try {
          if (!payload?.messageId || !payload?.conversationId) return;

          await MessageModel.findByIdAndUpdate(payload.messageId, {
            status: "delivered",
          });

          io?.to(payload.conversationId).emit("message:status-changed", {
            messageId: payload.messageId,
            status: "delivered",
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to update message status:", err);
        }
      },
    );

    socket.on(
      "message:seen",
      async (payload: { conversationId: string; messageIds: string[] }) => {
        try {
          if (!payload?.conversationId || !payload?.messageIds?.length) return;

          const userId = (socket.data as any).user?.id;

          await MessageModel.updateMany(
            { _id: { $in: payload.messageIds } },
            {
              status: "seen",
              $addToSet: { seenBy: userId },
            },
          );

          io?.to(payload.conversationId).emit("message:status-changed", {
            messageIds: payload.messageIds,
            status: "seen",
            seenBy: userId,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to mark messages as seen:", err);
        }
      },
    );

    socket.on("disconnect", (reason) => {
      // eslint-disable-next-line no-console
      console.log("Socket disconnected:", socket.id, reason);
    });
  });
}

export function getIo() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
