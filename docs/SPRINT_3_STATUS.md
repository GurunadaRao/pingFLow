# VibeChat — Sprint 3 Plan

## Sprint 3 Goal

Deliver the REST messaging critical path for channels and chat history. Build reliable message send, history retrieval, edit/delete, receipts, reactions, and rate limiting so the app can support live chat operations over the API.

## Core Objectives

- `POST /channels/{id}/messages` — reliable message send with idempotency, sequence assignment, and MongoDB bucket persistence.
- `GET /channels/{id}/messages` — cursor-based message history across bucket boundaries.
- `GET /channels/{id}/messages/{seq}` — fetch a single message by sequence.
- `PUT /channels/{id}/messages/{seq}` — edit a message.
- `DELETE /channels/{id}/messages/{seq}` — soft delete a message.
- `POST /channels/{id}/messages/{seq}/read` — mark as read.
- `POST /channels/{id}/messages/{seq}/reactions` — add a reaction.
- `DELETE /channels/{id}/messages/{seq}/reactions/{emoji}` — remove a reaction.
- Rate limiting and validation for send/read operations.

## Sprint 3 Plan

### Week 1

1. Define REST payload contracts and expectations for idempotency and cursor pagination.
2. Implement `SequenceService` usage in message send flow.
3. Add `POST /channels/{id}/messages` with:
   - membership check
   - distributed lock via Redis
   - sequence allocation
   - MongoDB `message_buckets` open bucket append / new bucket creation
   - Redis unread counter updates
   - idempotency handling
4. Build helper logic for message bucket insertion and bucket rollover.

### Week 2

1. Add message history APIs:
   - `GET /channels/{id}/messages`
   - `GET /channels/{id}/messages/{seq}`
2. Add edit/delete message support and Redis publish hooks for realtime events.
3. Add receipts and reactions endpoints.
4. Implement Redis-based rate limiting and request validation.
5. Write tests:
   - bucket split logic
   - pagination across buckets
   - concurrent send sequencing
   - rate limiting enforcement
6. Document API behavior and finalize migration to Sprint 4 readiness.

## Acceptance Criteria

- Message send returns `{ _mid, seq, server_at }` and persists in MongoDB.
- Concurrent send requests assign unique, gap-free sequence numbers.
- History pagination works correctly across buckets.
- Edit/delete operations update message state and emit change events.
- Rate limiting blocks abuse and valid requests continue through.
- Tests cover send/historic pagination and sequence concurrency.

## Notes

- Sprint 3 is intentionally focused on REST write/read hot path. Socket.IO realtime delivery remains Sprint 4.
- This sprint should leave the backend ready for frontend messaging integration.
