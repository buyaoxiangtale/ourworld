# Ourworld API v1 — integration contract

## 学校学历与服务城市

`User` 包含可选 `school`（最长 120 字符）与 `educationLevel`（`high-school`、`vocational`、`associate`、`bachelor`、`master`、`doctorate`、`other`）。`PATCH /me` 支持独立更新这两个字段，传 `null` 清除；公开个人资料和本人资料均返回已填写值。数据库迁移为 `003_profile_education.sql`，可重复执行。

服务城市从独立搜索列表选择，通过 `PATCH /me {cityIds: [...]}` 保存，最多 50 个有效城市 ID，可传空数组清除。常规个人资料表单不再提交 `cityIds`，避免覆盖独立城市页的更新。学校学历保存同样只提交自身字段。

`GET /places` 支持 `limit`（1–250，默认 250）和 `offset`（默认 0）参数，响应为 `{items: Place[], nextOffset: number|null}`；`nextOffset=null` 表示已读完。空查询按地点类型、英文名和 ID 排序。关键词查询会归一化全半角和大小写，按空白或逗号拆词，每个词均须命中地点名称、别名或所属地。精确名称、精确别名、前缀和子串依次优先，同级结果按地点类型、英文名和 ID 稳定排序。城市选择器读取 `kind=city` 全部分页，并读取国家名称用于中英文和国家/地区搜索；搜索还支持城市别名和忽略拉丁字母重音。


Prefix `/api/v1`. Success returns the resource directly (not an extra data envelope). Errors `{code,message,requestId?}`. IDs are opaque strings, times ISO UTC. Bearer access token. WebSocket `/api/v1/ws`, first JSON frame `{event:"auth",data:{token}}`, then `{event,data}` events. Message sends use HTTP; WS notifies after commit.

## Endpoints
- `GET /health` and `/ready` (under prefix).
- `POST /auth/register {email,password,name}`, `/auth/login {email,password}` -> `{accessToken,refreshToken,user}`. `/auth/verify {token}`, `/auth/forgot {email}`, `/auth/reset {token,password}`, `/auth/refresh {refreshToken}`, `/auth/logout {refreshToken}`. Mailpit receives actual verification links.
- `GET /me` -> User; `PATCH /me {name,bio,tags,cityIds,quote,avatar,socialLinks,accountType:"individual"|"agency",priceRange:{min,max(0..1000000,min<=max),currency:USD|CNY|EUR|GBP|JPY,unit:hour|half-day|day|experience}|null,experienceYears:0..90|null,languages:string[]<=12 of <=30 chars}` -> User. Switching account type in either direction resets provider status to `none` and rejects any pending verification. Agency accounts can only submit `kind:"agency"` certification; approving it certifies the agency (only agency accounts can hold that kind).
- `GET /places?q=&kind=&parentId=&limit=&offset=` -> `{items,nextOffset}`; `GET /places/:id` -> Place; `GET /favorites` -> `{items:Place[]}`; `PUT /favorites/:cityId`; `DELETE /favorites/:cityId`.
- `GET /cities/:cityId/people-feed?feedId=&cursor=&cityIds=&coverage=any|all` -> PeopleFeed. `cityIds` is an optional comma-separated multi-city scope. The first call starts a randomized snapshot of active users whose profile service cities match the scope, excluding the viewer and blocked accounts. Provider approval is optional for discovery. Pagination keeps the original scope and skips users who no longer match it. Start a new round to pick up newly eligible users or change the scope.
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
`VITE_API_BASE` default `/api/v1`; web dev proxy target is configurable with `API_PROXY_TARGET` (default `http://127.0.0.1:8188`). `VITE_WS_BASE` optional, otherwise same origin. Layout generation endpoints are available to API clients. Web uses `/globe/index.html` for the shared standalone globe, iframe commands/events use the bridge schema. Root integrates build copying to web public output and native resources.

## Profile
Shared definitions in `@ourworld/contracts`. Identity/trust fields come from server resources, not model text. Draft `revision` distinct from layout `schemaVersion`. Candidate holds `baseRevision`; application checks current revision. Missing LLM config returns explicit error, not a mock generation.
