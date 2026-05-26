# Chat Routes Implementation Action Plan (Client)

Last updated: 2026-05-19

## Goal

Implement production-ready client routes and API integrations for the chat application, starting from the current blank route setup.

## Current Baseline

- Router is enabled with `BrowserRouter`.
- Only one route exists: `/`.
- No client API layer is implemented yet in `src/api`, `src/services`, or `src/sockets`.
- Server auth routes are mounted under `/api/:version/auth` (`:version` defaults to `v1`).

## Implementation Order

1. Setup shared API client and route constants.
2. Implement auth routes and auth API integration.
3. Implement conversation list route and data fetching.
4. Implement conversation detail route and message history.
5. Implement message send flow.
6. Implement optional streaming route support.
7. Add loading, error, empty states, and route guards.
8. Add tests and finalize acceptance criteria.

## Auth Routes Action Plan

### A) Client Route: `/login`

Purpose: Sign in existing users.

Actions:

1. Add route and `LoginPage` component.
2. Build email/password form with validation.
3. Submit credentials to `POST /api/v1/auth/login`.
4. Store `accessToken` and `refreshToken` securely.
5. Redirect authenticated users to `/`.

Definition of done:

1. Valid credentials log in and navigate to chat.
2. Invalid credentials show actionable error message.

---

### B) Client Route: `/register`

Purpose: Create a new account.

Actions:

1. Add route and `RegisterPage` component.
2. Build name/email/password form with validation.
3. Submit to `POST /api/v1/auth/register`.
4. On success, either auto-login or redirect to `/login`.

Definition of done:

1. New user registration completes with clear success state.
2. Duplicate email and validation errors are shown correctly.

---

### C) Protected Client Route: `/profile` (or profile drawer in `/`)

Purpose: Show authenticated user profile.

Actions:

1. Add protected route (or authenticated profile surface).
2. Call `GET /api/v1/auth/profile` with bearer token.
3. If token is expired, call refresh flow and retry once.
4. On unauthorized failure, clear session and route to `/login`.

Definition of done:

1. Authenticated users can load profile data.
2. Unauthenticated users are redirected to `/login`.

---

### D) Auth API Route: `POST /api/v1/auth/login`

Purpose: Exchange credentials for session tokens.

Actions:

1. Add typed client API function in `src/api/auth`.
2. Return strongly typed `{ accessToken, refreshToken, user }` shape.
3. Persist tokens and user snapshot.

Definition of done:

1. Client state switches to authenticated after login.

---

### E) Auth API Route: `POST /api/v1/auth/register`

Purpose: Create user account.

Actions:

1. Add typed register API function.
2. Handle server validation/auth errors consistently.
3. Trigger post-register login flow or login redirect.

Definition of done:

1. Registration path is fully functional and recoverable on error.

---

### F) Auth API Route: `POST /api/v1/auth/refresh`

Purpose: Rotate refresh token and issue a new access token.

Actions:

1. Add refresh function in auth API module.
2. Implement API interceptor or wrapper retry logic for `401`.
3. Prevent refresh stampede with a single in-flight refresh lock.

Definition of done:

1. Expired access tokens refresh transparently for valid sessions.

---

### G) Auth API Route: `GET /api/v1/auth/profile`

Purpose: Verify session and fetch current user.

Actions:

1. Add profile endpoint function with auth header.
2. Call on app bootstrap after token hydration.
3. Update global auth state with current user.

Definition of done:

1. App restores session correctly after page reload.

---

### H) Client Action Route: `/logout` (action, not page)

Purpose: End session locally and route safely.

Actions:

1. Clear auth state and tokens.
2. Clear user-specific chat cache/state.
3. Navigate to `/login`.

Definition of done:

1. Logging out always returns user to unauthenticated state.

## Route-By-Route Action Plan

### 1) Client Route: `/`

Purpose: Main chat landing view.

Actions:

1. Replace blank element with chat shell page component.
2. Render two regions: conversation sidebar and active-chat panel.
3. On first load, request conversations from API.
4. If conversations exist, auto-select the latest and navigate to `/chat/:conversationId`.
5. If none exist, keep empty-chat state visible.

Definition of done:

1. Opening `/` displays chat shell (not blank).
2. User sees either conversation list or empty state.

---

### 2) Client Route: `/chat/:conversationId`

Purpose: Conversation detail page.

Actions:

1. Add dynamic route in router config.
2. Read `conversationId` from route params.
3. Fetch message history for the selected conversation.
4. Render messages in chronological order.
5. Handle invalid or missing conversation IDs with fallback to `/`.

Definition of done:

1. Navigating to `/chat/<id>` loads message history for that conversation.
2. Invalid IDs gracefully recover to `/` with user-friendly state.

---

### 3) API Route: `GET /api/conversations`

Purpose: Populate sidebar conversation list.

Actions:

1. Add typed API function in `src/api` (request + response model).
2. Call on app startup and after new conversation creation.
3. Store result in client state (`src/store` or feature-level state).
4. Add retries/toast for transient errors.

Definition of done:

1. Conversation list renders from server data.
2. Loading and error states are visible and recoverable.

---

### 4) API Route: `GET /api/messages/:conversationId`

Purpose: Load conversation history.

Actions:

1. Add typed API function for messages by conversation.
2. Trigger call whenever `conversationId` changes.
3. Normalize/shape messages for rendering.
4. Preserve scroll-to-bottom behavior after load.

Definition of done:

1. Selecting a conversation shows its historical messages.
2. Switching conversations updates history correctly.

---

### 5) API Route: `POST /api/messages`

Purpose: Send user message.

Actions:

1. Add send-message API function.
2. Wire message input submit action to API call.
3. Optimistically append pending message in UI.
4. Reconcile with server response (id, timestamp, status).
5. Handle failure rollback with resend action.

Definition of done:

1. User can send a message and see confirmed server state.
2. Failed sends are visible and retryable.

---

### 6) API Route: `POST /api/chat/stream` (optional, if streaming enabled)

Purpose: Stream assistant response tokens.

Actions:

1. Decide transport: SSE, fetch stream, or WebSocket.
2. Add stream handler service in `src/services` or `src/sockets`.
3. Render token-by-token output in current conversation.
4. Add cancel generation and reconnect behavior.

Definition of done:

1. Assistant response appears progressively.
2. User can stop generation safely.

## Cross-Cutting Tasks

1. Add route constants in a shared file (for internal navigation safety).
2. Add API base URL config via `VITE_API_BASE_URL`.
3. Add auth header injection if protected endpoints are used.
4. Add route guard component for protected routes.
5. Add global error formatter and toast/alert mapping.
6. Add request abort on route change to prevent stale updates.

## File Targets (Recommended)

- `src/App.tsx` for route declarations.
- `src/pages/auth` for `LoginPage` and `RegisterPage`.
- `src/pages/chat` for page-level route components.
- `src/api` for endpoint wrappers.
- `src/services` for orchestration and stream handling.
- `src/store` for route-aware chat state.

## Validation Checklist

1. Route navigation works for `/` and `/chat/:conversationId`.
2. Auth navigation works for `/login`, `/register`, and protected routes.
3. No blank screen on initial load.
4. API loading, empty, success, and error states are implemented.
5. Message send flow works with optimistic UI and rollback.
6. Access token refresh and logout behavior are verified.
7. TypeScript passes for route params and API response types.
8. Basic route integration tests are added.

## Milestones

1. Milestone A: Auth routes + `login/register/refresh/profile` complete.
2. Milestone B: `/` + `GET /api/conversations` complete.
3. Milestone C: `/chat/:conversationId` + `GET /api/messages/:conversationId` complete.
4. Milestone D: `POST /api/messages` complete.
5. Milestone E: streaming and resilience polish complete.
