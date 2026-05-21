import http from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { getRedis } from "./redis";
import pool from "./pg";
import { registerSocketHandlers } from "../sockets/socket.handlers";

let io: Server | null = null;

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  email?: string;
  displayName?: string;
}

export function initSocket(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: "*", // allow from any origin during development / tests
      credentials: true,
    },
  });

  const redisClient = getRedis();
  if (redisClient) {
    try {
      console.log("🔌 Initializing Socket.IO Redis Adapter...");
      const pubClient = redisClient;
      const subClient = redisClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      console.log("✅ Socket.IO Redis Adapter configured successfully");
    } catch (error) {
      console.error("❌ Failed to configure Socket.IO Redis Adapter:", error);
    }
  } else {
    console.warn("⚠️  Redis client not available. Falling back to local in-memory Socket.IO adapter.");
  }

  // Auth middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error("Authentication error: Token is required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (!decoded.sub || decoded.type !== "access") {
        return next(new Error("Authentication error: Invalid token"));
      }

      socket.userId = decoded.sub;
      socket.email = decoded.email;

      // Fetch display name from database once
      const userResult = await pool.query(
        "SELECT display_name FROM users WHERE id = $1 LIMIT 1",
        [decoded.sub]
      );
      socket.displayName = userResult.rows[0]?.display_name || decoded.email;

      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  // Handle connection
  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`🔌 Client connected: ${socket.userId} (${socket.displayName}) (socket ID: ${socket.id})`);
    
    // Register socket handlers
    registerSocketHandlers(socket);

    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.userId} (socket ID: ${socket.id})`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }
  return io;
}
