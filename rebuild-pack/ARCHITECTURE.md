# Kronicle Studio — architecture and rebuild specification

This is the main document of the rebuild pack. It describes the system as a
set of contracts and invariants, not as a copy of the original source. The
companion files go deeper on models/pricing (`MODELS-AND-PRICING.md`), the
database (`DATA-MODEL.md`, `schema.sql`), the HTTP surface
(`API-CONTRACT.md`), behaviour (`BEHAVIOR.md`), security (`SECURITY.md`) and the
build order (`REBUILD-CHECKLIST.md`).

---

## 1. What the product is

Kronicle Studio is an AI film-making workspace. A user pastes a script (or an
idea), the system splits it into episodes, extracts cast/places/props, writes
image prompts, generates looks, builds a shot plan, generates storyboard
frames and video clips, and edits them on a timeline that exports an MP4.

Around that core sit:

- workspaces (personal or organisation) with shared wallets,
- invites and roles (admin / editor / viewer),
- a credit wallet with a two-phase hold/settle ledger,
- credit top-ups through Razorpay,
- a director chat agent,
- uploads (images and clips),
- a demo/lab mode for local evaluation.

The unit of tenancy is the **agency** (called "workspace" in the UI). Every
project, script, asset, plan, storyboard, track, clip, video, order and chat
message belongs to an agency. The wallet belongs to the agency, not the user.

---

## 2. System topology

```
browser
  │  http://localhost:3210
  ▼
apps/web  (Next.js App Router, client components)
  │  fetch("/api/…", credentials: "include")
  ▼
apps/api  (Express 4, TypeScript, tsx)
  ├── node:sqlite  storage/kronicle.db      (WAL, foreign_keys ON)
  ├── storage/images | videos | exports | uploads   → served at /media
  └── job worker (1 s tick) → settle generation holds
```

The web app never touches SQLite. The API is the only writer. Media files are
written to disk by the API and served statically; there is no object store in
the replica.

---

## 3. Tech stack and repo layout

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspace |
| API | Node 24, Express 4, TypeScript, `tsx` |
| DB | `node:sqlite` (`DatabaseSync`), WAL |
| Auth | 4-digit email OTP → HS256 JWT (2 h) in an HttpOnly cookie |
| Validation | Zod at the route boundary |
| Web | Next.js 15 App Router, React, Tailwind, lucide-react |
| Shared | `@kronicle/shared`: roles, plans, units, hold formula |
| Media | SVG placeholders; ffmpeg for clips and timeline export |
| Jobs | SQLite table + 1 s worker with retry/backoff |

```
apps/
  api/src/
    index.ts      all HTTP routes
    db.ts         schema + query helpers
    auth.ts       JWT, cookie, authRequired, roles
    wallet.ts     hold/settle/credit/quote
    jobs.ts       durable queue + worker
    media.ts      SVG images, ffmpeg clips/export
    demo.ts       demo + lab seeding
  web/
    app/          routes: /(app)/home, project, editor, settings…
    components/   shell, session, UI kit
    lib/api.ts    fetch wrapper
packages/shared/src/index.ts   units, plans, permissions
labs/billing-abuse/            vulnerable vs fixed simulator
docs/                          product/UI/editor/security specs
```

---

## 4. Configuration and ports

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_PATH` | `./storage/kronicle.db` | SQLite file |
| `STORAGE_DIR` | `./storage` | media root |
| `JWT_SECRET` | dev secret | session signing |
| `BILLING_MODE` | `vulnerable` | `fixed` reserves `items × unit` |
| `SECURITY_MODE` | `vulnerable` | `fixed` enforces object scope on URL writers |
| `DEMO_MODE` | `true` | loopback demo + lab login |
| `LAB_PASSWORD` | `research-3000!` | lab account password |
| `RAZORPAY_KEY_SECRET` | dev secret | payment HMAC |
| `RAZORPAY_WEBHOOK_SECRET` | dev secret | webhook HMAC |
| `PUBLIC_API_URL` | `http://localhost:4000` | media/API origin |

Web runs on **3210**; API on **4000**. Ports 3000/3100 are avoided because
other local apps occupy them.

---

## 5. Request lifecycle and envelope

All JSON routes return:

```json
{ "code": 200, "data": <payload>, "message": "success" }
```

Errors use the same envelope where possible:

- `400` invalid parameters (Zod issues in `errors`)
- `401` missing/invalid token
- `402` insufficient credits
- `403` role/workspace forbidden
- `404` not found / object outside the caller's agency
- `409` price/region mismatch
- `500` unexpected

`authRequired` runs before every non-public route. It:

1. reads the token from `Authorization: Bearer` or the `kronicleToken` cookie;
2. verifies the JWT and reloads the user from `users` (deleted user → 401);
3. resolves the agency from `x-agency-id`, otherwise the user's first agency;
4. verifies a `memberships` row (no membership → 403);
5. attaches `req.user`, `req.agencyId`, `req.role`.

`requirePermission(p)` then checks the role matrix. Object routes re-check the
project with `projects.id = ? AND projects.agency_id = ?`; a foreign id is a
404, never a leak.

---

## 6. Identity

### 6.1 OTP

1. `POST /api/auth/request-otp { email }` → 4-digit code in `otps`, 5-minute
   expiry, returns `verification_id` (and `dev_code` in the local build).
2. `POST /api/auth/verify-otp { email, otp, verification_id }` → checks
   id + email + code + expiry + unconsumed, marks consumed, creates the user if
   new, signs the JWT, sets `kronicleToken`.

The code is bound to both the verification id and the email, so it cannot be
replayed against another address.

### 6.2 JWT and session

- HS256, payload `{ id, userId, name }`, 2-hour expiry.
- Cookie `kronicleToken`: HttpOnly, SameSite=Lax, path `/`.
- Logout clears the cookie but does **not** revoke an already-issued JWT; it
  remains valid until expiry (observed reference behaviour; low finding).

### 6.3 Onboarding

`POST /api/user/onboard { name, workspaceName, type }` creates the first
agency and membership, credits the signup bonus, and marks the user onboarded:

- personal workspace: **100 credits**
- organisation: **1,000 credits**

`GET /api/auth/me` returns the user, permissions, abilities, credit summary and
active workspace. The web shell calls it on boot; a 401 triggers the local demo
session if `DEMO_MODE` is on.

---

## 7. Tenancy, roles and sharing

### 7.1 Agencies

- `agencies(id, name, type, owner_user_id)`
- `memberships(agency_id, user_id, role)` unique per pair
- `wallets(agency_id UNIQUE, balance, held)`
- A user can belong to many agencies; the active one is chosen per request by
  `x-agency-id`.

### 7.2 Roles

| Permission | admin | editor | viewer |
|---|---|---|---|
| project.view / session.use | ✓ | ✓ | ✓ |
| project.create / edit / move | ✓ | ✓ | – |
| generate.run | ✓ | ✓ | – |
| project.delete | ✓ | – | – |
| members.manage | ✓ | – | – |
| billing.pay | ✓ | – | – |
| workspace.manage | ✓ | – | – |

### 7.3 Invites

`POST /api/agency/inviteMember { email, role }` (admin only) creates an invite
with a 32-byte random token, 7-day expiry, bound to the invited email. The
invitee must be signed in as that email to accept. Accepting creates the
membership. Inviting does **not** move credits or grant the org bonus; the
bonus is tied to agency creation/upgrade, not membership.

### 7.4 Workspace operations

- `changeRole`, `removeMember`, `leaveAgency`, `renameAgency`,
  `upgradeToOrg`, `resendInvite`, `revokeInvite`.
- `moveProject { projectId, targetAgencyId }` requires the caller to be allowed
  to add projects to the target workspace. Cross-tenant move is 403.
- `upgradeToOrg` turns a personal workspace into an organisation. In the
  observed live product it did **not** grant an extra bonus or reset a negative
  balance.

### 7.5 The credit-sharing model

Credits are **not transferable**. There is no transfer, gift, coupon, referral
or redeem endpoint. The only ways to use another workspace's wallet are:

1. be an invited member of that workspace (shared wallet), or
2. move a project between workspaces you already belong to; future generation
   on that project charges the destination wallet.

A member's personal wallet is separate and cannot be pulled into an org.

---

## 8. Data model

The schema is in `schema.sql`; table-by-table detail is in `DATA-MODEL.md`.

```
users ──< memberships >── agencies ──< wallets
  │                         │            └──< ledger
  │                         ├──< invites
  │                         └──< projects ──< scripts
  │                                           ├──< assets ──< asset_images
  │                                           ├──< plans
  │                                           ├──< storyboards
  │                                           └──< tracks ──< clips
  │                                                          └──< videos
  └──< orders (billing)

jobs             durable queue
agent_messages   chat transcript
```

Core invariants:

- every domain row is reachable from `projects.agency_id`;
- `wallets.agency_id` is unique; `ledger` is append-only history;
- `ledger` rows with `status='pending'` are open holds and can settle once;
- a project's scripts, assets, plans, storyboards, tracks and clips are scoped
  through the project, never trusted from the client.

---

## 9. Wallet and credit ledger

### 9.1 Two-phase generation

1. **Hold** — `holdCredits(agencyId, amount)`:
   - checks `balance >= amount`;
   - moves `amount` from `balance` to `held`;
   - writes a `pending` ledger row with `credits_held = amount`.
2. **Settle** — `settleCredits(ledgerId, actual)`:
   - only acts if the row is still `pending` (idempotent);
   - releases the hold and applies `actual − held` to `balance`;
   - `status='failed'` refunds the hold.

`round6` keeps six decimal places. Credits are fractional and 1 credit = ₹1 in
the replica's plan table.

### 9.2 The hold formula

```
vulnerable: hold = min(items, concurrentCount ?? 1) × unit
fixed:      hold = items × unit
```

`concurrentCount` is client-controlled and defaults to 1. This is the root of
F-001/F-003: a batch can reserve one item while settling many. The fixed mode
reserves the whole batch before dispatch.

### 9.3 Bonus

`creditWallet` writes a completed ledger row. Onboarding credits
`BONUS.personal = 100` or `BONUS.org = 1000`. The bonus is per agency, not per
user or invite.

### 9.4 Observed live behaviour

- Text hold 3.135; actual settlements observed between ~1.37 and ~3.73.
- Image hold 7.0224; actual 7.026319 per image.
- Video quote 134 credits per 5 s clip at 720p.
- Extract 4 credits per episode group.
- Analysis 3 credits flat.
- A workspace was observed at **−6.259805 credits** after completed image
  settlements (OBS-002): settlement does not re-check the balance.

---

## 10. AI model layer

The product exposes **multiple models per modality** and stores the chosen
image/video model on the project.

### 10.1 Registry (from `GET/POST /api/config/getClientConfig`)

**Image**

| Label | Value |
|---|---|
| Nano Banana Flash | `openai:google/gemini-3.1-flash-image` |
| GPT Image 2.5 Flare | `openai:gpt-image-2.5-flare` |
| GPT Image 2 | `openai:gpt-image-2` |

**Video**

| Label | Value | Provider |
|---|---|---|
| MiniMax H3 | `minimax/h3` | WaveSpeed |
| Wan 3.0 | `alibaba/wan-3.0` | WaveSpeed |
| Seedance 2.0 Pro | `ep-20260727140143-rwmnp` | Volcengine |
| Seedance 2.0 Mini | `ep-20260904133405-tjttt` | Volcengine |

**Text**

| Label | Value |
|---|---|
| DeepSeek V4 Flash | `deepinfra/deepseek-ai/DeepSeek-V4-Flash` |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` |
| Gemini 3.8 Flash | `google/gemini-3.8-flash` |

**Defaults:** image `openai:google/gemini-3.1-flash-image`, video
`volcengine:ep-20260727140143-rwmnp`, quality `1K`, ratio `9:16`, style
`Indian_Fantasy_Microdrama`.

### 10.2 Routing

- The project stores `image_model`, `video_model`, `image_quality`.
- Generation requests may override `model` / `resolution`; the server records
  the model on the asset/video row.
- There is no automatic fallback in the replica; a provider adapter would map
  the model value to an HTTP client and return a URL.
- The mock adapter is `svgImage()` (deterministic gradient card) and
  `renderClipVideo()` (2 s ffmpeg test clip). Replace only those two functions
  to go live.

### 10.3 Model selection in the UI

The home/project creation screens expose the registry; the project settings
store the choice. Text models are used by analysis/plan/prompt stages; image
models by looks/storyboards; video models by clips.

---

## 11. Token and cost accounting

`/api/wallet/quote` is the client-facing estimator. It is **not** the hold.

| Action | Quote formula | Unit |
|---|---|---|
| text.generate | flat 4 credits; breakdown input 25 / output 1000 tokens, 4 chars/token | 4 |
| script.analysis | flat 3 | 3 |
| image.generate | `count × 8` for 1K, `count × 14` for 4K; count 1–50 | 8 / 14 |
| video.generate | `clips × ceil(durationSec / 5) × 134`; durationSec > 0 | 134 |
| asset.extract | `ceil(episodes / groupSize) × 4`; default group 5 | 4 |
| review.fix | flat 3 | 3 |

The generation endpoints hold the `UNIT` values and settle the provider cost:

| Unit | Value |
|---|---|
| text | 3.135 |
| image | 7.0224 |
| video | 134 |
| extract | 4 |
| analysis | 3 |

Why the quote and the hold differ: the quote is a UI estimate; the hold is the
reservation; the settlement is the actual provider charge. That difference is
normal, but it is also where the F-001/F-003 gap lives when the hold is
smaller than the settled amount.

Token counting for text is the simple `chars / 4` model with a flat output
estimate; the replica does not call a tokenizer. A real provider adapter should
use the provider's usage object for settlement and keep the same ledger
semantics.

Provider cost and margin are **not exposed** by the API. The lab uses
`$0.01/credit` only as an assumption for the ₹/$ model; treat it as a
scenario, not a disclosed price.

---

## 12. Generation pipeline

The stages and their contracts:

| Stage | Endpoint | Result |
|---|---|---|
| 1. Analyse | `POST /api/project/analyzeScript { text }` | split into episodes, words, estimated seconds, suggested name/ratio |
| 2. Create | `POST /api/project/createFromScript { name, episodes, imageModel, videoModel, videoRatio, artStyle }` | project + scripts |
| 3. Extract | `POST /api/script/extractAssets { projectId }` | asset rows (role/scene/tool), script marked extracted |
| 4. Prompt | `POST /api/assetsGenerate/batchPolishAssetsPrompt { projectId, items }` | prompt per asset |
| 5. Looks | `POST /api/assetsGenerate/batchGenerateImageAssets { projectId, items, concurrentCount, model, resolution }` | `asset_images` + primary `image_path` |
| 6. Plan | `POST /api/production/plan/generatePlan { projectId, scriptId }` | scenes × shots JSON |
| 7. Frames | `POST /api/production/storyboard/batchGenerateImage { projectId, scriptId, shots, concurrentCount }` | storyboard rows + images |
| 8. Clip | `POST /api/production/workbench/generateVideo { projectId, trackId }` | video row + clip on a track |
| 9. Cut | `POST /api/production/saveFlowData { projectId, tracks, clips }` | tracks/clips persisted |
| 10. Export | `POST /api/editor/export { clips }` | ffmpeg MP4 in `storage/exports` |

State:

- script `extract_state`: 0 not extracted, 1 extracted, -1 cancelled.
- asset `state`: `ready` → `completed`; `prompt_state` mirrors the prompt.
- storyboard `status`: `image_ready` (then video can attach).
- clip `status`: `ready`; `media_path` is the public URL.
- project `status`: active or `deleted` (soft delete; `deletedAt` set).

The pipeline is synchronous in the request for the mock provider, except the
settlement which is queued. A real deployment would enqueue the provider job
and poll, keeping the same asset/storyboard/clip states.

---

## 13. Durable jobs

Generation money must survive a restart, so settlement is a database job:

```
jobs(id, kind, payload, status, attempts, run_at, locked_at, result, error)
```

- `enqueueJob(kind, payload, delayMs)` inserts `queued` with `run_at`.
- `startJobWorker()` ticks every second, claims the oldest due `queued` row with
  a conditional update, runs the handler, marks `done`, or retries with 1/2/4 s
  backoff (max 3 attempts).
- `registerJob("settle", …)` calls `settleCredits`.
- `GET /api/system/jobs` (admin) shows the last 25 jobs.

The reference replica still uses `setTimeout` for a few endpoints
(`script/extractAssets`, `scriptEnhancement/generate`); a complete rebuild should
move every money path to `enqueueJob("settle", …)`.

---

## 14. Chat and agent memory

The director chat is project-scoped:

- `POST /api/chat/send { projectId, message }` → stores user + assistant
  messages, returns both.
- `POST /api/chat/stream` → SSE: `{"event":"start"}`, repeated
  `{"delta":"…"}`, `{"event":"done","messageId"}`, then `data: [DONE]`.
- `POST /api/agents/getMemory { projectId }` → last 40 messages, a one-line
  project summary and a token estimate.

All three resolve the project through the caller's agency first. The replica's
reply is deterministic and grounded in live counts (scripts, completed looks,
plan, frames, clips); a production build can replace `directorReply()` with a
model call while keeping the SSE contract and the scoping.

---

## 15. Media storage and uploads

Directories: `storage/images`, `storage/videos`, `storage/exports`,
`storage/uploads`; all served at `/media/...`.

Uploads are base64 data URLs:

- `POST /api/assets/uploadClip` — mp4/webm/mov.
- `POST /api/production/editImage/uploadImage` — png/jpeg/webp; optionally
  attaches to an asset in the same project.

Controls: MIME allowlist, extension derived from MIME (no traversal), UUID
filename, 40 MB cap, project scoped. SVG is excluded to avoid stored XSS.

---

## 16. Editor and export

- Tracks (`video`/`audio`/`text`/`overlay`) and clips (`start_ms`,
  `duration_ms`, `trim_in_ms`, `trim_out_ms`, `position`).
- The editor loads `getFlowData`, persists with `saveFlowData`, and compiles
  with `editor/export`.
- Export shells out to `ffmpeg` (`trim`, `concat`, optional `drawtext`) and
  writes an MP4 into `storage/exports`.
- The UI supports select, split at playhead, move, delete, trim inputs, and a
  media pool of storyboard frames + generated clips.

---

## 17. Billing and payments

Plans (INR):

| id | credits | price |
|---|---|---|
| 1 | 100 | ₹100 |
| 2 | 220 | ₹200 |
| 3 | 550 | ₹500 |

Flow:

1. `POST /api/payment/listPlans` (public) → plans with `amountPaise`.
2. `POST /api/payment/createOrder { planId, currency }` (admin/billing.pay) →
   server looks up the plan and creates a Razorpay order. Client-supplied
   amount/credits/price are ignored. Currency must match the plan/location,
   otherwise `409`.
3. `POST /api/payment/getOrder { orderId }` → owner-scoped order.
4. `POST /api/payment/verifyPayment { razorpay_order_id, razorpay_payment_id,
   razorpay_signature }` → HMAC check, owner-scoped, marks paid and credits the
   wallet.
5. `POST /api/webhooks/razorpay` → HMAC over the raw body; idempotent order
   update.

`mockPay` exists only in the replica (`DEMO_MODE`); the live production route
is 404. The Razorpay key **secret** never leaves the server; only the public
`keyId` is returned.

---

## 18. API surface

`API-CONTRACT.md` has the full table. Groups:

- auth: request/verify OTP, me, logout, onboarding, permissions, profile
- agency: get/create/members/invites/roles/leave/rename/upgrade/move
- config: client config (home defaults, model registry, billing ratio)
- wallet: detail, transactions, quote
- payment: plans, create/get/verify, mock pay, webhook
- project: analyse, create, add/edit/delete, single
- script: get, batch add, update/delete, extract/cancel/poll, enhancement
- assets: list/counts, prompt polish, image generation, upload
- production: plan, storyboard, flow, tracks, video, file URLs, URL writers
- editor: export
- chat: send/stream/memory
- system: jobs, version
- demo/lab: demo session, dev login

---

## 19. Security boundaries

Controls that hold (observed on the live target):

- auth required on all production routes (401 without a token);
- membership check on the agency header (403);
- project/script/asset/order reads scoped by agency (404);
- invites are 32-byte tokens, email-bound, 7 days;
- roles: editor cannot invite/pay/delete; viewer read-only;
- payment amount server-side, HMAC on verify and webhook, order ownership,
  no secret in the client;
- no credit-transfer endpoint; cross-tenant `moveProject` is 403;
- image quote/limits validated; hidden credit routes 404.

Findings and deliberate modes:

- **F-001/F-003 (High)** — hold `min(items, cc ?? 1) × unit` vs settle
  `items × unit`; `cc` client-controlled. Parallel or sequential batches can
  settle past the balance.
- **F-002 (Medium)** — 1,000-credit org bonus per org with only email OTP;
  self-invite aggregation.
- **F-004 (High)** — cross-tenant asset URL overwrite via
  `/api/production/assets/updateAssetsUrl` and a random `flowId`.
- **OBS-001 (Low)** — OTP verify had no lockout in 10 attempts.
- **OBS-002 (High)** — wallets can go negative after settlement.

`BILLING_MODE=vulnerable|fixed` and `SECURITY_MODE=vulnerable|fixed` reproduce
and block the respective issues. See `SECURITY.md`.

---

## 20. Observability and operations

- `GET /api/version` → release string.
- `GET /api/system/jobs` (admin) → queue state.
- Ledger + wallet are the audit trail for money.
- Media is on disk; back up `storage/` and `kronicle.db` together.
- Logs: API stdout; ffmpeg errors are caught and surfaced as 500.
- The demo/lab endpoints are loopback-only and disabled by `DEMO_MODE=false`.

---

## 21. Known gaps and deliberate mocks

- Providers are mocked (SVG + ffmpeg); no real model HTTP calls.
- Razorpay is mocked; no live keys.
- Email is not sent; OTP is returned in the response for local use.
- A few money paths still use `setTimeout` instead of the job queue.
- No rate limiting on OTP or generation; no CSRF token; logout does not revoke
  JWTs.
- No pixel-perfect UI guarantee; see `docs/UI-SPEC.md`.
- Real provider cost/margin is not exposed; the $/credit figure is a lab
  assumption.
- Uploads are base64, not resumable/multipart.

---

## 22. Rebuild order

1. Workspace + shared package (roles, plans, units).
2. SQLite schema (`schema.sql`) and helpers.
3. Auth (OTP, JWT, agency resolution, onboarding, bonuses).
4. Tenancy (invites, roles, members, moveProject).
5. Wallet (hold/settle/credit/quote) + ledger.
6. Projects, scripts, assets, plans, storyboards, tracks/clips.
7. Generation endpoints + mock media.
8. Jobs worker; move every settlement to it.
9. Editor save/export.
10. Billing (plans, order, verify, webhook).
11. Chat (send/stream/memory), uploads, URL writers.
12. Web screens in the order: login → home → project → editor → settings.
13. Security modes and the billing lab.
14. Demo/lab seeding.

Acceptance checks are in `REBUILD-CHECKLIST.md`.

---

## 23. Glossary

| Term | Meaning |
|---|---|
| Agency / workspace | tenancy unit that owns projects and the wallet |
| Personal vs org | agency type; org gets the 1,000 bonus and team features |
| Hold | credits moved from balance to held for a pending generation |
| Settle | final charge against a pending ledger row |
| Unit | base credit price per action (`UNIT` in shared) |
| `cc` | client-supplied `concurrentCount` used (wrongly) in the hold formula |
| FlowId | client-supplied image-flow identifier in URL writers |
| Looks | generated character/scene/prop images |
| Plan | scenes × shots directing plan |
| Storyboard | frame images for the plan |
| Clip | timeline media segment |
| Track | video/audio/text lane in the editor |
