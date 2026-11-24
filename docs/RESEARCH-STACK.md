# Research: stack for a clean-room Kronicle replica

Status: research brief, 2026-11-24. Scope: what to build `apps/web`, `apps/api`,
`packages/shared` and `labs/billing-abuse` on, and why.

Inputs read:

- `docs/REFERENCE-OBSERVED.md` (observed reference behaviour, routes, API surface)
- `docs/PLAN.md` (outcomes A and B, phases)
- `apps/api/package.json`, `packages/shared/src/index.ts` (current scaffold)
- `/Users/het/SecurityHarness/engagements/auto/web-20261124-073125/reports/KRONICLE-BILLING-SECURITY-REVIEW.md`
  (F-001, F-002, F-003, OBS-001 and the negative payment/tenant matrix)
- Public primary docs, listed in §13. Every version number below was read from
  the npm registry or the project's own docs on 2026-11-24, not from memory.

This document is a stack recommendation, not a spec. Product/schema detail
belongs in `DATA-MODEL.md`, `API-CONTRACTS.md`, `VIDEO-EDITOR-SPEC.md`.

---

## 0. Recommendation in one screen

| Layer | Choice | Version to pin |
|---|---|---|
| Runtime | Node.js LTS | `26.x` LTS (local `v26.12.1`); `24.x` LTS also acceptable |
| Package manager | pnpm workspace (already in repo) | `pnpm@10` |
| Language | TypeScript | `7.0.x` if the toolchain is happy, else `5.9.3` |
| Web | Next.js App Router + React 19 | `next@16.4.6`, `react@19.3.1` |
| Styling | Tailwind CSS v4 (PostCSS plugin) | `tailwindcss@4.3.5` |
| Server-state | TanStack Query v5 | `@tanstack/react-query@5.108.4` |
| Client-state | Zustand v5 | `zustand@5.1.0` |
| API | Express 5 (ESM, async handlers) | `express@5.3.0` |
| Validation | Zod 4 (shared contracts) | `zod@4.6.7` |
| Database | `node:sqlite` (built-in, sync API) | bundled with Node; RC stability |
| Images | `sharp` (mock + thumbnails) | `sharp@0.35.5` |
| Video mux | FFmpeg CLI (child process) | `ffmpeg 9.x` (local `9.0.2`) |
| Optional motion graphics | Remotion | `remotion@4.0.546` — licence gate, see §10.2 |
| Payments | Razorpay Orders + Checkout (test mode) behind a mock rail | doc-only; no SDK required |

Two corrections to the brief as written:

1. **Next.js 15 is no longer current.** `next@latest` is `16.4.6`; the 15 line
   is still patched (`15.5.29` is the current 15.x backport, and the September
   2026 security release explicitly shipped `15.5.26`). The App Router model the
   replica depends on is unchanged between 15 and 16, so build on **16.4.x**
   unless you are deliberately chasing build parity with the observed target.
2. **Zod 4, not 3.** The scaffold currently pins `zod@^3.24.1`. Zod 4 has
   breaking changes that affect how we write contracts (§6). Decide once, before
   `packages/shared` grows.

---

## 1. Version matrix (verified 2026-11-24)

Read from `registry.npmjs.org/<pkg>/latest` and the projects' own pages.

| Package | `latest` | Engines / notes |
|---|---|---|
| `next` | 16.4.6 | `node >=20.9.0`; `15.5.29` is the current 15.x backport |
| `react` / `react-dom` | 19.3.1 | Next 16.4 advertises "React 19.3 features" |
| `tailwindcss` | 4.3.5 | docs banner reads "v4.3" |
| `@tailwindcss/postcss` | 4.3.5 | the Next.js install path |
| `@tanstack/react-query` | 5.108.4 | v5 API (`useQuery({ queryKey, queryFn })`) |
| `zustand` | 5.1.0 | `node >=12.20` |
| `express` | 5.3.0 | `node >= 18`; `latest-4` is 4.22.3 |
| `zod` | 4.6.7 | "Zod 4 is stable" |
| `typescript` | 7.0.2 | last 5.x is `5.9.3` |
| `tsx` | 4.23.15 | dev runner already in the scaffold |
| `sharp` | 0.35.5 | `node >=20.9.0` |
| `remotion` / `@remotion/cli` | 4.0.546 | peer `react >=16.8` |
| `vitest` | 5.1.1 | |
| `@playwright/test` | 1.65.1 | listed among Next's peer dependencies |
| FFmpeg | 9.1 source tarball on ffmpeg.org; local binary `9.0.2` | |
| Node | `26.13.1` docs; local `v26.12.1` | 26.x and 24.x are both LTS |

---

## 2. Runtime and repo baseline

- **Node 26 LTS.** `node:sqlite` is a *release candidate* (Stability 1.2). The
  history table is precise: `v22.13.0` dropped the `--experimental-sqlite` flag
  but kept it experimental; `v24.15.0` and `v25.7.0` promoted it to release
  candidate. Local `v26.12.1` exposes `Database`, `DatabaseSync`, `Statement`,
  `StatementSync`.
- **Class name differs by major.** Node 22/24 export `DatabaseSync` as the real
  class (`Database` does not exist there). Node 26 renamed it to `Database` and
  keeps `DatabaseSync` as a deprecated alias (DEP0210). Pin the runtime and use
  the matching name; do not write code that assumes both.
- **`node:sqlite` is fully synchronous.** The docs state "All APIs exposed by
  this class execute synchronously." Consequences are in §8: never `await`
  inside a transaction, never run FFmpeg on the request path.
- Foreign keys are **on by default** (`enableForeignKeyConstraints: true`), and
  the docs' own example uses `STRICT` tables. Use both.
- TypeScript 7 is the native compiler line. It is `latest`, but if `tsx`,
  Metro-style path aliases or a plugin in the chain misbehaves, fall back to
  `5.9.3` — nothing in this design needs TS 7.
- Keep the pnpm workspace as-is (`apps/*`, `packages/*`, `labs/*`). The lab
  should import the **same** billing module as the API, not a copy; that is what
  makes "vulnerable vs fixed" a mode switch rather than two codebases.

---

## 3. Frontend

### 3.1 Next.js 16.4 App Router

What we need from the App Router, and what it gives us:

- `app/` layouts + nested routes map cleanly onto the observed tree
  (`/home/settings/{general,team,billing,usage}`, `/production`, `/assets`,
  `/invite/[token]`).
- **Route Handlers** (`app/**/route.ts`) exist but we do **not** need them: the
  observed architecture is a separate Express API at `/api/*`, and keeping that
  split makes the API contract testable without a browser. Use `next.config`
  rewrites (`/api/:path*` → `http://localhost:4000/api/:path*`) in dev so the
  frontend calls same-origin paths like the original.
- Route Handlers "are not cached by default"; only `GET` can opt in via
  `export const dynamic = 'force-static'`. That default is what we want for an
  authenticated app.
- Server Components fetch nothing in this design. All data access is client-side
  through TanStack Query against the Express API, because every screen is
  per-workspace and depends on the `x-agency-id` header, which lives in client
  state (§3.4).
- Turbopack is the default bundler in 16 for both dev and build (opt out with
  `next build --webpack`). The observed build also used Turbopack, so bundle
  behaviour will look familiar.

**Caching rule (non-negotiable):** any route that renders per-user data must opt
out of static rendering (`cookies()`, `headers()`, or `export const dynamic =
'force-dynamic'`). Never put a workspace-scoped payload in a cached RSC result;
that is how tenant data leaks between users.

### 3.2 Tailwind CSS 4

- Install path for Next.js is the PostCSS plugin, per the docs: `tailwindcss`,
  `@tailwindcss/postcss`, `postcss`, then `postcss.config.mjs` with
  `{ plugins: { "@tailwindcss/postcss": {} } }`, then `@import "tailwindcss";`
  in the global stylesheet. There is no `tailwind.config.js` requirement and no
  `content` array — v4 detects classes from source files itself.
- Theme tokens go in CSS (`@theme`), which suits the observed
  `bg-surface-2` / `text-muted-foreground` / `border-border` vocabulary seen in
  the JS chunks. Recreate tokens, not exact values.
- v4 is a rewrite: don't paste v3 config or `@tailwind base/components/utilities`
  directives.

### 3.3 TanStack Query v5

- Owns **server state**: projects, scripts, assets, plan, storyboard, wallet,
  ledger, members, orders.
- Query keys must include the workspace id or the cache will serve agency A's
  data inside agency B after a workspace switch:
  `['wallet', agencyId]`, `['projects', agencyId]`, `['storyboard', projectId]`.
- Mutations that change credits must invalidate `['wallet', agencyId]` and
  `['ledger', agencyId]` together; the observed UI shows a held balance that
  changes *before* settlement, so poll `wallet/detail` at ~2 s while a batch is
  in flight rather than inventing optimistic arithmetic.
- Long jobs (image/video batches) are `polling*` endpoints in the observed API.
  Model them as a query with `refetchInterval` that stops on a terminal status,
  not as a mutation with a spinner.

### 3.4 Zustand v5

- Owns **client state only**: session user, active `agencyId`, role, sidebar and
  panel layout, timeline UI state (selected clip, playhead, zoom, snapping).
- Do **not** mirror server data into Zustand. Two sources of truth is the
  classic way to render a stale balance.
- Persist only `agencyId` (and maybe theme) with `persist`; never persist tokens
  — they belong in httpOnly cookies (§5.2).

### 3.5 Suggested dependency set

```
next@16.4.6  react@19.3.1  react-dom@19.3.1
tailwindcss@4.3.5  @tailwindcss/postcss@4.3.5  postcss@8.5.33
@tanstack/react-query@5.108.4  zustand@5.1.0
zod@4.6.7            # also a dependency of packages/shared
```

No component library is required; the observed UI is a custom design system.
If one is wanted for speed, keep it headless so the token vocabulary survives.

---

## 4. API layer: Express 5

### 4.1 Express 5 changes that actually matter here

From the official migration guide:

- **Rejected promises are forwarded to error middleware.** `async` handlers no
  longer need `.catch(next)`. This is the single biggest reason to take 5 over 4
  for a JSON API — every zod parse failure and every `throw` lands in one
  handler.
- Removed: `app.del()`, `req.param()`, `res.send(obj, status)`,
  `res.json(obj, status)`, `res.redirect(url, status)` (argument order flipped to
  `res.redirect(status, url)`), `res.sendfile()` (now `res.sendFile`),
  `res.send(status)`.
- `req.body` is `undefined` when unparsed (was `{}`). Guard accordingly.
- `req.query` is a getter and the default parser is "simple" — no nested objects
  from query strings. Client-supplied `?a[b]=c` will not turn into an object,
  which quietly kills a class of prototype-pollution probes.
- Wildcards must be named: `/*splat`, and `/{*splat}` to include `/`.
- `express.static` now defaults `dotfiles: "ignore"`. If the replica ever serves
  `/.well-known`, opt in explicitly.
- `express.json/urlencoded/text/raw` gained Brotli request support.

### 4.2 Middleware order (mount order is the security model)

```
1. requestId + structured logger
2. helmet-equivalent headers (or a hand-rolled set: nosniff, frame-ancestors,
   referrer-policy, HSTS in prod)
3. cors({ origin: WEB_ORIGIN, credentials: true })      # one origin, not *
4. cookieParser()
5. POST /api/webhooks/razorpay  -> express.raw({ type: 'application/json' })
   (BEFORE the JSON parser; the HMAC is over the raw bytes)
6. express.json({ limit: '2mb' })
7. auth middleware (reads cookie, verifies JWT, sets req.user)
8. workspace middleware (reads x-agency-id, checks membership, sets req.agency)
9. routes
10. 404 handler
11. error handler (single JSON envelope, no stack in prod)
```

Step 5 is a hard requirement, not a preference. If `express.json()` touches the
webhook body first, `JSON.stringify(req.body)` will not reproduce the signed
bytes and every real webhook fails. The alternative, if the raw route feels
awkward, is `express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })`
and to sign `req.rawBody`.

### 4.3 One response envelope

The observed API answers `{ code, data, message }` (`{"code":200,"data":
{"total":10},"message":"success"}`). Keep it, because the frontend and the
regression tests both key off it:

```ts
type Ok<T>  = { code: 200; data: T; message: 'success' };
type Err    = { code: number; data: null; message: string; issues?: unknown };
```

Map: zod failure → 400 with `issues`; not a member → 403; not found *or* not
yours → 404 (the observed target returns 404 for cross-tenant reads, which is
the right choice — it avoids confirming existence); insufficient credits → 402;
conflict/duplicate → 409; unauthenticated → 401.

### 4.4 Validation middleware

One helper, used everywhere:

```ts
const validate = <T extends z.ZodType>(schema: T) =>
  (req, res, next) => {
    const r = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!r.success) return res.status(400).json({ code: 400, data: null,
      message: 'Invalid request', issues: z.treeifyError(r.error) });
    Object.assign(req, r.data);       // typed, parsed values only
    next();
  };
```

Never read `req.body` after validation — read the parsed copy. That is what makes
"client sent `concurrentCount: 1e9`" a non-event.

---

## 5. Auth

### 5.1 Flow (mock email OTP → JWT cookies)

Observed shape, reproduced locally with no email provider:

1. `POST /api/auth/send-otp { email }` → creates a `verifications` row
   (`id`, `email`, `code_hash`, `expires_at`, `attempts`, `consumed_at`) and
   returns `{ verificationId, otpLength: 4, expiresIn: 300 }`.
2. In dev, the code is written to the API log **and** to
   `storage/dev-outbox/<email>.txt`, and the login screen shows a "Dev: use
   1234" hint when `NODE_ENV !== 'production'`. No SMTP, no third-party key.
3. `POST /api/auth/verify-otp { verificationId, email, code }` → on success,
   create-or-find the user, mint tokens, set cookies, return the session user.
4. `POST /api/auth/logout` → clears cookies and bumps `users.token_version`
   (see 5.6).
5. `GET /api/auth/me` → user + memberships + active agency + permissions.

Keep the 4-digit code (the product's UX) but treat it as a **mock** credential:
attempt cap, rate limit, short expiry, and a loud banner that it is a replica.
Anything internet-facing should be 6+ digits or a magic link.

### 5.2 Tokens and cookies

Two tokens, mirroring the observed lifetimes:

| Cookie | Algorithm | TTL | Purpose |
|---|---|---|---|
| `kronicleToken` | HS256 | 2 h | access token, sent on every API call |
| `jwtToken` | HS512 | 14 d | refresh token, only accepted by `/api/auth/refresh` |

Rules:

- `httpOnly: true`, `secure: NODE_ENV === 'production'`, `sameSite: 'lax'`,
  `path: '/'` (or `path: '/api'` for the refresh token).
- Different secrets for access and refresh (`JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`). A single shared secret is why the observed 2 h token
  could not be revoked cleanly.
- Refresh rotates: every refresh issues a new refresh token and records its
  `jti`; an unknown `jti` invalidates the family.
- **Logout must revoke.** The observed app left a valid `kronicleToken` alive
  after logout (recorded in the report's coverage list). Fix it with a
  `token_version` integer in `users`, embedded as a claim and compared on every
  request. Bumping it logs out every device; a `sessions` table gives per-device
  control if wanted.
- Because this is a replica, also expose `POST /api/auth/dev-login { email }`
  behind `NODE_ENV !== 'production'` so Playwright and the lab can skip OTP.

### 5.3 Claims

```ts
{ sub: userId, tv: tokenVersion, iat, exp, jti }
```

Deliberately **no** `agencyId` and **no** `role` in the token. Both are
per-workspace, and a token claim would either pin the user to one workspace or
let a client assert a role. Resolve them per request from `agency_members`.

### 5.4 Workspace header

`x-agency-id` selects the active workspace, exactly as observed.

```
auth  -> req.user
ws    -> const agencyId = req.get('x-agency-id')
         if (!agencyId) -> 400
         const m = member(agencyId, req.user.id)
         if (!m) -> 403 'You are not a member of this organisation'
         req.agency = agency; req.role = m.role; req.permissions = ROLE_PERMISSIONS[m.role]
```

This is the only place membership is decided. Every query downstream carries
`agency_id = req.agency.id` **from this object**, never from the body. The
observed target got this right (403 on a foreign `x-agency-id`, 404 on foreign
project ids); the replica must keep that property and the lab must prove it.

### 5.5 Roles

Reuse `packages/shared` as-is — it already encodes the observed model:

| Role | Permissions |
|---|---|
| `admin` | `billing.pay`, `generate.run`, `members.manage`, `project.*`, `session.use`, `workspace.manage` |
| `editor` | `generate.run`, `project.create/edit/move/view`, `session.use` |
| `viewer` | `project.view`, `session.use` |

Enforce with one guard, not scattered `if (role === 'admin')`:

```ts
const can = (perm: Permission) => (req, res, next) =>
  req.permissions.includes(perm) ? next() : res.status(403).json({...});
```

Observed mapping to keep: `billing.pay` gates create-order and plan changes;
`members.manage` gates invite/role-change/remove; `generate.run` gates
generation; a viewer can read a project but not spend the shared wallet.

### 5.6 Invites

Observed and worth copying exactly:

- Token = 32 random bytes, base64url → **43 characters**. Store only
  `sha256(token)`; the plaintext exists once, in the link.
- 7-day expiry, single use, **bound to the invited email**. Accepting while
  logged in as a different email must fail (the target returns 403 here).
- `revokeInvite` sets `revoked_at`; `resendInvite` rotates the token and expiry.
- `listInvites` never returns the token, only `id`, `email`, `role`,
  `expiresAt`, `status`.
- Accepting writes `agency_members` and marks `accepted_at` in one transaction.

---

## 6. Shared contracts: Zod 4

`packages/shared` is the contract layer; both the API and the web app import it,
so a schema change breaks compilation on both sides.

Zod 4 differences that will bite if we write it like Zod 3 (from the official
migration guide):

| Zod 3 | Zod 4 |
|---|---|
| `z.string().min(5, { message: 'x' })` | `z.string().min(5, { error: 'x' })` (`message` deprecated) |
| `z.string().email()` | `z.email()` (method form deprecated) |
| `z.string().uuid()` | `z.uuid()` (strict RFC 9562/4122) or `z.guid()` (loose) |
| `z.object({}).strict()` | `z.strictObject({})` |
| `z.record(z.string())` | `z.record(keySchema, valueSchema)` — two args required |
| `.default(v)` parses `v` | `.default(v)` short-circuits; `v` must match the **output** type. Use `.prefault(v)` for the old behaviour |
| `err.format()` / `.flatten()` | `z.treeifyError(err)` |
| `z.nativeEnum(E)` | `z.enum(E)` |

Also: `z.number().int()` rejects unsafe integers; `.safe()` no longer accepts
floats; `z.coerce.*` inputs are `unknown` and a missing key now errors.

Contract conventions:

- Every request body is a `strictObject` so unknown keys are rejected (the
  observed API behaves this way: extra `amount`/`credits` fields were ignored
  rather than honoured, which is even safer — either is defensible, but pick
  one and test it).
- Ids are `z.uuid()` or `z.guid()`, never `z.string()`; a loose string is how
  tenant ids sneak into places that should only accept opaque ids.
- Money is `z.int().nonnegative()` in **minor units** (paise, micro-credits).
  Never `z.number()` for money.
- `concurrentCount` is `z.int().min(1).max(8).optional()` — a **scheduling
  hint**, never a billing input. See §12.
- Export domain constants (`ROLES`, `ROLE_PERMISSIONS`, `PLANS`, `BONUS`,
  `UNIT`) from the same module as the schemas, as the scaffold already does.

---

## 7. Data model

### 7.1 The money decision: integer micro-credits

Observed ledger values include `3.135`, `7.0224`, `134`, and balances like
`314.839515` — six decimal places. SQLite has no `DECIMAL`; `REAL` is IEEE-754
and will not sum to the reported totals. Store credits as **integers scaled by
1e6 (micro-credits)**:

| Display | Stored |
|---|---|
| 3.135 | `3_135_000` |
| 7.0224 | `7_022_400` |
| 134 | `134_000_000` |
| 314.839515 | `314_839_515` |

1e6 matches the observed precision exactly, so nothing is lost. Do all
arithmetic in integers, and format only at the edge (`µ / 1e6`, 6 dp, trailing
zeros trimmed). Paise are already integers; do not convert them to rupees
anywhere but in the UI.

### 7.2 Tables

Every table gets `id TEXT PRIMARY KEY` (UUIDv7 preferred — sortable), an
`agency_id` where the row is tenant-owned, and `created_at INTEGER` (epoch ms,
set by the app). `STRICT` everywhere. Enable `PRAGMA foreign_keys` (default on
in `node:sqlite`) and add `ON DELETE CASCADE` from `agencies` down.

| Table | Key columns | Notes / indexes |
|---|---|---|
| `users` | `email` UNIQUE (citext-style: store lowercased), `name`, `avatar_url`, `token_version INT DEFAULT 0`, `onboarded_at` | one identity across workspaces |
| `verifications` | `email`, `code_hash`, `expires_at`, `attempts INT`, `consumed_at` | index `(email, created_at DESC)`; delete/expire after use |
| `sessions` (optional) | `user_id`, `jti` UNIQUE, `refresh_hash`, `revoked_at`, `user_agent`, `ip` | only if per-device logout is wanted |
| `agencies` | `name`, `type TEXT CHECK(type IN ('individual','org'))`, `owner_user_id`, `upgraded_at` | the "workspace" |
| `agency_members` | `agency_id`, `user_id`, `role CHECK(role IN ('admin','editor','viewer'))`, `joined_at` | PK `(agency_id,user_id)`; index `(user_id)`; exactly one `admin` who is the owner is enforced in service code + a partial unique index on `(agency_id, owner_user_id)` shape |
| `invites` | `agency_id`, `email`, `role`, `token_hash` UNIQUE, `invited_by`, `expires_at`, `accepted_at`, `revoked_at` | index `(agency_id, email)` |
| `projects` | `agency_id`, `title`, `kind` (`show`/`extension`/`localise`), `stage` (see `PROJECT_STAGES`), `script_id`, `image_model_id`, `video_model_id`, `text_model_id`, `created_by` | index `(agency_id, created_at DESC)`; model ids are catalog ids, not free text |
| `scripts` | `project_id`, `agency_id`, `episode_no`, `title`, `content TEXT`, `word_count`, `version INT` | index `(project_id, episode_no)`; keep versions for "compare" UX |
| `assets` | `agency_id`, `project_id`, `kind` (`image`/`video`/`audio`/`doc`), `storage_key`, `mime`, `bytes`, `width`, `height`, `duration_ms`, `sha256`, `origin` (`upload`/`generated`) | content-addressed `storage_key`; index `(project_id, kind)` |
| `script_assets` | `project_id`, `script_id`, `type` (`role`/`place`/`prop`), `name`, `prompt`, `asset_id`, `status` | the "Cast & places" / `cornerScape` entity list |
| `asset_variants` | `script_asset_id`, `provider`, `model_id`, `prompt`, `resolution`, `seed`, `asset_id`, `status` | one row per generated take |
| `plans` | `project_id`, `version INT`, `status`, `content_json TEXT` (scenes) | `CHECK(json_valid(content_json))` in non-STRICT column, or validate in code; index `(project_id, version DESC)` |
| `plan_anchors` | `plan_id`, `scene_no`, `prompt`, `asset_id`, `status` | the `production/anchor/*` surface |
| `storyboards` | `project_id`, `plan_id`, `scene_no`, `shot_no`, `description`, `image_asset_id`, `status`, `order_index` | index `(project_id, order_index)` |
| `tracks` | `project_id`, `kind` (`video`/`audio`/`bgm`), `name`, `order_index`, `locked INT` | timeline lanes |
| `clips` | `track_id`, `project_id`, `video_id`, `storyboard_id`, `start_ms`, `duration_ms`, `in_ms`, `out_ms`, `order_index`, `speed REAL DEFAULT 1.0`, `transition` | index `(track_id, order_index)`; all time is integer ms |
| `videos` | `project_id`, `clip_id` (nullable), `provider`, `model_id`, `prompt`, `duration_s INT`, `status`, `provider_job_id`, `storage_key`, `credits_charged INT` | generated takes *and* the rendered output if you want one table |
| `wallets` | `agency_id` UNIQUE, `balance_uc INTEGER NOT NULL DEFAULT 0`, `held_uc INTEGER NOT NULL DEFAULT 0`, `version INT` | one per agency; `CHECK(balance_uc >= 0)` if enforcing no-negative |
| `ledger` | `wallet_id`, `agency_id`, `kind` (`hold`/`settle`/`release`/`topup`/`bonus`/`refund`), `credits_held_uc`, `credits_delta_uc`, `gen_type`, `status`, `ref_type`, `ref_id`, `idempotency_key` UNIQUE, `created_at` | the audit spine; index `(agency_id, created_at DESC)`; never update a settled row |
| `orders` | `agency_id`, `user_id`, `plan_id`, `amount_paise INT`, `currency TEXT CHECK(currency='INR')`, `credits_uc INT`, `provider TEXT`, `provider_order_id` UNIQUE, `provider_payment_id`, `status` (`created`/`attempted`/`paid`/`failed`/`refunded`), `signature_verified_at`, `paid_at` | index `(agency_id, created_at DESC)` |
| `webhook_events` | `provider`, `event_id` UNIQUE (`x-razorpay-event-id`), `type`, `payload_sha256`, `processed_at`, `result` | the idempotency ledger for webhooks |
| `jobs` | `agency_id`, `project_id`, `kind`, `status` (`queued`/`running`/`done`/`failed`/`dead`), `priority INT`, `attempts INT`, `max_attempts INT`, `run_after INT`, `lease_until INT`, `worker_id`, `payload_json`, `hold_ledger_id`, `items_total INT`, `items_done INT` | index `(status, run_after, priority DESC)` |
| `job_items` | `job_id`, `idx INT`, `status`, `provider_job_id`, `result_json`, `settle_ledger_id`, `error` | UNIQUE `(job_id, idx)`; one settle per item, idempotent |

Derived/optional tables if the flow needs them: `chat_streams` (the
`/api/chat/stream` isolation key is `project:agent:script`),
`client_config` (the `getClientConfig` payload, versioned), `usage_daily`
(rollups for the usage page — cheaper than scanning `ledger`).

### 7.3 Critical DDL (copy the constraints, not just the columns)

```sql
CREATE TABLE wallets (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE,
  balance_uc  INTEGER NOT NULL DEFAULT 0 CHECK (balance_uc >= 0),
  held_uc     INTEGER NOT NULL DEFAULT 0 CHECK (held_uc >= 0),
  version     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE ledger (
  id                TEXT PRIMARY KEY,
  wallet_id         TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  agency_id         TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN
                      ('hold','settle','release','topup','bonus','refund')),
  credits_held_uc   INTEGER NOT NULL DEFAULT 0 CHECK (credits_held_uc >= 0),
  credits_delta_uc  INTEGER NOT NULL,
  gen_type          TEXT,
  status            TEXT NOT NULL CHECK (status IN ('pending','completed','failed','released')),
  ref_type          TEXT,
  ref_id            TEXT,
  idempotency_key   TEXT NOT NULL UNIQUE,
  created_at        INTEGER NOT NULL
) STRICT;

CREATE INDEX ledger_agency_time ON ledger (agency_id, created_at DESC);

CREATE TABLE orders (
  id                     TEXT PRIMARY KEY,
  agency_id              TEXT NOT NULL REFERENCES agencies(id),
  user_id                TEXT NOT NULL REFERENCES users(id),
  plan_id                INTEGER NOT NULL,
  amount_paise           INTEGER NOT NULL CHECK (amount_paise > 0),
  currency               TEXT NOT NULL CHECK (currency = 'INR'),
  credits_uc             INTEGER NOT NULL CHECK (credits_uc > 0),
  provider               TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id      TEXT NOT NULL UNIQUE,
  provider_payment_id    TEXT,
  status                 TEXT NOT NULL CHECK (status IN
                           ('created','attempted','paid','failed','refunded')),
  signature_verified_at  INTEGER,
  paid_at                INTEGER,
  created_at             INTEGER NOT NULL
) STRICT;

CREATE TABLE jobs (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL,
  project_id     TEXT,
  kind           TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN
                   ('queued','running','done','failed','dead')),
  priority       INTEGER NOT NULL DEFAULT 0,
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  run_after      INTEGER NOT NULL DEFAULT 0,
  lease_until    INTEGER,
  worker_id      TEXT,
  payload_json   TEXT NOT NULL,
  hold_ledger_id TEXT REFERENCES ledger(id),
  items_total    INTEGER NOT NULL DEFAULT 0,
  items_done     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
) STRICT;

CREATE INDEX jobs_ready ON jobs (status, run_after, priority DESC, created_at);
```

### 7.4 Invariants

**Enforced by the database:** one wallet per agency; unique provider order id;
unique idempotency key per ledger row; `(job_id, idx)` unique; non-negative
`held_uc`; foreign keys cascade from `agencies` and `projects`.

**Enforced by the service, in a single transaction:** hold = full batch cost;
settlement per item; a settle may never exceed the hold it belongs to; the sum
of `ledger.credits_delta_uc` for a wallet equals `balance_uc` (assert this in a
`seed:verify` script and in CI, because it is the one check that catches every
double-spend); an order credits the wallet exactly once.

**Never enforced by the client:** price, credits, plan, unit price, hold size,
concurrency, role, `agency_id`.

---

## 8. Queue and job patterns

No Redis, no broker. One SQLite file, one writer, a claim loop. This matches the
"runs locally with mock providers" requirement and keeps the lab honest.

### 8.1 Connection setup

```ts
import { Database } from 'node:sqlite';           // Node 26; DatabaseSync on 22/24
const db = new Database(dbPath, { timeout: 5000 });
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA foreign_keys = ON');             // already default
db.exec('PRAGMA busy_timeout = 5000');
```

`journal_mode = WAL` allows concurrent readers with one writer. `busy_timeout`
matters because WAL still serialises writers.

### 8.2 Claim (atomic, no lost work)

```sql
BEGIN IMMEDIATE;
UPDATE jobs
   SET status = 'running',
       worker_id = ?,
       attempts = attempts + 1,
       lease_until = ?            -- now + 60s
 WHERE id = (
   SELECT id FROM jobs
    WHERE status = 'queued'
      AND run_after <= ?
    ORDER BY priority DESC, created_at
    LIMIT 1
 )
RETURNING *;
COMMIT;
```

`BEGIN IMMEDIATE` takes the write lock up front, so two workers cannot both win.
Do it in one synchronous block — `node:sqlite` is synchronous, and **awaiting
inside a transaction blocks the event loop while holding a write lock**.

### 8.3 Two-phase execution

The database transaction must not contain provider or FFmpeg work:

1. **Claim** (transaction above).
2. **Execute** outside any transaction: call the mock/real provider, run FFmpeg
   in a child process, upload to `storage/`.
3. **Complete** in a new transaction: write `job_items.result_json`, insert the
   `settle` ledger row(s) with `idempotency_key = 'gen:' || job_item_id`,
   decrement `held_uc`, increment `items_done`, then mark the job `done`.

Because step 3 is keyed on the item id, a crash between 2 and 3 replays safely:
the insert is a no-op, and the file is content-addressed so a re-run overwrites
the same object.

### 8.4 Lease, retry, dead-letter

- A watchdog every 10 s: `UPDATE jobs SET status='queued', worker_id=NULL,
  lease_until=NULL WHERE status='running' AND lease_until < now`.
- `attempts >= max_attempts` → `status = 'dead'`, and release the remaining
  hold (`release` ledger rows) so the wallet is not stuck.
- Backoff: `run_after = now + min(60_000, 1000 * 2 ** attempts)`.
- Every job carries `hold_ledger_id`; on `dead`, the release must be idempotent
  too (`idempotency_key = 'release:' || job_id`).

### 8.5 Throughput and honesty

- Batch jobs fan out to `job_items`; the worker processes N items concurrently
  (a scheduling decision), while the **hold covers all N** (a billing decision).
  These are two different numbers and conflating them is exactly F-001/F-003.
- If a real provider is added later, the same queue works: the provider call is
  just longer. Put a concurrency cap per provider in a `providers` config row.
- For the lab, expose the queue's internals (claimed/held/settled) so the
  detector can show the abuse in progress.

---

## 9. Providers and the model catalog

### 9.1 Interface

One interface, three capabilities. Keep it small enough that a mock is trivial
and a real adapter is a day's work.

```ts
export type Capability = 'text' | 'image' | 'video';

export interface GenerateRequest {
  kind: Capability;
  modelId: string;              // catalog id resolved server-side
  prompt: string;
  resolution?: '1K' | '2K' | '4K';
  durationSeconds?: number;
  referenceAssetIds?: string[];
  seed?: number;
}

export interface GenerateResult {
  providerJobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  asset?: { storageKey: string; mime: string; width?: number; height?: number; durationMs?: number };
  usage?: { units: number; unit: 'tokens' | 'images' | 'seconds' };
  error?: { code: string; message: string; retryable: boolean };
}

export interface ProviderAdapter {
  readonly key: string;                       // 'mock', 'openai', 'google', ...
  supports(modelId: string): boolean;
  submit(req: GenerateRequest): Promise<GenerateResult>;
  poll(providerJobId: string): Promise<GenerateResult>;
  cancel?(providerJobId: string): Promise<void>;
}
```

`submit` returns immediately and `poll` is the only way to learn the outcome —
that is how every real text-to-video API works, so the mock must behave the
same way or the queue will not be exercised.

### 9.2 Catalog shape

```ts
export interface ModelDescriptor {
  id: string;                 // stable, sent by the client, resolved server-side
  label: string;              // "Gemini 3.1 Flash Image"
  brand: string;              // "Google" | "OpenAI" | "MiniMax" | ...
  kind: Capability;
  providerKey: string;        // adapter key
  providerModel: string;      // the id the provider API wants
  logo?: string;
  capabilities: {
    textToImage?: boolean;
    imageEdit?: boolean;
    multiReference?: boolean;
    audio?: boolean;
    anchoring?: boolean;      // "wide reference images that lock a scene's layout"
  };
  durations?: number[];       // seconds, video only
  maxReferenceImages?: number;
  resolutions?: string[];
  creditUnitUc: number;       // price per item, in micro-credits
  enabled: boolean;
}
```

`GET /api/config/getClientConfig` returns the **filtered** catalog (only
`enabled` models, no `providerModel`, no internal cost fields) plus plans,
bonus values and UI flags. `POST /api/config/getClientConfig` works too if the
frontend prefers POST; the observed app uses POST — support both, same payload.

### 9.3 Observed catalog

Directly observed in evidence/JS (not inferred):

| Kind | Id as sent by the client | Evidence |
|---|---|---|
| image | `google/gemini-3.1-flash-image` | request bodies in `evidence/raw/credit-bypass*`, `concurrent-count` |
| image | `openai:gpt-image-2.5-flare` | `evidence/raw/model-confusion/req-gpt-model.json` |
| image | `openai:gpt-image-2` (family) | `REFERENCE-OBSERVED.md` |
| video | Seedance 2.5, with a unique "Anchoring" capability | UI chunk `1k9c1lbv3potc.js`: "Only Seedance 2.5 uses it" |

Reported in `REFERENCE-OBSERVED.md` but **not** re-verified against raw JSON in
this pass (treat as the seed catalog, not as fact):

- text: DeepSeek, Claude, Gemini, GPT, Grok, Kimi, MiniMax, GLM
- image: `gemini-3.1-flash-image`, `gpt-image-2.5-*`, `gpt-image-2`
- video: `minimax/h3`, `alibaba/wan-3.0`, `volcengine` Seedance 2.0 / 2.5
- brands surfaced in the model picker: `OpenAI`, `MiniMax`
- picker copy confirms the pairing model: one image model + one video model per
  show, plus "Anchoring" only for Seedance 2.5.

Note the id syntax is inconsistent (`provider/model` vs `provider:model`). Do
not "fix" it in the client; normalise in the resolver:

```ts
const normalise = (s: string) => s.replace(':', '/').toLowerCase();
const model = catalog.find(m => normalise(m.id) === normalise(clientId) && m.enabled);
if (!model) throw new HttpError(400, 'Unknown model');
```

The observed app accepted a model id the project had not selected (the
`model-confusion` probe changed the id in the request and the server used it).
That is a **billing** issue, not an auth one: price comes from the catalog, so
changing the model cannot change the hold for the same `genType` — but it does
let a user pick an expensive model on a cheap plan. Guard it: assert the model
is enabled for the agency's plan and record `model_id` on the ledger row.

### 9.4 Mock adapters

`MockTextProvider`, `MockImageProvider`, `MockVideoProvider` share one base:

- **Deterministic output.** `seed = sha256(prompt + modelId + index)`; the asset
  bytes derive from the seed, so the same request renders the same file and
  screenshots/tests are stable.
- **Text**: a template that echoes the prompt and the requested schema. For
  script analysis, return JSON matching the real contract (scenes, roles,
  places) so the downstream steps work without a provider.
- **Image**: `sharp` compositing — a gradient or noise field from the seed, the
  prompt's first words rendered as text via an SVG input, the resolution badge,
  and a coloured frame. 1K/2K/4K change `width`/`height`.
- **Video**: FFmpeg `lavfi` sources, e.g.
  `-f lavfi -i "testsrc2=size=1280x720:rate=24:duration=5"` or
  `gradients=s=1280x720:d=5`, plus `drawtext` for the prompt and a frame
  counter; `-c:v libx264 -pix_fmt yuv420p`. Duration comes from the request, so
  the 5 s/134-credit unit is visible in the output.
- **Latency and failure injection**: `MOCK_LATENCY_MS`, `MOCK_FAILURE_RATE`,
  `MOCK_FAIL_ONCE` (fail the first `poll` for a given job id) — all from env,
  all logged. Without this the queue's retry and release paths are never
  exercised.
- **Cost accounting**: the mock returns `usage.units` (1 image, N seconds, N
  text units) so settlement can be checked against the catalog price; the lab
  multiplies `units` by a configurable "real provider price" to model the $10k
  impact.

### 9.5 Why the catalog is data, not code

Model ids churn monthly (the observed catalog already spans eight text vendors
and four video vendors). If ids are string literals in components, every change
is a deploy. Keep them in one table/JSON file keyed by `id`, with
`providerKey`/`providerModel` behind it, and let the API filter by
`enabled` + plan. The frontend renders whatever it is given, exactly as the
observed picker does.

---

## 10. Export: FFmpeg vs Remotion

Both are viable. They are not equivalent, and the choice is mostly about
whether the export needs **motion graphics from web tech**.

### 10.1 FFmpeg pipeline (recommended default)

Editor model: tracks → clips with `in_ms`/`out_ms`/`start_ms`. Export is a
deterministic function of that model.

Per clip (frame-accurate trim requires a re-encode; `-c copy` snaps to
keyframes and will drift):

```
ffmpeg -ss <in_s> -to <out_s> -i clip.mp4 \
       -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1" \
       -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p part_000.mp4
```

Concat (identical codec/size/fps — the safe case):

```
ffmpeg -f concat -safe 0 -i list.txt -c copy cut.mp4
```

Concat with mixed sources, or transitions:

```
ffmpeg -i a.mp4 -i b.mp4 -filter_complex \
 "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v]" \
 -map "[v]" -c:v libx264 -crf 20 -pix_fmt yuv420p out.mp4
```

`xfade` requires matching size, fps and pixel format on both inputs — normalise
first, or it fails with an unhelpful error. Overlays/titles:

```
-vf "drawtext=text='SCENE 1':fontsize=48:fontcolor=white:x=80:y=h-140:box=1:boxcolor=black@0.5"
```

Audio: `amix` for BGM + clip audio, `afade` for in/out, then
`-c:a aac -b:a 192k -ar 48000`. Final mux:
`-movflags +faststart` so the MP4 seeks in a browser.

Build the filtergraph as data (an array of `{filter, inputs, outputs}`), not as
string concatenation of user text. Any `drawtext` value must be escaped
(`:`, `'`, `\`, `%`) or it becomes an argument-injection primitive — the
`textfile=` option is safer than inline `text=` for user-supplied strings.

Cost: one process per export, CPU-bound, roughly realtime/2–4 for 1080p on a
laptop with `veryfast`. No browser, no npm licence, fully offline.

### 10.2 Remotion (optional, for titles/lower-thirds)

Remotion renders React components to frames in headless Chrome and encodes with
its bundled FFmpeg. `renderMedia({ composition, serveUrl, codec: 'h264',
outputLocation, inputProps })` is the server-side entry point, and
`selectComposition()` resolves the composition's `width/height/fps/
durationInFrames` before rendering. It is genuinely good at the thing FFmpeg is
bad at: animated titles, kinetic type, branded lower-thirds, React-driven
timelines.

Two costs that must be decided up front:

1. **Licence.** Free for individuals and companies of **up to 3 people**.
   Above that: "Remotion for Automators" at **$0.01 per render**, billed in
   1,000-render increments with a **$100/month minimum**, or "Remotion for
   Creators" at $25/seat/month; Enterprise from $500/month. The renderer takes
   a `licenseKey` (`rm_sec_…` server-side, `rm_pub_…` client-side) and sends
   usage events. A "clean-room replica" that renders on every export is
   squarely in "Automators" territory once it is more than a personal project.
2. **Weight.** Headless Chromium + a per-render browser launch, memory
   proportional to `concurrency` (default half the CPUs, capped at 8). This
   does not belong on the Express request path; it belongs in the job queue as
   its own worker kind.

### 10.3 Tradeoffs

| Dimension | FFmpeg filtergraph | Remotion |
|---|---|---|
| Determinism | High (same inputs → same bytes) | High, but depends on Chrome/font versions |
| Motion graphics / typography | Poor-to-mediocre (`drawtext` only) | Excellent (React, CSS, springs) |
| Startup cost per export | ~50 ms | seconds (browser launch/bundle) |
| Memory | Low, one process | High (Chromium), scales with concurrency |
| Dependency surface | One binary on PATH | Node + Chromium + bundled FFmpeg + licence key |
| Offline | Yes | Yes, after first browser download |
| Licensing | LGPL/GPL depending on build flags | Free ≤3 people, then paid |
| Debuggability | Filtergraph errors are cryptic; `-report` helps | React errors are readable |
| Frame-accurate trim | Re-encode required | Native (frame range) |
| Data overlay (charts, captions from data) | Painful | Natural |

### 10.4 Recommendation

Ship **FFmpeg for the base cut** (trim, concat, crossfade, BGM, burn-in
captions) and add **Remotion as an optional `kind: 'render:remotion'` job** for
titles/lower-thirds only. That keeps the default path dependency-light and
offline, gives the editor a real export, and leaves the licence decision to
whoever turns the optional path on. The tradeoff is explicit in
`docs/VIDEO-EDITOR-SPEC.md`, not hidden in a dependency.

---

## 11. Razorpay: test mode and the mock rail

The observed integration is already close to the reference design and the
security review found no price-tampering path. Reproduce the *correct* shape,
and put the known billing bug behind `BILLING_MODE=vulnerable` in the lab only.

### 11.1 Plans and orders are server-authoritative

- `PLANS` lives in `packages/shared` (`100/220/550` credits at
  `10000/20000/50000` paise). The client sends `planId` and `currency` only.
- `createOrder` looks the plan up, ignores any client `amount`, `credits`,
  `price` or `currency` outside the allowed set, and inserts an `orders` row
  before calling the provider.
- Amounts are integers in paise. `orders.amount_paise` has
  `CHECK (amount_paise > 0)`; Razorpay's own minimum is ₹1.00 (100 paise).
- One order per payment intent. Razorpay orders accept multiple *attempts* but
  a single order can only become `paid` once — mirror that with a unique
  constraint plus a state check, not with hope.

### 11.2 Payment signature

```
generated = HMAC_SHA256(order_id + "|" + razorpay_payment_id, key_secret)   // hex
valid     = timingSafeEqual(generated, razorpay_signature)
```

Critical detail from the docs: use **your stored `order_id`**, not the
`razorpay_order_id` the client posted. Then load the order, confirm it belongs
to `req.agency.id`, confirm it is not already `paid`, and only then credit.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
  .update(`${order.providerOrderId}|${paymentId}`)
  .digest('hex');
const a = Buffer.from(expected, 'hex');
const b = Buffer.from(signature, 'hex');
if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(400)...
```

Crediting the wallet must be one transaction: `UPDATE orders SET status='paid',
provider_payment_id=?, signature_verified_at=? WHERE id=? AND status<>'paid'`
and, only if that changed a row, insert the `topup` ledger row with
`idempotency_key = 'order:' + order.id`. The conditional update *is* the
idempotency check.

### 11.3 Webhook

- Route mounted with `express.raw({ type: 'application/json' })` (§4.2).
- `HMAC_SHA256(rawBody, webhook_secret)` compared to `X-Razorpay-Signature`,
  hex, timing-safe.
- Dedupe on `x-razorpay-event-id` via the `webhook_events` table; retries are
  expected, and delivery order is **not** guaranteed (the docs are explicit that
  `payment.authorized` may arrive after `payment.captured`). Handle each event
  idempotently and never assume sequence.
- Rotating the secret means old retries still need the old secret — keep a small
  list of active/previous secrets for the validation window.
- Respond 2xx quickly and do the credit in the same request only if it is fast;
  otherwise enqueue a job. Never do FFmpeg or provider work in a webhook.

### 11.4 The mock rail (so the app works with no Razorpay account)

`PAYMENTS_MODE=mock` (default in dev):

1. `createOrder` → `provider_order_id = 'order_mock_' + randomUUID()`, status
   `created`, response includes `key: 'rzp_test_mock'`.
2. The web app renders its **own** checkout modal (amount, credits, "Pay" /
   "Fail" buttons) instead of loading `checkout.razorpay.com`. This is the only
   place the UI branches on mode.
3. "Pay" POSTs `{ orderId }` to `POST /api/dev/mock-pay` (dev-only, guarded by
   `NODE_ENV !== 'production'`), which generates a real HMAC with the dev
   `RAZORPAY_KEY_SECRET` and calls the same verify path as production. **Do not
   special-case the mock to skip verification** — the point is to exercise the
   real code path.
4. Optionally, the mock can also fire a signed webhook at
   `/api/webhooks/razorpay` with a generated `x-razorpay-event-id`, so the
   webhook path is covered by the E2E test too.

With `PAYMENTS_MODE=razorpay` and test keys, the app loads the real Checkout
script with `key` + `order_id` only (no client `amount`). Test data from the
docs: card `4100 2800 0000 1007` (Visa), `5500 6700 0000 1002` (Mastercard),
`6527 6589 0000 1005` (RuPay), any future expiry and random CVV; UPI
`success@razorpay` / `failure@razorpay`; netbanking and wallets go to a mock
bank page with Success/Failure buttons. Test and live keys are distinct; test
key ids conventionally start with `rzp_test_` (convention, not stated on the
page read).

### 11.5 State machine and guards

```
created --attempt--> attempted --capture--> paid
   |                     |
   +------ fail ---------+--> failed
paid --refund--> refunded
```

Guards to test explicitly (the review tested most of these on the target and
they held; the replica must hold too):

| Attempt | Expected |
|---|---|
| extra `amount`, `credits`, `price` in `createOrder` | ignored |
| `planId` unknown / 0 / negative / float / string | 400 |
| `currency: USD` | 409 or 400; never a converted order |
| `verifyPayment` with a fake signature | 400, no credit |
| `verifyPayment` for another workspace's order | 404 |
| replayed `verifyPayment` | 200 (or 409) but **no second credit** |
| webhook with a bad signature | 401, no credit |
| duplicate `x-razorpay-event-id` | processed once |
| client-claimed `status:'paid'`, `credits: 999999` | schema reject |

### 11.6 Ledger shape for a top-up

```
kind='topup', credits_delta_uc=+100_000_000, credits_held_uc=0,
gen_type=null, status='completed', ref_type='order', ref_id=<order id>,
idempotency_key='order:<order id>'
```

For bonuses (personal 100 / org 1000), same shape with `kind='bonus'` and
`idempotency_key='bonus:signup:<user>'` / `'bonus:org:<agency>'` so a retry or a
double-onboard cannot double-pay.

---

## 12. Invariants that must be true in the replica

Derived from the review; each is a test, not a comment.

| # | Invariant | Source |
|---|---|---|
| 1 | `hold_uc = items.length × creditUnitUc`, computed server-side, in one atomic transaction | F-001 / F-003 |
| 2 | `concurrentCount` never affects the hold; it is clamped `1..8` and used only for scheduling | F-003 |
| 3 | Settlement is per item, and a settle can never exceed the hold it belongs to | F-001 |
| 4 | No settlement may take `balance_uc` below zero; new work is refused at ≤ 0 | F-001 fix |
| 5 | One org bonus per verified identity/tenant, not per disposable email | F-002 |
| 6 | OTP verify has a per-verification attempt cap (5) + per-email/IP rate limit | OBS-001 |
| 7 | Logout revokes the access token (`token_version` bump) | review coverage list |
| 8 | A settled ledger row is immutable; corrections are new `refund` rows | ledger design |
| 9 | Sum of `credits_delta_uc` per wallet equals `balance_uc` (CI assertion) | ledger design |
| 10 | Every tenant-scoped query filters on `req.agency.id`, never a body field | tenant matrix |
| 11 | Cross-tenant reads return 404, not 403, for object ids | tenant matrix |
| 12 | Price and credits come from the plan table only | payment matrix |

`labs/billing-abuse` runs 1–5 in both modes: `vulnerable` reproduces the
observed behaviour (`hold = min(items, cc ?? 1) × unit`, default 1), `fixed`
asserts the invariants above. Same code, one flag — so the diff between the two
modes is the finding.

---

## 13. Sources

Primary docs actually fetched for this brief (2026-11-24):

**Next.js**
- https://nextjs.org/blog — release history; 16.4 current, 15.5.x still patched
- https://nextjs.org/blog/next-16-4 — Next.js 16.4 (React 19.3 features)
- https://nextjs.org/blog/next-16 — Next.js 16: "Turbopack is now the default
  bundler for all apps; opt out with `next build --webpack`"
- https://nextjs.org/docs/app/getting-started/route-handlers — Route Handlers,
  "not cached by default", route/page conflict rules
- https://nextjs.org/docs/app — App Router entry point

**React / styling / data**
- https://react.dev — React 19
- https://tailwindcss.com/docs/installation/using-postcss — Tailwind 4 for
  Next.js (PostCSS plugin, `@import "tailwindcss"`)
- https://tailwindcss.com/docs/installation/using-vite — Tailwind 4 Vite path
  (kept as the cross-check for the install model)
- https://tanstack.com/query/latest/docs/framework/react/overview — TanStack
  Query v5 concepts
- https://zustand.docs.pmnd.rs/learn/getting-started/introduction — Zustand v5

**API / validation / runtime**
- https://expressjs.com/en/guide/migrating-5.html — Express 5 breaking changes,
  async error forwarding, `express.raw`/Brotli, route syntax
- https://zod.dev/ — Zod 4 basics
- https://zod.dev/v4/changelog — Zod 4 migration (error param, `z.email()`,
  `z.record` arity, `.default`/`.prefault`, `treeifyError`)
- https://nodejs.org/api/sqlite.html — `node:sqlite` (Stability 1.2, sync API,
  `Database`, FK default on, STRICT example)
- https://nodejs.org/docs/latest-v24.x/api/sqlite.html — `DatabaseSync`,
  "v24.15.0: SQLite is now a release candidate"
- https://nodejs.org/docs/latest-v22.x/api/sqlite.html — "v22.13.0: no longer
  behind `--experimental-sqlite` but still experimental"

**Video**
- https://ffmpeg.org/ — project home; 8.x/9.x release news
- https://ffmpeg.org/download.html — `ffmpeg-9.1.tar.xz`
- https://ffmpeg.org/ffmpeg-filters.html — filter reference (`xfade`, `concat`,
  `overlay`, `drawtext`, `amix`, `fade`, `scale`)
- https://ffmpeg.org/ffmpeg.html — CLI/reference
- https://trac.ffmpeg.org/wiki/Concatenate — concat demuxer vs filter concat
- https://www.remotion.dev/docs/renderer/render-media — `renderMedia()`,
  `selectComposition()`, `codec`, `concurrency`, `licenseKey`
- https://www.remotion.dev/docs/license — licensing overview
- https://www.remotion.dev/docs/license/pricing — free ≤3 people, $0.01/render
  automators with $100/mo minimum, $25/seat creators, $500/mo enterprise

**Payments**
- https://razorpay.com/docs/api/orders/create/ — Orders API, amounts in
  subunits, `receipt` as idempotency key, server-side signature warning
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/
  — Checkout options (`key` + `order_id`), handler response fields, the
  `hmac_sha256(order_id + "|" + payment_id, secret)` verification step, test
  cards and UPI test ids
- https://razorpay.com/docs/webhooks/validate-test/ — `X-Razorpay-Signature`
  HMAC-SHA256 over the **raw** body, `x-razorpay-event-id` idempotency,
  out-of-order delivery, secret rotation caveat

**Engagement evidence (local, not public)**
- `docs/REFERENCE-OBSERVED.md`
- `/Users/het/SecurityHarness/engagements/auto/web-20261124-073125/reports/KRONICLE-BILLING-SECURITY-REVIEW.md`
- `.../evidence/raw/{credit-bypass,credit-bypass-A,concurrent-count,independent-verify,payment,tenant,signup-bonus,model-confusion}/`
- JS chunk `.../raw/js-app/1k9c1lbv3potc.js` (model picker copy, brands,
  anchoring note)

---

## 14. Not verified / open questions

Flagged honestly; resolve before the phase that depends on them.

1. **Next.js 15 vs 16 parity.** I verified that both are current and patched,
   and that the App Router/Route Handler model is the same. I did **not**
   diff 15.5 → 16.4 for behaviour the replica relies on (Turbopack defaults,
   caching defaults, `next lint` removal). If pixel/build parity matters, pin
   `15.5.29`.
2. **TypeScript 7 fitness.** `typescript@7.0.2` is `latest`, but I did not test
   it with `tsx`, pnpm workspace path aliases, or Next's type plugin. Fallback
   `5.9.3` is verified to exist and is uncontroversial.
3. **`node:sqlite` API drift.** The class was renamed `DatabaseSync` →
   `Database` between 24 and 26 (DEP0210). Behaviour under concurrent writers
   beyond WAL + `busy_timeout` was not benchmarked; the design assumes one
   writer process, which is safe but caps throughput.
4. **Full observed model catalogue.** Only two image model ids were confirmed
   in raw evidence (`google/gemini-3.1-flash-image`,
   `openai:gpt-image-2.5-flare`). The text/video lists and the exact
   `providerModel` strings are from `REFERENCE-OBSERVED.md`, not from provider
   APIs, and several may be renamed or unavailable. Treat the catalogue as a
   seed and keep it data-driven.
5. **Model-to-price mapping.** The observed hold was the same regardless of the
   model id sent (`model-confusion` changed the id and the price did not move),
   which suggests pricing is per `genType`, not per model. Not proven. Design
   for per-model `creditUnitUc` and default it to the `genType` price so both
   behaviours are expressible.
6. **Razorpay test-key prefix.** Docs state test and live keys are separate but
   do not print the `rzp_test_` prefix; I recorded it as convention, not fact.
   No live Razorpay account was used and no payment was made.
7. **Remotion render cost/latency on this machine.** Not measured. The $0.01
   per-render figure and the $100/month floor are from the pricing page; actual
   licence applicability depends on team size at build time.
8. **FFmpeg build flags.** The local binary is a Homebrew build with
   `--enable-gpl --enable-libx264 --enable-libx265 --enable-videotoolbox`.
   A distributed build (or `ffmpeg-static`) may differ in codec availability;
   `libx264` is GPL, which matters if the replica is ever shipped.
9. **`xfade` frame-accuracy at non-integer frame rates.** Not tested. Normalise
   every clip to one fps (24) before transitions.
10. **Invite/token length.** `REFERENCE-OBSERVED.md` records a 43-character
    base64url token (≈32 bytes). Confirmed only from the report text, not from a
    token capture in this pass.
