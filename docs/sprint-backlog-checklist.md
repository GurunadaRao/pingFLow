# VibeChat — Prioritized Sprint Backlog (Checklists)

**Architecture:** Polyglot persistence (PostgreSQL + MongoDB + Redis + S3) with Socket.IO realtime layer.
**Reference:** See `docs/db.md` for schema design rationale and critical paths.

---

## Sprint 0 — Project Setup & Polyglot Database Provisioning (2 weeks)

### Accounts & Infrastructure

- [ ] Provision PostgreSQL 16 database (Neon / AWS RDS).
- [ ] Provision MongoDB 7 Atlas cluster (production-tier with backups).
- [ ] Provision Redis 7 instance (Upstash or self-hosted).
- [ ] Provision S3 bucket (or R2) for media storage with CORS and lifecycle rules.
- [ ] Create accounts: Vercel/Netlify, Render/Railway, n8n, Resend, Cloudinary.

### Repository & Local Setup

- [ ] Scaffold mono-repo: `apps/server`, `apps/client`, `packages/{shared-types, shared-constants, shared-utils}`.
- [ ] Initialize `package.json` scripts: `dev`, `build`, `test`, `migrate`, `seed`.
- [ ] Configure Node.js version lock (`.nvmrc`, `engines` field).

### Database Drivers & ORM Setup

- [ ] Install and configure Prisma ORM for PostgreSQL (migrations, client generation).
- [ ] Install and configure Mongoose for MongoDB with connection pooling.
- [ ] Install `ioredis` for Redis client with reconnection logic.
- [ ] Install `@aws-sdk/client-s3` for S3 presigned URLs.

### CI/CD & Environment Config

- [ ] Document all required env vars by tier (PostgreSQL, MongoDB, Redis, S3 credentials).
- [ ] Create `.env.example` and `.env.local` templates.
- [ ] Configure GitHub Actions for backend tests + frontend build previews.
- [ ] Test local `npm run dev` with all three databases connected.

**Acceptance criteria**

- [ ] All cloud accounts created and credentials secured in `.env.local`.
- [ ] `npm run dev` connects to all three databases without errors (health checks log success).
- [ ] `prisma migrate dev --preview-feature` runs successfully (scaffold baseline).
- [ ] CI pipeline triggers on PR.
- [ ] Team can clone, `npm install`, and `npm run dev` independently.

---

## Sprint 1 — PostgreSQL Tier: Auth & Relational Metadata (2 weeks)

### Schema Implementation

- [ ] Migrate and create `users` table (id, email, password_hash, phone, account_status, email_verified, created_at, updated_at).
- [ ] Create indexes: `idx_users_email` (UNIQUE, LOWER), `idx_users_active_status` (partial), `idx_users_phone` (partial).
- [ ] Migrate and create `email_verifications` table (id, user_id, token_hash, new_email, used_at, expires_at).
- [ ] Create index: `idx_ev_token` (partial, WHERE used_at IS NULL).
- [ ] Migrate and create `password_reset_tokens` table (id, user_id, token_hash, used_at, expires_at, ip_address).
- [ ] Create indexes: `idx_prt_token`, `idx_prt_user`, `idx_prt_expires`.
- [ ] Migrate and create `refresh_tokens` table (id, user_id, token_hash, device_id, platform, ip_address, revoked_at, expires_at).
- [ ] Create indexes: `idx_rt_token`, `idx_rt_user`, `idx_rt_expires`.
- [ ] Migrate and create `channels` table (id, type, invite_link, display_name, created_at, updated_at, deleted_at).
- [ ] Create index: `idx_channels_invite_link` (partial).
- [ ] Migrate and create `channel_members` table (channel_id, user_id, role, muted, archived, joined_at, left_at).
- [ ] Create indexes: `idx_cm_user_active`, `idx_cm_channel`.
- [ ] Migrate and create `blocked_users` table (blocker_id, blocked_id, created_at).
- [ ] Create index: `idx_blocked_by_user`.
- [ ] Migrate and create `push_tokens` table (id, user_id, device_id, token, platform, created_at).
- [ ] Create index: `idx_push_user`.
- [ ] _(Optional for MVP)_ Migrate `one_time_prekeys` table for Signal Protocol E2EE (defer to Sprint 7+).

### Auth Endpoint Implementation

- [ ] Implement `POST /auth/signup` (validate email, hash password with bcrypt cost≥12, create user + verification token).
- [ ] Implement `POST /auth/verify-email` (consume token, activate user, return 200).
- [ ] Implement `POST /auth/login` (validate email/password, issue JWT access + refresh token).
- [ ] Implement `POST /auth/refresh` (validate refresh token, rotate with new token, revoke old).
- [ ] Implement `POST /auth/logout` (revoke refresh token + all devices option).
- [ ] Implement `POST /auth/forgot-password` (generate token, send email via Resend — _defer email to Sprint 5_).
- [ ] Implement `POST /auth/reset-password` (consume token, update password, revoke all refresh tokens).
- [ ] Implement JWT middleware: `authenticate()` — verify access token, attach user to `req.user`.
- [ ] Implement authorization middleware: `requireChannel(channelId)` — check membership in PostgreSQL.

### Security & Testing

- [ ] Input validation with Zod for all auth payloads (email format, password strength, token format).
- [ ] Rate-limit auth endpoints (5 req/min per email, 20 req/min per IP for signup).
- [ ] Implement `GET /health` endpoint (returns 200 + { db: "connected", redis: "connected", mongodb: "connected" }).
- [ ] Implement `GET /auth/me` endpoint (returns current user profile).
- [ ] Unit tests: password hashing, JWT encoding/decoding, token expiry.
- [ ] Integration tests: signup → verify → login → refresh → logout flow.
- [ ] Database cleanup: reset migrations between test runs.

**Acceptance criteria**

- [ ] User can sign up with valid email and receives verification email placeholder (log only, no Resend yet).
- [ ] User verifies email and account transitions to `active` status.
- [ ] User logs in and receives access token + refresh token (refresh token persisted in DB).
- [ ] Access token decodes to valid `{ userId, iat, exp }` claims.
- [ ] Refresh token rotates on request (old token revoked).
- [ ] `GET /auth/me` returns user profile when authenticated.
- [ ] Logout revokes refresh token (subsequent refresh fails 401).
- [ ] All tests pass in CI.
- [ ] `GET /health` returns 200 with all services green.

---

## Sprint 2 — MongoDB Tier: Message History (Bucket Pattern) + Redis Setup (2 weeks)

### MongoDB Schema & Indexes

- [x] Design and implement MongoDB `message_buckets` collection schema (see `db.md`).
  - [x] Create `MessageBucket` Mongoose model with sub-schemas: `MediaAttachment`, `Receipt`, `Reaction`, `Message`.
  - [x] Implement bucket fields: `channel_id`, `seq_min`, `seq_max`, `message_count`, `messages[]`, `created_at`, `updated_at`.
  - [x] Implement `Message` sub-schema fields: `_mid`, `seq`, `sender_id`, `body`, `media[]`, `replies`, `reactions[]`, `receipts[]`, `sent_at`, `deleted_by`.
- [x] Create index: `idx_channel_seq_max` (channel_id, seq_max DESC) — primary read path.
- [x] Create index: `idx_channel_seq_range` (channel_id, seq_min, seq_max) — bucket lookup.
- [x] Create index: `idx_channel_open_bucket` (channel_id, message_count) (partial, where message_count < 100).
- [x] Create index: `idx_channel_media` (channel_id, messages.sent_at DESC) (sparse, partial) — media gallery.
- [ ] Seed test data: 2-3 channels with 200+ messages split across buckets.

### Redis Setup & Ephemeral State

- [x] Configure Redis connection with ioredis (pools, timeouts, reconnection backoff).
- [ ] Implement Redis key patterns: `presence:{uid}`, `session:{uid}`, `socket:{socket_id}`, `unread:{uid}:{cid}`, `typing:{cid}`, `seq:{cid}`, `msg:lock:{cid}`. (partial: presence/unread/typing/seq/lock implemented; session/socket keys pending)
- [x] Implement Redis operations:
  - [x] `HSET presence:{uid}` — online status TTL 30s (refreshed on heartbeat).
  - [ ] `SADD session:{uid}` — track active socket IDs per user.
  - [x] `INCR unread:{uid}:{cid}` with 7-day TTL — unread counters.
  - [x] `ZADD typing:{cid}` — typing indicator SORTED SET, expired members auto-prune.
  - [x] `INCR seq:{cid}` — monotonic sequence counter (seeded on cold start from MongoDB).
  - [x] `SET msg:lock:{cid} NX EX PX 500` — distributed write lock for sequence integrity.
- [ ] Implement Redis Pub/Sub channels: `chat:{cid}` (message events), `presence:{uid}` (online status).
- [x] Implement Lua scripts (partial): lock release (ownership check) implemented via Lua; unread counter fetch (SCAN) and Lua-based typing cleanup not implemented.
- [ ] Test: cold start sequence seeding, lock contention under concurrent writes, Lua script atomicity. (sequence/concurrency tests present; some tests pending)

### Channel & Participant Endpoints (PostgreSQL)

- [x] Implement `POST /channels` (create DM or group, insert into PostgreSQL + `channel_members`).
- [x] Implement `GET /channels` (list user's active channels with unread counts from Redis).
- [ ] Implement `GET /channels/{id}` (fetch channel metadata + member list).
- [x] Implement `POST /channels/{id}/members` (add participant, update `channel_members`).
- [x] Implement `DELETE /channels/{id}/members/{uid}` (remove participant, soft-delete via left_at).
- [ ] Implement `PUT /channels/{id}` (rename, update group invite link).
- [x] Check membership in PostgreSQL before responding; cache recent membership in Redis (TTL 1h) (membership checks implemented; Redis caching pending)

### Testing

- [ ] Unit tests: bucket split logic (when message_count reaches 100, create new bucket).
- [ ] Integration tests: insert 150 messages, verify split across 2 buckets with correct seq ranges.
- [x] Redis tests: sequence counter increments atomically (implemented/tested); typing indicators expire and presence TTL implemented (functionality present, tests pending).
- [x] Concurrency tests: two servers INCR same channel's seq counter in parallel (lock should prevent race) — sequence concurrency test present.

**Acceptance criteria**

- [x] Messages persist in MongoDB buckets with correct seq values.
- [ ] Bucket auto-splits at 100 messages; new messages go to new bucket.
- [x] Redis sequence counter seeded correctly on server startup.
- [x] Typing indicators appear in Redis and expire after 5s.
- [x] Unread counts persist in Redis and reset to 0 when user opens channel.
- [x] User can create DM/group and add members; membership queries are fast.
- [ ] All tests pass; no race conditions under concurrent load.

---

## Sprint 3 — REST Messaging APIs & Critical Path (Write Hot Path) (2 weeks)

### Message Send (Critical Path)

- [x] Implement `POST /channels/{id}/messages` (send message):
  - [x] Validate membership in PostgreSQL (cached in Redis).
  - [x] Acquire distributed lock: `SET msg:lock:{cid} {server_id} NX EX PX 500`.
  - [x] Increment sequence: `INCR seq:{cid}` → assign seq number.
  - [x] Construct message object with seq, sender_id, body, server_at, receipts=[], reactions=[].
  - [x] MongoDB: `$push` into open bucket (or create new bucket if count ≥ 100).
  - [x] Redis: `INCR unread:{recipient_id}:{cid}` for each recipient.
  - [x] Release lock.
  - [x] Return 201 with { _mid, seq, server_at }.
- [x] Implement idempotency: client sends `client_mid` (UUID); server dedupes on this ID (MongoDB compound index).
- [x] Handle bucket creation on cold start or bucket-full condition.
- [x] Log critical-path timings (lock acquire, seq increment, MongoDB write, Redis fan-out).

### Message List & History (Cursor-Based Pagination)

- [x] Implement `GET /channels/{id}/messages` (fetch chat history):
  - [x] Accept query params: `before_seq` (cursor), `limit` (default 50).
  - [x] Query MongoDB for buckets where seq_max < before_seq, sorted newest-first.
  - [x] Unpack messages from buckets, flatten, reverse-sort by seq.
  - [x] Return messages + next_cursor (lowest seq in response) + has_more flag.
- [x] Implement `GET /channels/{id}/messages/{seq}` (single message by seq).
- [x] Test pagination across bucket boundaries (e.g., messages 75–125 spanning 2 buckets).

### Message Edit & Delete

- [x] Implement `PUT /channels/{id}/messages/{seq}` (edit message):
  - [x] Validate sender == current user.
  - [x] MongoDB: `$set` message body in the bucket (field: `edited_at`).
  - [x] Redis Pub/Sub: `PUBLISH chat:{cid} { event: "message.edited", seq, body }`.
- [x] Implement `DELETE /channels/{id}/messages/{seq}` (soft delete):
  - [x] Validate sender == current user.
  - [x] MongoDB: `$set messages.$.deleted_by = user_id` (keep message, mark deleted).
  - [x] Redis Pub/Sub: `PUBLISH chat:{cid} { event: "message.deleted", seq }`.

### Receipts & Reactions

- [x] Implement `POST /channels/{id}/messages/{seq}/read` (mark as read):
  - [x] MongoDB: `$push` receipt or `$set` existing receipt's read_at in the message.
  - [x] Redis Pub/Sub: `PUBLISH chat:{cid} { event: "read_receipt", seq, reader_id, read_at }`.
- [x] Implement `POST /channels/{id}/messages/{seq}/reactions` (add emoji reaction):
  - [x] MongoDB: `$push` reaction to message (user_id, emoji).
  - [x] Redis Pub/Sub: `PUBLISH chat:{cid} { event: "reaction_added", seq, emoji, user_id }`.
- [x] Implement `DELETE /channels/{id}/messages/{seq}/reactions/{emoji}` (remove reaction).

### Rate Limiting & Security

- [x] Implement Redis token-bucket rate limiter: 100 msg/user/min for send, 500 req/min for read.
- [x] Implement `req.user` permission check on all endpoints (sender validation for edit/delete).
- [x] Implement input validation: message body (1–5000 chars), emoji validation.
- [x] Add CORS allowlist, request/response logging middleware.

### Testing

- [x] Unit tests: sequence assignment, bucket creation, receipt aggregation logic.
- [x] Integration tests: send 10 messages in parallel, verify seq assigns uniquely and no gaps.
- [x] Load tests: 100 msg/sec sustained throughput, measure lock contention latency.
- [x] Mutation tests: edit/delete/react to same message in sequence, verify order.

**Acceptance criteria**

- [x] Send message via REST: message persists in MongoDB, seq assigned, ACK returns in <200ms.
- [x] Concurrent sends from 2 servers to same channel: seq numbers are unique, no duplicates or gaps.
- [x] History pagination: fetch 3 requests of 50 messages each, verify no duplicates across boundaries.
- [x] Edit/delete: original message text replaced, read receipt persists.
- [x] Rate limits block >100 msg/min per user.
- [x] All tests pass; latency P95 <500ms for send.

---

## Sprint 4 — Socket.IO Realtime Layer (Presence, Typing, Events) (2 weeks)

### Socket.IO Server Setup

- [x] Install and configure `socket.io` with Redis adapter for multi-server broadcasting.
- [x] Implement socket authentication middleware: validate JWT, attach `socket.user_id`.
- [x] Implement socket disconnection handling: clean up Redis session + presence.
- [x] Configure CORS for frontend origin.
- [x] Implement heartbeat: client sends heartbeat every 10s, server refreshes `presence:{uid}` TTL.

### Room Management

- [x] Implement room join: `socket.on('join_channel', { channel_id })`:
  - [x] Verify membership in PostgreSQL.
  - [x] `socket.join(`chat:{cid}`)` + add socket ID to Redis `session:{uid}`.
  - [x] Broadcast `{ event: "user_joined", user_id, display_name }` to room.
- [x] Implement room leave: `socket.on('leave_channel', { channel_id })`:
  - [x] `socket.leave(`chat:{cid}`)`.
  - [x] Broadcast `{ event: "user_left", user_id }` to room.

### Presence & Online Status

- [x] Implement presence update: `HSET presence:{uid}` with { status, last_seen, platform, device_id }, TTL 30s.
- [x] Implement presence broadcast: after join, `PUBLISH presence:{uid}` to notify contacts.
- [x] Implement presence list endpoint: `GET /channels/{id}/presence`:
  - [x] Fetch all members' presence from Redis (PIPELINE HGETALL for each).
  - [x] Return { online_members: [...], away_members: [...], offline_members: [...] }.
- [x] Implement exponential backoff for presence refreshes (client-side in Sprint 5).

### Typing Indicators

- [x] Implement typing start: `socket.on('typing_start', { channel_id })`:
  - [x] `ZADD typing:{cid} {now_ms + 5000} "{uid}:{display_name}"`.
  - [x] `io.to(`chat:{cid}`).emit('typing_update', { typing_users: [...] })`.
- [x] Implement typing stop: `socket.on('typing_stop', { channel_id })`:
  - [x] `ZREM typing:{cid} "{uid}:{display_name}"`.
  - [x] Broadcast updated list.
- [x] Implement server-side cleanup: ZREMRANGEBYSCORE to remove expired entries before each read.

### Redis Pub/Sub Integration

- [x] Subscribe server to Redis pub/sub channels: `chat:{cid}` for each joined channel.
- [x] On `PUBLISH chat:{cid} { event: "message.created", ... }`:
  - [x] Parse event, emit to room: `io.to(`chat:{cid}`).emit('message.created', message)`.
- [x] On `PUBLISH chat:{cid} { event: "message.edited", ... }`:
  - [x] Emit to room: `io.to(`chat:{cid}`).emit('message.edited', { seq, body, edited_at })`.
- [x] On `PUBLISH chat:{cid} { event: "read_receipt", ... }`:
  - [x] Emit to room: `io.to(`chat:{cid}`).emit('receipt_updated', { seq, reader_id, read_at })`.
- [x] On `PUBLISH chat:{cid} { event: "reaction_added", ... }`:
  - [x] Emit to room: `io.to(`chat:{cid}`).emit('reaction_added', { seq, emoji, user_id })`.

### Connection & Reconnection

- [x] Implement graceful disconnect: cleanup sessions on `socket.on('disconnect')`.
- [x] Implement reconnection state sync: client passes last known seq, server responds with new messages since.
- [x] Implement exponential backoff for reconnection (client-side in Sprint 5).
- [x] Test network failure scenarios: kill connection, verify client reconnects and catches up.

### Testing & Monitoring

- [x] Unit tests: room join/leave, presence TTL refresh, typing set/expire logic.
- [x] Integration tests: 2 connected clients, verify message broadcast to both.
- [x] Multi-server test: Socket.IO with Redis adapter, broadcast across 2 server instances.
- [x] Load test: 1000 concurrent connections, measure broadcast latency (target <100ms).
- [x] Monitor: socket count, message broadcast latency, Redis pub/sub backlog.

**Acceptance criteria**

- [x] Socket connects, authenticates, joins channel room.
- [x] User A sends message via REST; User B (connected to same channel) receives `message.created` event in <500ms.
- [x] Presence list shows online users with last_seen timestamp.
- [x] Typing indicator appears for 5s on other clients, auto-clears on timeout.
- [x] Client reconnects after network failure and catches up with missed messages.
- [x] Multi-server: message sent on server A reaches client on server B.

---

## Sprint 5 — Frontend MVP (Auth, Channels, Chat UI) (2 weeks)

### Auth UI & Flows

- [ ] Implement `SignUpForm` component (email, password strength indicator, agree to ToS).
- [ ] Implement `SignInForm` component (email, password, "forgot password" link).
- [ ] Implement email verification flow: extract token from URL, call `POST /auth/verify-email`, show success/error.
- [ ] Implement password reset flow: request email → send token → reset form → redirect to login.
- [ ] Implement JWT + refresh token handling: store access token in memory, refresh token in httpOnly cookie.
- [ ] Implement auth guard: redirect unauthenticated users to login.
- [ ] Implement logout: clear tokens, redirect to login.

### Channels & Conversations

- [ ] Implement Channels list view:
  - [ ] Call `GET /channels` with React Query (polling every 30s for new unread).
  - [ ] Display channel name, last message, unread badge, last_seen timestamp.
  - [ ] Sort by last_message_at DESC.
- [ ] Implement Create Channel modal (DM: select user, Group: name + select participants).
- [ ] Implement channel search (Cmd/Ctrl+K palette or search input).
- [ ] Implement "Pin channel" / "Archive channel" quick actions.
- [ ] Implement member list sidebar: name, online status (from presence), mute toggle.

### Chat UI & Message Display

- [ ] Implement Message list component:
  - [ ] Display messages paginated (cursor-based, `before_seq`).
  - [ ] "Load earlier" button at top; infinite scroll at bottom.
  - [ ] Group messages by sender + timestamp (15min window).
- [ ] Implement Message input box:
  - [ ] Text area with emoji picker, mention autocomplete (defer @mention tagging to Sprint 7+).
  - [ ] Send button (keyboard shortcut: Shift+Enter or Cmd+Enter).
- [ ] Implement Message item: sender, avatar, timestamp, body, reactions row, reply-to indicator.
- [ ] Implement message actions: edit (hover menu), delete, react, reply (defer threading to Sprint 7+).
- [ ] Implement optimistic send: send message, add to list with "pending" state, update on ACK with seq + server_at.

### Realtime Integration (Socket.IO Client)

- [ ] Install `socket.io-client` and implement Socket context provider.
- [ ] Implement `useSocket()` hook: connect on mount, join channel on route change, clean up on unmount.
- [ ] Listen to events: `message.created`, `message.edited`, `message.deleted`, `receipt_updated`, `reaction_added`.
- [ ] On `message.created`: add to list if from other user, or update optimistic placeholder if from self.
- [ ] Implement reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s).
- [ ] On reconnect: query server for missed messages (pass last known seq).
- [ ] Implement presence indicators: subscribe to `presence:{channel_members}`, show online/offline status.

### Typing Indicators & Live Presence

- [ ] Implement typing indicator: emit `typing_start` on first keystroke, `typing_stop` on blur/send.
- [ ] Display typing users: "Ravi is typing..." above message input.
- [ ] Implement presence list: sidebar shows "3 online, 5 away, 2 offline".
- [ ] Implement "last seen" badge: e.g., "Saw message at 2:45 PM".

### Data Caching & Sync

- [ ] Use React Query for REST endpoints with background refetch intervals.
- [ ] Configure React Query cache: 5 min stale time for channels, 10 min for message history.
- [ ] Implement scroll-to-bottom on new message (unless user scrolled up).
- [ ] Implement read receipt: mark messages as read when visible in viewport (Intersection Observer).

### Navigation & Layout

- [ ] Implement sidebar: channels list, create channel button, profile menu.
- [ ] Implement top bar: channel name, member count, search icon, more menu (pin, archive, leave).
- [ ] Implement responsive layout: mobile drawer for sidebar, hide on large screens.
- [ ] Implement loading states and error boundaries on channel + message list.

### Accessibility & Polish

- [ ] Add keyboard navigation: Cmd/Ctrl+K for search, Tab through channels, Enter to send.
- [ ] Add ARIA labels to interactive elements.
- [ ] Implement dark mode toggle (localStorage, TailwindCSS dark class).
- [ ] Implement toast notifications for errors (e.g., "Message failed to send").

### Testing

- [ ] Unit tests: optimistic send logic, receive message update, typing indicator state.
- [ ] Integration tests: signup → join channel → send message → receive in real-time.
- [ ] Visual regression tests (Chromatic or Percy) for key components.

**Acceptance criteria**

- [ ] User signs up, verifies email, logs in.
- [ ] User opens a channel and sees message history with pagination.
- [ ] User types a message and sends it (optimistic insert, then ACK).
- [ ] User B (connected to same channel) sees the message appear in real-time.
- [ ] Typing indicator shows "User A is typing..." for 5s then auto-clears.
- [ ] Presence shows "3 online" when 3 users are in channel.
- [ ] Edit/delete message: change persists across all clients in real-time.
- [ ] React with emoji: reaction appears instantly, other clients see it in <500ms.
- [ ] Client reconnects after network loss and catches up with missed messages.
- [ ] n8n receives and processes webhooks (message tagging occurs).

---

## Sprint 6 — Media Uploads, Email, Webhooks & n8n (2 weeks)

### S3 Media Upload (Server-Side)

- [ ] Implement `POST /upload/presigned-url` (generate S3 presigned upload URL):
  - [ ] Accept media_type (image, video, audio, file), filename.
  - [ ] Generate S3 key: `media/{channel_id}/{date}/{message_id}/{filename}`.
  - [ ] Generate presigned URL with 60s expiry.
  - [ ] Return { url, key, expiry }.
- [ ] Implement lifecycle rules: auto-delete unprocessed uploads after 24h.
- [ ] Implement CORS on S3 bucket: allow PUT from frontend origin.

### Client Upload UI

- [ ] Implement file picker in message input: click to select, or drag-drop.
- [ ] On file select:
  - [ ] Call `POST /upload/presigned-url` to get signed URL.
  - [ ] PUT file directly to S3 (multipart for large files, progress callback).
  - [ ] Show upload progress bar (visually block send until complete).
- [ ] On upload success: attach media to message payload, send message with media URLs.
- [ ] Implement media preview: image thumbnail, video play button, audio player, file icon.
- [ ] Implement attachment gallery: media messages tab in channel (use MongoDB `idx_channel_media` index).

### Email Integration (Transactional via Resend)

- [ ] Configure Resend API key and sender email.
- [ ] Implement email templates: welcome, email-verification, password-reset.
- [ ] Update auth endpoints to call Resend:
  - [ ] `POST /auth/signup` → send welcome email.
  - [ ] `POST /auth/verify-email` → on click, send confirmation email.
  - [ ] `POST /auth/forgot-password` → send reset link email.
- [ ] Implement email unsubscribe link (optional for MVP).

### n8n Webhooks & Automations

- [ ] Deploy n8n instance (or use cloud).
- [ ] Implement server webhooks: `POST /webhooks/n8n/message-created`, `POST /webhooks/n8n/user-signed-up`.
- [ ] Implement webhook enqueue (Redis queue or in-memory): ack 202 immediately, process async.
- [ ] Implement webhook retry logic: exponential backoff, max 5 retries, dead-letter queue on failure.
- [ ] Implement HMAC-SHA256 webhook signing: include `X-Signature` header, n8n verifies.
- [ ] Create n8n flow: trigger on message webhook → extract sentiment (call OpenAI or Hugging Face API) → store tag in MongoDB message.
- [ ] Create n8n flow: trigger on user signup → log to Google Sheets or Slack (optional).
- [ ] Implement monitoring: log webhook events, latencies, failures.

### Media Processing (Optional MVP+)

- [ ] Install `sharp` for image optimization: resize, convert to WebP.
- [ ] Implement async media job: after upload, create thumbnail (360w) and preview (1080w).
- [ ] Store processed files in S3 with optimized CDN paths.
- [ ] Update MongoDB message: store both original + thumbnail URLs.

### Testing

- [ ] Unit tests: presigned URL generation, S3 key formatting.
- [ ] Integration tests: upload file to S3, attach to message, verify URL persists in MongoDB.
- [ ] Email tests: verify Resend receives correct payload, simulate bounce/unsubscribe.
- [ ] Webhook tests: send webhook to n8n, verify signature validation, retry on failure.

**Acceptance criteria**

- [ ] User selects image, sees upload progress, sends message with attachment.
- [ ] Message displays image thumbnail with zoom-on-click preview.
- [ ] Verification email sent to user on signup; user clicks link, account activates.
- [ ] n8n receives webhook on new message; sentiment tag appears in message history.
- [ ] Upload fails gracefully: user sees error toast, can retry.
- [ ] Webhook fails: server logs error, retries with backoff, eventually succeeds.

---

## Sprint 7 — Observability, Hardening, Performance (2 weeks)

### Error Tracking & Observability

- [ ] Integrate Sentry: install SDK, configure DSN, enable error capture on both backend + frontend.
- [ ] Implement custom breadcrumbs: log socket events, API calls, database queries.
- [ ] Implement performance monitoring: mark critical paths (send message, fetch history, auth).
- [ ] Set up alerts: critical errors (5xx, auth failures, database connection loss).
- [ ] Implement health check aggregator: `GET /health` returns { postgres, mongodb, redis } with latencies.
- [ ] Add request/response logging middleware: log endpoint, status, latency, user_id.

### Database & Connection Tuning

- [ ] Tune Prisma connection pool: set min/max based on server threads (default 5/10).
- [ ] Tune MongoDB connection pool: set maxPoolSize (default 100, monitor connection count).
- [ ] Tune Redis connection backoff: implement exponential backoff for reconnects.
- [ ] Implement connection timeout middleware: cancel slow queries after 10s (configurable).
- [ ] Monitor: active connections, query latencies (P50, P95, P99).
- [ ] Run load test: 100 concurrent users, measure DB connection saturation.

### Cold-Start Mitigations

- [ ] Implement scheduled ping jobs: hit `/health` every 5 min to keep Render container warm.
- [ ] Implement connection keepalive: periodically query each database to prevent timeout.
- [ ] Implement pre-warmed connection pools on server startup.
- [ ] Measure and log cold-start latency on deploy.

### Security Hardening

- [ ] Implement HMAC-SHA256 webhook signature verification on all n8n webhooks.
- [ ] Implement signed S3 URLs with TTL (10 min for upload, 24h for download).
- [ ] Implement rate-limit headers: return X-RateLimit-\* on all endpoints.
- [ ] Implement input sanitization: SQL injection, XSS, command injection tests.
- [ ] Implement CSRF protection (if needed for forms).
- [ ] Implement ACL checks: verify user is channel member before responding with messages.
- [ ] Enable HTTPS everywhere, enforce HSTS header.
- [ ] Review all user inputs: validate length, type, format with Zod before DB insert.

### E2E & Load Testing

- [ ] Create Playwright E2E test suite: signup → verify → login → create channel → send message → edit/delete → logout.
- [ ] Create load test: 100 concurrent users, each sends 10 messages/min for 10 min.
- [ ] Measure: response latencies, database query times, error rates, memory consumption.
- [ ] Run load test against staging environment before launch.
- [ ] Create smoke test: basic happy path (login → send → logout) runs before every deploy.

### Monitoring & Alerts

- [ ] Set up Upstash Redis dashboard monitoring: key count, memory, hit rates.
- [ ] Set up MongoDB Atlas monitoring: connection count, query latency, storage.
- [ ] Set up PostgreSQL monitoring: active connections, query cache hit ratio.
- [ ] Set up alerts: database down, error rate >1%, response time P95 >1s, memory >80%.
- [ ] Create runbook: escalation procedures, on-call contacts.

### Testing

- [ ] Unit tests: all middleware, utility functions, validators.
- [ ] Integration tests: full flows (auth, send, edit, delete, reactions).
- [ ] Security tests: attempt SQL injection, XSS, CSRF — all should fail gracefully.
- [ ] Load tests: measure latency under 100, 500, 1000 concurrent users.

**Acceptance criteria**

- [ ] Errors are captured in Sentry with full stack traces + context.
- [ ] Health check returns 200 with all services green.
- [ ] Load test sustains 100 concurrent users with <500ms P95 latency.
- [ ] Cold-start latency <2s (on first request after deploy).
- [ ] All rate limits enforced; requests over limit get 429.
- [ ] Signed webhook requests pass verification; tampered requests fail 401.
- [ ] E2E test suite passes 100% on staging before deploy.

---

## Sprint 8 — Staging, Launch, Post-Launch Tasks (2 weeks)

### Staging Environment

- [ ] Create staging environment: separate PostgreSQL, MongoDB, Redis, S3 buckets.
- [ ] Copy production-like env vars to staging (except real API keys — use test credentials).
- [ ] Deploy backend to staging (Render, Railway, or similar).
- [ ] Deploy frontend to staging (Vercel, Netlify).
- [ ] Configure staging domain: e.g., `staging.vibechat.dev`.
- [ ] Enable SSL certificate for staging domain.

### E2E Testing & QA

- [ ] Run full E2E test suite on staging (Playwright, Cypress, or manual).
- [ ] Test flows: signup → verify → login → create DM → send message → edit/delete → logout.
- [ ] Test group flows: create group → add members → send message → see presence.
- [ ] Test media: upload image → verify thumbnail shows → edit caption → delete.
- [ ] Test realtime: 2 browsers, verify message appears in real-time.
- [ ] Test presence: log out one user, verify offline in other user's presence list.
- [ ] Test error scenarios: network failure, invalid token, rate limit exceeded.
- [ ] QA sign-off: all test cases pass.

### Performance & Load Testing (Staging)

- [ ] Run load test on staging: 100 concurrent users, 10 msg/min for 30 min.
- [ ] Verify: no errors, latencies stable, no DB connection leaks.
- [ ] Verify: Sentry error rate <0.1%, no critical alerts.
- [ ] Measure: cost per request (API, database, storage), estimate production cost.

### Security Review & Compliance

- [ ] Security audit: OWASP Top 10 checklist.
- [ ] Privacy: verify no PII in logs, Sentry, or cache.
- [ ] Terms of Service: draft if needed (defer detailed legal review to post-launch).
- [ ] Data retention: implement cleanup jobs (e.g., delete verified-but-unused accounts after 30 days).

### Launch Checklist

- [ ] DNS: configure production domain, verify CNAME/A records.
- [ ] SSL certificate: ensure valid, set auto-renewal.
- [ ] Environment variables: all production secrets provisioned.
- [ ] Database backups: enable automated daily backups + point-in-time recovery.
- [ ] Monitoring & alerts: all dashboards, alerts, and runbooks ready.
- [ ] Incident response: on-call schedule, escalation contact, communication channels.
- [ ] Onboarding docs: README, setup guide, API docs (Swagger / Postman collection).
- [ ] Announcement: prepare launch post, social media, beta user email.

### Production Deployment

- [ ] Deploy backend to production (same infra as staging, separate secrets).
- [ ] Deploy frontend to production.
- [ ] Run smoke test on production: verify `/health` returns 200, login works.
- [ ] Monitor error rate & latencies for 1 hour post-deploy.
- [ ] Monitor cost: verify spending matches estimates.
- [ ] Announce launch: send email to beta testers, post on social media.

### Post-Launch Tasks & Deferred Backlog

- [ ] Collect user feedback: in-app survey, Discord, email.
- [ ] Monitor analytics: sign-ups, DAU, message volume, error rates.
- [ ] Create deferred features backlog for Sprint 9+:
  - [ ] End-to-end encryption (E2EE): implement Signal Protocol with `one_time_prekeys`.
  - [ ] Full-text search: implement MongoDB Atlas Search on messages.
  - [ ] Message threading: replies group under parent message.
  - [ ] Voice/video calls: integrate Twilio or Daily.dev.
  - [ ] Read-only channels / announcements: admin-only send.
  - [ ] Group permissions: roles (admin, moderator, member) with ACL.
  - [ ] Custom emoji / emoji reactions: expand from 4 default emoji.
  - [ ] User mentions (@name) + notification: push notification when mentioned.
  - [ ] Message forwarding: send message to another channel.
  - [ ] Typing indicator improvements: show % similarity to avoid spam.
  - [ ] User profile: bio, avatar, status message.
  - [ ] Block / report user: harassment prevention.
  - [ ] Giphy / Tenor integration: GIF picker in message input.

### Testing & Monitoring

- [ ] Integration test: production smoke test (login → send → logout).
- [ ] Monitoring: daily dashboard review, alert response SLA <15 min.

**Acceptance criteria**

- [ ] Staging passes all E2E tests (100% pass rate).
- [ ] Load test on staging: 100 users, no errors, P95 <500ms.
- [ ] Production deployment succeeds, smoke test passes.
- [ ] Error rate <0.1%, latency P95 <500ms on production (1h post-deploy).
- [ ] Launch announcement sent, beta users can sign up and use app.
- [ ] Monitoring + alerts active, on-call rotation established.
- [ ] Post-launch backlog documented and prioritized.

---

### Prioritization & Notes

- Sprint lengths assume a small team (2 engineers + 1 QA/DevOps part-time). Adjust story points accordingly.
- Break large items into smaller tickets before sprint planning (e.g., message endpoints → create, list, edit, delete).
- Keep at most 3 high-risk items per sprint to limit scope creep.

---

## Architecture Principles (Reference from db.md)

### Polyglot Persistence Strategy

- **PostgreSQL (Tier 1):** Identity, auth, group topology, access control — source of truth for ACID transactions and complex JOINs.
- **MongoDB (Tier 2):** Message history with bucket pattern (50–100 msgs/doc) — avoids per-message document overhead.
- **Redis (Tier 3):** Ephemeral state and pub/sub — online status, unread counters, typing, sequence counter, sessions.
- **S3 (Tier 4):** Media storage — keeps message payloads lean, enables independent CDN policies.

### Critical Paths (Performance Targets)

#### Path A: Send Message (Write Hot Path)

```
1. Acquire lock (SET NX EX)
2. INCR sequence counter
3. MongoDB $push into bucket
4. Redis INCR unread for each recipient
5. Release lock
Target latency: <200ms end-to-end
```

#### Path B: Fetch Chat History (Cursor-Based Pagination)

```
1. Query MongoDB for buckets (seq_max < before_seq)
2. Unpack messages from 1–3 buckets
3. Return flattened, reverse-sorted messages + next_cursor
Target latency: <500ms for 50 messages
```

#### Path C: Publish Event (Socket.IO Broadcast)

```
1. REST endpoint processes (locks, DB writes, etc.)
2. PUBLISH to Redis pub/sub: chat:{cid}
3. Socket servers subscribe and forward to connected clients
4. Clients receive event and update UI
Target latency: <500ms from send to on-screen (excluding network delay)
```

### Key Design Decisions

| Decision                         | Rationale                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| **Bucket Pattern**               | No write amplification per group size; 50–100 msgs/bucket avoids 16MB document limit. |
| **Sequence Numbers**             | Redis INCR ensures monotonic, gapless seq across all messages (idempotent cursor).    |
| **Delivery Receipts in Message** | No fan-out rows; per-member sub-documents with $push/atomic ops.                      |
| **S3 URLs in MongoDB**           | Keeps buckets <1MB; message and media metadata co-located.                            |
| **Redis First-Read**             | Avoid cold DB hits for ephemeral state (online, unread, typing).                      |
| **Socket.IO + Redis Adapter**    | Multi-server broadcasts; room-based fan-out without request-per-client.               |
| **Distributed Lock (msg:lock)**  | Prevents race conditions on sequence counter and bucket writes.                       |

### Indexing Strategy

**PostgreSQL:**

- `idx_users_email` (UNIQUE, LOWER): login hot path
- `idx_cm_user_active` (user_id, joined_at DESC): load user's channel list
- `idx_rt_token` (partial, WHERE revoked_at IS NULL): refresh token validation

**MongoDB:**

- `idx_channel_seq_max` (channel_id, seq_max DESC): primary read path for pagination
- `idx_channel_open_bucket` (partial, WHERE message_count < 100): fast bucket lookup on send
- `idx_channel_media` (sparse): gallery tab queries

**Redis:**

- No indexes needed; all operations are O(1) or O(N scan) with early exits.

### Load Targets

- **Users:** Up to 10K DAU in Sprint 8; target 100K+ with architecture as-is.
- **Concurrency:** 100 concurrent connections per server; 10 servers = 1000 concurrent.
- **Message Volume:** 100 msg/sec sustained throughput (1000 users × 1 msg/10s).
- **Latency:** P95 <500ms for send/fetch; P99 <1000ms.
- **Error Rate:** <0.1% (99.9% availability target).

### Security Considerations

- **HMAC Webhook Signing:** n8n webhooks signed with SHA-256 + shared secret.
- **Signed S3 URLs:** 60s TTL for upload, 24h for download.
- **Rate Limiting:** 100 msg/user/min, 5 signup/email/min, 20 login/email/min.
- **ACL Enforcement:** Membership check before each message query.
- **JWT Secrets:** Stored in env vars, rotated quarterly.
- **Password Hashing:** bcrypt cost ≥12, never log plaintext.

---

If you'd like, I can create GitHub issues from this checklist or add a GitHub Project board with these items—tell me which sprint to start with and I will scaffold issues with descriptions and estimates.
