const axios = require("axios");
const io = require("socket.io-client");
const crypto = require("crypto");

const API_BASE = process.env.API_BASE || "http://localhost:4001/api/v1";

async function apiRequest(path, method, data, token) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const config = { method, url: `${API_BASE}${path}`, headers };
    if (method.toLowerCase() === "get") config.params = data;
    else config.data = data;
    const res = await axios(config);
    return { status: res.status, data: res.data };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      return {
        status: err.response?.status,
        data: err.response?.data,
        error: err.message,
      };
    }
    throw err;
  }
}

async function createAndLogin(email) {
  try {
    await apiRequest("/auth/register", "post", {
      email,
      password: "TestPass123!",
      displayName: email.split("@")[0],
    });
  } catch (e) {
    // ignore registration errors (already exists)
  }

  const loginRes = await apiRequest("/auth/login", "post", {
    email,
    password: "TestPass123!",
  });
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error("Login failed", loginRes);
    process.exit(1);
  }
  return { userId: loginRes.data.user.id, token: loginRes.data.accessToken };
}

async function run() {
  console.log("Starting realtime two-user test against", API_BASE);
  const time = Date.now();
  const aEmail = `a-${time}@test.local`;
  const bEmail = `b-${time}@test.local`;

  const userA = await createAndLogin(aEmail);
  const userB = await createAndLogin(bEmail);

  console.log("Users created:", userA.userId, userB.userId);

  // create direct channel
  const channelRes = await apiRequest(
    "/channels",
    "post",
    { channelType: "direct", memberIds: [userB.userId] },
    userA.token,
  );
  if (channelRes.status !== 201) {
    console.error("Create channel failed", channelRes);
    process.exit(1);
  }
  const channelId = channelRes.data.channel.id;
  console.log("Created channel", channelId);

  // connect sockets
  const socketBase = API_BASE.replace(/\/api\/v1$/, "");
  const socketA = io(socketBase, {
    auth: { token: userA.token },
    transports: ["websocket"],
    reconnection: false,
  });
  const socketB = io(socketBase, {
    auth: { token: userB.token },
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

  console.log("Both sockets connected");

  socketA.emit("join_channel", { channelId });
  socketB.emit("join_channel", { channelId });

  // wait a moment for joins to process
  await new Promise((r) => setTimeout(r, 250));

  const testBody = "E2E realtime test " + crypto.randomUUID();

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

  // send via REST as userA
  const send = await apiRequest(
    `/channels/${channelId}/messages`,
    "post",
    { clientMid: crypto.randomUUID(), body: testBody },
    userA.token,
  );
  if (send.status !== 201) {
    console.error("Send failed", send);
    process.exit(1);
  }
  console.log("Send response:", send.data);

  const msg = await received;
  console.log("Socket B received message:", msg._mid || msg);

  // verify persistence via fetch
  const list = await apiRequest(
    `/channels/${channelId}/messages`,
    "get",
    { limit: 20 },
    userB.token,
  );
  if (list.status !== 200) {
    console.error("List messages failed", list);
    process.exit(1);
  }
  const found = list.data.messages.find((m) => m.body === testBody);
  if (!found) {
    console.error("Message not found in persisted history. list:", list);
    process.exit(1);
  }

  console.log("Persistence check passed. message seq:", found.seq);

  socketA.close();
  socketB.close();
  console.log("TEST PASSED");
  process.exit(0);
}

run().catch((err) => {
  console.error("TEST FAILED", err && err.message ? err.message : err);
  process.exit(1);
});
