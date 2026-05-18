const { io } = require("socket.io-client");

const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2YTBhZmRkMTA4ODQ5YTcxMzFkZDkzMWEiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc5MTA2ODU2LCJleHAiOjE3Nzk3MTE2NTZ9.P7WAndzyEXg3xFeA1NAHw8z-uEkUnN7YHgSR-0ElE0w";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";
const CONVERSATION_ID = "507f1f77bcf86cd799439011"; // Sample MongoDB ObjectId

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function runTest() {
  console.log("Connecting to", SERVER_URL);

  const socket = io(SERVER_URL, {
    auth: { token: TOKEN },
    reconnectionAttempts: 5,
    reconnectionDelay: 500,
    transports: ["websocket"],
  });

  let gotMessage = false;
  let gotHistory = false;

  socket.on("connect", async () => {
    console.log("✓ connected", socket.id);

    // join a test conversation
    socket.emit("join", CONVERSATION_ID);
  });

  socket.on("message:history", (payload) => {
    console.log(
      "✓ received message history:",
      payload.messages.length,
      "messages",
    );
    gotHistory = true;
  });

  socket.on("message:received", (msg) => {
    console.log("✓ message:received:", {
      _id: msg._id,
      text: msg.text,
      status: msg.status,
      createdAt: msg.createdAt,
    });
    gotMessage = true;
  });

  socket.on("message:status-changed", (payload) => {
    console.log("✓ message:status-changed:", payload);
  });

  socket.on("user:joined", (payload) => {
    console.log("✓ user:joined:", payload);
  });

  // wait a bit for join to process, then send a message
  await wait(500);

  socket.emit(
    "message:send",
    {
      conversationId: CONVERSATION_ID,
      text: "Hello from socket test!",
      type: "text",
    },
    (ack) => {
      console.log("✓ ack (message:send):", ack);
    },
  );

  // wait for events to flow
  await wait(2000);

  if (gotMessage && gotHistory) {
    socket.emit("message:delivered", {
      conversationId: CONVERSATION_ID,
      messageId: "507f1f77bcf86cd799439012", // example message ID
    });
    console.log("✓ emitted message:delivered");
  }

  await wait(1000);

  if (gotMessage && gotHistory) {
    console.log("Test PASSED ✓");
    console.log("  - Connected to socket.io");
    console.log("  - Joined conversation");
    console.log("  - Sent message (persisted to MongoDB)");
    console.log("  - Received message broadcast");
    console.log("  - Retrieved message history");
    socket.close();
    process.exit(0);
  } else {
    console.error("Test FAILED ✗");
    console.error("  gotMessage:", gotMessage);
    console.error("  gotHistory:", gotHistory);
    socket.close();
    process.exit(1);
  }
}

setTimeout(() => {
  console.error("Test timeout");
  process.exit(2);
}, 10000);

runTest().catch((err) => {
  console.error(err);
  process.exit(3);
});
