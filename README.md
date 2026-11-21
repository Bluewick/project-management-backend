# Traceboard — Project Management Backend

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-000000?logo=vercel&logoColor=white)](https://project-management-frontend-pearl.vercel.app/)
![Node.js](https://img.shields.io/badge/Node.js-ESM-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.3-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pg%208.23-4169E1?logo=postgresql&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socketdotio&logoColor=white)
![JWT Auth](https://img.shields.io/badge/Auth-JWT-D63AFF?logo=jsonwebtokens&logoColor=white)
![Object Storage](https://img.shields.io/badge/Storage-S3%20Compatible-FF9900)
![License](https://img.shields.io/badge/License-ISC-blue)

A production-oriented REST & real-time WebSocket backend for issue tracking and Kanban project management, built with **Node.js (ES Modules)**, **Express 5**, **PostgreSQL**, **Socket.IO**, and **S3-compatible object storage**.

---

## Table of Contents

- [Overview & Key Features](#overview--key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema Overview](#database-schema-overview)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [API Reference](#api-reference)
  - [Response Envelope & Error Format](#response-envelope--error-format)
  - [Health](#health)
  - [Authentication](#authentication)
  - [Users](#users)
  - [Projects](#projects)
  - [Members & Invites](#members--invites)
  - [Labels](#labels)
  - [Issues & Kanban](#issues--kanban)
  - [Comments & Mentions](#comments--mentions)
  - [Attachments](#attachments)
  - [Issue Activity Log](#issue-activity-log)
- [Real-Time Events (Socket.IO)](#real-time-events-socketio)
- [Background Maintenance & Lifecycle](#background-maintenance--lifecycle)
- [Scripts](#scripts)
- [License](#license)

---

## Overview & Key Features

- **JWT Authentication & Refresh Token Rotation**: Short-lived access tokens (`15m` default) paired with SHA-256 hashed refresh tokens stored in PostgreSQL. Includes **token reuse detection** — replaying a revoked refresh token automatically revokes all active sessions for that user.
- **Project-Level RBAC**: Four granular project roles (`admin`, `manager`, `developer`, `viewer`) enforced via dedicated middleware and service-level ownership rules, plus transactional **last-admin protection** (`SELECT ... FOR UPDATE`).
- **Invite System**: Generate email-bound or open shareable project invite tokens (SHA-256 hashed, configurable expiration) with single-use acceptance.
- **Issue Tracking & Kanban Positioning**:
  - Auto-incrementing human-readable issue keys per project (e.g., `TB-1`, `TB-2`).
  - Floating-point midpoint positioning for O(1) drag-and-drop reordering across Kanban columns, with automatic transactional column rebalancing when position gaps drop below `1e-6`.
  - Rich filtering (multi-status, priority, type, severity, `me`/`unassigned` assignees, `any`/`all` label matching, due date windows, overdue flag) and PostgreSQL full-text search (`tsvector` + `ILIKE` fallback) with relevance ranking.
- **Threaded Comments & `@mentions`**: Nested comment replies (`parent_comment_id`) with automatic resolution of `@[Name](uuid)` and `@email@domain.com` mentions against active project members.
- **S3-Compatible Attachments**:
  - Primary 2-step **presigned PUT upload** workflow (`presign` → direct client upload to S3/R2/MinIO → server-verified `confirm` via `HeadObject`).
  - Optional server-proxied **direct upload** fallback using Multer memory storage.
  - Time-limited presigned GET download URLs generated on demand.
- **Immutable Audit Trail**: Automatic diff logging for issue creation, scalar field changes, label updates, comments, and attachments.
- **Real-Time Collaboration (Socket.IO)**: JWT-authenticated WebSocket connections with RBAC-verified `project:<id>` and `issue:<id>` rooms broadcasting live issue, comment, and attachment mutations.
- **Security & Reliability**: Helmet security headers, configurable CORS, global and auth-specific rate limiting, centralized PostgreSQL error mapping, custom schema validation middleware, periodic maintenance cleanup job, and graceful shutdown (`SIGINT`/`SIGTERM`).

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js (ES Modules) |
| Web Framework | Express 5 (`express`) |
| Database | PostgreSQL (`pg`, Neon-ready SSL support) |
| Real-Time | Socket.IO (`socket.io`) |
| Object Storage | AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) — works with AWS S3, Cloudflare R2, MinIO, etc. |
| File Uploads | Multer (`multer`, memory storage fallback) |
| Authentication | JSON Web Tokens (`jsonwebtoken`), `bcrypt` |
| Security | `helmet`, `cors`, `express-rate-limit` |
| Dev Tooling | `dotenv`, `nodemon` |

---

## Project Structure

```text
project-management-backend/
├── package.json
├── README.md
└── src/
    ├── server.js                          # Express app bootstrap, CORS, rate limiters, Socket.IO & graceful shutdown
    ├── config/
    │   ├── db.js                          # PostgreSQL Pool, query helper & transactional wrapper
    │   ├── env.config.js                  # Centralized environment parsing & required variable checks
    │   ├── s3.config.js                   # S3Client singleton, presigned PUT/GET, head/upload/delete helpers
    │   └── socket.config.js               # Socket.IO server setup, JWT handshake auth & room emitters
    ├── controllers/                       # Thin HTTP handlers delegating to services
    │   ├── activity.controller.js
    │   ├── attachment.controller.js
    │   ├── auth.controller.js
    │   ├── comment.controller.js
    │   ├── health.controller.js
    │   ├── issue.controller.js
    │   ├── label.controller.js
    │   ├── project.controller.js
    │   ├── project_member.controller.js
    │   └── user.controller.js
    ├── middleware/
    │   ├── auth.middleware.js             # Bearer JWT verification & global role guard
    │   ├── error.middleware.js            # 404 handler, Postgres error mapper & centralized error serializer
    │   ├── project_rbac.middleware.js     # Project membership & role authorization middleware
    │   ├── upload.middleware.js           # Multer single-file upload & MIME whitelist validation
    │   └── validate.middleware.js         # Declarative params/query/body schema validator
    ├── models/                            # Parameterized SQL queries per domain entity
    │   ├── activity.model.js
    │   ├── attachment.model.js
    │   ├── cleanup.model.js
    │   ├── comment.model.js
    │   ├── issue.model.js
    │   ├── label.model.js
    │   ├── project.model.js
    │   ├── project_invite.model.js
    │   ├── project_member.model.js
    │   ├── token.model.js
    │   └── user.model.js
    ├── routes/                            # Express routers with request validation & RBAC bindings
    │   ├── activity.routes.js
    │   ├── attachment.routes.js
    │   ├── auth.routes.js
    │   ├── comment.routes.js
    │   ├── health.routes.js
    │   ├── issue.routes.js
    │   ├── label.routes.js
    │   ├── project.routes.js
    │   ├── project_member.routes.js
    │   └── user.routes.js
    ├── services/                          # Business logic, transactions, audit logging & Socket.IO emissions
    │   ├── activity.service.js
    │   ├── attachment.service.js
    │   ├── auth.service.js
    │   ├── cleanup.service.js
    │   ├── comment.service.js
    │   ├── issue.service.js
    │   ├── label.service.js
    │   ├── project.service.js
    │   ├── project_member.service.js
    │   └── user.service.js
    └── utils/
        ├── api_error.util.js              # Operational ApiError class with HTTP factory methods
        ├── async_handler.util.js          # Async route wrapper forwarding rejections to Express error middleware
        ├── jwt.js                         # Token helpers
        └── response.util.js               # Standardized send_success / send_error response helpers
```

---

## Prerequisites

- **Node.js** `>= 18.x` (ESM + built-in `node:http` / `node:crypto`)
- **PostgreSQL** `>= 14.x` (local instance or hosted, e.g., Neon)
- **S3-Compatible Object Storage** (optional for core API; required for attachment endpoints — AWS S3, Cloudflare R2, MinIO, etc.)

---

## Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/Bluewick/project-management-backend.git
   cd project-management-backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root (see [Environment Variables](#environment-variables)). You can generate strong JWT secrets with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. **Initialize your PostgreSQL database**

   Ensure your database contains the tables described in [Database Schema Overview](#database-schema-overview) in the `public` schema.

5. **Run the server**

   ```bash
   # Development (with nodemon auto-reload)
   npm run dev

   # Production
   npm start
   ```

6. **Verify the server is healthy**

   ```bash
   curl http://localhost:5000/api/health
   ```

---

## Environment Variables

> **Database Connection Note:** `src/config/env.config.js` validates that `DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` are always set. In `src/config/db.js`, when `NODE_ENV=production`, the pool connects using `DATABASE_URL` (with SSL enabled); otherwise (development), it connects using `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.

### Required

| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection URI (used in production and validated at startup) | `postgresql://user:pass@host:5432/traceboard?sslmode=require` |
| `JWT_SECRET` | Secret key used to sign and verify access tokens | `<random-64-char-hex>` |
| `JWT_REFRESH_SECRET` | Secret key used to sign and verify refresh tokens | `<random-64-char-hex>` |

### Local Development Database (`NODE_ENV !== "production"`)

| Variable | Description | Example |
| --- | --- | --- |
| `DB_HOST` | Local PostgreSQL hostname | `localhost` |
| `DB_PORT` | Local PostgreSQL port | `5432` |
| `DB_USER` | Local PostgreSQL username | `postgres` |
| `DB_PASSWORD` | Local PostgreSQL password | `postgres` |
| `DB_NAME` | Local PostgreSQL database name | `project-management-db` |

### Server, CORS & Rate Limiting

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime environment (`development` or `production`) |
| `PORT` | `5000` | HTTP / Socket.IO server port |
| `FRONTEND_URL` | _(unset)_ | Additional allowed origin for Express CORS (alongside `localhost:5173`, `localhost:3000`, `localhost:5253`, and `https://*.vercel.app`) |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed origin for Socket.IO CORS |
| `DB_SSL` | `true` for Neon/prod, else `false` | Boolean toggle parsed by `env.config.js` |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Sliding window duration (ms) for rate limiters |
| `RATE_LIMIT_MAX` | `100` | Max requests per window on `/api/*` |
| `AUTH_RATE_LIMIT_MAX` | `15` | Max requests per window on `/api/auth/register` and `/api/auth/login` |

### Authentication & Invites

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `BCRYPT_SALT_ROUNDS` | `12` | Cost factor for bcrypt password hashing |
| `INVITE_EXPIRES_HOURS` | `168` (7 days) | Expiration duration for newly generated project invites |

### Object Storage (S3 / R2 / MinIO — Optional)

If any of `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, or `AWS_SECRET_ACCESS_KEY` is omitted, attachment endpoints return `503 STORAGE_NOT_CONFIGURED` while the rest of the API operates normally.

| Variable | Default | Description |
| --- | --- | --- |
| `AWS_REGION` | `""` | S3 region (e.g., `us-east-1`, `auto` for R2) |
| `AWS_S3_BUCKET` | `""` | Target bucket name |
| `AWS_ACCESS_KEY_ID` | `""` | Access key ID |
| `AWS_SECRET_ACCESS_KEY` | `""` | Secret access key |
| `AWS_ENDPOINT_URL_S3` | `""` | Custom endpoint URL for S3-compatible providers (R2, MinIO, etc.) |
| `AWS_S3_FORCE_PATH_STYLE` | `true` if endpoint set, else `false` | Forces path-style S3 URLs |
| `S3_PRESIGN_EXPIRES_SECONDS` | `900` (15 min) | Expiration for presigned PUT and GET URLs |
| `MAX_ATTACHMENT_SIZE_BYTES` | `26214400` (25 MB) | Max file size for presigned uploads |
| `MAX_DIRECT_UPLOAD_SIZE_BYTES` | `10485760` (10 MB) | Max file size for Multer server-proxied uploads |

### Real-Time & Maintenance

| Variable | Default | Description |
| --- | --- | --- |
| `ENABLE_SOCKET_IO` | `true` | Enable or disable the Socket.IO server |
| `CLEANUP_INTERVAL_MS` | `3600000` (1 hour) | Interval (ms) for background cleanup; set `<= 0` to disable |

---

## Database Schema Overview

The backend expects the following 11 PostgreSQL tables in the `public` schema (using UUID primary keys):

| Table | Purpose & Key Columns |
| --- | --- |
| `users` | Accounts: `id`, `email` (unique), `password_hash`, `full_name`, `avatar_url`, `role`, `is_active`, `last_login_at`, `created_at`, `updated_at` |
| `refresh_tokens` | Active/revoked sessions: `id`, `user_id`, `token_hash` (SHA-256), `expires_at`, `revoked_at`, `created_at` |
| `projects` | Workspaces: `id`, `name`, `key_prefix` (unique uppercase), `description`, `issue_counter`, `owner_id`, `is_archived`, `created_at`, `updated_at` |
| `project_members` | Role assignments: `id`, `project_id`, `user_id`, `role` (`admin`/`manager`/`developer`/`viewer`), `joined_at` |
| `project_invites` | Invite tokens: `id`, `project_id`, `email` (nullable), `role`, `token_hash` (SHA-256), `invited_by`, `expires_at`, `accepted_at`, `created_at` |
| `issues` | Work items: `id`, `project_id`, `issue_number`, `issue_key`, `title`, `description`, `reproduction_steps`, `type`, `status`, `priority`, `severity`, `story_points`, `due_date`, `position` (float), `reporter_id`, `assignee_id`, `search_vector` (`tsvector`), `created_at`, `updated_at` |
| `labels` | Project tags: `id`, `project_id`, `name`, `color_hex`, `created_at`, `updated_at` |
| `issue_labels` | Many-to-many join (`issue_id`, `label_id`) with composite unique/PK constraint |
| `issue_comments` | Threaded discussions: `id`, `issue_id`, `author_id`, `parent_comment_id`, `body`, `mentions` (`jsonb`), `is_edited`, `created_at`, `updated_at` |
| `issue_attachments` | File metadata: `id`, `issue_id`, `uploaded_by`, `file_name`, `file_size`, `mime_type`, `s3_key`, `file_url`, `status` (`pending`/`uploaded`), `created_at`, `updated_at` |
| `issue_activities` | Audit log: `id`, `issue_id`, `actor_id`, `action`, `metadata` (`jsonb`), `created_at` |

---

## Role-Based Access Control (RBAC)

Every project member holds one of four roles: `admin`, `manager`, `developer`, or `viewer`.

| Capability | `admin` | `manager` | `developer` | `viewer` |
| --- | :---: | :---: | :---: | :---: |
| View project, members, labels, issues, comments, attachments, activity | Yes | Yes | Yes | Yes |
| Update / archive / delete project | Yes | — | — | — |
| Create / list / cancel invites & change member roles | Yes | — | — | — |
| Remove other members | Yes | — | — | — |
| Leave project (remove self) | Yes* | Yes | Yes | Yes |
| Create & update labels | Yes | Yes | Yes | — |
| Delete labels | Yes | Yes | — | — |
| Create, update, move issues & attach/detach labels | Yes | Yes | Yes | — |
| Delete issues | Yes | Yes | Reporter only | — |
| Post comments & replies | Yes | Yes | Yes | Yes |
| Edit comment | Author only | Author only | Author only | Author only |
| Delete comment | Yes | Author only | Author only | Author only |
| Upload attachments | Yes | Yes | Yes | — |
| Delete attachments | Yes | Yes | Uploader only | — |

\* An `admin` cannot be demoted or removed if they are the **last remaining admin** in the project (`400 LAST_ADMIN_PROTECTION`).

---

## API Reference

All REST endpoints are mounted under `/api`. Protected endpoints require the header:

```http
Authorization: Bearer <access_token>
```

### Response Envelope & Error Format

**Success Response**

```json
{
  "success": true,
  "message": "Resource processed successfully.",
  "data": { "...": "..." },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "total_pages": 3
  }
}
```
_(The `meta` key is included only on paginated list responses.)_

**Error Response**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "location": "body", "field": "email", "message": "email must be a valid email address." }
    ]
  }
}
```

---

### Health

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Returns API health status, `uptime_seconds`, and PostgreSQL `server_time`. |

---

### Authentication

Base path: `/api/auth`

| Method | Endpoint | Auth | Rate Limit | Body Parameters | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/register` | Public | Strict (`AUTH_RATE_LIMIT_MAX`) | `email`, `password` (8–128), `full_name` (2–120) | Registers a new user and returns `{ user, tokens }`. |
| `POST` | `/login` | Public | Strict (`AUTH_RATE_LIMIT_MAX`) | `email`, `password` | Authenticates user, updates `last_login_at`, and returns `{ user, tokens }`. |
| `POST` | `/refresh` | Public | Global | `refresh_token` | Rotates refresh token and issues a new `{ tokens }` pair. Replaying a revoked token revokes all user sessions (`401 TOKEN_REUSE_DETECTED`). |
| `POST` | `/logout` | Public | Global | `refresh_token` | Revokes the provided refresh token. |

---

### Users

Base path: `/api/users` (all routes require Bearer JWT)

| Method | Endpoint | Body Parameters | Description |
| --- | --- | --- | --- |
| `GET` | `/me` | — | Fetch the authenticated user's profile. |
| `PATCH` | `/me` | `full_name` (opt, 2–120), `avatar_url` (opt, http/https URL or `""` to clear) | Update display name and/or avatar URL. |
| `PATCH` | `/me/password` | `current_password`, `new_password` (8–128) | Change password and revoke all active refresh tokens. |

---

### Projects

Base path: `/api/projects` (all routes require Bearer JWT)

| Method | Endpoint | Role | Parameters | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/` | Authenticated | Body: `name` (2–120), `key_prefix` (2–10 alnum, starts with letter), `description` (opt, max 2000) | Create a project and assign creator as `admin`. |
| `GET` | `/` | Authenticated | Query: `include_archived` (bool), `page`, `limit` (1–100) | List paginated projects the user belongs to. |
| `GET` | `/:projectId` | Any member | — | Get project details including `member_count` and `my_role`. |
| `PATCH` | `/:projectId` | `admin` | Body: `name`, `key_prefix`*, `description`, `is_archived` | Update project settings. |
| `DELETE` | `/:projectId` | `admin` | — | Permanently delete a project. |
| `POST` | `/invites/:token/accept` | Authenticated | — | Accept a project invite token and join the project. |

\* `key_prefix` cannot be modified once any issue has been created (`400 PROJECT_KEY_LOCKED`).

---

### Members & Invites

Base path: `/api/projects/:projectId`

| Method | Endpoint | Role | Parameters | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/invites` | `admin` | Body: `role` (`admin`/`manager`/`developer`/`viewer`), `email` (opt) | Create an invite and return `{ invite, invite_token }` (raw token is shown only once). |
| `GET` | `/invites` | `admin` | — | List active, unexpired pending invites. |
| `DELETE` | `/invites/:inviteId` | `admin` | — | Cancel/revoke a pending invite. |
| `GET` | `/members` | Any member | — | List project members sorted by role hierarchy then join date. |
| `PATCH` | `/members/:userId` | `admin` | Body: `role` | Update a member's project role (subject to last-admin protection). |
| `DELETE` | `/members/:userId` | `admin` or self | — | Remove a member or leave the project (subject to last-admin protection). |

---

### Labels

Base path: `/api/projects/:projectId/labels`

| Method | Endpoint | Role | Parameters | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Any member | — | List all labels for a project alphabetically. |
| `POST` | `/` | `admin`, `manager`, `developer` | Body: `name` (1–50), `color_hex` (opt `#RRGGBB`, default `#6366F1`) | Create a project label. |
| `PATCH` | `/:labelId` | `admin`, `manager`, `developer` | Body: `name` (opt), `color_hex` (opt) | Update a label's name or color. |
| `DELETE` | `/:labelId` | `admin`, `manager` | — | Delete a project label. |

---

### Issues & Kanban

Base path: `/api/projects/:projectId/issues`

**Allowed Enum Values**
- `type`: `bug`, `feature`, `task` (default: `task`)
- `status`: `backlog`, `todo`, `in_progress`, `in_review`, `done` (default: `todo`)
- `priority`: `low`, `medium`, `high`, `critical` (default: `medium`)
- `severity`: `minor`, `major`, `critical`, `blocker` (nullable)

| Method | Endpoint | Role | Description |
| --- | --- | --- | --- |
| `GET` | `/` | Any member | List/search/filter issues (paginated, max `limit=200`). |
| `POST` | `/` | `admin`, `manager`, `developer` | Create a new issue (`title` required; optional `description`, `reproduction_steps`, `type`, `status`, `priority`, `severity`, `story_points` 0–100, `due_date` ISO 8601, `assignee_id`, `label_ids` max 20). |
| `GET` | `/key/:issueKey` | Any member | Fetch an issue by human-readable key (e.g., `TB-12`). |
| `GET` | `/:issueId` | Any member | Fetch an issue by UUID (hydrated with `reporter`, `assignee`, and `labels`). |
| `PATCH` | `/:issueId` | `admin`, `manager`, `developer` | Partially update issue fields and/or replace `label_ids`. Records field-level audit diffs. |
| `PATCH` | `/:issueId/move` | `admin`, `manager`, `developer` | Move/reorder an issue on the Kanban board. Body: `status` (req), `prev_position` (opt), `next_position` (opt). |
| `DELETE` | `/:issueId` | `admin`, `manager`, or `developer` (reporter) | Delete an issue. |
| `POST` | `/:issueId/labels/:labelId` | `admin`, `manager`, `developer` | Attach a single label to an issue. |
| `DELETE` | `/:issueId/labels/:labelId` | `admin`, `manager`, `developer` | Detach a single label from an issue. |

**Query Parameters for `GET /api/projects/:projectId/issues`**

| Parameter | Format / Values | Description |
| --- | --- | --- |
| `status` | CSV of statuses | Filter by one or more statuses (e.g., `todo,in_progress`) |
| `priority` | CSV of priorities | Filter by one or more priorities |
| `type` | CSV of types | Filter by one or more issue types |
| `severity` | CSV of severities | Filter by one or more severities |
| `assignee_id` | UUID, `me`, or `unassigned` | Filter by assignee |
| `reporter_id` | UUID or `me` | Filter by reporter |
| `label_ids` | CSV of UUIDs (max 20) | Filter by attached labels |
| `label_match` | `any` (default) \| `all` | Match any label or require all listed labels |
| `due_before` / `due_after` | ISO 8601 date string | Filter by due date range |
| `overdue` | `true` \| `false` | When `true`, returns non-`done` issues past `due_date` |
| `q` | String (1–200 chars) | Full-text search (`search_vector`) + `ILIKE` match on `issue_key` & `title` |
| `sort_by` | `position`, `created_at`, `updated_at`, `priority`, `due_date`, `relevance` | Sort field (defaults to `relevance` when `q` is set, else `position`) |
| `sort_order` | `asc` (default) \| `desc` | Sort direction |
| `page` / `limit` | Numbers (`limit` 1–200, default 50) | Pagination |

---

### Comments & Mentions

Base path: `/api/projects/:projectId/issues/:issueId/comments`

| Method | Endpoint | Role | Parameters | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Any member | Query: `parent_comment_id` (UUID), `top_level_only` (bool), `page`, `limit` (1–200) | List issue comments chronologically with `author` and `reply_count`. |
| `POST` | `/` | Any member | Body: `body` (1–10000), `parent_comment_id` (opt UUID) | Post a comment or threaded reply. Automatically parses `@[Name](uuid)` and `@email@domain.com` mentions. |
| `PATCH` | `/:commentId` | Author only | Body: `body` (1–10000) | Edit comment body, re-resolve mentions, and set `is_edited = true`. |
| `DELETE` | `/:commentId` | Author or `admin` | — | Delete a comment. |

---

### Attachments

Base path: `/api/projects/:projectId/issues/:issueId/attachments`

**Allowed MIME Types**: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `video/mp4`, `video/webm`, `text/plain`, `application/json`, `application/pdf`.

| Method | Endpoint | Role | Description |
| --- | --- | --- | --- |
| `GET` | `/` | Any member | List uploaded attachments with fresh presigned GET `download_url`s. |
| `POST` | `/presign` | `admin`, `manager`, `developer` | Step 1 (Presigned flow): Body `{ file_name, file_size, mime_type }`. Creates a `pending` record and returns `{ attachment, upload_url, expires_in_seconds }`. |
| `POST` | `/:attachmentId/confirm` | Upload initiator (`admin`/`manager`/`developer`) | Step 2 (Presigned flow): Verifies S3 object existence & size via `HeadObject`, marks `uploaded`, logs activity, and returns attachment with `download_url`. |
| `POST` | `/upload` | `admin`, `manager`, `developer` | Direct fallback: `multipart/form-data` with field name `file` (up to `MAX_DIRECT_UPLOAD_SIZE_BYTES`). Streams buffer to S3 and returns attachment with `download_url`. |
| `DELETE` | `/:attachmentId` | Uploader, `manager`, or `admin` | Deletes the object from S3 and removes the database record. |

---

### Issue Activity Log

Base path: `/api/projects/:projectId/issues/:issueId/activity`

| Method | Endpoint | Role | Query Parameters | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/` | Any member | `sort_order` (`asc` \| `desc`, default `desc`), `page`, `limit` (1–200) | Returns paginated audit trail entries with `actor`, `action`, `metadata`, and `created_at`. |

**Tracked Actions**: `issue_created`, `status_changed`, `priority_changed`, `type_changed`, `severity_changed`, `assignee_changed`, `story_points_changed`, `due_date_changed`, `title_updated`, `description_updated`, `reproduction_steps_updated`, `labels_updated`, `label_added`, `label_removed`, `comment_added`, `attachment_added`, `attachment_removed`.

---

## Real-Time Events (Socket.IO)

When `ENABLE_SOCKET_IO=true` (default), Socket.IO attaches to the same HTTP server.

### Connection & Authentication

Provide a valid access JWT via Socket.IO `auth.token` (recommended) or the `Authorization: Bearer <token>` handshake header:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: { token: accessToken },
  withCredentials: true,
});
```

### Client → Server Room Events

All room subscription events verify project membership in PostgreSQL and support an optional acknowledgement callback `(response) => void` returning `{ ok: true, room }` or `{ ok: false, error }`.

| Event | Payload | Room Joined / Left |
| --- | --- | --- |
| `project:join` | `projectId` or `{ project_id }` | `project:<projectId>` |
| `project:leave` | `projectId` or `{ project_id }` | `project:<projectId>` |
| `issue:join` | `{ project_id, issue_id }` | `issue:<issueId>` |
| `issue:leave` | `issueId` or `{ issue_id }` | `issue:<issueId>` |

### Server → Client Broadcast Events

| Event | Target Rooms | Payload Shape |
| --- | --- | --- |
| `issue:created` | `project:<projectId>` | `{ project_id, actor_id, issue }` |
| `issue:updated` | `project:<projectId>`, `issue:<issueId>` | `{ project_id, actor_id, issue }` |
| `issue:moved` | `project:<projectId>`, `issue:<issueId>` | `{ project_id, actor_id, previous_status, issue }` |
| `issue:deleted` | `project:<projectId>`, `issue:<issueId>` | `{ project_id, actor_id, issue_id, issue_key }` |
| `comment:added` | `issue:<issueId>` | `{ project_id, issue_id, comment }` |
| `comment:updated` | `issue:<issueId>` | `{ project_id, issue_id, comment }` |
| `comment:deleted` | `issue:<issueId>` | `{ project_id, issue_id, comment_id, actor_id }` |
| `attachment:added` | `issue:<issueId>` | `{ project_id, issue_id, attachment }` |
| `attachment:deleted` | `issue:<issueId>` | `{ project_id, issue_id, attachment_id, actor_id }` |

---

## Background Maintenance & Lifecycle

- **Maintenance Cleanup Scheduler** (`src/services/cleanup.service.js`): Runs every `CLEANUP_INTERVAL_MS` (default: 1 hour) and cleans up:
  1. Expired refresh tokens, plus revoked refresh tokens older than 7 days.
  2. Project invites expired for more than 7 days, plus accepted invites older than 30 days.
  3. Abandoned `pending` attachments older than 24 hours (removes orphaned objects from S3 if configured, then deletes DB rows in batches of 100).
- **Graceful Shutdown**: Handles `SIGINT` and `SIGTERM` by stopping the cleanup scheduler, closing Socket.IO connections, closing the HTTP server, and draining the PostgreSQL connection pool before exiting.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the server in development mode with `nodemon src/server.js`. |
| `npm start` | Starts the server with `node src/server.js`. |

---

## License

ISC
