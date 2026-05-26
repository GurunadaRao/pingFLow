# Polyglot Persistence Schema: Production-Grade Messaging Platform

### WhatsApp-Inspired Architecture across PostgreSQL · MongoDB · Redis · S3

---

## Architecture Overview

```

┌──────────────────────────────────────────────────────────────────────────┐
│                     APPLICATION / API GATEWAY LAYER                      │
└────────────┬──────────────┬──────────────────┬──────────────────────────┘
             │              │                  │                  │
     ┌───────▼──────┐ ┌─────▼─────┐  ┌────────▼────────┐  ┌─────▼──────┐
     │  PostgreSQL  │ │  MongoDB  │  │      Redis       │  │   S3/CDN   │
     │  Relational  │ │  Document │  │  Ephemeral Cache │  │   Object   │
     │   Metadata   │ │  History  │  │   + Pub/Sub      │  │  Storage   │
     └──────────────┘ └───────────┘  └──────────────────┘  └────────────┘
     Users, Auth,     Chat buckets,  Online status,         Media files,
     Groups, ACL,     Reactions,     Unread counters,       Thumbnails,
     E2EE keys        Threads        Typing, Sessions       Voice notes
```

---

## Design Principles

| Concern                           | Decision                                                                    | Rationale                                                            |
| --------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Write amplification in groups** | Delivery/read receipts stored as per-member sub-documents, not fan-out rows | Avoids N INSERT ops per group message; single atomic MongoDB update  |
| **Hot path latency**              | Redis is the first-read layer for all ephemeral state                       | Avoids cold DB reads for online status, unread counts                |
| **Document growth**               | MongoDB Bucket Pattern (50–100 msgs/doc)                                    | Prevents per-message document overhead; amortises index cost         |
| **Media URLs**                    | S3 keys embedded in MongoDB message payload                                 | Keeps message and media metadata co-located; no JOIN required        |
| **E2EE readiness**                | Identity + pre-key tables in PostgreSQL                                     | Signal Protocol pre-key bundle fits naturally in relational ACL tier |

---

## Tier 1: PostgreSQL — Relational Metadata

### Design Notes

PostgreSQL owns **identity, access control, and group topology** — the source of truth for anything that requires ACID transactions or complex JOIN queries. Message payloads never land here; only the metadata required to authorise access and render the UI shell.

---

### DDL: `users`

> **Auth model:** Email is the primary login credential. Password is hashed with bcrypt (cost ≥ 12). Phone number is optional — stored for contact discovery if the user chooses to add it, but never required. Email must be verified before the account is active.

```sql
CREATE TABLE users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ── Primary login credential ──────────────────────────────────────
    email           VARCHAR(254)    NOT NULL UNIQUE,    -- RFC 5321 max length
    email_verified  BOOLEAN         NOT NULL DEFAULT FALSE,
    password_hash   TEXT            NOT NULL,           -- bcrypt, cost ≥ 12

    -- ── Profile ───────────────────────────────────────────────────────
    display_name    VARCHAR(100)    NOT NULL,
    avatar_s3_key   TEXT,
    about_text      VARCHAR(139),

    -- ── Optional phone (contact discovery only, not used for login) ───
    phone_number    VARCHAR(20)     UNIQUE,             -- nullable
    phone_verified  BOOLEAN         NOT NULL DEFAULT FALSE,

    -- ── Account lifecycle ─────────────────────────────────────────────
    account_status  VARCHAR(20)     NOT NULL DEFAULT 'pending_verification'
                        CHECK (account_status IN (
                            'pending_verification', -- registered, email not yet verified
                            'active',
                            'suspended',
                            'deleted'
                        )),
    last_seen_at    TIMESTAMPTZ,

    -- ── E2EE: Signal Protocol identity layer ──────────────────────────
    identity_public_key     BYTEA,              -- IK_pub (curve25519)
    signed_prekey_id        INTEGER,
    signed_prekey_pub       BYTEA,
    signed_prekey_signature BYTEA,
    registration_id         INTEGER,            -- Signal registration ID

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Login lookup (hot path — every request)
CREATE UNIQUE INDEX idx_users_email         ON users (LOWER(email));

-- Contact discovery by phone (optional feature)
CREATE INDEX        idx_users_phone         ON users (phone_number)
    WHERE phone_number IS NOT NULL;

-- Only index active accounts for presence / search queries
CREATE INDEX        idx_users_active_status ON users (account_status)
    WHERE account_status = 'active';
```

---

### DDL: `email_verifications`

```sql
-- Stores one-time tokens sent to the user's inbox on registration
-- and whenever they change their email address.
CREATE TABLE email_verifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,    -- SHA-256 of the raw token (never store raw)
    new_email   VARCHAR(254) NOT NULL,          -- the email being verified
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    used_at     TIMESTAMPTZ,                    -- null = not yet consumed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup by token hash on verification click
CREATE INDEX idx_ev_token   ON email_verifications (token_hash) WHERE used_at IS NULL;
-- Cleanup job: delete expired/used tokens
CREATE INDEX idx_ev_expires ON email_verifications (expires_at);
```

---

### DDL: `password_reset_tokens`

```sql
-- "Forgot password" flow. Token is emailed; on use it is consumed immediately.
CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,    -- SHA-256 of the raw token
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    used_at     TIMESTAMPTZ,
    ip_address  INET,                           -- audit trail
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prt_token   ON password_reset_tokens (token_hash) WHERE used_at IS NULL;
CREATE INDEX idx_prt_user    ON password_reset_tokens (user_id);
CREATE INDEX idx_prt_expires ON password_reset_tokens (expires_at);
```

---

### DDL: `refresh_tokens`

```sql
-- Long-lived JWT refresh tokens stored server-side for revocation support.
-- Access tokens (short-lived, 15 min) are stateless JWTs — not stored here.
CREATE TABLE refresh_tokens (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT        NOT NULL UNIQUE,    -- SHA-256 of the raw refresh token
    device_id       VARCHAR(64),                    -- client-generated fingerprint
    platform        VARCHAR(10) CHECK (platform IN ('ios', 'android', 'web', 'desktop')),
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    revoked_at      TIMESTAMPTZ,                    -- null = still valid
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token validation (every protected API request that needs refresh)
CREATE INDEX idx_rt_token      ON refresh_tokens (token_hash) WHERE revoked_at IS NULL;
-- "Log out all devices" for a user
CREATE INDEX idx_rt_user       ON refresh_tokens (user_id)    WHERE revoked_at IS NULL;
-- Cleanup job
CREATE INDEX idx_rt_expires    ON refresh_tokens (expires_at);
```

---

### DDL: `one_time_prekeys` (Signal Protocol)

```sql
-- One-time pre-keys (OPKs) consumed on session establishment.
-- Each row is a single ephemeral key. Server pops one per new session.
CREATE TABLE one_time_prekeys (
    id          BIGSERIAL       PRIMARY KEY,
    user_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prekey_id   INTEGER         NOT NULL,
    public_key  BYTEA           NOT NULL,
    consumed    BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, prekey_id)
);

-- Index for key server: fetch unclaimed keys for a user
CREATE INDEX idx_otpk_user_unclaimed ON one_time_prekeys (user_id, consumed)
    WHERE consumed = FALSE;
```

---

### DDL: `channels`

```sql
-- A channel is the universal abstraction for both DMs and group chats.
-- DM: type = 'direct', exactly 2 members.
-- Group: type = 'group', 1..N members.
CREATE TABLE channels (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type    VARCHAR(10)     NOT NULL CHECK (channel_type IN ('direct', 'group')),

    -- Group-only metadata (null for DMs)
    group_name          VARCHAR(100),
    group_avatar_s3_key TEXT,
    group_description   VARCHAR(512),
    group_invite_link   VARCHAR(64) UNIQUE,  -- random slug for invite URLs

    created_by      UUID            REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Soft-delete
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_channels_type        ON channels (channel_type);
CREATE INDEX idx_channels_invite_link ON channels (group_invite_link)
    WHERE group_invite_link IS NOT NULL;
```

---

### DDL: `channel_members`

```sql
-- Membership table. Tracks roles, mute, and archival state per member.
CREATE TABLE channel_members (
    channel_id      UUID            NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         UUID            NOT NULL REFERENCES users(id)    ON DELETE CASCADE,

    role            VARCHAR(10)     NOT NULL DEFAULT 'member'
                        CHECK (role IN ('owner', 'admin', 'member')),

    joined_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    left_at         TIMESTAMPTZ,                            -- null = still member
    removed_by      UUID            REFERENCES users(id),  -- set if kicked

    -- Client-side UI prefs (stored server-side for sync)
    is_muted        BOOLEAN         NOT NULL DEFAULT FALSE,
    muted_until     TIMESTAMPTZ,
    is_archived     BOOLEAN         NOT NULL DEFAULT FALSE,
    is_pinned       BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Last-read watermark (used to compute unread count on cold load)
    last_read_message_id    TEXT,   -- MongoDB message _id stored as text ref
    last_read_at            TIMESTAMPTZ,

    PRIMARY KEY (channel_id, user_id)
);

-- Hot path: load all channels for a user
CREATE INDEX idx_cm_user_active ON channel_members (user_id, joined_at DESC)
    WHERE left_at IS NULL;

-- Membership lookup: is user in channel?
CREATE INDEX idx_cm_channel ON channel_members (channel_id)
    WHERE left_at IS NULL;
```

---

### DDL: `blocked_users`

```sql
CREATE TABLE blocked_users (
    blocker_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX idx_blocked_by_user ON blocked_users (blocker_id);
```

---

### DDL: `push_tokens`

```sql
-- One row per device. A user may have multiple devices.
CREATE TABLE push_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform    VARCHAR(10) NOT NULL CHECK (platform IN ('apns', 'fcm', 'web')),
    token       TEXT        NOT NULL,
    device_id   VARCHAR(64),                     -- client-generated fingerprint
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_id)
);

CREATE INDEX idx_push_user ON push_tokens (user_id);
```

---

### PostgreSQL: Index Blueprint Summary

| Index                      | Type           | Columns                   | Purpose                              |
| -------------------------- | -------------- | ------------------------- | ------------------------------------ |
| `users_pkey`               | PK             | `id`                      | Identity lookup                      |
| `idx_users_email`          | Unique B-Tree  | `LOWER(email)`            | Login — case-insensitive email match |
| `idx_users_phone`          | Partial B-Tree | `phone_number`            | Optional contact discovery           |
| `idx_users_active_status`  | Partial B-Tree | `account_status`          | Presence / search (active only)      |
| `idx_ev_token`             | Partial B-Tree | `token_hash`              | Email verification click             |
| `idx_prt_token`            | Partial B-Tree | `token_hash`              | Password reset validation            |
| `idx_rt_token`             | Partial B-Tree | `token_hash`              | Refresh token validation             |
| `idx_rt_user`              | Partial B-Tree | `user_id`                 | "Log out all devices" revocation     |
| `idx_cm_user_active`       | Partial B-Tree | `user_id, joined_at DESC` | Load user's channel list             |
| `idx_cm_channel`           | Partial B-Tree | `channel_id`              | Fan-out delivery check               |
| `idx_otpk_user_unclaimed`  | Partial B-Tree | `user_id, consumed`       | Signal key server pop                |
| `idx_channels_invite_link` | Partial B-Tree | `group_invite_link`       | Invite URL resolution                |

---

### Auth Query Logic

#### Registration

```sql
-- 1. Insert user (status = pending_verification)
INSERT INTO users (email, password_hash, display_name, account_status)
VALUES (LOWER($1), $2, $3, 'pending_verification')
RETURNING id;

-- 2. Insert verification token (raw token generated in app, only hash stored)
INSERT INTO email_verifications (user_id, token_hash, new_email)
VALUES ($1, encode(sha256($2::bytea), 'hex'), LOWER($3));

-- 3. Send email with raw token link: /verify-email?token=<raw>
```

#### Email Verification Click

```sql
-- Atomically consume the token and activate the account
WITH token AS (
    UPDATE email_verifications
    SET    used_at = NOW()
    WHERE  token_hash = encode(sha256($1::bytea), 'hex')
      AND  used_at   IS NULL
      AND  expires_at > NOW()
    RETURNING user_id, new_email
)
UPDATE users
SET    email_verified = TRUE,
       account_status = 'active',
       email          = (SELECT new_email FROM token),
       updated_at     = NOW()
WHERE  id = (SELECT user_id FROM token)
RETURNING id, email, display_name;
-- Returns 0 rows if token is invalid/expired/already used → 400 response
```

#### Login (Email + Password)

```sql
-- Fetch user by email (case-insensitive via functional index)
SELECT id, password_hash, account_status, email_verified
FROM   users
WHERE  email = LOWER($1)
  AND  account_status = 'active'
  AND  email_verified = TRUE;

-- App: bcrypt.compare(plainPassword, row.password_hash)
-- On success: issue access token (JWT, 15 min) + refresh token (30 days)

-- Store refresh token
INSERT INTO refresh_tokens (user_id, token_hash, device_id, platform, ip_address)
VALUES ($1, encode(sha256($2::bytea), 'hex'), $3, $4, $5::inet);
```

#### Token Refresh

```sql
-- Validate and rotate refresh token (old token consumed, new one issued)
WITH old AS (
    UPDATE refresh_tokens
    SET    revoked_at   = NOW(),
           last_used_at = NOW()
    WHERE  token_hash = encode(sha256($1::bytea), 'hex')
      AND  revoked_at IS NULL
      AND  expires_at > NOW()
    RETURNING user_id, device_id, platform
)
INSERT INTO refresh_tokens (user_id, token_hash, device_id, platform)
SELECT user_id, encode(sha256($2::bytea), 'hex'), device_id, platform
FROM   old
RETURNING user_id;
-- Returns 0 rows → token invalid/expired → force re-login
```

#### Forgot Password Flow

```sql
-- 1. User submits email — always return 200 (don't leak existence)
INSERT INTO password_reset_tokens (user_id, token_hash, ip_address)
SELECT id, encode(sha256($1::bytea), 'hex'), $2::inet
FROM   users
WHERE  email = LOWER($3) AND account_status = 'active';

-- 2. User clicks link — consume token and update password
WITH tok AS (
    UPDATE password_reset_tokens
    SET    used_at = NOW()
    WHERE  token_hash = encode(sha256($1::bytea), 'hex')
      AND  used_at   IS NULL
      AND  expires_at > NOW()
    RETURNING user_id
)
UPDATE users
SET    password_hash = $2,       -- new bcrypt hash
       updated_at    = NOW()
WHERE  id = (SELECT user_id FROM tok)
RETURNING id;

-- 3. Revoke all existing refresh tokens (security: log out all devices)
UPDATE refresh_tokens
SET    revoked_at = NOW()
WHERE  user_id    = $1
  AND  revoked_at IS NULL;
```

---

## Tier 2: MongoDB — Message & Thread History (Bucket Pattern)

### Design Notes

#### Why the Bucket Pattern?

Each message as its own document means N documents per conversation, high index overhead, and random-access reads. Instead, we **group 50–100 messages into a single bucket document**. A bucket covers a contiguous `sequence_range` within a channel.

**Benefits:**

- One document read = 50–100 messages → optimal for chat history pagination
- Index lives on bucket boundaries, not individual messages
- Atomic `$push` into the `messages` array = no separate collection per message
- Bucket `message_count` field acts as a gate; when it hits 100, the app opens a new bucket

**The 16MB trap:** At an average of ~500 bytes per message (text + metadata), 100 messages ≈ 50KB per bucket — well within limits. Media messages don't embed binary; they embed an S3 URL string (~80 bytes). Safe headroom even with reactions.

---

### Mongoose Schema: `MessageBucket`

```javascript
// models/MessageBucket.js
import mongoose from "mongoose";
const { Schema } = mongoose;

// ── Media Attachment Sub-schema ──────────────────────────────────────────
const MediaAttachmentSchema = new Schema(
  {
    media_type: {
      type: String,
      enum: ["image", "video", "audio", "file", "sticker", "gif"],
      required: true,
    },
    s3_key: { type: String, required: true }, // raw S3 object key
    cdn_url: { type: String }, // Cloudfront/CDN URL
    file_name: { type: String },
    file_size_bytes: { type: Number },
    mime_type: { type: String },

    // Image / Video specific
    width_px: { type: Number },
    height_px: { type: Number },
    duration_secs: { type: Number }, // audio / video only

    // Blurhash for lazy-load placeholder (computed at upload time)
    blurhash: { type: String }, // e.g. "LKO2?U%2Tw=w]~RBVZRi};RPxuwH"

    // Thumbnail for videos / large files
    thumbnail_s3_key: { type: String },
    thumbnail_cdn_url: { type: String },
  },
  { _id: false },
);

// ── Per-member Delivery/Read Receipt Sub-schema ──────────────────────────
// ARCHITECTURAL DECISION: receipts live inside the message object, NOT as
// a separate collection. For 1:1 chats this is 1-2 entries. For groups
// (max 256 members) this is max 256 entries per message — acceptable at
// ~32 bytes per entry = 8KB max overhead per message.
// Fan-out write amplification is avoided: one atomic $push per message,
// one $set to update receipt status.
const ReceiptSchema = new Schema(
  {
    user_id: { type: String, required: true }, // UUID from PostgreSQL
    delivered_at: { type: Date }, // server push confirmed
    read_at: { type: Date }, // blue ticks
  },
  { _id: false },
);

// ── Reaction Sub-schema ──────────────────────────────────────────────────
const ReactionSchema = new Schema(
  {
    user_id: { type: String, required: true },
    emoji: { type: String, required: true }, // unicode: "👍", "❤️"
    reacted_at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// ── Message Sub-schema ───────────────────────────────────────────────────
const MessageSchema = new Schema(
  {
    // Globally unique message ID (client-generated UUID for idempotency)
    _mid: { type: String, required: true, unique: false },

    // Sequence number within the channel (monotonically increasing)
    seq: { type: Number, required: true },

    sender_id: { type: String, required: true }, // UUID
    sent_at: { type: Date, required: true, default: Date.now },
    server_at: { type: Date, required: true, default: Date.now }, // server receipt time

    // Message body
    message_type: {
      type: String,
      enum: ["text", "media", "system", "reply", "forwarded", "deleted"],
      default: "text",
    },
    body: { type: String, default: "" }, // empty for media-only messages

    // Media (null for text messages)
    media: { type: MediaAttachmentSchema, default: null },

    // Threaded reply context
    reply_to: {
      _mid: { type: String }, // referenced message ID
      seq: { type: Number },
      sender_id: { type: String },
      body_preview: { type: String, maxlength: 100 }, // truncated quote
    },

    // Forward chain
    forwarded_from_channel_id: { type: String },

    // E2EE ciphertext envelope (only present when E2EE is enabled)
    e2ee_envelope: {
      registration_id: { type: Number },
      ephemeral_key: { type: String }, // base64
      ciphertext: { type: String }, // base64
      message_type: { type: Number }, // Signal message type (1=whisper, 3=prekey)
    },

    // Lifecycle state
    status: {
      type: String,
      enum: ["sent", "delivered", "read", "failed"],
      default: "sent",
    },

    // Per-member receipts array (delivery + read tracking)
    receipts: [ReceiptSchema],

    // Reactions
    reactions: [ReactionSchema],

    // Soft-delete (message body nulled out, replaced with tombstone)
    deleted_at: { type: Date, default: null },
    deleted_by: { type: String, default: null },
  },
  { _id: false },
);

// ── Bucket Document Schema ───────────────────────────────────────────────
const MessageBucketSchema = new Schema(
  {
    // Compound shard key: channel + sequence window
    channel_id: { type: String, required: true, index: true },

    // Bucket covers messages seq [seq_min, seq_max]
    seq_min: { type: Number, required: true },
    seq_max: { type: Number, required: true },

    // Denormalised message count — gate for bucket fullness (cap = 100)
    message_count: { type: Number, required: true, default: 0 },

    // Timestamp range (for TTL or archival policies)
    first_message_at: { type: Date },
    last_message_at: { type: Date },

    // The messages array (50–100 messages per bucket)
    messages: [MessageSchema],
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "message_buckets",
  },
);

// ── Indexes ──────────────────────────────────────────────────────────────

// PRIMARY READ PATH: paginate buckets for a channel, newest first
MessageBucketSchema.index(
  { channel_id: 1, seq_max: -1 },
  { name: "idx_channel_seq_max" },
);

// RECEIPT UPDATES: find the bucket containing a specific message by seq
MessageBucketSchema.index(
  { channel_id: 1, seq_min: 1, seq_max: 1 },
  { name: "idx_channel_seq_range" },
);

// OPEN BUCKET LOOKUP: find the current open bucket (message_count < 100)
// Partial index — only indexes documents with unfilled buckets
MessageBucketSchema.index(
  { channel_id: 1, message_count: 1 },
  {
    name: "idx_channel_open_bucket",
    partialFilterExpression: { message_count: { $lt: 100 } },
  },
);

// MEDIA SEARCH: find all media messages in a channel (for the media gallery tab)
// Sparse — only indexes documents containing at least one media message
MessageBucketSchema.index(
  { channel_id: 1, "messages.sent_at": -1 },
  {
    name: "idx_channel_media",
    sparse: true,
    partialFilterExpression: { "messages.message_type": "media" },
  },
);

export default mongoose.model("MessageBucket", MessageBucketSchema);
```

---

### MongoDB: Index Blueprint Summary

| Index Name                | Fields                              | Type             | Purpose                                |
| ------------------------- | ----------------------------------- | ---------------- | -------------------------------------- |
| `idx_channel_seq_max`     | `channel_id, seq_max DESC`          | Compound         | Chat history pagination (cursor-based) |
| `idx_channel_seq_range`   | `channel_id, seq_min, seq_max`      | Compound         | Locate bucket for receipt updates      |
| `idx_channel_open_bucket` | `channel_id, message_count`         | Partial Compound | Fast open-bucket lookup on send        |
| `idx_channel_media`       | `channel_id, messages.sent_at DESC` | Sparse Partial   | Media gallery tab                      |

---

## Tier 3: Redis — Ephemeral & Pub/Sub Volatile Cache

### Design Notes

Redis owns **everything that changes at socket speed** — states that would cause thundering-herd reads on PostgreSQL if not cached. All keys use a consistent `namespace:entity_id` pattern for scan safety. TTLs are mandatory on all volatile keys.

---

### Key Naming Conventions

```
presence:{user_id}                       → Online status hash
session:{user_id}:{socket_id}            → Socket session binding
unread:{user_id}:{channel_id}            → Unread message counter
typing:{channel_id}                      → Active typers sorted set
channel:members:{channel_id}             → Cached member list (set)
msg:lock:{channel_id}                    → Distributed write lock for seq increment
seq:{channel_id}                         → Monotonic sequence counter
```

---

### Data Structures & Commands

#### 1. User Presence

```redis
# Structure: HASH
# Key: presence:{user_id}
# TTL: 30 seconds (refreshed on heartbeat every 10s)

HSET presence:{user_id}
  status       "online"           # online | away | offline
  last_seen    "1717158000000"    # epoch ms
  platform     "ios"              # ios | android | web | desktop

EXPIRE presence:{user_id} 30

# Read presence
HGETALL presence:{user_id}

# Batch presence check (PIPELINE for N users)
PIPELINE
  HGET presence:{user_id_1} status
  HGET presence:{user_id_2} status
  ...
EXEC
```

#### 2. Socket Session Mapping

```redis
# Structure: SET (all socket IDs for a user across devices)
# Key: session:{user_id}
# TTL: none (managed explicitly on disconnect)

SADD session:{user_id} {socket_id}
SREM session:{user_id} {socket_id}      # on disconnect
SMEMBERS session:{user_id}              # get all active sockets for fan-out
SCARD session:{user_id}                 # how many active connections

# Per-socket metadata (used for delivery routing)
# Structure: HASH
# Key: socket:{socket_id}
HSET socket:{socket_id}
  user_id     "{user_id}"
  channel     "ws-server-3"           # which server instance owns this socket
  platform    "ios"
  connected_at "1717158000000"
EXPIRE socket:{socket_id} 3600
```

#### 3. Unread Message Counts

```redis
# Structure: STRING (atomic counter)
# Key: unread:{user_id}:{channel_id}
# TTL: 7 days (auto-expire stale counters)

# Increment on new message received (server-side, per recipient)
INCR unread:{user_id}:{channel_id}
EXPIRE unread:{user_id}:{channel_id} 604800   # 7 days

# Reset on user opening the chat
DEL unread:{user_id}:{channel_id}
# OR use SET 0 to preserve the key (avoids a re-EXPIRE)
SET unread:{user_id}:{channel_id} 0 KEEPTTL

# Fetch all unread counts for a user's channel list (Lua script for atomicity)
-- KEYS[1] = user_id
-- Uses SCAN to gather all unread:{user_id}:* keys
local cursor = 0
local counts = {}
repeat
  local result = redis.call('SCAN', cursor, 'MATCH', 'unread:' .. KEYS[1] .. ':*', 'COUNT', 100)
  cursor = tonumber(result[1])
  for _, key in ipairs(result[2]) do
    local channel_id = key:match(':([^:]+)$')
    local count = redis.call('GET', key)
    counts[#counts+1] = channel_id
    counts[#counts+1] = count or '0'
  end
until cursor == 0
return counts

# Execute with: EVALSHA {sha} 1 {user_id}
```

#### 4. Typing Indicators

```redis
# Structure: SORTED SET (score = expiry epoch ms)
# Key: typing:{channel_id}
# Members: "{user_id}:{display_name}" (denormalised for fast rendering)

# User starts typing
ZADD typing:{channel_id} {now_ms + 5000} "{user_id}:{display_name}"

# User stops typing (explicit stop or timeout)
ZREM typing:{channel_id} "{user_id}:{display_name}"

# Get currently typing users (filter expired entries atomically)
ZRANGEBYSCORE typing:{channel_id} {now_ms} +inf

# Clean up expired entries (run periodically or before each read)
ZREMRANGEBYSCORE typing:{channel_id} -inf {now_ms - 1}
```

#### 5. Channel Sequence Counter

```redis
# Structure: STRING (atomic integer)
# Key: seq:{channel_id}
# Used to assign monotonically increasing sequence numbers to messages

# Increment and get next sequence number
INCR seq:{channel_id}

# Initialise from MongoDB on first use (cold start)
SET seq:{channel_id} {last_known_seq} NX     # NX = only if not exists
```

#### 6. Pub/Sub — Real-Time Event Fan-Out

```redis
# Channel naming: chat:{channel_id}
# Used by Socket.IO/ws server to broadcast to all subscribers of a channel

# Server A publishes a new message event
PUBLISH chat:{channel_id} '{"event":"new_message","message_id":"{_mid}","sender_id":"{uid}","seq":1042}'

# Server B (which has sockets for this channel) subscribes and forwards
SUBSCRIBE chat:{channel_id}

# Typing indicator events
PUBLISH chat:{channel_id} '{"event":"typing_start","user_id":"{uid}","name":"Ravi"}'
PUBLISH chat:{channel_id} '{"event":"typing_stop","user_id":"{uid}"}'

# Presence broadcast (fan to user's contacts)
PUBLISH presence:{user_id} '{"event":"status_change","status":"online","user_id":"{uid}"}'
```

#### 7. Distributed Write Lock (Sequence Integrity)

```redis
# Prevents race conditions when multiple servers write to the same channel's
# open bucket simultaneously. Uses SET NX EX pattern.

# Acquire lock (500ms TTL — auto-releases if handler crashes)
SET msg:lock:{channel_id} {server_id} NX EX 1 PX 500

# Release lock (Lua for atomicity — only release if we own it)
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
-- EVALSHA {sha} 1 msg:lock:{channel_id} {server_id}
```

---

### Redis: Key Blueprint Summary

| Key Pattern          | Structure        | TTL         | Purpose                        |
| -------------------- | ---------------- | ----------- | ------------------------------ |
| `presence:{uid}`     | HASH             | 30s         | Online/offline status          |
| `session:{uid}`      | SET              | Explicit    | All socket IDs per user        |
| `socket:{socket_id}` | HASH             | 3600s       | Per-socket routing metadata    |
| `unread:{uid}:{cid}` | STRING (counter) | 7d          | Unread badge counts            |
| `typing:{cid}`       | SORTED SET       | Score-based | Active typing indicators       |
| `seq:{cid}`          | STRING (counter) | None        | Monotonic message sequence     |
| `msg:lock:{cid}`     | STRING (NX lock) | 500ms       | Distributed write lock         |
| `chat:{cid}`         | PubSub Channel   | —           | Real-time event fan-out        |
| `presence:{uid}`     | PubSub Channel   | —           | Presence broadcast to contacts |

---

## Tier 4: Object Storage (S3 / Cloudinary)

### Design Notes

Binary media is **never stored in MongoDB**. Only the S3 object key and CDN URL travel in the message payload. This keeps buckets lean and enables independent CDN cache policies per media type.

---

### S3 Key Naming Convention

```
media/
  {channel_id}/
    {yyyy}/{mm}/{dd}/
      {message_id}/
        original.{ext}          # Original upload
        thumbnail_360w.webp     # Server-generated thumbnail
        thumbnail_720w.webp
        preview.webp            # Full-size compressed (images)
        audio.ogg               # Transcoded voice note
```

**Example:**

```
media/ch_9f4a2b/2025/06/01/msg_7c3d1e/original.jpg
media/ch_9f4a2b/2025/06/01/msg_7c3d1e/thumbnail_360w.webp
media/ch_9f4a2b/2025/06/01/msg_7c3d1e/preview.webp
```

---

### Media Metadata (embedded in MongoDB message payload)

```json
{
  "_mid": "msg_7c3d1e",
  "message_type": "media",
  "body": "Look at this!",
  "media": {
    "media_type": "image",
    "s3_key": "media/ch_9f4a2b/2025/06/01/msg_7c3d1e/original.jpg",
    "cdn_url": "https://cdn.yourdomain.com/media/ch_9f4a2b/2025/06/01/msg_7c3d1e/preview.webp",
    "file_name": "photo.jpg",
    "file_size_bytes": 2457600,
    "mime_type": "image/jpeg",
    "width_px": 3024,
    "height_px": 4032,
    "duration_secs": null,
    "blurhash": "LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
    "thumbnail_cdn_url": "https://cdn.yourdomain.com/media/ch_9f4a2b/2025/06/01/msg_7c3d1e/thumbnail_360w.webp"
  }
}
```

---

### S3 Bucket Policies

```
Buckets:
  messaging-media-raw       → Pre-signed upload target (private, pre-sign URL TTL: 60s)
  messaging-media-processed → CDN origin (private, CloudFront signed URLs)

CORS (messaging-media-raw):
  AllowedOrigins: ["https://yourdomain.com"]
  AllowedMethods: ["PUT", "POST"]
  AllowedHeaders: ["*"]
  MaxAgeSeconds: 3600

Lifecycle Rules (messaging-media-raw):
  - Delete unprocessed objects after 24h (failed uploads auto-cleanup)

Lifecycle Rules (messaging-media-processed):
  - Transition to Glacier after 365 days
  - Voice notes: expire after 1 year (configurable)
```

---

## Critical Query Paths

### Path A: Sending a New Message

This is the **write hot path**. Sequence:

```
1. Client sends message via WebSocket
2. Server validates membership in PostgreSQL (cached: Redis session check)
3. Acquire distributed lock: SET msg:lock:{channel_id} ... NX EX PX 500
4. Increment sequence: INCR seq:{channel_id}  →  seq = 1043
5. Construct message object with seq, server_at, receipts=[]
6. MongoDB: $push into open bucket (or create new bucket if count = 100)
7. Redis: INCR unread:{recipient_id}:{channel_id}  (for each recipient)
8. Redis: PUBLISH chat:{channel_id} {event payload}
9. Release lock
10. ACK to sender with {_mid, seq, server_at}
```

```javascript
// services/messageService.js (critical path)
import MessageBucket from "../models/MessageBucket.js";
import redis from "../lib/redis.js";
import { acquireLock, releaseLock } from "../lib/locks.js";

export async function sendMessage({
  channelId,
  senderId,
  body,
  media,
  replyTo,
  clientMid,
}) {
  const lockKey = `msg:lock:${channelId}`;
  const lockId = `${process.env.SERVER_ID}:${Date.now()}`;

  // Step 1: Acquire distributed lock
  const locked = await redis.set(lockKey, lockId, "NX", "PX", 500);
  if (!locked) throw new Error("LOCK_CONTENTION"); // caller should retry

  try {
    // Step 2: Assign monotonic sequence number
    const seq = await redis.incr(`seq:${channelId}`);

    const now = new Date();
    const newMessage = {
      _mid: clientMid,
      seq,
      sender_id: senderId,
      sent_at: now,
      server_at: now,
      message_type: media ? "media" : "text",
      body: body ?? "",
      media: media ?? null,
      reply_to: replyTo ?? null,
      status: "sent",
      receipts: [], // populated as delivery confirmations arrive
      reactions: [],
    };

    // Step 3: Atomic upsert into open bucket (MongoDB)
    // findOneAndUpdate with upsert:
    //   - If open bucket exists (count < 100) → $push message, $inc count
    //   - If no open bucket → create a new bucket document
    const result = await MessageBucket.findOneAndUpdate(
      {
        channel_id: channelId,
        message_count: { $lt: 100 }, // open bucket gate
      },
      {
        $push: { messages: newMessage },
        $inc: { message_count: 1 },
        $min: { seq_min: seq },
        $max: { seq_max: seq },
        $set: {
          last_message_at: now,
          $setOnInsert: { first_message_at: now },
        },
        $setOnInsert: {
          channel_id: channelId,
          seq_min: seq,
          message_count: 1,
        },
      },
      {
        upsert: true,
        new: true,
        sort: { seq_max: -1 }, // target the newest open bucket
      },
    );

    // Step 4: Fan-out unread increments to all channel members
    // (member list read from Redis cache or PostgreSQL)
    const memberIds = await getChannelMemberIds(channelId); // returns string[]

    const pipeline = redis.pipeline();
    for (const memberId of memberIds) {
      if (memberId === senderId) continue; // sender doesn't get unread
      pipeline.incr(`unread:${memberId}:${channelId}`);
      pipeline.expire(`unread:${memberId}:${channelId}`, 604800);
    }

    // Step 5: Publish to all servers via Redis Pub/Sub
    const event = JSON.stringify({
      event: "new_message",
      channel_id: channelId,
      _mid: clientMid,
      seq,
      sender_id: senderId,
      server_at: now.toISOString(),
    });
    pipeline.publish(`chat:${channelId}`, event);

    await pipeline.exec();

    return { _mid: clientMid, seq, server_at: now };
  } finally {
    await releaseLock(lockKey, lockId); // Lua atomic release
  }
}
```

---

### Path B: Fetching Chat History (Cursor-Based Pagination)

```
Client sends: { channel_id, before_seq: 1043, limit: 50 }

Query logic:
1. Find buckets where seq_max < before_seq, sorted newest-first
2. Unpack messages from those buckets, flatten, reverse-sort by seq
3. Return first `limit` messages + next cursor (the lowest seq in response)

Cursor is the seq value — stable across bucket boundaries, monotonic.
```

```javascript
// services/historyService.js
export async function fetchChatHistory({ channelId, beforeSeq, limit = 50 }) {
  // We may need messages spanning multiple buckets.
  // Fetch enough buckets to fill the limit (each bucket has up to 100 messages).
  // Worst case: limit=50 at a bucket boundary → 2 buckets.

  const buckets = await MessageBucket.find(
    {
      channel_id: channelId,
      seq_max: { $lt: beforeSeq }, // cursor: buckets BEFORE the current position
    },
    {
      // Projection: exclude internal fields, include messages array
      messages: 1,
      seq_min: 1,
      seq_max: 1,
    },
  )
    .sort({ seq_max: -1 }) // newest buckets first
    .limit(Math.ceil(limit / 50) + 1) // over-fetch by 1 bucket for cursor detection
    .lean();

  // Flatten all messages from all fetched buckets into a single array
  const allMessages = buckets
    .flatMap((b) => b.messages)
    .filter((m) => m.seq < beforeSeq)
    .sort((a, b) => b.seq - a.seq); // newest first

  const messages = allMessages.slice(0, limit);

  // Compute the next cursor for the client
  const hasMore = allMessages.length > limit;
  const nextCursor = hasMore ? messages[messages.length - 1].seq : null;

  return {
    messages,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

// Example response shape:
// {
//   messages: [ { _mid, seq, sender_id, body, media, receipts, reactions, ... }, ... ],
//   next_cursor: 993,     // client passes this as before_seq in next request
//   has_more: true
// }
```

---

### Path B (cont): Updating Read Receipts (Blue Ticks)

```javascript
// When user B reads a message, update the receipt in the bucket
export async function markAsRead({ channelId, readerId, upToSeq }) {
  const readAt = new Date();

  // Update all buckets containing messages ≤ upToSeq for this channel
  await MessageBucket.updateMany(
    {
      channel_id: channelId,
      seq_min: { $lte: upToSeq },
      "messages.receipts.user_id": readerId,
    },
    {
      $set: {
        "messages.$[msg].receipts.$[receipt].read_at": readAt,
        "messages.$[msg].status": "read",
      },
    },
    {
      arrayFilters: [
        { "msg.seq": { $lte: upToSeq } },
        { "receipt.user_id": readerId, "receipt.read_at": null },
      ],
    },
  );

  // Reset unread counter in Redis
  await redis.set(`unread:${readerId}:${channelId}`, 0, "KEEPTTL");

  // Publish read receipt event so sender gets blue ticks
  await redis.publish(
    `chat:${channelId}`,
    JSON.stringify({
      event: "read_receipt",
      channel_id: channelId,
      reader_id: readerId,
      up_to_seq: upToSeq,
      read_at: readAt.toISOString(),
    }),
  );
}
```

---

## Scalability Notes

### Group Message Delivery at Scale (No Write Amplification)

WhatsApp groups (up to 1024 members) use **server-side fan-out via Redis Pub/Sub**, not per-member rows:

```
PUBLISH chat:{channel_id} → all socket servers subscribed to this channel
                          → each server fans out to its own connected sockets
                          → unread INCR batched in Redis pipeline (not per-row SQL)
```

The MongoDB bucket gets **one write** per message regardless of group size. Member delivery receipts are accumulated **in the message's `receipts` array** with `$push` operations as acknowledgements arrive asynchronously — they do not block the send path.

### Sequence Number Cold Start

On server startup, seed Redis from MongoDB:

```javascript
async function seedSequenceCounter(channelId) {
  const latest = await MessageBucket.findOne(
    { channel_id: channelId },
    { seq_max: 1 },
  )
    .sort({ seq_max: -1 })
    .lean();

  const lastSeq = latest?.seq_max ?? 0;
  await redis.set(`seq:${channelId}`, lastSeq, "NX"); // NX: don't overwrite existing
}
```

### Delivery Status Aggregation for Groups

The group message `status` field derives from the **minimum receipt state** across all members:

```javascript
function aggregateGroupStatus(receipts, memberCount) {
  const delivered = receipts.filter((r) => r.delivered_at).length;
  const read = receipts.filter((r) => r.read_at).length;

  if (read === memberCount) return "read"; // all blue ticks
  if (delivered === memberCount) return "delivered"; // all double ticks
  return "sent"; // single tick
}
```

This is computed at **read time**, not stored — avoids O(N) update writes on every receipt event for large groups.

---

## Technology Stack Summary

| Layer               | Technology                           | Client Library           |
| ------------------- | ------------------------------------ | ------------------------ |
| Relational Metadata | PostgreSQL 16                        | `pg` / Prisma ORM        |
| Message History     | MongoDB 7 (Atlas)                    | Mongoose 8               |
| Cache & Pub/Sub     | Redis 7 (Upstash / self-hosted)      | `ioredis`                |
| Object Storage      | AWS S3 / Cloudflare R2               | `@aws-sdk/client-s3`     |
| Real-Time Transport | Socket.IO / ws                       | `socket.io`              |
| Media Processing    | Sharp (images), FFmpeg (video/audio) | `sharp`, `fluent-ffmpeg` |

---

_Schema Version: 1.0 — Gurunada Suvidha Platform Reference Architecture_
