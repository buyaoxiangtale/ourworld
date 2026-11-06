# Ourworld API v1 — integration contract

Prefix `/api/v1`. Success returns the resource directly (not an extra data envelope). Errors `{code,message,requestId?}`. IDs are opaque strings, times ISO UTC. Bearer access token. WebSocket `/api/v1/ws`, first JSON frame `{event:"auth",data:{token}}`, then `{event,data}` events. Message sends use HTTP; WS notifies after commit.

## Endpoints
- `GET /health` and `/ready` (under prefix).
- `POST /auth/register {email,password,name}`, `/auth/login {email,password}` -> `{accessToken,refreshToken,user}`. `/auth/verify {token}`, `/auth/forgot {email}`, `/auth/reset {token,password}`, `/auth/refresh {refreshToken}`, `/auth/logout {refreshToken}`. Mailpit receives actual verification links.
- `GET /me` -> User; `PATCH /me {name,bio,tags,cityIds,quote,avatar,socialLinks,accountType:"individual"|"agency",priceRange:{min,max(0..1000000,min<=max),currency:USD|CNY|EUR|GBP|JPY,unit:hour|half-day|day|experience}|null,experienceYears:0..90|null,languages:string[]<=12 of <=30 chars}` -> User. Switching account type in either direction resets provider status to `none` and rejects any pending verification. Agency accounts can only submit `kind:"agency"` certification; approving it certifies the agency (only agency accounts can hold that kind).
- `GET /places?q=&kind=&parentId=` -> `{items}`; `GET /places/:id` -> Place; `GET /favorites` -> `{items:Place[]}`; `PUT /favorites/:cityId`; `DELETE /favorites/:cityId`.
- `GET /cities/:cityId/people-feed?feedId=&cursor=&cityIds=&coverage=any|all` -> PeopleFeed. `cityIds` is a comma-separated optional multi-city scope. First call starts random snapshot; same feed uses cursor, no repeated people. Scope is fixed for a feed and changing it requires a new feed. No quote/tag ranking. Candidate city coverage, approved, active, not self, not blocked.
- `GET /users/:id` -> `{user,layout,packages,posts,reviews,places}`; user carries `accountType`, `priceRange`, `experienceYears`, `languages` and the review `rating` average; public only published layout (themes: ocean/forest/nocturne); `GET /profile/draft` -> ProfileDraft; `PUT /profile/draft {revision,layout}` -> ProfileDraft; `POST /profile/publish {revision}`; `GET /profile/history` -> `{items}`; `POST /profile/restore {revision}` creates a new draft from history.
- `POST /profile/jobs {prompt,baseRevision}` -> LayoutJob; `GET /profile/jobs/:id`; `DELETE /profile/jobs/:id`; `POST /profile/jobs/:id/apply {revision}` -> ProfileDraft, conflict 409. Agent never publishes.
- `GET /packages?userId=` -> `{items}`; `POST /packages`; `PATCH /packages/:id`; `DELETE /packages/:id` archives. Fields align ServicePackage. Publish requires approved provider.
- `POST /verification {kind:"professional"|"experience"|"agency",name,description,fileIds:string[]}`; `GET /verification` -> latest request. `agency` requires the account to be `accountType:"agency"` and at least one document; approving it marks the account as a certified agency.
- `POST /uploads` multipart file -> `{id,url}`; optional purpose field `public|chat|verification`. Sensitive files owner/member/admin authorized.
- `GET /posts?cityId=&userId=&cursor=` -> Page<Post>; `POST /posts {cityId,title,body,images}`; `PUT /posts/:id/like`; `DELETE /posts/:id/like`; `GET /posts/:id/comments` -> `{items}`; `POST /posts/:id/comments {body}`.
- `POST /conversations/direct {userId,cityId}` -> Conversation (same unordered pair returns same conversation); `GET /conversations` -> `{items}`; `GET /conversations/:id/messages?after=&before=` -> Page<Message>; `POST /conversations/:id/messages {clientMessageId,type,body,data?}` -> Message; `PUT /conversations/:id/read {sequence}`.
- `POST /conversations/:id/trips {cityId,title,endAt}` -> Trip; `GET /conversations/:id/trips` -> `{items}`; `PATCH /trips/:id {endAt}` creates a new proposal by the editing member and resets previous acceptance/confirmations. Frozen, cancelled or already reviewed trips cannot be edited. `POST /trips/:id/accept {expectedEndAt?}` rejects a stale end time; `/confirm-end`; `/cancel`; `POST /trips/:id/reviews {rating,body}`. Trip must be accepted first; date OR both confirmations OR admin opens; freeze wins.
- `POST /reports {targetType,targetId,reason}`; `PUT /blocks/:userId`; `DELETE /blocks/:userId`.
- `GET /admin/overview`, `/admin/users`, `/admin/verifications?kind=professional|experience|agency`, `/admin/reports`, `/admin/trips`, `/admin/posts`, `/admin/places`, `/admin/audit` -> overview or `{items}`; moderation `POST /admin/verifications/:id/decision {status:"approved"|"rejected",reason}`, `/admin/reports/:id/resolve {action,reason}`, `/admin/trips/:id/action {action:"freeze"|"unfreeze"|"open",reason}`, `/admin/users/:id/action {action:"suspend"|"restore",reason}`, `/admin/posts/:id/action {action:"hide"|"restore",reason}`.

WS events: `conversation.created`, `message.created`, `conversation.read`, `profile.job.updated`, `trip.updated`. Each recipient may have multiple connections; resync REST on reconnect.

Admin place writes: `POST /admin/places` and `PATCH /admin/places/:id` validate the country/city/attraction hierarchy and write audit records. Controlled seed media exposes `/seed/avatar/:id.svg`, `/seed/city/:id.svg` and equivalent `.png` paths for native image decoders. Uploaded and external images are not rewritten.

Demo seed users: `traveler@ourworld.test`, `local@ourworld.test`, `admin@ourworld.test`; password supplied by `DEMO_PASSWORD` env (local example only). All seed users email verified. App must expose login, never assume demo API responses offline.

## Frontend environment
`VITE_API_BASE` default `/api/v1`; web dev proxy target is configurable with `API_PROXY_TARGET` (default `http://127.0.0.1:8188`). `VITE_WS_BASE` optional, otherwise same origin. Web uses `/globe/index.html` for the shared standalone globe, iframe commands/events use the bridge schema. Root integrates build copying to web public output and native resources.

## Profile
Shared definitions in `@ourworld/contracts`. Identity/trust fields come from server resources, not model text. Draft `revision` distinct from layout `schemaVersion`. Candidate holds `baseRevision`; application checks current revision. Missing LLM config returns explicit error, not a mock generation.
