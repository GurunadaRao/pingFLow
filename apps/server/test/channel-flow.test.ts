import axios from "axios";
import pool from "../src/lib/pg";
import connectMongoDB from "../src/lib/mongoose";
import { MessageBucket } from "../src/models/message-bucket.model";
import { SequenceService } from "../src/services/sequence.service";
import crypto from "crypto";

const API_BASE = "http://localhost:4000/api/v1";

interface TestResult {
  suite: string;
  testName: string;
  status: "✅ PASS" | "❌ FAIL";
  message: string;
}

const results: TestResult[] = [];

// Helper function to make authenticated requests
async function apiRequest(
  url: string,
  method: string,
  data?: unknown,
  token?: string
) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await axios({
      method,
      url: `${API_BASE}${url}`,
      data,
      headers,
    });
    return { status: response.status, data: response.data };
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      return {
        status: error.response?.status,
        data: error.response?.data,
        error: error.message,
      };
    }
    throw error;
  }
}

// Utility to create a verified active user
async function createVerifiedUser(email: string) {
  const registerRes = await apiRequest("/auth/register", "POST", {
    email,
    password: "Password123!",
    displayName: `Test User ${email.split("@")[0]}`,
  });

  if (registerRes.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(registerRes.data)}`);
  }

  const token = registerRes.data.verificationToken;
  const verifyRes = await apiRequest("/auth/verify-email", "POST", { token });
  if (verifyRes.status !== 200) {
    throw new Error(`Verification failed: ${JSON.stringify(verifyRes.data)}`);
  }

  const loginRes = await apiRequest("/auth/login", "POST", {
    email,
    password: "Password123!",
  });

  return {
    userId: loginRes.data.user.id,
    token: loginRes.data.accessToken,
  };
}

async function runTests() {
  console.log("🚀 STARTING SPRINT 2 INTEGRATION TESTS");
  
  // Connect MongoDB for model test assertions
  await connectMongoDB();

  const timeSuffix = Date.now();
  const userAEmail = `usera-${timeSuffix}@test.com`;
  const userBEmail = `userb-${timeSuffix}@test.com`;

  let userA: { userId: string; token: string };
  let userB: { userId: string; token: string };

  // ==========================================
  // SUITE 1: AUTHENTICATION PREPARATION
  // ==========================================
  try {
    userA = await createVerifiedUser(userAEmail);
    userB = await createVerifiedUser(userBEmail);
    results.push({
      suite: "Auth Prep",
      testName: "Create test users A and B",
      status: "✅ PASS",
      message: "Verified users registered and logged in successfully",
    });
  } catch (e: any) {
    results.push({
      suite: "Auth Prep",
      testName: "Create test users A and B",
      status: "❌ FAIL",
      message: e.message,
    });
    printSummary();
    process.exit(1);
  }

  // ==========================================
  // SUITE 2: CHANNELS & MEMBERSHIPS (PG & REDIS)
  // ==========================================
  let groupChannelId = "";
  let directChannelId = "";

  // Test 2.1: Create Direct Channel
  try {
    const res = await apiRequest(
      "/channels",
      "POST",
      {
        channelType: "direct",
        memberIds: [userB.userId],
      },
      userA.token
    );

    if (res.status === 201) {
      directChannelId = res.data.channel.id;
      results.push({
        suite: "Channels",
        testName: "Create Direct Channel",
        status: "✅ PASS",
        message: `Direct channel created: ${directChannelId}`,
      });
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (e: any) {
    results.push({
      suite: "Channels",
      testName: "Create Direct Channel",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  // Test 2.2: Try duplicate Direct Channel creation (should return existing channel)
  try {
    const res = await apiRequest(
      "/channels",
      "POST",
      {
        channelType: "direct",
        memberIds: [userB.userId],
      },
      userA.token
    );

    if (res.status === 200 && res.data.isExisting && res.data.channel.id === directChannelId) {
      results.push({
        suite: "Channels",
        testName: "De-duplicate Direct Channel",
        status: "✅ PASS",
        message: "Successfully detected duplicate and returned existing channel ID",
      });
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (e: any) {
    results.push({
      suite: "Channels",
      testName: "De-duplicate Direct Channel",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  // Test 2.3: Create Group Channel
  try {
    const res = await apiRequest(
      "/channels",
      "POST",
      {
        channelType: "group",
        groupName: "Dev Team Chat",
        groupDescription: "VibeChat Developers Chatroom",
        memberIds: [], // Empty member addition at start, only creator
      },
      userA.token
    );

    if (res.status === 201) {
      groupChannelId = res.data.channel.id;
      results.push({
        suite: "Channels",
        testName: "Create Group Channel",
        status: "✅ PASS",
        message: `Group channel created: ${groupChannelId}`,
      });
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (e: any) {
    results.push({
      suite: "Channels",
      testName: "Create Group Channel",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  // Test 2.4: Fetch User Channels (verifying Redis unread counts logic integration)
  try {
    const res = await apiRequest("/channels", "GET", undefined, userA.token);
    if (res.status === 200 && Array.isArray(res.data.channels)) {
      const groupChan = res.data.channels.find((c: any) => c.id === groupChannelId);
      const directChan = res.data.channels.find((c: any) => c.id === directChannelId);

      if (groupChan && directChan && groupChan.unreadCount === 0) {
        results.push({
          suite: "Channels",
          testName: "List User Channels with Unreads",
          status: "✅ PASS",
          message: `Retrieved active channels with unread properties successfully`,
        });
      } else {
        throw new Error("Missing active channels or unread parameters in payload");
      }
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (e: any) {
    results.push({
      suite: "Channels",
      testName: "List User Channels with Unreads",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  // Test 2.5: Add member to channel
  try {
    const res = await apiRequest(
      `/channels/${groupChannelId}/members`,
      "POST",
      { userId: userB.userId },
      userA.token
    );

    if (res.status === 200) {
      results.push({
        suite: "Memberships",
        testName: "Add Channel Member",
        status: "✅ PASS",
        message: "Successfully added user B to the group channel",
      });
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (e: any) {
    results.push({
      suite: "Memberships",
      testName: "Add Channel Member",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  // Test 2.6: Remove member from channel
  try {
    const res = await apiRequest(
      `/channels/${groupChannelId}/members/${userB.userId}`,
      "DELETE",
      undefined,
      userA.token
    );

    if (res.status === 200) {
      results.push({
        suite: "Memberships",
        testName: "Remove Channel Member",
        status: "✅ PASS",
        message: "Successfully removed user B from the group channel",
      });
    } else {
      throw new Error(`Status: ${res.status}`);
    }
  } catch (e: any) {
    results.push({
      suite: "Memberships",
      testName: "Remove Channel Member",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  // ==========================================
  // SUITE 3: MONGOOSE MESSAGE BUCKET PERSISTENCE
  // ==========================================
  try {
    // Clean potential old test bucket data
    await MessageBucket.deleteMany({ channelId: groupChannelId });

    // Design nested message
    const messagePayload = {
      _mid: crypto.randomUUID(),
      seq: 1,
      senderId: userA.userId,
      body: "Hello Scaled World!",
      sentAt: new Date(),
    };

    // Insert into Mongoose MessageBucket model
    const bucket = new MessageBucket({
      channelId: groupChannelId,
      seqMin: 1,
      seqMax: 1,
      messageCount: 1,
      messages: [messagePayload],
    });

    await bucket.save();

    const savedBucket = await MessageBucket.findOne({ channelId: groupChannelId });
    if (savedBucket && savedBucket.messages.length === 1 && savedBucket.messages[0].body === "Hello Scaled World!") {
      results.push({
        suite: "MongoDB Model",
        testName: "Save Message Bucket",
        status: "✅ PASS",
        message: "Monolithic bucket document saved and asserted cleanly",
      });
    } else {
      throw new Error("Document save validation error");
    }
  } catch (e: any) {
    results.push({
      suite: "MongoDB Model",
      testName: "Save Message Bucket",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  // ==========================================
  // SUITE 4: REDIS CONCURRENCY & Monotonic Sequence Numbering
  // ==========================================
  try {
    const parallelChannelId = crypto.randomUUID();
    const concurrentRequestsCount = 8;
    const promises: Promise<number>[] = [];

    // Trigger multiple parallel requests to SequenceService
    for (let i = 0; i < concurrentRequestsCount; i++) {
      promises.push(SequenceService.getNextSequence(parallelChannelId));
    }

    const assignedSequences = await Promise.all(promises);

    // Assert sequence order is distinct and sequential (no gaps)
    const sorted = [...assignedSequences].sort((a, b) => a - b);
    const hasDuplicates = new Set(sorted).size !== sorted.length;
    const isMonotonic = sorted[0] === 1 && sorted[concurrentRequestsCount - 1] === concurrentRequestsCount;

    if (!hasDuplicates && isMonotonic) {
      results.push({
        suite: "Redis Concurrency",
        testName: "Atomic Sequence Locking",
        status: "✅ PASS",
        message: `Generated concurrent sequences without gaps or duplicates: [${sorted.join(", ")}]`,
      });
    } else {
      throw new Error(`Duplicates/Gap detected: [${sorted.join(", ")}]`);
    }
  } catch (e: any) {
    results.push({
      suite: "Redis Concurrency",
      testName: "Atomic Sequence Locking",
      status: "❌ FAIL",
      message: e.message,
    });
  }

  printSummary();
}

function printSummary() {
  console.log("\n==================================================");
  console.log("             SPRINT 2 SUMMARY OF RESULTS");
  console.log("==================================================");
  
  let passes = 0;
  let fails = 0;

  results.forEach((r) => {
    console.log(`[${r.suite}] ${r.testName}: ${r.status}`);
    if (r.status === "❌ FAIL") {
      console.log(`   └─ Error: ${r.message}`);
      fails++;
    } else {
      passes++;
    }
  });

  console.log("==================================================");
  console.log(`📊 TOTAL ASSERTS: ${results.length} | Pass: ${passes} | Fail: ${fails}`);
  console.log("==================================================");

  // Close PostgreSQL connection pools so script terminates cleanly
  pool.end();
  process.exit(fails > 0 ? 1 : 0);
}

runTests();
