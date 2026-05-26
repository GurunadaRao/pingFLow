import dotenv from "dotenv";
import pool from "./pg";
import initRedis from "./redis";
import initCloudinary from "./cloudinary";
import connectMongoDB from "./mongoose";
import { env } from "../config/env";

dotenv.config();

export async function initializeSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(254) NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      avatar_s3_key TEXT,
      about_text VARCHAR(139),
      phone_number VARCHAR(20) UNIQUE,
      phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      account_status VARCHAR(20) NOT NULL DEFAULT 'pending_verification'
        CHECK (account_status IN ('pending_verification', 'active', 'suspended', 'deleted')),
      last_seen_at TIMESTAMPTZ,
      identity_public_key BYTEA,
      signed_prekey_id INTEGER,
      signed_prekey_pub BYTEA,
      signed_prekey_signature BYTEA,
      registration_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone_number) WHERE phone_number IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_active_status ON users (account_status) WHERE account_status = 'active';

    CREATE TABLE IF NOT EXISTS email_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      new_email VARCHAR(254) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ev_token ON email_verifications (token_hash) WHERE used_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ev_expires ON email_verifications (expires_at);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
      used_at TIMESTAMPTZ,
      ip_address INET,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens (token_hash) WHERE used_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens (user_id);
    CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens (expires_at);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      device_id VARCHAR(64),
      platform VARCHAR(10) CHECK (platform IN ('ios', 'android', 'web', 'desktop')),
      user_agent TEXT,
      ip_address INET,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
      revoked_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_rt_token ON refresh_tokens (token_hash) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_rt_expires ON refresh_tokens (expires_at);

    CREATE TABLE IF NOT EXISTS one_time_prekeys (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prekey_id INTEGER NOT NULL,
      public_key BYTEA NOT NULL,
      consumed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, prekey_id)
    );

    CREATE INDEX IF NOT EXISTS idx_otpk_user_unclaimed ON one_time_prekeys (user_id, consumed) WHERE consumed = FALSE;

    CREATE TABLE IF NOT EXISTS channels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel_type VARCHAR(10) NOT NULL CHECK (channel_type IN ('direct', 'group')),
      group_name VARCHAR(100),
      group_avatar_s3_key TEXT,
      group_description VARCHAR(512),
      group_invite_link VARCHAR(64) UNIQUE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_channels_type ON channels (channel_type);
    CREATE INDEX IF NOT EXISTS idx_channels_invite_link ON channels (group_invite_link) WHERE group_invite_link IS NOT NULL;

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      removed_by UUID REFERENCES users(id),
      is_muted BOOLEAN NOT NULL DEFAULT FALSE,
      muted_until TIMESTAMPTZ,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      last_read_message_id TEXT,
      last_read_at TIMESTAMPTZ,
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cm_user_active ON channel_members (user_id, joined_at DESC) WHERE left_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_cm_channel ON channel_members (channel_id) WHERE left_at IS NULL;

    CREATE TABLE IF NOT EXISTS blocked_users (
      blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE INDEX IF NOT EXISTS idx_blocked_by_user ON blocked_users (blocker_id);

    CREATE TABLE IF NOT EXISTS push_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform VARCHAR(10) NOT NULL CHECK (platform IN ('apns', 'fcm', 'web')),
      token TEXT NOT NULL,
      device_id VARCHAR(64),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, device_id)
    );

    CREATE INDEX IF NOT EXISTS idx_push_user ON push_tokens (user_id);
  `);
}

export async function initializeConnections() {
  console.log("Initializing database connections...");

  const results: Record<string, string> = {};

  await pool.query("SELECT 1");
  await initializeSchema();
  results.postgres = "connected";
  try {
    await connectMongoDB();
    results.mongodb = "connected";
  } catch (error) {
    results.mongodb = `error: ${String(error)}`;
  }

  try {
    const redis = initRedis();
    if (redis) {
      await redis.ping();
      results.redis = "connected (ioredis)";
    } else if (env.upstashRedisUrl && env.upstashRedisToken) {
      results.redis = "configured (Upstash REST API)";
    } else {
      results.redis = "not configured";
    }
  } catch (error) {
    results.redis = `error: ${String(error)}`;
  }

  try {
    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      initCloudinary();
      results.cloudinary = "configured";
    } else {
      results.cloudinary = "not configured";
    }
  } catch (error) {
    results.cloudinary = `error: ${String(error)}`;
  }

  console.log("Connection summary:", results);
  return results;
}

export default initializeConnections;
