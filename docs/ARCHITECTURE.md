# Architecture — kronicle.kee

Clean-room behavioural replica of the Kronicle Studio backend. This document is
the map of how the replica works, what was observed on the reference, and where
the security boundaries sit. It is the backend companion to
`PRODUCT-TEARDOWN.md`, `UI-SPEC.md`, `VIDEO-EDITOR-SPEC.md` and
`SECURITY-NOTES.md`.

## 1. Topology

```
browser
  │  http://localhost:3210
  ▼
apps/web  (Next.js App Router, client components)
  │  fetch("/api/…", credentials: "include")
  ▼
apps/api  (Express 4, TypeScript, tsx)
  ├── node:sqlite  storage/kronicle.db   (WAL, foreign_keys ON)
  ├── storage/images | videos | exports | uploads   (served at /media)
  └── jobs worker (1 s tick) → settle generation holds
```

- `apps/web` never talks to a database. Every screen goes through the API.
- `apps/api` is the only writer. It owns the wallet ledger, the media files and
  the job queue.
- `packages/shared` exports billing units (`UNIT`), plans (`PLANS`), role
  permissions and the hoist/quote helpers used by both sides.
- The reference is an SPA backed by a JSON API (`/api/...`) with a
  `{ code, data, message }` envelope. The replica keeps that envelope so the
  observed client logic ports over with minimal changes.

## 2. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_PATH` | `./storage/kronicle.db` | SQLite file |
| `STORAGE_DIR` | `./storage` | media root |
| `JWT_SECRET` | dev secret | session signing |
| `BILLING_MODE` | `vulnerable` | `fixed` enables the corrected hold formula |
| `SECURITY_MODE` | `vulnerable` | `fixed` enables object-scope checks on production URL writes |
| `DEMO_MODE` | `true` | loopback demo session + lab login |
| `LAB_PASSWORD` | `research-3000!` | lab account password |
| `RAZORPAY_KEY_SECRET` | dev secret | mock payment HMAC |

`BILLING_MODE` and `SECURITY_MODE` exist because this is a research lab: the
vulnerable path reproduces a finding, the fixed path is the regression test.

## 3. Identity and sessions

### 3.1 Email OTP

1. `POST /api/auth/request-otp { email }` creates a 4-digit code in `otps`
   with a 5-minute expiry and returns `verification_id` (the dev response also
   includes `dev_code`; a real deployment would mail it).
2. `POST /api/auth/verify-otp { email, otp, verification_id }` checks
   id + email + code + expiry + unconsumed, marks it consumed, creates the user
   if new, signs a JWT and sets the `kronicleToken` cookie.

The code is bound to the verification id **and** the email, so a code cannot be
replayed against a different address.

### 3.2 JWT

`signToken` puts `{ id, userId, name }` in a 2-hour HS256 JWT. It is accepted
from the `kronicleToken` cookie or `Authorization: Bearer`. `authRequired`
re-reads the user from the database on every request, so a deleted user is
rejected even with a valid token.

### 3.3 Workspace selection

Every authenticated request carries an agency. `authRequired` chooses:

1. `x-agency-id` header, if present;
2. otherwise the user's first agency by creation time.

It then looks up `memberships(agency_id, user_id)`. No membership → `403`. The
resolved `agencyId` and `role` are attached to the request and every data route
is expected to scope by them.

> Observed on the reference: the client sends `x-agency-id`; the token alone is
> not enough to choose a workspace. The replica keeps the same rule.

### 3.4 Roles

`ROLE_PERMISSIONS` in `packages/shared`:

| Permission | admin | editor | viewer |
|---|---|---|---|
| project.view | ✓ | ✓ | ✓ |
| project.create / edit / move | ✓ | ✓ | – |
| generate.run | ✓ | ✓ | – |
| project.delete | ✓ | – | – |
| members.manage | ✓ | – | – |
| billing.pay | ✓ | – | – |
| workspace.manage | ✓ | – | – |

`requirePermission(p)` checks the request role. `adminOnly` is the narrower gate
for destructive workspace operations.

### 3.5 Demo and lab sessions

- `POST /api/demo/session` (loopback only) creates/loads
  `demo@kronicle.studio`, a `Kronicle Studio` org with **10,000 credits**, and a
  seeded "The Lighthouse Keeper" project. The web shell calls it automatically
  when `/api/auth/me` returns 401, so `/` opens the studio.
- `POST /api/auth/dev-login` (loopback only) signs in
  `researcher@kronicle.local` / `research-3000!` into a `Research Lab` org with
  **3,000 credits**. The login page exposes it at `/login?lab=1`.
- Both are disabled by `DEMO_MODE=false` and refuse non-loopback clients.

## 4. Data model

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

jobs             durable queue (kind, payload, run_at, attempts, status)
agent_messages   chat transcript scoped by agency + project
```

Key columns:

- `wallets(agency_id UNIQUE, balance, held)` — one wallet per workspace.
- `ledger(agency_id, type, gen_type, status, credits_held, credits_delta,
  actor_user_id, meta)` — append-only history; `pending` rows are open holds.
- `assets(project_id, type, prompt, prompt_state, image_path, state, model,
  resolution)` — cast/place/prop records. `image_path` is the public URL.
- `storyboards(project_id, shot_number, prompt, image_path, video_prompt,
  status)`.
- `tracks(project_id, kind, position)` and `clips(track_id, media_path,
  start_ms, duration_ms, trim_in_ms, trim_out_ms)` — the editor timeline.
- `orders(agency_id, plan_id, amount_paise, credits, gateway_order_id UNIQUE,
  status, payment_id)`.

There are no database-level foreign keys between most domain tables; scoping is
enforced in queries (`JOIN projects p ON p.id = … WHERE p.agency_id = ?`). That
is the single most important invariant in the codebase and the place where
F-004 broke it.

## 5. Wallet and ledger

The wallet is a two-phase system:

1. **Hold** — `holdCredits(agencyId, amount)` checks `balance >= amount`, moves
   the amount from `balance` to `held`, and writes a `pending` ledger row. A
   generation starts only after the hold succeeds.
2. **Settle** — `settleCredits(ledgerId, actual)` reads the row, ignores it
   unless still `pending`, releases the hold and applies
   `actual − held` to the balance. `actual` is the true provider cost;
   `status="failed"` refunds the hold.

`computeHold(items, concurrentCount, unit)` is the disputed formula. In
`vulnerable` mode it is `min(items, concurrentCount ?? 1) × unit`; in `fixed`
mode it is `items × unit` (the whole batch is reserved before work starts).

`creditWallet` is the top-up/adjustment path; it writes a completed ledger row
with a positive delta. The 1,000-credit organisation bonus and the 100-credit
personal bonus are applied here after onboarding.

Money never touches a provider key: the API quotes `PLANS`, creates an order
with the server-side amount, and only credits the wallet after a verified
signature (`verifyPayment` HMAC or the Razorpay webhook HMAC over the raw
body).

## 6. Job queue

Generation work must survive an API restart and must not double-charge, so
settlement is a database job rather than a `setTimeout`:

```
jobs(id, kind, payload, status, attempts, run_at, locked_at, result, error)
```

- `enqueueJob(kind, payload, delayMs)` inserts a `queued` row with
  `run_at = now + delay`.
- `startJobWorker()` ticks every second, selects the oldest due `queued` row,
  claims it with a conditional `UPDATE … WHERE status='queued'`, runs the
  handler and marks it `done` or retries with exponential backoff (1 s, 2 s,
  4 s; max 3 attempts).
- `registerJob("settle", …)` calls `settleCredits`. Because settlement is
  idempotent on a `pending` ledger row, a retry cannot charge twice.
- `GET /api/system/jobs` (admin) exposes the last 25 jobs with status/attempts.

Every generation endpoint (`batchPolishAssetsPrompt`, `batchGenerateImageAssets`,
`generatePlan`, `batchGenerateImage`, `generateVideo`, script enhancement) now
enqueues a settle job instead of holding a timer in memory.

## 7. Generation pipeline

The replica mirrors the observed stage contract:

| Stage | Endpoint | Output |
|---|---|---|
| analyse | `/api/project/analyzeScript` | title, logline, characters, scenes |
| create | `/api/project/createFromScript` | project + episode script |
| extract | `/api/script/extractAssets` | scripts + asset records (role/scene/tool) |
| looks | `/api/assetsGenerate/batchGenerateImageAssets` | `asset_images` + primary `image_path` |
| plan | `/api/production/plan/generatePlan` | scenes × shots JSON |
| frames | `/api/production/storyboard/batchGenerateImage` | storyboard rows + images |
| clip | `/api/production/workbench/generateVideo` | video row + clip on a track |
| cut | `/api/production/saveFlowData` | tracks + clips persistence |
| compile | `/api/editor/export` | ffmpeg MP4 in `storage/exports` |

Provider calls are mocked: `svgImage()` renders a deterministic gradient card,
`renderClipVideo()` renders a 2-second ffmpeg clip with a text label. The mocks
exist so the full state machine, credit flow and editor can be exercised without
a model key. A production adapter would replace only those two functions.

## 8. Chat and agent memory

The observed client has a director chat. The replica implements the contract
with a deterministic, project-grounded responder (no external model):

- `POST /api/chat/send { projectId, message }` — appends the user message and an
  assistant reply to `agent_messages`, returns both.
- `POST /api/chat/stream` — the same, streamed as SSE:
  `data: {"event":"start"}`, repeated `data: {"delta":"…"}`,
  `data: {"event":"done","messageId"}`, then `data: [DONE]`.
- `POST /api/agents/getMemory { projectId }` — last 40 messages plus a
  one-line project summary and a token estimate.

All three resolve the project through
`projects.id = ? AND projects.agency_id = ?` first, so a project id from another
workspace is a 404 and never reaches the transcript. The reply itself is derived
from live counts (scripts, completed looks, plan, frames, clips), so the next
step it suggests matches the actual project state.

## 9. Uploads

Two observed upload paths are implemented as base64 data URLs:

- `POST /api/assets/uploadClip` — `video/mp4`, `video/webm`, `video/quicktime`.
- `POST /api/production/editImage/uploadImage` — `image/png`, `image/jpeg`,
  `image/webp`; optionally attaches the result to an asset in the same project.

Controls:

- the MIME type is taken from the data-URL header and must be in the allowlist;
- the extension is derived from the MIME type, never from the client filename
  (no path traversal);
- the file name is a server-side UUID;
- payloads are capped at 40 MB (express JSON limit 48 MB);
- the project is resolved against the caller's agency before anything is
  written;
- SVG is deliberately not accepted, to avoid stored XSS through `image/svg+xml`.

## 10. Security boundaries

### Enforced

- Every route except auth, payment plans and the loopback demo/lab routes runs
  `authRequired`; unauthenticated production writes return 401.
- Workspace resolution requires a real membership row (`403` otherwise).
- Mutating routes require a role permission.
- Project reads/writes in the core routes join through `projects.agency_id`.
- Payment amount is server-side; `verifyPayment` and the webhook verify an HMAC;
  a plan id is looked up, not trusted from the client.
- Settlement is idempotent and cannot overdraw a held amount.
- Upload type/extension/size are validated server-side.

### Deliberately weak (lab modes)

- `BILLING_MODE=vulnerable` reproduces the hold-collapse finding: `concurrentCount`
  is client-controlled and defaults to 1, so a parallel batch reserves one item
  but settles N.
- `SECURITY_MODE=vulnerable` reproduces F-004: `updateAssetsUrl`,
  `updateAnchorUrl` and `updateStoryboardUrl` look the row up by id alone and
  accept any UUID as `flowId`.
- `SECURITY_MODE=fixed` joins the row to the caller's agency and validates the
  flow, and is the regression test for the finding.

### Known gaps / not implemented

- No rate limiting on OTP request/verify or generation endpoints.
- No CSRF token; the session cookie is `SameSite=Lax` and the API accepts a
  cookie, so cross-site POSTs are blocked by the browser but not by a token.
- Logout clears the cookie but does not revoke an already-issued JWT (it stays
  valid until expiry) — the replica reproduces the observed behaviour.
- The mock provider functions do not fetch remote URLs, so the replica cannot
  reproduce a server-side fetch of an attacker URL.
- Chat is deterministic; there is no model, tool loop or prompt-injection
  surface in the replica.
- `updateVideoDuration` and the remaining workbench writers are not replicated.

## 11. Reference-to-replica map

| Reference behaviour | Replica |
|---|---|
| `{ code, data, message }` envelope | `ok()` / `bad()` |
| `x-agency-id` workspace switch | `authRequired` |
| OTP + JWT cookie | `request-otp` / `verify-otp` |
| 1,000 org bonus / 100 personal bonus | `creditWallet` on onboarding |
| hold → settle with provider cost | ledger + jobs |
| script → assets → plan → storyboard → video | same stage endpoints |
| asset URL rewrite after generation | `updateAssetsUrl` (+ siblings) |
| director chat SSE | `chat/stream` |
| base64 image/clip upload | `uploadImage` / `uploadClip` |
| Razorpay create/verify/webhook | HMAC mock |

## 12. Where to change what

- New API route: `apps/api/src/index.ts` (keep `authRequired`, resolve the
  project through the agency, then write).
- New table: `apps/api/src/db.ts` `db.exec` block + a migration if the column is
  added to an existing table.
- New background work: `registerJob(kind, handler)` and `enqueueJob`; never a
  bare `setTimeout` for money or provider state.
- Billing rule: `packages/shared` `UNIT`/`holdFor` and `apps/api/src/wallet.ts`.
- Screen: `apps/web/app/(app)/…`; all data through `apps/web/lib/api.ts`.
- New security test: `SECURITY_MODE=fixed` should make the exploit return 404
  and a wrong flow return 400.
