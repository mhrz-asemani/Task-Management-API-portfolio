# Task Management API

A REST API for user-owned task management, built with Node.js, Express 5, TypeScript, and PostgreSQL.

- **Live API:** https://todo-api-ule1.onrender.com/
- **Swagger UI:** https://todo-api-ule1.onrender.com/api-docs

## Highlights
- User registration and login with JWT-based access and refresh tokens in HttpOnly cookies
- Per-user task CRUD with ownership checks
- Zod request validation and consistent error responses
- Helmet, exact-origin CORS checks, rate limiting, and structured logging
- PostgreSQL migrations and integration tests
- Docker and Docker Compose support
- OpenAPI 3.1 contract and Swagger UI
- Optional task image uploads through Cloudinary

## Technology
Node.js 20, Express 5, TypeScript, PostgreSQL 16, JWT, Zod, Jest, Docker, and GitHub Actions.

## Run locally
Requirements: Node.js 20+, npm, and Docker with Compose v2.

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d db
npm run build
npm run db:migrate
npm run dev
```

The API listens on `http://localhost:3000` by default. Locally, Swagger UI is available at `/api-docs` and the OpenAPI contract at `/openapi.json`. The deployed endpoints are linked above.

For a fully containerized stack, configure the local values in `.env` and run:

```bash
docker compose up --build -d
```

## Quality checks
```bash
npm run typecheck
npm test
npm run build
npm run validate:openapi
```

Tests require a dedicated test database. Never point test environment variables at production data. GitHub Actions runs type checking, build, migrations, and integration tests against an isolated PostgreSQL service; a separate manually triggered workflow performs an end-to-end smoke test against an ephemeral database.

## API contract
See [API documentation](docs/API.md) and the machine-readable [OpenAPI 3.1 specification](openapi.json).

## Environment and security
Copy `.env.example` to `.env` and replace the placeholders with local development values. Never commit real credentials. Keep JWT and Cloudinary secrets in environment variables or a secrets manager. Production authentication cookies are HttpOnly and Secure; the frontend origin must be explicitly configured.

## Scope
The API currently manages user-owned tasks (represented by the `/todos` resource), authentication sessions, and optional task image uploads. The public project repository is a source snapshot; no production deployment configuration or credentials are included.
