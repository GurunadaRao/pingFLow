# Prisma Setup & Migration Notes

This document explains the Prisma setup added to the repository and how relational models are mapped between PostgreSQL (Prisma) and MongoDB.

## What was added

- `apps/server/prisma/schema.prisma` — Prisma schema describing relational models: `User`, `RefreshToken`, `Conversation`, `Participant`.
- `apps/server/src/lib/prisma.ts` — Prisma client singleton wrapper to import throughout the server.
- `.env.example` now contains `DATABASE_URL` for Postgres connection.
- `package.json` script: `prisma:generate` to generate the Prisma client.

## Data mapping decisions

- Postgres (Prisma):
  - `User` — canonical user records, credentials, usernames, roles.
  - `RefreshToken` — refresh token lifecycle stored relationally for safe rotation and queries.
  - `Conversation` & `Participant` — conversation metadata and membership management.

- MongoDB (existing):
  - `Message` documents and append-heavy message history remain in MongoDB. This leverages Mongo's document model for efficient chunked history writes and reads.
  - Media metadata and other high-throughput, unstructured message blobs remain in MongoDB.

## Next steps to complete migration

1. Install dependencies and generate Prisma client:

```bash
cd apps/server
npm install
npm run prisma:generate
```

2. Create and run migrations against your Postgres dev database:

```bash
npx prisma migrate dev --name init
```

3. Replace usages of Mongoose `UserModel` and `RefreshTokenModel` with the Prisma client (`src/lib/prisma.ts`). Example:

```ts
import { prisma } from './lib/prisma';

const user = await prisma.user.create({ data: { ... } });
```

4. Keep message-related code using Mongo models. Update code comments and docs to reflect the hybrid architecture.

5. Add integration tests and update CI to run `prisma:generate` before tests.

## Notes & caveats

- Prisma `@prisma/client` must match the `prisma` CLI version; install compatible versions if you encounter version mismatch errors.
- When migrating production data from Mongo to Postgres for users, plan a careful data migration strategy (scripts, unique constraint handling, locking).
- Keep DB connection pooling and limits in mind when deploying to free-tier Postgres providers.

If you want, I can:

- Convert `auth.service.ts` to use Prisma for `User` and `RefreshToken` now, or
- Add migration scripts and CI steps to run Prisma migrations in CI.
  Which should I implement next?
