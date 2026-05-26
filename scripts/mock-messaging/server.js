const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 5000;

// In-memory store
const channels = [{ id: "channel1", group_name: "Demo Channel" }];
const messages = {
  channel1: [],
};

function toClientChannel(channel) {
  return {
    id: channel.id,
    channel_type: "direct",
    group_name: channel.group_name,
    last_message: channel.last_message ?? "",
  };
}

function toClientMessage(message) {
  return {
    _mid: message._mid,
    seq: message.seq,
    senderId: message.senderId,
    body: message.body,
    sentAt: message.sentAt,
    reactions: [],
    receipts: [],
  };
}

// REST endpoints
app.get("/api/v1/channels", (req, res) => {
  res.json({ channels: channels.map(toClientChannel) });
});

app.get("/api/v1/channels/:id/messages", (req, res) => {
  const { id } = req.params;
  res.json({
    messages: (messages[id] || []).map(toClientMessage),
    nextCursor: null,
    hasMore: false,
  });
});

app.post("/api/v1/channels/:id/messages", (req, res) => {
  const { id } = req.params;
  const body = req.body?.body ?? req.body?.text;
  const senderId =
    req.body?.senderId ??
    req.body?.sender ??
    req.headers["x-user-id"] ??
    "demo-user";
  if (!body) {
    return res.status(400).json({ error: "missing body" });
  }
  const msg = {
    _mid: req.body?.clientMid ?? `${id}-${Date.now()}`,
    seq: (messages[id]?.length ?? 0) + 1,
    channelId: id,
    senderId,
    body,
    sentAt: new Date().toISOString(),
  };
  if (!messages[id]) messages[id] = [];
  messages[id].push(msg);

  // emit to room
  const payload = {
    event: "message.created",
    message: toClientMessage(msg),
  };
  io.to(`chat:${id}`).emit("message.created", payload);
  return res.json({ message: toClientMessage(msg) });
});

io.on("connection", (socket) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const userId = token || socket.handshake.query.userId || `guest-${socket.id}`;
  socket.userId = userId;
  console.log(`socket connected: ${socket.id} user=${userId}`);

  socket.on("join_channel", ({ channelId }) => {
    socket.join(`chat:${channelId}`);
    console.log(`${userId} joined chat:${channelId}`);
  });

  socket.on("leave_channel", ({ channelId }) => {
    socket.leave(`chat:${channelId}`);
    console.log(`${userId} left chat:${channelId}`);
  });

  socket.on("disconnect", () => {
    console.log(`socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Mock messaging server listening on ${PORT}`);
});
