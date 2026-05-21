# Contributing to PingFlow

Thank you for your interest in contributing to PingFlow! This repository is designed to be collaborative and open, with a monorepo structure for the client, server, and shared packages.

## Getting Started

1. Fork the repository and clone your fork.
2. Install dependencies in the package or app you are working on.
   - `cd apps/client && npm install`
   - `cd apps/server && npm install`

## How to Contribute

### Bug reports

- Search existing issues first.
- Open a new issue with a clear title and reproduction steps.
- Include expected behavior, actual behavior, and any relevant logs.

### Feature requests

- Create a new issue describing the problem and your proposed solution.
- Keep requests focused and aligned with the project goals.

### Pull requests

- Create your branch from `main`.
- Follow a clear branch naming pattern such as `feature/<name>` or `fix/<name>`.
- Keep changes small and self-contained.
- Add or update tests when relevant.
- Document new functionality in `README.md` or `docs/` if needed.

## Code Style

- Write TypeScript for all new source code.
- Use `npm run lint` in the appropriate workspace package before opening a PR.
- Keep formatting consistent with existing files.

## Testing

- Run the available test commands in the workspace where your change lives.
- If you add backend logic, include tests in `apps/server/src` or `apps/server/test`.
- If you add frontend behavior, include tests in `apps/client/src`.

## Review Process

- PRs should include a concise summary of the change and why it is needed.
- Maintain backwards compatibility unless the change is explicitly breaking.
- Be prepared to respond to review feedback and make follow-up changes.

## Community Expectations

- Be respectful and collaborative.
- Keep discussions constructive.
- Cite any third-party code or libraries you incorporate.
