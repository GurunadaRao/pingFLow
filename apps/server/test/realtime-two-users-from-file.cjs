const fs = require("fs");
const path = require("path");
const axios = require("axios");
const io = require("socket.io-client");
const crypto = require("crypto");

const API_BASE = process.env.API_BASE || "http://localhost:4001/api/v1";

function readTestUsers() {
  const p = path.join(__dirname, "test-users.json");
  if (!fs.existsSync(p))
    throw new Error("test-users.json not found; run create_test_users first");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function apiRequest(pathUrl, method, data, token) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const config = { method, url: `${API_BASE}${pathUrl}`, headers };
    if (method.toLowerCase() === "get") config.params = data;
    else config.data = data;
    const res = await axios(config);
    return { status: res.status, data: res.data };
  } catch (err) {
    if (err.response)
      return {
        status: err.response.status,
        data: err.response.data,
        error: err.message,
      };
    throw err;
  }
}

async function run() {
  const users = readTestUsers();
  if (!Array.isArray(users) || users.length < 2) {
    console.error("Need at least two users in test-users.json");
    process.exit(1);
  }

  const userA = users[0];
  const userB = users[1];
  const tokenA = userA.auth.accessToken;
  const tokenB = userB.auth.accessToken;
  const userBId = userB.auth.user.id;

  console.log("Creating direct channel (A -> B)");
  const create = await apiRequest(
    "/channels",
    "post",
    { channelType: "direct", memberIds: [userBId] },
    tokenA,
  );
  if (create.status !== 201) {
    console.error("Failed to create channel", create);
    process.exit(1);
  }
  const channelId = create.data.channel.id;
  console.log("Channel created", channelId);

  const socketBase = API_BASE.replace(/\/api\/v1$/, "");
  const socketA = io(socketBase, {
    auth: { token: tokenA },
    transports: ["websocket"],
    reconnection: false,
  });
  const socketB = io(socketBase, {
    auth: { token: tokenB },
    transports: ["websocket"],
    reconnection: false,
  });

  await new Promise((resolve, reject) => {
    let ready = 0;
    const ok = () => {
      if (++ready === 2) resolve();
    };
    socketA.on("connect", ok);
    socketB.on("connect", ok);
    socketA.on("connect_error", (e) => reject(e));
    socketB.on("connect_error", (e) => reject(e));
    setTimeout(() => reject(new Error("socket connect timeout")), 8000);
  });

  socketA.emit("join_channel", { channelId });
  socketB.emit("join_channel", { channelId });

  await new Promise((r) => setTimeout(r, 200));

  const testBody = "E2E-" + crypto.randomUUID();

  const received = new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("did not receive message.created within timeout")),
      8000,
    );
    socketB.on("message.created", (payload) => {
      if (payload && payload.message && payload.message.body === testBody) {
        clearTimeout(t);
        resolve(payload.message);
      }
    });
  });

  console.log("Sending message via REST as userA");
  const send = await apiRequest(
    `/channels/${channelId}/messages`,
    "post",
    { clientMid: crypto.randomUUID(), body: testBody },
    tokenA,
  );
  if (send.status !== 201) {
    console.error("Send failed", send);
    process.exit(1);
  }

  const msg = await received;
  console.log("Socket B received message", msg._mid || msg.seq);

  socketA.close();
  socketB.close();
  console.log("Integration test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error("Test failed", err && err.message ? err.message : err);
  process.exit(1);
});
