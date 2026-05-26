const { io } = require("./mock-messaging/node_modules/socket.io-client");

const token = process.env.TOKEN;
const channelId = process.env.CHANNEL_ID;

if (!token || !channelId) {
  console.error("TOKEN and CHANNEL_ID are required");
  process.exit(1);
}

const socket = io("http://localhost:4001", {
  auth: { token },
  transports: ["websocket"],
  reconnection: false,
});

socket.on("connect", () => {
  console.log(`connected ${socket.id}`);
  socket.emit("join_channel", { channelId });
  console.log(`joined ${channelId}`);
});

socket.on("message.created", (payload) => {
  console.log("message.created", JSON.stringify(payload));
});

socket.on("connect_error", (error) => {
  console.error("connect_error", error.message);
  process.exit(1);
});
