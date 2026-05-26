#!/usr/bin/env node
const fs = require("fs");

const base = "http://localhost:4001/api/v1/auth";

(async () => {
  const timestamp = Date.now();
  const users = [
    {
      email: `test1+${timestamp}@example.com`,
      password: "Password123!",
      displayName: "Test User One",
    },
    {
      email: `test2+${timestamp}@example.com`,
      password: "Password123!",
      displayName: "Test User Two",
    },
  ];

  const results = [];

  for (const u of users) {
    console.log(`\nProcessing ${u.email}`);

    // Register (ignore errors if user exists)
    try {
      const res = await fetch(`${base}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: u.email,
          password: u.password,
          displayName: u.displayName,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        console.log(`Registered ${u.email}`);
      } else {
        console.log(
          `Register response for ${u.email}:`,
          json?.error || res.status,
        );
      }
    } catch (err) {
      console.error("Register request failed:", String(err));
    }

    // Login
    try {
      const res = await fetch(`${base}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, password: u.password }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        console.log(`Logged in ${u.email}`);
      } else {
        console.log(
          `Login response for ${u.email}:`,
          json?.error || res.status,
        );
      }
      results.push({
        email: u.email,
        password: u.password,
        displayName: u.displayName,
        auth: json,
      });
    } catch (err) {
      console.error("Login request failed:", String(err));
      results.push({
        email: u.email,
        password: u.password,
        displayName: u.displayName,
        auth: null,
        error: String(err),
      });
    }
  }

  const outPath = "apps/server/test-users.json";
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved results to ${outPath}`);
})();
