# API Contract

The machine-readable OpenAPI 3.1 contract is maintained in [`../openapi.json`](../openapi.json). When the API is running locally, open `/api-docs` for interactive Swagger UI or `/openapi.json` for the raw contract.

Default local base URL: `http://localhost:3000`.

All request bodies are JSON unless an endpoint explicitly uses `multipart/form-data`. Authentication uses HttpOnly cookies; access and refresh tokens are not returned in JSON response bodies. Browser clients must send credentialed requests and use the exact configured frontend origin.

## Authentication and errors

The API supports:
- `POST /auth/signup` — create an account
- `POST /auth/login` — authenticate and set access/refresh cookies
- `POST /auth/refresh` — rotate the refresh token and renew authentication cookies
- `POST /auth/logout` — revoke the refresh token and clear cookies

Passwords must satisfy the API's validation rules. Invalid credentials return an authentication error; duplicate accounts return a conflict response.

Expected application errors use a structured response with an error code, message, and status. Unexpected failures return a generic internal error without exposing exception details.

## Tasks

All task endpoints require authentication.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/todos` | List the authenticated user's tasks |
| `POST` | `/todos` | Create a task |
| `PUT` | `/todos/:id` | Update a task owned by the user |
| `DELETE` | `/todos/:id` | Delete a task owned by the user |
| `POST` | `/todos/:id/image` | Upload a task image |

Example create request:

```json
{
  "text": "Prepare release",
  "done": false
}
```

The `text` field is required and bounded by the API schema. `done` is optional and defaults to `false`. Updates accept the supported task fields and preserve fields not supplied.

A user cannot read or modify another user's task. The API returns an appropriate not-found response when a task is not owned by the authenticated user.

## Health and API documentation

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Basic API availability response |
| `GET` | `/healthz` | Process liveness |
| `GET` | `/readyz` | Database readiness |
| `GET` | `/api-docs` | Swagger UI |
| `GET` | `/openapi.json` | OpenAPI 3.1 document |

## Realtime events

The Socket.IO server authenticates connections using the access-token cookie and emits task events to the owning user's room:

- `todo:created`
- `todo:updated`
- `todo:deleted`

This document summarizes the current API behavior. The OpenAPI specification is the machine-readable contract; update both when endpoint behavior changes.
