import { io, Socket } from "socket.io-client";
import { useChatStore } from "../store/chat-store";
import toast from "react-hot-toast";

let socket: Socket | null = null;
let currentToken: string | null = null;
let heartbeatInterval: any = null;

export const initSocket = (token: string) => {
  // If a socket exists with the same token, reuse it
  if (socket && currentToken === token) {
    console.log("🔌 Socket already initialized with same token");
    return socket;
  }

  // If a socket exists but token changed (e.g., re-login), disconnect first
  if (socket && currentToken !== token) {
    console.log(
      "🔌 Token changed — disconnecting existing socket and reconnecting",
    );
    try {
      socket.disconnect();
    } catch (e) {
      // ignore
    }
    socket = null;
    currentToken = null;
  }

  const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:4001";

  console.log(`🔌 Initializing Socket.IO connection to ${socketUrl}...`);
  socket = io(socketUrl, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 20000,
  });

  currentToken = token;

  socket.on("connect", () => {
    console.log("✅ Socket.IO connected. ID:", socket?.id);
    useChatStore.getState().setSocketConnected(true);

    // Join currently active channel if any
    const activeId = useChatStore.getState().activeChannelId;
    if (activeId) {
      joinChannel(activeId);
    }

    // Start presence heartbeats
    startHeartbeats();
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️  Socket.IO disconnected. Reason:", reason);
    useChatStore.getState().setSocketConnected(false);
    stopHeartbeats();
  });

  socket.on("connect_error", (error) => {
    console.error("❌ Socket.IO connection error:", error.message);
    useChatStore.getState().setSocketConnected(false);
  });

  // ==========================================
  // REAL-TIME EVENT LISTENERS
  // ==========================================

  // 1. Message created
  socket.on("message.created", (payload: { event: string; message: any }) => {
    console.log("➡️ Real-time message created:", payload.message);
    const { message } = payload;
    const activeChannelId = useChatStore.getState().activeChannelId;

    useChatStore
      .getState()
      .addMessage(message.channelId || activeChannelId, message);
    useChatStore
      .getState()
      .updateChannelLastMessage(
        message.channelId || activeChannelId,
        message.body,
        message.sentAt,
      );

    if (activeChannelId !== message.channelId) {
      useChatStore.getState().incrementUnreadCount(message.channelId);
    }
  });

  // 2. Message edited
  socket.on(
    "message.edited",
    (payload: {
      event: string;
      seq: number;
      body: string;
      editedAt: string;
    }) => {
      console.log("➡️ Real-time message edited:", payload);
      const activeChannelId = useChatStore.getState().activeChannelId;
      if (activeChannelId) {
        useChatStore.getState().updateMessage(activeChannelId, payload.seq, {
          body: payload.body,
          editedAt: payload.editedAt,
        });
      }
    },
  );

  // 3. Message deleted
  socket.on("message.deleted", (payload: { event: string; seq: number }) => {
    console.log("➡️ Real-time message deleted:", payload);
    const activeChannelId = useChatStore.getState().activeChannelId;
    if (activeChannelId) {
      useChatStore
        .getState()
        .deleteMessageFromStore(activeChannelId, payload.seq);
    }
  });

  // 4. Reaction added
  socket.on(
    "reaction.added",
    (payload: {
      event: string;
      seq: number;
      userId: string;
      emoji: string;
    }) => {
      console.log("➡️ Real-time reaction added:", payload);
      const activeChannelId = useChatStore.getState().activeChannelId;
      if (activeChannelId) {
        const messages =
          useChatStore.getState().messagesByChannel[activeChannelId] || [];
        const msg = messages.find((m) => m.seq === payload.seq);
        if (msg) {
          const reactions = [
            ...(msg.reactions || []).filter(
              (r) =>
                !(r.userId === payload.userId && r.emoji === payload.emoji),
            ),
            {
              userId: payload.userId,
              emoji: payload.emoji,
            },
          ];
          useChatStore
            .getState()
            .updateMessage(activeChannelId, payload.seq, { reactions });
        }
      }
    },
  );

  // 5. Reaction removed
  socket.on(
    "reaction.removed",
    (payload: {
      event: string;
      seq: number;
      userId: string;
      emoji: string;
    }) => {
      console.log("➡️ Real-time reaction removed:", payload);
      const activeChannelId = useChatStore.getState().activeChannelId;
      if (activeChannelId) {
        const messages =
          useChatStore.getState().messagesByChannel[activeChannelId] || [];
        const msg = messages.find((m) => m.seq === payload.seq);
        if (msg) {
          const reactions = (msg.reactions || []).filter(
            (r) => !(r.userId === payload.userId && r.emoji === payload.emoji),
          );
          useChatStore
            .getState()
            .updateMessage(activeChannelId, payload.seq, { reactions });
        }
      }
    },
  );

  // 6. Typing update
  socket.on(
    "typing_update",
    (payload: { channelId: string; typing_users: string[] }) => {
      console.log("➡️ Typing update:", payload);
      useChatStore
        .getState()
        .setTypingUsers(payload.channelId, payload.typing_users);
    },
  );

  // 7. Presence updates / other system events
  socket.on(
    "user_joined",
    (payload: { user_id: string; display_name: string }) => {
      console.log("➡️ User joined room:", payload);
      useChatStore.getState().setPresence(payload.user_id, {
        status: "online",
        lastSeenAt: new Date().toISOString(),
        platform: "web",
      });
    },
  );

  socket.on("user_left", (payload: { user_id: string }) => {
    console.log("➡️ User left room:", payload);
    useChatStore.getState().setPresence(payload.user_id, {
      status: "offline",
      lastSeenAt: new Date().toISOString(),
      platform: "web",
    });
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    useChatStore.getState().setSocketConnected(false);
  }
  stopHeartbeats();
};

// Heartbeat presence refresh (every 10 seconds)
const startHeartbeats = () => {
  stopHeartbeats();
  heartbeatInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit("heartbeat");
    }
  }, 10000);
};

const stopHeartbeats = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

// Room management actions
export const joinChannel = (channelId: string) => {
  if (socket && socket.connected) {
    console.log(`🔌 Joining socket room chat:${channelId}`);
    socket.emit("join_channel", { channelId });
  }
};

export const leaveChannel = (channelId: string) => {
  if (socket && socket.connected) {
    console.log(`🔌 Leaving socket room chat:${channelId}`);
    socket.emit("leave_channel", { channelId });
  }
};

// Typing status controls
export const startTyping = (channelId: string) => {
  if (socket && socket.connected) {
    socket.emit("typing_start", { channelId });
  }
};

export const stopTyping = (channelId: string) => {
  if (socket && socket.connected) {
    socket.emit("typing_stop", { channelId });
  }
};
