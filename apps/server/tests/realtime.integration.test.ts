import fs from "fs";
import path from "path";
import axios from "axios";
import { io as ioClient, Socket } from "socket.io-client";

const API_BASE = process.env.API_BASE || "http://localhost:4001/api/v1";
const API_ORIGIN = API_BASE.replace(/\/api.*$/, "");

jest.setTimeout(20000);

function readTestUsers() {
  const p = path.join(__dirname, "../test-users.json");
  if (!fs.existsSync(p))
    throw new Error("test-users.json not found; run create_test_users first");
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 2)
    throw new Error("need at least two test users in test-users.json");
  return parsed;
}

async function apiRequest(
  pathUrl: string,
  method: string,
  data?: any,
  token?: string,
) {
  const url = `${API_BASE}${pathUrl}`;
  try {
    const res = await axios({
      method,
      url,
      data,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return res;
  } catch (err: any) {
    if (err.response) return err.response;
    throw err;
  }
}

describe("realtime integration: REST -> Socket.IO broadcast", () => {
  let users: any[];
  beforeAll(() => {
    users = readTestUsers();
  });

  test("creates channel, connects two sockets, REST send triggers message.created for both", async () => {
    const userA = users[0];
    const userB = users[1];
    const tokenA = userA.auth.accessToken;
    const tokenB = userB.auth.accessToken;
    const userAId = userA.auth.user.id;
    const userBId = userB.auth.user.id;

    // 1) create a direct channel with B as member
    const createRes = await apiRequest(
      "/channels",
      "post",
      { channelType: "direct", memberIds: [userBId] },
      tokenA,
    );
    expect(createRes.status).toBe(201);
    const channelId = createRes.data.channel.id;
    expect(channelId).toBeTruthy();

    // 2) connect two sockets
    const socketA: Socket = ioClient(API_ORIGIN, {
      auth: { token: tokenA },
      transports: ["websocket"],
      reconnection: false,
    });
    const socketB: Socket = ioClient(API_ORIGIN, {
      auth: { token: tokenB },
      transports: ["websocket"],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      let ready = 0;
      const onReady = () => {
        ready += 1;
        if (ready === 2) resolve();
      };
      socketA.on("connect", onReady);
      socketB.on("connect", onReady);
      socketA.on("connect_error", (e) => reject(e));
      socketB.on("connect_error", (e) => reject(e));
      setTimeout(() => reject(new Error("socket connect timeout")), 8000);
    });

    // join channel rooms
    socketA.emit("join_channel", { channelId });
    socketB.emit("join_channel", { channelId });

    // 3) prepare promises to capture message.created on both sockets
    const testBody = `integration-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const recvA = new Promise<any>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("socket A did not receive message.created")),
        8000,
      );
      const handler = (payload: any) => {
        try {
          if (payload && payload.message && payload.message.body === testBody) {
            clearTimeout(t);
            socketA.off("message.created", handler);
            resolve(payload.message);
          }
        } catch (e) {
          // ignore
        }
      };
      socketA.on("message.created", handler);
    });

    const recvB = new Promise<any>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("socket B did not receive message.created")),
        8000,
      );
      const handler = (payload: any) => {
        try {
          if (payload && payload.message && payload.message.body === testBody) {
            clearTimeout(t);
            socketB.off("message.created", handler);
            resolve(payload.message);
          }
        } catch (e) {
          // ignore
        }
      };
      socketB.on("message.created", handler);
    });

    // 4) send message via REST as userA
    const sendRes = await apiRequest(
      `/channels/${channelId}/messages`,
      "post",
      { clientMid: `cm-${Date.now()}`, body: testBody },
      tokenA,
    );
    expect(sendRes.status === 201 || sendRes.status === 200).toBeTruthy();

    // 5) await both receives
    const [msgA, msgB] = await Promise.all([recvA, recvB]);
    expect(msgA.body).toBe(testBody);
    expect(msgB.body).toBe(testBody);

    // clean up
    socketA.close();
    socketB.close();
  });
});
