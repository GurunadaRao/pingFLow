import { randomUUID } from "node:crypto";

const baseUrl = process.env.API_BASE_URL || "http://localhost:4001/api/v1";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(
      data?.error || `Request failed with ${response.status}`,
    );
    error.response = { status: response.status, data };
    throw error;
  }

  return { data };
}

async function registerAndLogin(email, password, displayName) {
  try {
    await request(`/auth/register`, {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        displayName,
      }),
    });
  } catch (error) {
    if (error?.response?.status !== 400) {
      throw error;
    }
  }

  const loginResponse = await request(`/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      deviceId: "smoke-test-device",
      platform: "web",
    }),
  });

  return loginResponse.data;
}

async function main() {
  const password = "TestPass123!";
  const alice = await registerAndLogin(
    "smoke.alice@example.com",
    password,
    "Smoke Alice",
  );
  const bob = await registerAndLogin(
    "smoke.bob@example.com",
    password,
    "Smoke Bob",
  );

  const createChannelResponse = await request(`/channels`, {
    method: "POST",
    body: JSON.stringify({
      channelType: "direct",
      memberIds: [bob.user.id],
    }),
    headers: { Authorization: `Bearer ${alice.accessToken}` },
  });

  const channel = createChannelResponse.data.channel;

  const sendResponse = await request(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body: "hello from alice on the real server",
      clientMid: randomUUID(),
    }),
    headers: { Authorization: `Bearer ${alice.accessToken}` },
  });

  const messagesResponse = await request(`/channels/${channel.id}/messages`, {
    headers: { Authorization: `Bearer ${bob.accessToken}` },
  });

  console.log(
    JSON.stringify(
      {
        alice: { id: alice.user.id, accessToken: alice.accessToken },
        bob: { id: bob.user.id, accessToken: bob.accessToken },
        channelId: channel.id,
        createdChannel: channel,
        sendResponse: sendResponse.data,
        bobMessageCount: messagesResponse.data.messages.length,
        latestMessage: messagesResponse.data.messages.at(-1),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.response?.data || error);
  process.exit(1);
});
