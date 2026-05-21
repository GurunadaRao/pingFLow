import pool from "../lib/pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_s3_key?: string;
  about_text?: string;
  account_status: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

// ==========================================
// REGISTRATION
// ==========================================

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: User; verificationToken: string }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if user exists
    const existingUser = await client.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    if (existingUser.rows.length > 0) {
      throw new Error("Email already registered");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert user with pending_verification status
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, display_name, account_status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, avatar_s3_key, about_text, account_status, email_verified, created_at, updated_at`,
      [email, passwordHash, displayName, "pending_verification"],
    );

    const user = userResult.rows[0];

    // Generate verification token
    const verificationToken = generateToken();
    const tokenHash = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token hash
    await client.query(
      `INSERT INTO email_verifications (user_id, token_hash, new_email, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, tokenHash, email, expiresAt],
    );

    await client.query("COMMIT");

    return {
      user,
      verificationToken,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ==========================================
// EMAIL VERIFICATION
// ==========================================

export async function verifyEmail(token: string): Promise<User> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenHash = hashToken(token);

    // Find and validate token
    const tokenResult = await client.query(
      `SELECT user_id, new_email FROM email_verifications
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );

    if (tokenResult.rows.length === 0) {
      throw new Error("Invalid or expired verification token");
    }

    const { user_id, new_email } = tokenResult.rows[0];

    // Mark token as used
    await client.query(
      "UPDATE email_verifications SET used_at = NOW() WHERE token_hash = $1",
      [tokenHash],
    );

    // Update user
    const userResult = await client.query(
      `UPDATE users 
       SET email_verified = TRUE, account_status = 'active', email = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, display_name, avatar_s3_key, about_text, account_status, email_verified, created_at, updated_at`,
      [new_email, user_id],
    );

    await client.query("COMMIT");

    return userResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ==========================================
// LOGIN
// ==========================================

export async function loginUser(
  email: string,
  password: string,
  deviceId: string,
  platform: "ios" | "android" | "web" | "desktop",
  userAgent: string,
  ipAddress: string,
): Promise<{
  user: User;
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}> {
  // Fetch user by email
  const userResult = await pool.query(
    `SELECT id, password_hash, account_status, email_verified
     FROM users
     WHERE LOWER(email) = LOWER($1) AND account_status = 'active' AND email_verified = TRUE`,
    [email],
  );

  if (userResult.rows.length === 0) {
    throw new Error("Invalid email or password");
  }

  const userRow = userResult.rows[0];

  // Verify password
  const passwordValid = await bcrypt.compare(password, userRow.password_hash);

  if (!passwordValid) {
    throw new Error("Invalid email or password");
  }

  // Fetch full user data
  const fullUserResult = await pool.query(
    `SELECT id, email, display_name, avatar_s3_key, about_text, account_status, email_verified, created_at, updated_at
     FROM users WHERE id = $1`,
    [userRow.id],
  );

  const user = fullUserResult.rows[0];

  // Generate tokens
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, type: "access" },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" },
  );

  const refreshToken = generateToken();
  const refreshTokenHash = hashToken(refreshToken);
  const refreshTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Store refresh token
  const refreshTokenResult = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_id, platform, user_agent, ip_address, expires_at, last_used_at)
     VALUES ($1, $2, $3, $4, $5, $6::inet, $7, NOW())
     RETURNING id`,
    [
      user.id,
      refreshTokenHash,
      deviceId,
      platform,
      userAgent,
      ipAddress,
      refreshTokenExpires,
    ],
  );

  return {
    user,
    accessToken,
    refreshToken,
    refreshTokenId: refreshTokenResult.rows[0].id,
  };
}

// ==========================================
// REFRESH TOKEN
// ==========================================

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; user: User }> {
  const refreshTokenHash = hashToken(refreshToken);

  // Find valid refresh token
  const tokenResult = await pool.query(
    `SELECT user_id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [refreshTokenHash],
  );

  if (tokenResult.rows.length === 0) {
    throw new Error("Invalid or expired refresh token");
  }

  const userId = tokenResult.rows[0].user_id;

  // Update last_used_at
  await pool.query(
    "UPDATE refresh_tokens SET last_used_at = NOW() WHERE token_hash = $1",
    [refreshTokenHash],
  );

  // Fetch user
  const userResult = await pool.query(
    `SELECT id, email, display_name, avatar_s3_key, about_text, account_status, email_verified, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId],
  );

  const user = userResult.rows[0];

  // Generate new access token
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, type: "access" },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" },
  );

  return { accessToken, user };
}

// ==========================================
// LOGOUT / REVOKE TOKENS
// ==========================================

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const refreshTokenHash = hashToken(refreshToken);

  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1",
    [refreshTokenHash],
  );
}

export async function logoutAllDevices(userId: string): Promise<void> {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}

// ==========================================
// PASSWORD RESET
// ==========================================

export async function requestPasswordReset(email: string): Promise<string> {
  // Check if user exists
  const userResult = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
    [email],
  );

  if (userResult.rows.length === 0) {
    // Don't leak whether email exists
    return "";
  }

  const userId = userResult.rows[0].id;
  const resetToken = generateToken();
  const resetTokenHash = hashToken(resetToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, resetTokenHash, expiresAt],
  );

  return resetToken;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<User> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenHash = hashToken(token);

    // Find and validate token
    const tokenResult = await client.query(
      `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash],
    );

    if (tokenResult.rows.length === 0) {
      throw new Error("Invalid or expired password reset token");
    }

    const userId = tokenResult.rows[0].user_id;

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await client.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [passwordHash, userId],
    );

    // Mark token as used
    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1",
      [tokenHash],
    );

    // Revoke all refresh tokens
    await client.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );

    // Fetch updated user
    const userResult = await client.query(
      `SELECT id, email, display_name, avatar_s3_key, about_text, account_status, email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId],
    );

    await client.query("COMMIT");

    return userResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ==========================================
// GET USER
// ==========================================

export async function getUserById(userId: string): Promise<User | null> {
  const result = await pool.query(
    `SELECT id, email, display_name, avatar_s3_key, about_text, account_status, email_verified, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId],
  );

  return result.rows[0] || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query(
    `SELECT id, email, display_name, avatar_s3_key, about_text, account_status, email_verified, created_at, updated_at
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );

  return result.rows[0] || null;
}

// ==========================================
// VERIFY JWT
// ==========================================

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    return decoded;
  } catch (error) {
    throw new Error("Invalid access token");
  }
}
