pingflow/
│
├── apps/
│   │
│   ├── client/                         # React Frontend
│   │   ├── public/
│   │   └── src/
│   │       ├── api/
│   │       ├── app/
│   │       ├── assets/
│   │       ├── components/
│   │       │   ├── common/
│   │       │   ├── chat/
│   │       │   ├── ai/
│   │       │   ├── workflow/
│   │       │   ├── dashboard/
│   │       │   └── layout/
│   │       │
│   │       ├── features/
│   │       │   ├── auth/
│   │       │   ├── chat/
│   │       │   ├── messages/
│   │       │   ├── workflows/
│   │       │   ├── ai/
│   │       │   ├── notifications/
│   │       │   ├── integrations/
│   │       │   └── settings/
│   │       │
│   │       ├── hooks/
│   │       ├── lib/
│   │       ├── pages/
│   │       ├── providers/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── sockets/
│   │       ├── store/
│   │       ├── styles/
│   │       ├── types/
│   │       ├── utils/
│   │       └── main.tsx
│   │
│   ├── server/                         # Main Backend API
│   │   └── src/
│   │       ├── config/
│   │       ├── constants/
│   │       ├── controllers/
│   │       ├── middleware/
│   │       ├── models/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── repositories/
│   │       ├── sockets/
│   │       ├── events/
│   │       ├── queues/
│   │       ├── jobs/
│   │       ├── workflows/
│   │       ├── integrations/
│   │       ├── ai/
│   │       │   ├── prompts/
│   │       │   ├── agents/
│   │       │   ├── embeddings/
│   │       │   ├── summarizer/
│   │       │   ├── parsers/
│   │       │   └── context/
│   │       │
│   │       ├── validations/
│   │       ├── helpers/
│   │       ├── utils/
│   │       ├── database/
│   │       ├── logs/
│   │       ├── tests/
│   │       ├── app.ts
│   │       └── server.ts
│   │
│   ├── automation-worker/              # Dedicated Worker Service
│   │   └── src/
│   │       ├── jobs/
│   │       ├── processors/
│   │       ├── queues/
│   │       ├── workflows/
│   │       ├── triggers/
│   │       ├── integrations/
│   │       ├── services/
│   │       └── worker.ts
│   │
│   ├── ai-service/                     # AI Microservice
│   │   └── src/
│   │       ├── agents/
│   │       ├── prompts/
│   │       ├── embeddings/
│   │       ├── summarization/
│   │       ├── translation/
│   │       ├── parsing/
│   │       ├── rag/
│   │       ├── vector-db/
│   │       ├── memory/
│   │       ├── services/
│   │       └── server.ts
│
├── packages/                           # Shared Packages
│   │
│   ├── ui/                             # Shared UI Components
│   ├── types/                          # Shared TS Types
│   ├── eslint-config/
│   ├── ts-config/
│   ├── shared-utils/
│   ├── shared-hooks/
│   └── shared-constants/
│
├── infrastructure/
│   │
│   ├── docker/
│   │   ├── client.Dockerfile
│   │   ├── server.Dockerfile
│   │   ├── worker.Dockerfile
│   │   └── ai-service.Dockerfile
│   │
│   ├── kubernetes/
│   │   ├── frontend/
│   │   ├── backend/
│   │   ├── redis/
│   │   ├── mongodb/
│   │   ├── ingress/
│   │   └── monitoring/
│   │
│   ├── nginx/
│   ├── terraform/
│   └── github-actions/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── workflows/
│   ├── deployment/
│   └── diagrams/
│
├── scripts/
│   ├── seed/
│   ├── migrations/
│   ├── backups/
│   └── setup/
│
├── monitoring/
│   ├── grafana/
│   ├── prometheus/
│   └── loki/
│
├── .env
├── .env.production
├── .gitignore
├── docker-compose.yml
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── LICENSE