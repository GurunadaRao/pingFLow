# PingFlow

<p align="center">
	<strong>Open-source, production-ready chat application with n8n automation integration.</strong>
</p>

<p align="center">
	<img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
	<img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
	<img src="https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
	<img src="https://img.shields.io/badge/n8n-Automation-EF4B2F?style=for-the-badge&logo=n8n&logoColor=white" alt="n8n">
	<img src="https://img.shields.io/badge/Monorepo-Workspace-111827?style=for-the-badge" alt="Monorepo">
</p>

PingFlow is built for teams that want a modern chat application they can own, extend, and deploy with confidence. The product combines a real-time React client, a Node.js backend, and automation-first workflows designed to connect chat experiences with n8n-powered processes.

## What PingFlow Is

PingFlow is a chat platform designed around three goals:

- provide a clean, fast chat experience
- keep the backend production-ready and maintainable
- make automation and workflow integration a first-class part of the product

This repository is structured as a monorepo so the frontend, backend, and shared packages can evolve together without creating unnecessary coupling.

## What’s Inside

- `apps/client` - React, TypeScript, Vite, Tailwind, and the chat interface
- `apps/server` - Express, Socket.IO, MongoDB, JWT auth, and Redis utilities
- `packages` - Shared workspace packages for reusable code and types
- `docs` - Project structure and supporting documentation

## Core Capabilities

- Real-time chat UI built for responsive interaction
- Production-oriented backend architecture with authentication and sockets
- n8n-friendly automation integration for workflow-driven extensions
- Workspace-based code organization that keeps the project scalable

## Tech Stack

- Client: React, TypeScript, Vite, Tailwind CSS
- Server: Node.js, Express, Socket.IO, MongoDB, JWT, Redis
- Shared tooling: TypeScript workspace packages

## Repository Structure

The client follows a feature-friendly layout under `apps/client/src`:

- `app` for app-level wiring
- `components` for shared UI pieces such as chat, AI, dashboard, and layout components
- `features` for domain-specific folders like auth, chat, messages, workflows, and settings
- `hooks`, `lib`, `pages`, `providers`, `routes`, `services`, `sockets`, `store`, `styles`, `types`, and `utils`

The broader layout is documented in [docs/folder-structure.md](docs/folder-structure.md).

## Getting Started

Install dependencies in each app directory:

```bash
cd apps/client
npm install

cd ../server
npm install
```

If your local setup requires environment variables, create the relevant `.env` files for the client and server before starting either app.

## Running the Apps

### Client

```bash
cd apps/client
npm run dev
```

### Server

```bash
cd apps/server
npm run dev
```

## Available Scripts

### Client

- `npm run dev` - Start the Vite development server
- `npm run build` - Type-check and build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview the production build

### Server

- `npm run dev` - Start the server in watch mode
- `npm run build` - Compile TypeScript to `dist`
- `npm start` - Run the compiled server

## Contributing

Contributions are welcome. If you add features, change the architecture, or expand the automation layer, please update the documentation alongside the code.

## License

Add the project license here before publishing publicly. A license file is required for a complete open-source release.
