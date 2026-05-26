import { io, Socket } from "socket.io-client";
import axios from "axios";

const API_BASE = "http://localhost:4001/api/v1";

interface Tokens {
  accessToken: string;
  refreshToken: string;
  displayName: string;
  userId: string;
}

// Helper: register + login a test user
async function createTestUser(suffix: string): Promise<Tokens> {
  const email = `socket-test-${suffix}-${Date.now()}@example.com`;
  const password = "TestPass123!";
  const displayName = `SocketUser-${suffix}`;

  // Register
  const registerRes = await axios.post(`${API_BASE}/auth/register`, {
    email,
    password,
    displayName,
  });
  const userId = registerRes.data.user.id;

  // Login
  const loginRes = await axios.post(`${API_BASE}/auth/login`, {
    email,
    password,
    deviceId: `socket-device-${suffix}`,
    platform: "web",
  });

  const { accessToken, refreshToken } = loginRes.data;
  return { accessToken, refreshToken, displayName, userId };
}

// Helper: create a channel (owner = userA)
async function createChannel(accessToken: string) {
  const res = await axios.post(
    `${API_BASE}/channels`,
    {
      channelType: "group",
      name: "Test Group",
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.data.channel?.id ?? res.data.id;
}

(async () => {
  console.log("\n=== SOCKET INTEGRATION TEST ===\n");

  // 1️⃣ Create two users
  const userA = await createTestUser("A");
  const userB = await createTestUser("B");
  console.log(`✅ Created users A & B`);

  // 2️⃣ Create a group channel (owned by A) and add B as member
  const channelId = await createChannel(userA.accessToken);
  console.log(`✅ Created channel ${channelId}`);

  // Add B to the channel
  await axios.post(
    `${API_BASE}/channels/${channelId}/members`,
    { userId: userB.userId },
    { headers: { Authorization: `Bearer ${userA.accessToken}` } }
  );
  console.log(`✅ Added user B to channel`);

  // 3️⃣ Connect sockets
  const socketA = io("http://localhost:4001", {
    auth: { token: userA.accessToken },
  }) as Socket;
  const socketB = io("http://localhost:4001", {
    auth: { token: userB.accessToken },
  }) as Socket;

  const once = (sock: Socket, ev: string) =>
    new Promise<any>((resolve) => sock.once(ev, resolve));

  await Promise.all([once(socketA, "connect"), once(socketB, "connect")]);
  console.log(`✅ Both sockets connected`);

  // 4️⃣ Join the channel
  socketA.emit("join_channel", { channelId });
  socketB.emit("join_channel", { channelId });
  await new Promise((r) => setTimeout(r, 500));

  // 5️⃣ User A starts typing → User B should receive typing_update
  const typingPromise = once(socketB, "typing_update");
  socketA.emit("typing_start", { channelId });
  const typingPayload = await typingPromise;

  const expected = typingPayload.typing_users?.some(
    (u: any) => u.display_name === userA.displayName
  );

  if (expected) {
    console.log("✅ SOCKET TEST PASSED – typing_update received correctly");
    process.exit(0);
  } else {
    console.error("❌ SOCKET TEST FAILED – typing_update payload incorrect");
    console.error("Received:", typingPayload);
    process.exit(1);
  }
})();
