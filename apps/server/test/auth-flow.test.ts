import axios, { AxiosError } from "axios";

const API_BASE = "http://localhost:4000/api/v1/auth";

interface TestResult {
  endpoint: string;
  method: string;
  status: "✅ PASS" | "❌ FAIL";
  message: string;
  data?: unknown;
}

const results: TestResult[] = [];

// Helper function to make API calls
async function apiCall(
  endpoint: string,
  method: string,
  data?: unknown,
  headers?: Record<string, string>,
) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      data,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };
    const response = await axios(config);
    return { status: response.status, data: response.data };
  } catch (error) {
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

// Test data
let testUser = {
  email: `test-${Date.now()}@example.com`,
  password: "TestPassword123!",
  displayName: "Test User",
};

let authTokens = {
  accessToken: "",
  refreshToken: "",
};

let verificationToken = "";
let passwordResetToken = "";

// ==================================================
// TEST 1: REGISTER
// ==================================================
async function testRegister() {
  console.log("\n🔑 TEST 1: REGISTER");
  try {
    const response = await apiCall("/register", "POST", {
      email: testUser.email,
      password: testUser.password,
      displayName: testUser.displayName,
    });

    if (response.status === 201 && response.data.verificationToken) {
      verificationToken = response.data.verificationToken;
      results.push({
        endpoint: "/register",
        method: "POST",
        status: "✅ PASS",
        message: `User registered: ${testUser.email}`,
        data: {
          user: response.data.user,
          hasVerificationToken: !!verificationToken,
        },
      });
      console.log("✅ Registration successful");
      console.log(`   User ID: ${response.data.user.id}`);
      console.log(`   Email: ${response.data.user.email}`);
      console.log(`   Status: ${response.data.user.account_status}`);
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/register",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Registration failed:", error);
  }
}

// ==================================================
// TEST 2: VERIFY EMAIL
// ==================================================
async function testVerifyEmail() {
  console.log("\n📧 TEST 2: VERIFY EMAIL");
  try {
    const response = await apiCall("/verify-email", "POST", {
      token: verificationToken,
    });

    if (response.status === 200 && response.data.user.email_verified === true) {
      results.push({
        endpoint: "/verify-email",
        method: "POST",
        status: "✅ PASS",
        message: "Email verified successfully",
        data: {
          user: response.data.user,
          emailVerified: response.data.user.email_verified,
        },
      });
      console.log("✅ Email verification successful");
      console.log(`   Account Status: ${response.data.user.account_status}`);
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/verify-email",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Email verification failed:", error);
  }
}

// ==================================================
// TEST 3: LOGIN
// ==================================================
async function testLogin() {
  console.log("\n🔐 TEST 3: LOGIN");
  try {
    const response = await apiCall("/login", "POST", {
      email: testUser.email,
      password: testUser.password,
      deviceId: "test-device-1",
      platform: "web",
    });

    if (
      response.status === 200 &&
      response.data.accessToken &&
      response.data.refreshToken
    ) {
      authTokens.accessToken = response.data.accessToken;
      authTokens.refreshToken = response.data.refreshToken;
      results.push({
        endpoint: "/login",
        method: "POST",
        status: "✅ PASS",
        message: "Login successful",
        data: {
          user: response.data.user,
          hasAccessToken: !!authTokens.accessToken,
          hasRefreshToken: !!authTokens.refreshToken,
        },
      });
      console.log("✅ Login successful");
      console.log(`   Access Token: ${authTokens.accessToken.slice(0, 20)}...`);
      console.log(
        `   Refresh Token: ${authTokens.refreshToken.slice(0, 20)}...`,
      );
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/login",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Login failed:", error);
  }
}

// ==================================================
// TEST 4: GET PROFILE (Protected)
// ==================================================
async function testGetProfile() {
  console.log("\n👤 TEST 4: GET PROFILE (Protected)");
  try {
    if (!authTokens.accessToken) {
      throw new Error("No access token available");
    }

    const response = await apiCall("/profile", "GET", undefined, {
      Authorization: `Bearer ${authTokens.accessToken}`,
    });

    if (response.status === 200 && response.data.user) {
      results.push({
        endpoint: "/profile",
        method: "GET",
        status: "✅ PASS",
        message: "Profile retrieved successfully",
        data: response.data.user,
      });
      console.log("✅ Profile retrieved successfully");
      console.log(`   User: ${response.data.user.display_name}`);
      console.log(`   Email: ${response.data.user.email}`);
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/profile",
      method: "GET",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Profile retrieval failed:", error);
  }
}

// ==================================================
// TEST 5: REFRESH TOKEN
// ==================================================
async function testRefreshToken() {
  console.log("\n🔄 TEST 5: REFRESH TOKEN");
  try {
    if (!authTokens.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await apiCall("/refresh", "POST", {
      refreshToken: authTokens.refreshToken,
    });

    if (response.status === 200 && response.data.accessToken) {
      const newAccessToken = response.data.accessToken;
      results.push({
        endpoint: "/refresh",
        method: "POST",
        status: "✅ PASS",
        message: "Access token refreshed successfully",
        data: {
          hasNewAccessToken: !!newAccessToken,
          user: response.data.user,
        },
      });
      console.log("✅ Token refresh successful");
      console.log(`   New Access Token: ${newAccessToken.slice(0, 20)}...`);
      authTokens.accessToken = newAccessToken;
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/refresh",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Token refresh failed:", error);
  }
}

// ==================================================
// TEST 6: FORGOT PASSWORD
// ==================================================
async function testForgotPassword() {
  console.log("\n🔑 TEST 6: FORGOT PASSWORD");
  try {
    const response = await apiCall("/forgot-password", "POST", {
      email: testUser.email,
    });

    if (response.status === 200) {
      // For testing, we might get the token back
      if (response.data.resetToken) {
        passwordResetToken = response.data.resetToken;
      }
      results.push({
        endpoint: "/forgot-password",
        method: "POST",
        status: "✅ PASS",
        message: "Password reset requested",
        data: { hasResetToken: !!passwordResetToken },
      });
      console.log("✅ Password reset request sent");
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/forgot-password",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Forgot password failed:", error);
  }
}

// ==================================================
// TEST 7: RESET PASSWORD
// ==================================================
async function testResetPassword() {
  console.log("\n🔐 TEST 7: RESET PASSWORD");
  try {
    if (!passwordResetToken) {
      console.log(
        "⏭️  Skipping reset password test (no reset token available)",
      );
      return;
    }

    const newPassword = "NewPassword456!";
    const response = await apiCall("/reset-password", "POST", {
      token: passwordResetToken,
      newPassword: newPassword,
    });

    if (response.status === 200 && response.data.user) {
      results.push({
        endpoint: "/reset-password",
        method: "POST",
        status: "✅ PASS",
        message: "Password reset successfully",
        data: response.data.user,
      });
      console.log("✅ Password reset successful");
      testUser.password = newPassword;
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/reset-password",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Password reset failed:", error);
  }
}

// ==================================================
// TEST 8: LOGOUT
// ==================================================
async function testLogout() {
  console.log("\n🚪 TEST 8: LOGOUT");
  try {
    if (!authTokens.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await apiCall(
      "/logout",
      "POST",
      { refreshToken: authTokens.refreshToken },
      {
        Authorization: `Bearer ${authTokens.accessToken}`,
      },
    );

    if (response.status === 200) {
      results.push({
        endpoint: "/logout",
        method: "POST",
        status: "✅ PASS",
        message: "Logout successful",
        data: response.data,
      });
      console.log("✅ Logout successful");
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/logout",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Logout failed:", error);
  }
}

// ==================================================
// TEST 9: LOGIN AGAIN FOR LOGOUT ALL DEVICES
// ==================================================
async function testLoginAgain() {
  console.log("\n🔐 TEST 9: LOGIN AGAIN (for logout all devices test)");
  try {
    const response = await apiCall("/login", "POST", {
      email: testUser.email,
      password: testUser.password,
      deviceId: "test-device-2",
      platform: "web",
    });

    if (response.status === 200 && response.data.accessToken) {
      authTokens.accessToken = response.data.accessToken;
      authTokens.refreshToken = response.data.refreshToken;
      console.log("✅ Re-login successful");
    } else {
      throw new Error("Re-login failed");
    }
  } catch (error) {
    console.error("❌ Re-login failed:", error);
  }
}

// ==================================================
// TEST 10: LOGOUT ALL DEVICES
// ==================================================
async function testLogoutAllDevices() {
  console.log("\n🚪 TEST 10: LOGOUT ALL DEVICES");
  try {
    if (!authTokens.accessToken) {
      throw new Error("No access token available");
    }

    const response = await apiCall(
      "/logout-all-devices",
      "POST",
      {},
      {
        Authorization: `Bearer ${authTokens.accessToken}`,
      },
    );

    if (response.status === 200) {
      results.push({
        endpoint: "/logout-all-devices",
        method: "POST",
        status: "✅ PASS",
        message: "Logged out from all devices",
        data: response.data,
      });
      console.log("✅ Logout from all devices successful");
    } else {
      throw new Error(
        `Unexpected response: ${response.status} - ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    results.push({
      endpoint: "/logout-all-devices",
      method: "POST",
      status: "❌ FAIL",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error("❌ Logout all devices failed:", error);
  }
}

// ==================================================
// RUN ALL TESTS
// ==================================================
async function runAllTests() {
  console.log("=".repeat(60));
  console.log("🧪 AUTH FLOW TEST SUITE");
  console.log("=".repeat(60));

  await testRegister();
  await testVerifyEmail();
  await testLogin();
  await testGetProfile();
  await testRefreshToken();
  await testForgotPassword();
  await testResetPassword();
  await testLogout();
  await testLoginAgain();
  await testLogoutAllDevices();

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.status === "✅ PASS").length;
  const failed = results.filter((r) => r.status === "❌ FAIL").length;

  results.forEach((result) => {
    console.log(`\n${result.status} ${result.endpoint} (${result.method})`);
    console.log(`   ${result.message}`);
    if (result.data) {
      console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
    }
  });

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

// Start tests
runAllTests().catch(console.error);
