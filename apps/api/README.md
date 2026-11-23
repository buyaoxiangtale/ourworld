# Ourworld API

Development artwork uses relative `/api/v1/seed/avatar/...` and `/api/v1/seed/city/...` URLs so gateway port changes do not alter stored content. Re-running seed repairs only known fixture rows whose old local resource exactly matches their expected artwork; uploads and outside URLs are preserved. Legacy `/api/v1/assets/...` URLs redirect to the canonical seed resources.

NestJS hosts the Fastify application, with PostgreSQL as the source of truth. Redis is used for bounded feed snapshots, distributed limits, BullMQ and cross-instance realtime notifications. There is no in-memory replacement for account, message or profile persistence.

## Run

From the repository root, install workspace dependencies and build contracts first. Local scripts load the root `.env` when present; injected environment variables take precedence.

```text
npm run build -w @ourworld/contracts
npm run migrate -w @ourworld/api
npm run seed -w @ourworld/api
npm run dev -w @ourworld/api
npm run worker:dev -w @ourworld/api
```

Production commands after building are `node apps/api/dist/main.js`, `node apps/api/dist/worker.js`, `node apps/api/dist/migrate.js` and `node apps/api/dist/seed.js`. Copy `apps/api/migrations` alongside `dist` into the image. Run migrations once before API replicas. The independent worker is required for email delivery, realtime outbox relay, scheduled reviews and layout generation.

Default port is 3000. Health endpoints are `/api/v1/health`, `/api/v1/ready`; Prometheus text metrics are at `/metrics`. WebSocket `/api/v1/ws` accepts the first JSON frame `{ "event": "auth", "data": { "token": "..." } }`, acknowledges `auth.ready`, and closes at the actual JWT expiration. Business writes use HTTP. Reconnect by fetching conversation history; realtime delivery is at-least-once and clients deduplicate by message id/sequence.

## Configuration

Set `DATABASE_URL`, `REDIS_URL`, `PUBLIC_BASE_URL`, `JWT_SECRET` (at least 32 characters in production), `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `SMTP_HOST`, `SMTP_PORT`, optional SMTP credentials, and `DEMO_PASSWORD`. Production CORS defaults to `PUBLIC_BASE_URL`; additional browser origins can be set through `CORS_ORIGINS`.

Set `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` and `LLM_OUTPUT_MODE=json` for a compatible Chat Completions provider. DeepSeek Flash on `https://api.deepseek.com` is sent `reasoning_effort: "none"`; provider-specific fields are not sent elsewhere. No configured key produces `503 MODEL_NOT_CONFIGURED`, never a simulated successful layout. Generated layouts are candidates only, require an explicit revision-checked application, and cannot publish or modify trust metadata.

`LLM_OUTPUT_MODE` accepts only `json`, `json_schema` and `plain`. JSON mode sends `response_format: {type: "json_object"}`; schema mode sends a strict named JSON Schema derived from the fixed component contract; plain mode omits `response_format`. Schema-mode optional component values are nullable and normalized before normal server-side layout/reference validation. DeepSeek's local default remains `json`; schema mode should only be selected for a provider/model that supports it.

SMTP and model tasks use independent queues and workers: `ourworld-mail` has its own SMTP concurrency, while only `ourworld-layout` has a global concurrency limit of two. Model recovery targets the layout queue. The protocol/queue test blocks two local HTTP fixture requests and verifies real SMTP delivery still completes; it is explicitly not a real DeepSeek connectivity test.

Seed creates the base catalogue of 50 cities and 200 illustrative attractions, then enriches it with additional countries, cities and demo profiles. It also creates verified development accounts `traveler@ourworld.test`, `local@ourworld.test`, `admin@ourworld.test` plus `load0000@ourworld.test` through `load0999@ourworld.test`. The demo password comes from the local `DEMO_PASSWORD` setting. Seed listings are fictional development examples. `LOAD_SEED=true` additionally inserts 100,000 historical messages in 250 deterministic load conversations. `AUTH_LOGIN_LIMIT` can be temporarily raised for a local load-test profile; its normal default is 60 logins/minute/IP.

Uploads accept verified JPEG, PNG, WebP and verification-only PDF up to 10 MB. Private files have short-lived signed media URLs so native/browser images do not need bearer headers. Profile galleries accept only the owner's public uploads. Verification and private chat files cannot be published as gallery assets.

## Verification

```text
npm run typecheck -w @ourworld/api
npm run test -w @ourworld/api
```

The API suite includes pure tests and integration tests. Run integration tests against a dedicated PostgreSQL database, Redis, S3-compatible storage and SMTP fixture. They create unique test accounts and disable them afterwards. Coverage includes password hashing/signatures, email and reset flows, refresh rotation, access control, concurrent unique conversations, idempotent messages, monotonic reads, blocks, public/draft isolation, stale layout conflicts, private media, random snapshots, and all review-opening paths with freeze precedence.

No payment, order, wallet or settlement persistence is created. The shared contracts only reserve a future payment provider interface.

## Place maintenance and multi-city trips

Administrators can create places with `POST /api/v1/admin/places` and partially update them with `PATCH /api/v1/admin/places/:id`. Names and descriptions use `{zh,en}`. Country parents are empty, cities belong to countries, attractions belong to cities; coordinates are range-checked. Country labels are derived from the hierarchy and propagated to descendants after country renaming. Existing place kinds are immutable to preserve references. Every change records an audit entry; there is no destructive place-delete endpoint.

`PATCH /api/v1/trips/:id {endAt,title?}` resets an unreviewed, unfrozen, uncancelled trip to a proposal. The modifying participant becomes the inviter and the other participant must accept again. Previous confirmations are cleared, and a trip amendment message preserves the previous agreement without deleting history. Acceptance supports `{expectedEndAt}` and compares UTC instants under the row lock; a stale displayed date returns `409 TRIP_CHANGED`. Old callers that omit the field remain compatible, while current clients should always include the displayed date.

People feeds optionally accept `cityIds=id1,id2&coverage=all|any`. Eligibility uses service-city intersection or full coverage, followed by the same random shuffle. The snapshot fixes these conditions; paginated calls may omit them, while explicitly changing them within the same `feedId` returns `409 FEED_FILTER_CONFLICT`. Single-city callers remain unchanged. Tags and quotes never influence this feed.
