# Kronicle — Product Teardown (clean-room reference)

Target: `https://kronicle.studio` · observed 24 Nov 2026 · authorised engagement
(`engagements/auto/web-20261124-073125`).

This document describes **behaviour and contracts only**. No proprietary source,
markup or long marketing copy is reproduced. Field names, routes, status codes and
short functional labels are recorded because the replica must be interface-compatible.

**Confidence labels used throughout**

| Tag | Meaning |
|---|---|
| `[O]` | Observed directly: present in the client bundle, public HTML, or captured network evidence. |
| `[D]` | Documented in the engagement reports (`KRONICLE-BILLING-SECURITY-REVIEW.md`, `KRONICLE-CREDIT-FARMING-CHAIN.md`) from live traffic. |
| `[I]` | Inferred from client code + adjacent contracts; plausible but **not** confirmed on the wire. |
| `[?]` | Unknown / open question (collected in §19). |

Sources used: `docs/REFERENCE-OBSERVED.md`; the two engagement reports; the
app-router JS chunks in `.../raw/js-app/`; the route manifest embedded in the Sentry
chunk; captured API evidence under `.../evidence/raw/`; and read-only fetches of `/`,
`/pricing`, `/pitch`, `/support`, `/legal/*`, `/series`, `/slate`, plus one
unauthenticated read of `POST /api/payment/listPlans`.

Sibling documents produced in the same wave (do not duplicate, cross-check):
`UI-SPEC.md` (visual system, components, tokens, copy rules), `VIDEO-EDITOR-SPEC.md`
(editor build detail), `BILLING-LAB.md` (credit-engine lab and $10k model),
`RESEARCH-STACK.md` (framework/library choices).

---

## 1. Product definition

Kronicle is a browser studio for producing short AI-generated drama series
("micro-dramas") from a screenplay. The pipeline is: paste or upload a script →
automatic episode split → pick a visual **look**, a **directing style** and the
image/video **models** → convert the script into a "shoot-ready" V2 → extract cast,
places and props → generate looks for them → per episode: plan → asset variants →
storyboard → shot video → arrange the takes on a timeline → compile and export.

It is sold to production houses. Workspaces ("agencies") are multi-tenant, share a
single credit wallet, have `admin` / `editor` / `viewer` roles, and every AI call is
metered in credits. Top-ups are Razorpay INR orders (100 / 220 / 550 credits).
The company is Kuku Technologies Limited (formerly Kuku Technologies Pvt Ltd);
the product family is Kuku (Kuku TV, Kuku FM, FreeDrama, Storizz, Guru). `[O]`

Two adjacent products live in the same shell: a **novel writer** (`/novel/*`) that
feeds shows, and a **platform admin** console (`/platform/*`, internal "Maalik").

---

## 2. Stack and runtime `[O][D]`

| Layer | What is observed |
|---|---|
| Front end | Next.js App Router (the Sentry chunk reports `16.4.6`; the engagement report recorded 15 — treat as App Router ≥15), Turbopack chunks, React 19, TanStack Query + Zustand, Tailwind-style design tokens, `next/font`, PWA manifest. |
| Edge/CDN | nginx in front of an AWS ALB; static chunks on CloudFront (`def713794u0ie.cloudfront.net`); media CDN `d1l07mcd18xic4.cloudfront.net/media/{images,videos,icons,scripts}`. Nonce-based CSP, HSTS, `frame-ancestors` self + `*.kukufm.com`, `object-src 'none'`. |
| API | Express JSON API under `/api/*` (also exposed to the browser as `/kronicle-api/api`), zod validation, `{code,message,data}` envelope. |
| Auth service | Python at `/py-api/*`: 4-digit email OTP → Firebase custom token (project `aravali-2dbcd`) → cookies `kronicleToken` (HS256, 2 h) and `jwtToken` (HS512, 14 d). |
| Payments | Razorpay live checkout; server-created order; HMAC `order_id|payment_id`; signed webhook `/api/webhooks/razorpay`. |
| AI providers | Behind a model abstraction. Text: DeepSeek, Claude, Gemini, GPT, Grok, Kimi, MiniMax, GLM. Image: `gemini-3.1-flash-image`, `gpt-image-2.5-*`, `gpt-image-2`. Video: `minimax/h3`, `alibaba/wan-3.0`, `volcengine Seedance 2.0/2.5`. `[D]` |
| Observability | Sentry (browser + Next), with replay/route manifest; Plausible-style analytics script `clickdash.kukufm.com`; `/next-api/k` ingest and `/next-api/version`. |
| i18n | 7 locales: `en`, `zh-CN`, `ko`, `hi`, `pt-BR`, `es`, `de` (`Accept-Language` header + `locale` body field). |
| Telemetry from client | Sentry events with tags `area: api|payment|feature`, plus custom `paymentReceived`, `noCredits`, `access-changed` events. |

Client request defaults `[O]`: axios base `/kronicle-api/api`, timeout **600 000 ms**;
headers `x-agency-id` (active workspace), `Accept-Language`, `X-Timezone`;
body gains `locale`. Session refresh is attempted once on 401 for any URL except
`/auth/{refreshToken,logout,google,otpRequest,otpVerify}`.

---

## 3. Route map (complete, from the route manifest) `[O]`

The instrumented manifest lists **44 routes (42 static, 2 dynamic)**. Three more
addressable surfaces exist outside that manifest: `/series`, `/slate` (both render the
sign-in gate when signed out) and `/opengraph-image`. Auth column: **public** =
reachable signed-out, **gated** = renders sign-in or redirects, **guarded** = needs
session + onboarding, **admin** = platform operator only.

| # | Route | Auth | Layout | Purpose |
|---|---|---|---|---|
| 1 | `/` | public | marketing | Landing: prompt hero, pipeline explainer, Greenlight Slate, series showcase, studio stories, referral ladder, press, CTA. |
| 2 | `/pricing` | public | marketing | Plan cards (client-rendered; "Loading / Setting up the shot" placeholder). Reads `payment/listPlans`. |
| 3 | `/pitch` | public | marketing | Greenlight Slate pitch form: name, work email, company, series title, logline, genre, language, episodes planned, PDF/DOCX ≤25 MB. Currently "submissions open soon" (not persisted). |
| 4 | `/contact` | public | marketing | Contact form/office details. |
| 5 | `/request-access` | public | marketing | Invite-only access request. |
| 6 | `/series` | gated | marketing | Public series catalogue; signed-out visit renders the sign-in card. |
| 7 | `/slate` | gated | marketing | Greenlight Slate programme page; same gate. |
| 8 | `/support` | public | marketing | Help centre: 4 topic cards + FAQ accordion + "ask your workspace admin". |
| 9 | `/legal/terms-of-service` | public | legal | Legal text shell. |
| 10 | `/legal/privacy-policy` | public | legal | Legal text shell. |
| 11 | `/legal/cookie-policy` | public | legal | Legal text shell. |
| 12 | `/access-denied` | public | status | 403 status screen ("Closed set"). |
| 13 | `/waitlist` | public | status | Waitlist status screen ("Standing by"). |
| 14 | `/maintenance` | public | status | Maintenance status screen ("Back soon"). |
| 15 | `/login` | public | auth | Email + Google sign-in; OTP step. |
| 16 | `/login/onboarding` | public (post-auth) | auth | Workspace creation: personal vs organisation. |
| 17 | `/home` | guarded | app shell | Script composer, recent shows, start-a-show. |
| 18 | `/home/shows` | guarded | app shell | All shows: search, sort, cards, card menu (open/rename/move/share/leave/delete). |
| 19 | `/home/script-split` | guarded | setup | Episode review/editor + split summary. |
| 20 | `/home/pick-look` | guarded | setup | Visual look picker. |
| 21 | `/home/pick-director` | guarded | setup | Directing-style picker. |
| 22 | `/home/pick-models` | guarded | setup | Image + video model picker. |
| 23 | `/home/settings/general` | guarded | settings | Workspace profile, id, type, role, balance, rename, upgrade, leave. |
| 24 | `/home/settings/team` | admin/org | settings | Members, roles, invites (org only, hidden when `features.team === false`). |
| 25 | `/home/settings/billing` | admin | settings | Plans, top-up, payment history. |
| 26 | `/home/settings/usage` | guarded | settings | Credit ledger. |
| 27 | `/home/settings/credits` | guarded | settings | Legacy/aliased credits page (in route manifest; not in the settings tab list). |
| 28 | `/script` | guarded | app shell | Legacy alias for script management (permission key `workspace.view.script`). |
| 29 | `/script-management` | guarded | app shell | Current script management (episodes + reader). |
| 30 | `/scriptEnhancement` | guarded | app shell | V1 → V2 shoot-ready workflow, asset extraction entry. |
| 31 | `/cornerScape` | guarded | app shell | Cast & places: prompts → looks → lock. |
| 32 | `/production` | guarded | app shell | Production workbench for one episode (Script, Script assets, Plan, Asset variants, Storyboard, Video). |
| 33 | `/editor` | guarded | full-bleed | Timeline editor + compile. |
| 34 | `/assets` | guarded | app shell | Asset library: Characters / Scenes / Props / Clips / Voices. |
| 35 | `/novel` | guarded | app shell | Novel list ("Write a novel"). |
| 36 | `/novel/write` | guarded | app shell | Chapter-by-chapter novel editor. |
| 37 | `/novel/continuity` | guarded | app shell | Novel continuity view. |
| 38 | `/invite/:token` | public (token) | status/auth | Invite accept; resolves workspace + role; requires sign-in with the invited email. |
| 39 | `/platform` | admin | platform | Platform console root. |
| 40 | `/platform/overview` | admin | platform | KPIs. |
| 41 | `/platform/workspaces` | admin | platform | Workspace list. |
| 42 | `/platform/workspaces/:id` | admin | platform | Workspace detail. |
| 43 | `/platform/projects` | admin | platform | Cross-tenant projects. |
| 44 | `/platform/features` | admin | platform | Feature flags. |
| 45 | `/platform/audit` | admin | platform | Audit log. |
| 46 | `/platform/access` | admin | platform | Access control. |
| — | `/opengraph-image` | public | — | OG image generator. |

Post-auth redirect helper: `/login?next=<encoded path+query>`; unauthenticated deep
links bounce through it. `[O]`

Legacy duplicates to keep or alias deliberately: `/script` vs `/script-management`
(same permission), `/home/settings/credits` vs `/home/settings/billing`.

---

## 4. Application shell `[O]`

Desktop = fixed left sidebar + content. Mobile = 48 px top bar with menu button and
slide-over.

### 4.1 Sidebar (expanded 248 px / collapsed 72 px, persisted in `localStorage` key `kronicle:sidebarExpanded`)

Order, top to bottom:

1. Brand mark → `/home`; collapse toggle.
2. `Home`
3. `Shows` (only if the workspace has shows)
4. `Novel`
5. Separator
6. **Project section** (only when a project is loaded; `?projectId=`):
   - project poster (2:3), name, `videoRatio` in mono uppercase, "View only" badge for viewers;
   - workflow group:
     | Item | Path | Permission | Stage dot |
     |---|---|---|---|
     | Script | `/script-management` | `workspace.view.script` | `scriptSource` + `extraction` |
     | Enhance | `/scriptEnhancement` | `workspace.view.scriptEnhancement` | `enhancement` |
     | Cast | `/cornerScape` | `workspace.view.cornerScape` | `castPrompts` + `castImages` |
     | Video | `/production` | `workspace.view.production` | — |
     | Editor | `/editor` | (production access) | — |
   - library group: `Assets` → `/assets` (`workspace.view.assets`).
7. Separator
8. Credits block: coin glyph + balance, "Top up" link → `/home/settings/billing`, gradient meter bar. Collapsed = icon + number + meter.
9. Profile menu (340 px popover): appearance (Light/Dark/Auto with mini window previews), Workspace → `/home/settings/general`, Platform → `/platform` (operators only), Help → `/support`, Install app row (prompt/installed/unavailable states), and a profile card: name/email, workspace name · role, balance, workspace id (copyable).

Sidebar item states: active gets a gradient left bar; a small coloured dot reflects the
stage state; a brand dot + count badge (99+) reflects pending items.

### 4.2 Stage-dot vocabulary `[O]`

`done` (success) · `current` (brand) · `todo` (border) · `pending` · `partial` ·
`outdated` (warning) · `failed` (destructive) · `n/a` ("Not used"). Worst state wins
when combining two stages (`failed → outdated → partial → pending → done`).

### 4.3 Guides / tours `[O]`

Per-route guided tours (driver.js-style) with a docked "What can I do here?" panel:
- `/home`: composer, add files, try sample, analyse.
- `/script-split`: setup steps, split summary, episodes, reader, add episodes, save/continue.
- `/scriptEnhancement`: choice, episodes, next (Cast & places).
- `/cornerScape`: three steps, list, detail, continue.
- `/production`: episode, steps, next, work area, Director.
- `/editor`: library, timeline ("V lanes picture, A lanes sound; S splits, Delete removes"), inspector, compile.
- `/assets`: tabs, search, add, table.
- `/novel`: new, search, list.
- `/home/pick-look`, `/home/pick-director`, `/home/pick-models`: setup steps, option grid, search, continue.
Guide can be closed and restored from Settings → Guide.

### 4.4 Status screens (branded, cinematic) `[O]`

`404`, `403`, `waitlist`, `maintenance`, `500`, `503`, `editorLoadFailed`,
`workspaceDisabled`. Each has a code word ("404 / Missing / Scene not found"), a
take word, title/description, and actions (`Go home`, `Try again`, `Check again`,
`Sign in with another account`, `Log out`, optional `Error ID`). The maintenance
screen animates three steps (save/upgrade/check); the waitlist screen animates a
queue.

### 4.5 Global feedback

Toast stack (success/info/warning/error), a "no credits" toast variant, a top
progress bar for navigation, and route error boundaries (one is labelled
`[workbench] page crashed`). `[O]`

---

## 5. Roles, permissions and tenancy

### 5.1 Identities

| Principal | Definition | Notes |
|---|---|---|
| Anonymous | No cookies | Marketing/legal/support, `/login`, `/invite/:token` (token resolution is public; accept needs session `[D]`). |
| User | Authenticated via OTP/Google | Owns a personal workspace automatically. |
| Workspace member | Membership row in an agency | `role ∈ {admin, editor, viewer}`. |
| Platform operator | `isMaalik` flag | Sees `/platform`, bypasses `workspace.manage` checks. `[O]` |

### 5.2 Role → capability matrix `[O][D]`

| Capability | admin | editor | viewer |
|---|---|---|---|
| View script/enhance/cast/production/assets (per permission keys) | ✓ | ✓ | ✓ (read-only UI badge) |
| Edit / delete episodes (`workspace.script.edit|delete`) | ✓ | ✓ | ✗ |
| Generate (spend shared wallet credits) | ✓ | ✓ | ✗ |
| Invite / change roles / remove members (`members.manage`) | ✓ | ✗ (403) | ✗ |
| Buy credits / create orders (`billing.pay`) | ✓ | ✗ (403) | ✗ |
| Rename workspace, upgrade to org, move project (`workspace.manage`) | ✓ | ✗ | ✗ |
| Share a show with a specific member (`share/*`) | owner/admin | project role dependent | ✗ |

Permission strings observed: `workspace.view.script`,
`workspace.view.scriptEnhancement`, `workspace.view.cornerScape`,
`workspace.view.production`, `workspace.view.assets`, `workspace.script.edit`,
`workspace.script.delete`, `workspace.manage`, `members.manage`, `billing.pay`,
`dashboard.project.viewScript`. `[O]`

`GET /api/user/permissions[?projectId=]` returns an `access` object:
`{permissions: string[], features: {team?: boolean}, …}`. Settings hides the Team
tab when `features.team === false`; `/home/settings/team` and `/billing` redirect
non-admins to `/home` with an "admins only" info toast. `[O]`

### 5.3 Tenancy rules `[O][D]`

- Every request carries `x-agency-id: <workspace uuid>`; the server verifies
  membership and returns **403** otherwise.
- Objects (projects, scripts, assets, orders, invites) are workspace-scoped and
  return **404** to non-members (existence not disclosed).
- One wallet per workspace; all members spend from it. Personal workspaces cannot
  invite.
- An org admin can invite any email as admin; an invitee may hold memberships in
  many workspaces and switch with `x-agency-id` (workspace switcher).
- Project-level sharing exists in addition to workspace membership:
  `share/listMembers` returns `{owner:{userId,…}, shares:[{userId,role,name,email}]}`;
  card menu offers Share to a member not already on the project.
- Workspace disable is a server state (`AGENCY_DISABLED`) → global disabled screen;
  its projects and credits are paused.

---

## 6. Domain model

### 6.1 Entities

| Entity | Key fields (observed or strongly implied) | Notes |
|---|---|---|
| `user` | `userId` (number), `name`, `email`, `avatar`, `locale`, `onboarded` | Signed-in identity; `localStorage` mirrors `userId`, `userName`. |
| `agency` (workspace) | `id` (uuid), `name`, `type: individual|org`, `role`, `active?`, `disabled?`, `isMaalik?` | `GET /agency/getMyAgency` → `{current, agencies[], isMaalik?}`. |
| `membership` | `userId, name, email, role, status` | `agency/listMembers` (limit/offset). |
| `invite` | `inviteId, email, role, token, link, expiresAt, status`, `createdBy`, `createdAt` | 43-char base64url token (~32 bytes), 7 days, email-bound. |
| `project` (show) | `id`, `name`, `projectType: original|extension|localise|novel`, `artStyle`, `directorManual`, `videoRatio`, `imageModel`, `videoModel`, `imageQuality`, `mode`, `thumbnail{vertical,key,square,web,dvd}`, `createTime`, `progress{currentStage,percent,stages{}}`, `myRole`, `canShare`, `owner`, `shares[]` | Created by `project/addProject` or `project/createFromScript`; progress is server-computed. |
| `script` (V1) | `id`, `projectId`, `name`, `content`, `episodeNumber`, `sortIndex`, `type` (`v1`/`v2`), `activeScriptId`, `editable`, `editBlockedReason`, `relatedAssets[]`, `file?` | One row per episode; `getScrptApi` returns `activeScriptId` on the live row. |
| `enhancement` (V2) | `sourceScriptId`, `episodeNumber`, `sortIndex`, `name`, `content`, `model`, `generatedAt`, `approvedScriptId`, `liveV2ScriptId`, `lockStatus: not_locked|locked`, `editable`, `editBlockedReason`, `status: not_generated|generating|generated|error`, `errorReason` | `scriptEnhancement/getPlanData` also returns `scriptSource: original|enhanced`, `missingEnhancement[]`, `assetsExtracted[]`. |
| `asset` | `id`, `projectId`, `type: role|scene|prop|clip|voice`, `name`, `describe` (text prompt), `prompt`, `url`/`urls[]`, `locked`, `status` | Cast = `role`; places = `scene`; props = `prop`; clips = uploaded/generated video; voices = audio. |
| `production flow` | per `(projectId, episodesId)` JSON blob | `production/getFlowData`, `production/saveFlowData`. Holds the workbench step state. |
| `anchor` | `id`, `projectId`, `flowId`, `url`, `prompt`, `status` | "Anchoring" wide reference frames that lock a scene's layout. |
| `derived asset` | `id`, `projectId`, `flowId`, `url`, `prompt`, `status` | Asset variants generated per shot/scene (`production/derived/getDerived`). |
| `storyboard` (shot) | `id`, `projectId`, `flowId`, `prompt`, `videoDesc`, `url`, `status` | One card per shot; image generation, preview, download, edit prompt/videoDesc. |
| `track` | `id`, `projectId`, `scriptId`, `duration`, `medias[]` | Editor lane container. |
| `media` / `clip` | `id`, `trackId`, `assetsId`, `src`, `start`, `duration`, `type: video|audio|image` | Bound to a track with `saveTrackMedias`. |
| `video` (take) | `id`, `projectId`, `scriptId`, `prompt`, `src`, `state: pending|generating|completed|failed`, `duration`, `selectVideoId` | Per storyboard shot; one selected take per shot. |
| `bgm` | `jobId`, `id`, `projectId`, `scriptId`, `url`, `name`, `status` | Generated underscore; list + poll. |
| `continuity panel` | `versionId`, `version`, `projectId`, `ids[]`, `prompt`, markers | Versioned continuity reference; history + delete. |
| `wallet` | `balanceCredits`, `heldCredits`, `totalCredits` | `total = balance + held`; one per agency. |
| `ledger row` | `id` (ULID), `type: generation|topup|…`, `genType`, `outputType`, `creditsHeld`, `creditsDelta`, `status`, `reason`, `actorUserId`, `actorName`, `actorEmail`, `createdAt` (epoch s) | Cursor-paged. |
| `plan` | `id`, `name`, `credits`, `prices[{currency,symbol,amount}]`, `amountPaise` | Public catalogue. |
| `order` | `orderId`, `planId`, `amount`, `currency`, `amountPaise`, `credits`, `gatewayOrderId`, `keyId`, `status`, `createdAt` | Status `created|paid|failed|expired`. |
| `novel` | `id`, `name`, `chapters[]`, continuity state | Routes only; model unknown (`[?]`). |

### 6.2 Relations

```
user 1─* membership *─1 agency 1─1 wallet 1─* ledger
agency 1─* project 1─* script(v1) 1─0..1 enhancement(v2)
project 1─* asset            project 1─1 flow (per episode)
flow 1─* anchor              flow 1─* derived asset
flow 1─* storyboard(shot) 1─* video(take)
project 1─* track 1─* media
project 1─* bgm              project 1─* continuity panel(versioned)
project *─* user (share, role)
agency 1─* invite            plan 1─* order *─1 agency/user
```

### 6.3 Invariants the product depends on

1. `totalCredits = balanceCredits + heldCredits`; holds are released on settle/cancel.
2. A generation is charged once, for the work performed; the wallet may be driven
   negative by settlement (this is the observed billing defect — reproduce in the
   lab, fix in the replica's "fixed" mode).
3. Scripts, assets, orders and flows are only reachable inside their workspace.
4. A paid order credits exactly once (HMAC + webhook signature + status machine).
5. Setup is one-way after completion: look and directing style "can't be changed
   after setup"; models are per-show and can be changed later from the picker (`[I]`).
6. Once enhancement starts, the original episode can no longer be edited; once
   assets are extracted, the enhanced script can no longer be swapped back.

---

## 7. End-to-end flows (numbered)

### 7.1 Sign-in (email OTP) `[O][D]`

1. `/login` shows: brand panel with an AI-generated still (title + one-line mood),
   "Welcome to Kronicle", `Continue with Google`, divider, "or use your work email",
   email field, `Continue with email`, legal line, language switcher, `Help`.
2. `POST /py-api/v1/users/auth/send-otp {email}` → `{verification_id, otp_length: 4}`.
3. UI switches to the 4-digit code step (auto-advance, paste, resend timer).
4. `POST /py-api/v1/users/auth/verify-otp {verification_id, code, email}` → Firebase
   custom token → server sets `kronicleToken` (2 h) + `jwtToken` (14 d).
5. Client calls `GET /api/user/check` → `{onboarded}`. Not onboarded →
   `/login/onboarding`; else `next` param or `/home`.
6. Wrong code → HTTP 400 `INVALID_OTP` / `INVALID_REQUEST`. Cross-email replay →
   `RE-VERIFY_OTP` "OTP Expired". Repeated sends may return `UPDATE_APP`
   ("please update your app"). OTP lifetime 5 min. `[D]`
7. Logout: `POST /py-api/v1/logout` (or `/auth/logout`), clears local caches,
   `window.location.assign('/login')`. Old `kronicleToken` remains valid until expiry. `[D]`

### 7.2 Onboarding `[O][D]`

1. `/login/onboarding` asks: **For myself** (personal) or **My team** (organisation),
   plus workspace name.
2. `POST /api/user/onboard {type: 'individual'|'org', name}` → `{onboarded: true, agency…}`.
3. Server creates the agency, the owner membership, the wallet, and the bonus ledger
   row: personal `topup / signup_bonus / +100`; org `topup / org_bonus / +1000`.
4. Redirect to `/home` (or the pending invite / `next`).

### 7.3 Create a show from a script (`/home`) `[O]`

1. Composer card: textarea placeholder invites a paste or a drop; chips row shows
   `Script`, `Add files`; accepted files: DOCX, PDF, TXT, MD (one file per episode,
   or one big file to split).
2. Files are read client-side (DOCX via a Word extractor, PDF via pdf.js, text via
   `TextDecoder`), each file becomes a "source" with a name.
3. With ≥1 source, an **analyse** query runs (keyed on the source list + a length/hash
   fingerprint, so it re-runs when the text changes): `POST
   /api/project/analyzeScript` with `{text | episodes[], fileName}`.
4. Response drives the header chips: suggested **name**, **frame/ratio**, estimated
   **language**, minutes or episode count, `needsDuration`, `preambleChars`,
   `structuredText`, `splitPresetId`, `suggestions.{name,videoRatio,directingStyleId}`,
   `cached`.
5. User may override name / frame / duration (1, 2, 3, 5 min); the summary line reads
   "summary · intro skipped · at N min, about M episodes".
6. **Analyse** (or create): `POST /api/project/createFromScript
   {text, name, videoRatio, directingStyleId, splitPresetId, episodes[], targetEpisodeSeconds?}`
   → `{projectId, episodeCount}`.
7. Navigate to `/home/script-split?projectId=…&source=files|headings|single&files=N&preset=…&preamble=0|1`.
8. Failure states: "Not enough credits to analyse this script." (error carries
   `balance`, `required`, `minTargetEpisodeSeconds`), "That's too short to be a
   script", per-file "Couldn't read <name>", and the config-missing message when
   `getClientConfig` did not load.
9. "No script yet?" → sample episodes (3 bundled samples with series/episode/logline/
   tags: English 9:16 ~110 s, Hindi 9:16 ~120 s, English ~1,000 words).

### 7.4 Review the split (`/home/script-split`) `[O]`

1. Setup header shows the 4 setup steps (Episodes → Look → Directing style → Models);
   completed steps link back.
2. Left: split summary + episode list. Tabs `All` / `Your call`; each row shows
   `EP nn`, title, word count, a "short/long" flag (<0.6× or >1.8× median when ≥3
   episodes), drag handle to reorder, delete (blocked with a reason), rename.
3. Right: screenplay reader for the selected episode with inline editing.
4. `Add episodes`: paste text, upload one file, or upload several files; a regex
   pattern editor (with AI-generated patterns via `/common/detectRegexPattern`) can
   be tuned; split result previews as "Added N scripts from split".
5. Save writes `updates[]` (`script/updateScript`) and `creates[]` (`script/batchAddScript`).
6. Continue → `/home/pick-look`.

Blocked-reason texts to reproduce (behavioural states, not prose):
generating · not_generated · enhanced-script-in-use · assets_extracting ·
assets_extracted · "A show needs at least one episode".

### 7.5 Setup: look → director → models `[O]`

1. **Look** (`/home/pick-look`): grid of visual styles from
   `POST /api/project/getVisualManual` → `[{name, stylePath, image[]}]`; search;
   "Suggested for your genre"; prev/next carousel; select; Continue saves
   `project/editProject {id, artStyle}`.
2. **Directing style** (`/home/pick-director`): list from
   `POST /api/project/queryDirectorManual` → `[{name, directorManual, image[],
   description}]`; Continue saves `{id, directorManual}`.
3. **Models** (`/home/pick-models`): two sections, Image model and Video model, each
   a 4-up card grid + "See all" sheet + search; card shows logo, name, spec chips
   (text-to-image, image edit, multi-reference, anchoring, audio, duration range,
   max resolution, image refs). Continue saves `{id, imageModel, videoModel}` and
   opens `/scriptEnhancement`.
4. Setup incompleteness (`!artStyle || !directorManual || !imageModel || !videoModel`)
   blocks Cast/Production/Assets in the sidebar and redirects them to
   `/script-management`.

### 7.6 Script enhancement V1 → V2 (`/scriptEnhancement`) `[O]`

1. Left rail: episode list with a V1/V2 status dot; header actions `Upload script`
   (adds a V1 row) and `Rename show`.
2. Centre: switch `Script version` = `Original` | `Shoot-ready`; screenplay reader;
   edit/save; `Previous episode` / `Next episode`; unsaved-changes dialog.
3. Footer summary: `x / y`, "All done", per-episode counts enhancing/queued/failed.
4. `Make all shoot-ready` → confirm dialog ("starts right away, keeps enhancing in
   the background, uses credits; the original can no longer be edited") →
   `POST /api/scriptEnhancement/generate {projectId, sourceScriptIds[],
   instructions?}`.
5. Progress: per-episode `status: generating`; client polls
   `POST /api/scriptEnhancement/generate {projectId, checkStatus: true}` →
   `{generating}`; stage copy cycles: reading the episode → adding scene headings →
   noting who is in each scene → writing wardrobe and props → checking continuity.
6. Review a generated episode → optional `Regenerate` with a free-text note (≤2000
   chars) → same endpoint with `instructions`; cost shown next to the button.
7. `Use originals` → `{projectId, scriptSource: 'original'}` → `{copied, blocked[]}`;
   `Use shoot-ready` / `Enhance all anyway` → `{projectId, scriptSource: 'enhanced'}`
   → `{republished}`.
8. Edit a working V2: `POST /api/scriptEnhancement/updateV2 {projectId,
   sourceScriptId, content}`.
9. `Extract assets` → `POST /api/script/extractAssets {projectId, scriptIds?,
   groupSize}`; blocked until every episode is shoot-ready ("Finish making every
   episode shoot-ready before extracting assets"). Progress via `/script/getAddEpisodesStatus`
   and `/script/pollScriptAssets`; cancel via `/script/cancelExtractAssets {ids}`.
10. Continue → `Proceed to Cast & Places` (`/cornerScape?projectId=…`).

### 7.7 Cast & places (`/cornerScape`) `[O]`

1. Three-step banner: write prompts → generate looks → lock. One button runs the
   next step for everything.
2. Left list: characters, places, props extracted from the scripts; search; select.
3. Detail panel: image/preview, prompt editor, voice (for characters), lock toggle,
   generate/regenerate, accepted variants.
4. Batch APIs: `POST /api/assetsGenerate/batchPolishAssetsPrompt
   {projectId, items:[{assetsId,type,name,describe}], concurrentCount}` (text prompt
   polish) and `POST /api/assetsGenerate/batchGenerateImageAssets
   {projectId, model, resolution, concurrentCount, items:[{id,type,name,prompt}]}`.
5. Continue → `/production` ("On to video") once looks are locked.

### 7.8 Asset library (`/assets`) `[O]`

Tabs: Characters · Scenes · Props · Clips · Voices. Table with checkbox selection,
thumbnail, name, type, status, updated. Toolbar: search, `Add`, and per-selection
actions (edit, write prompts, generate looks, delete). Clips tab accepts an uploaded
clip (`POST /api/assets/uploadClip {base64Data, projectId, name}`). Data from
`/api/assets/getAssetsApi` (`{type?, name?, page, limit, projectId}` →
`{data[], total}`) and counts from `/api/assets/getAssetCounts`.

### 7.9 Production workbench (`/production`) `[O]`

Per episode, six tabs, each building on the previous:

1. **Script** — the approved V2 for the selected episode; read-only here.
2. **Script assets** — what extraction produced for this episode.
3. **Plan** — `production/plan/getPlan` / `generatePlan`: the episode broken into
   scenes/shots/beats; the "plan" is the editable source of prompts.
4. **Asset variants** — `production/derived/getDerived`: per-asset variant sets,
   generated/picked.
5. **Anchoring / Asset variants image generation** — `production/anchor/*`
   (batch generate, poll, update, updateAnchorUrl, batchDelete).
6. **Storyboard** — `production/storyboard/*`: shot cards with prompt + `videoDesc`,
   batch image generation, polling, preview, download, URL update, edit info.
7. **Video** — `production/workbench/*`: per-shot video takes, prompt generation and
   reprompt, duration, select take, delete, BGM, continuity panel, statutory-warning
   detection, tracks.

Header: episode picker, step list ("click any step"), `What's next` button, work area,
and the **Director** panel (AI chat about this episode).

### 7.10 Editor (`/editor`) `[O][I]`

Full-bleed four-region layout: media **library** (left), **canvas/preview** (centre),
**inspector** (right), **timeline** (bottom), plus a top bar with **Compile**.
Takes and media drag from library to timeline; `S` splits, `Delete` removes; V lanes
are picture, A lanes are sound; compile renders and the result appears under
**Compilations**. Detailed feature inventory in §15.

### 7.11 Billing (`/home/settings/billing`) `[O][D]`

1. Load `POST /api/payment/listPlans {}` → `{plans[], currency, country}`; keep plans
   whose first price currency matches.
2. Render plan cards with credits, price, per-credit comparison and % bonus vs the
   cheapest rate; show current balance.
3. Buy → `POST /api/payment/createOrder {planId, currency}` → `{orderId, planId,
   amount, currency, amountPaise, credits, gatewayOrderId, keyId}`.
4. Razorpay checkout opens with only `key` + `order_id` (+ theme, email, language);
   success handler `POST /api/payment/verifyPayment {razorpay_order_id,
   razorpay_payment_id, razorpay_signature}`.
5. Poll `POST /api/payment/getOrder {orderId}` every 3 s (≤20 tries) until `paid` /
   `failed` / `expired`; on paid, toast + refresh wallet/usage.
6. Failures: "Payments are not configured", "Razorpay is not available", checkout
   script load failure, "Couldn't check the payment", card failure (logged with
   code/reason/step).

### 7.12 Team (`/home/settings/team`, org only) `[O][D]`

Members table (name, email, role, joined) + pending invites (email, role, expiry,
resend, revoke). `Invite` → email + role → `agency/inviteMember` → link.
Change role → `agency/changeRole {userId, role}`. Remove → `agency/removeMember {userId}`.
Owner row is immutable. Read-only for non-admins (tab hidden / redirect).

### 7.13 Invite accept (`/invite/:token`) `[O][D]`

1. Resolve token (`agency/getInviteInfo {token}`) → workspace name, inviter, role,
   expiry; invalid/expired → "This invite is invalid or has expired".
2. Signed-out: sign in (the invited email must match).
3. Accept → `agency/acceptInvite {token}` → membership created; workspace appears in
   the switcher; invited user also gets their own personal workspace (+100) `[D]`.
4. Token is 43-char base64url, 7-day expiry, bound to the invited email; wrong
   account → 403.

### 7.14 Novel (`/novel`, `/novel/write`, `/novel/continuity`) `[O][?]`

List with New/Search; chapter-by-chapter writing surface; continuity view. Project
type `novel` gates the production steps the same way as `original`. The editor UI and
data model are not in the captured bundles — see §19.

### 7.15 Platform console (`/platform/*`) `[O][?]`

Operator-only surfaces: overview KPIs, workspace list + detail, cross-tenant project
list, feature flags, audit, access. Not reachable from a normal account (API 404 `[D]`).

---

## 8. Screen-by-screen specification

### 8.1 `/` marketing `[O]`

Sections: sticky nav (Studio · Series · Slate · Pricing · Sign in · Start creating);
hero with a "Make a series about ___" prompt field and example chips; a four-step
"How a series comes together" strip (Chat → Shots → …); Greenlight Slate card with
quarter deadline countdown and Pitch CTA; "Now streaming" series cards (studio,
genre, languages, episode count, metrics, watch/how-it-was-made); studio stories
(video cards with durations); a director's-cut quote; referral ladder (1/3/5/10
studios → 5,000 credits each → priority review → producer → free Studio plan);
press logos; final CTA (invite-only request access); footer with product/company/
legal/support columns and company registration line.

### 8.2 `/pricing` `[O][D]`

Client-side; plan data from the payment API (works signed-out). Show plan cards,
currency/country context, credit explainer, FAQ, CTA. Signed-out purchase routes to
login.

### 8.3 `/home` `[O]`

Two zones:
1. **Start a show**: composer card with gradient border and animated beam; chips for
   name / frame / duration / language; helper summary; primary `Analyse` → creates
   the show; `Add files`; `Try a sample`; inline errors.
2. **Recent shows**: up to N cards (poster, name, ratio, step progress bars, current
   step label, "View only" badge, shared-by label, menu). Empty state → composer only.

### 8.4 `/home/shows` `[O]`

Header with title + New show. Toolbar: search (`q`), sort (`edited|newest|oldest|name`),
view toggle (list/grid), pagination (page size 5 default, 24 in one variant). Card:
poster (2:3), name, mono ratio, 4 progress bars, "Step n of 4 — <stage>", role/share
badges, menu: Open, Rename, Move to workspace, Share, Leave, Delete (destructive,
confirm). Share modal lists owner + shares + an "add member" picker filtered to
workspace members not already on the project.

### 8.5 Setup screens `[O]`

Shared skeleton: setup stepper, title + one-line intro, search, option grid/carousel,
suggested marker, sticky Continue. Continue persists one field and advances.

### 8.6 `/scriptEnhancement` `[O]`

Three columns: episode rail (status dot + EP number + title + V1/V2 tag), reader, and
footer bar. A mode switch toggles Original/Shoot-ready; a banner states which source
the project uses and until when it can be switched. Dialogs: confirm enhance all,
regenerate with note, switch source, leave without saving, rename show, upload script
(name + paste/upload, 40k char default limit).

### 8.7 `/cornerScape` `[O]`

Header: three-step progress + "do next step for everything" button + search.
Left: grouped list (characters / places / props) with thumbnails and lock icons.
Right: detail (large preview, name, type, prompt editor, voice select for characters,
generate/regenerate, variants strip, lock/unlock, delete). Locked assets are not
regenerated by batch runs.

### 8.8 `/assets` `[O]`

Sticky tab bar + search + Add; virtualised table; bulk action bar appears on
selection; row click opens a preview drawer (image viewer with zoom, download,
previous/next; video player for clips; audio player for voices).

### 8.9 `/production` `[O]`

Episode selector row (EP number, name, progress %), step tabs with states, work area,
right-side Director drawer, and a "What's next" CTA that runs or opens the next step.
Storyboard = responsive card grid: frame preview, shot number, prompt, duration,
per-card actions (generate/regenerate, preview, download, edit, delete, select take).
Video step = per-shot take stacks with a selected take, prompt tools, continuity
panel, BGM, and "send to timeline".

### 8.10 `/editor` `[O][I]`

See §15.

### 8.11 Settings `[O]`

Sub-nav (General · Team · Billing · Usage) with underline active state. General:
workspace card (name, type, role, balance, id with copy), rename, upgrade personal →
org, leave (org members), danger zone. Billing: balance, plans, buy, ledger link.
Usage: filterable ledger table (date, actor, type/genType, output type, held, delta,
status) with cursor "Load more".

### 8.12 `/novel` `[O][?]`

Cards for novels, New novel, Search. `/novel/write` is a distraction-free chapter
editor; `/novel/continuity` shows story continuity. Turning a novel into a show is
advertised ("then turn it into a show") but the conversion call was not observed.

---

## 9. Credits, pricing and payments

### 9.1 Wallet semantics `[O][D]`

| Field | Meaning |
|---|---|
| `balanceCredits` | Spendable balance (may go negative after settlement). |
| `heldCredits` | Sum of outstanding reservations. |
| `totalCredits` | `balance + held`. |

`GET /api/wallet/detail` → `{code:200, data:{balanceCredits, heldCredits, totalCredits}, message:"success"}`.

### 9.2 Quote → hold → settle `[D]`

```
POST /api/wallet/quote {items:[{key, action, ...params}]}
  → {code:200, data:{items:[{key, credits}], …}}
```

Actions and parameters observed:

| `action` | Params | Used for |
|---|---|---|
| `text.generate` | `text:{promptChars}` | prompt polish, per-item text work |
| `image.generate` | `image:{model, size?, count}` | one image variant |
| `video.generate` | `video:{model, durationSec, clips:1, …}` | one clip |
| `asset.extract` | `extract:{episodes, groupSize}` | asset extraction |

`POST /api/assetsGenerate/batchPolishAssetsPrompt` and
`POST /api/assetsGenerate/batchGenerateImageAssets` reserve credits **before**
dispatch and settle per item afterwards. Ledger rows carry `creditsHeld` (reserved)
and `creditsDelta` (actual).

Observed unit economics `[D]`:

| Unit | Hold | Settle (observed) |
|---|---|---|
| text item | 3.135 | −1.50 … −3.95 (token dependent) |
| image item (`google/gemini-3.1-flash-image`, 1K) | 7.0224 | −7.026 … −9.033 |
| video clip (5 s) | — | ≈ −134 |
| `script_analysis` | 3 | −3 flat |
| `asset-extraction` (per group) | 3.135 | −0.54 … −0.72 |

Reservation formula observed (bug, reproduce in lab only):

```
hold       = min(items.length, concurrentCount ?? 1) × unit_price
settlement = items.length × unit_price
```

`concurrentCount` is client-supplied, optional, defaults to **1**, and only `1` (or
omission) passes validation as a low value; `1e9` is clamped to `items.length`. The UI
default is 5. Batches of 100 items were accepted. Items beyond the first "chunk" are
never re-checked for funds, and settlement is allowed to take the balance negative.

### 9.3 Ledger `[O]`

`GET|POST /api/wallet/transactions {limit?, cursor?, type?, from?, to?}` →
`{data:{items:[…], nextCursor: null|string}}`.

Row shapes:

```jsonc
// generation
{"id":"01a20c9d-…","type":"generation","creditsHeld":7.0224,
 "genType":"asset_prompt","outputType":"image",
 "actorUserId":415571210,"actorName":"…","actorEmail":"…",
 "createdAt":1795507985,"status":"completed","creditsDelta":-7.026371}

// topup
{"id":"01a20c92-…","type":"topup","status":"completed","creditsDelta":100,
 "reason":"signup_bonus","actorUserId":415577481,"actorName":"…",
 "actorEmail":"…","createdAt":1795507231}
```

Observed `genType` values: `asset_prompt` (text/image), `asset-extraction`,
`script_analysis`, `universal_text`. Observed `type`: `generation`, `topup`.
`reason`: `signup_bonus`, `org_bonus`. `status`: `pending`, `completed`, `failed`
(implied). `createdAt` is Unix seconds.

### 9.4 Plans `[O]` (public, no auth)

```
POST /api/payment/listPlans {}
→ {"code":200,"data":{"plans":[
     {"id":1,"name":"100 credits","credits":100,
      "prices":[{"currency":"INR","symbol":"₹","amount":"100.00"}],"amountPaise":10000},
     {"id":2,"name":"220 credits","credits":220,
      "prices":[{"currency":"INR","symbol":"₹","amount":"200.00"}],"amountPaise":20000},
     {"id":3,"name":"550 credits","credits":550,
      "prices":[{"currency":"INR","symbol":"₹","amount":"500.00"}],"amountPaise":50000}],
    "currency":"INR","country":"IN"},"message":"success"}
```

Effective price: ₹1.00 / ₹0.909 / ₹0.909 per credit; the 220 and 550 plans are the
"bonus" tiers and the UI computes base vs extra credits against the best rate.
Currency is geo-selected server-side; `currency: "USD"` → 409 "Prices changed for
your location". Unknown `planId` → 400 "Unknown plan". `[D]`

Onboarding grants: personal **+100**, org **+1000**. The marketing referral ladder
(5,000 credits per referred studio) is **not implemented** in the app — no referral
endpoint or ledger reason exists. `[D]`

### 9.5 Order and payment state machine `[O][D]`

```
createOrder(planId, currency)
   → created ──verifyPayment(HMAC)──► paid
        │                              ▲
        ├── gateway failure ──► failed │
        └── timeout ─────────► expired ┘   (webhook payment.captured also → paid)
```

- `POST /api/payment/createOrder {planId, currency}` → `{orderId, planId, amount,
  currency, amountPaise, credits, gatewayOrderId, keyId}`. Extra client fields
  (`amount`, `credits`, `price`) are ignored; order amount is server-authoritative.
- `POST /api/payment/getOrder {orderId}` → `{status, …}` scoped to the caller's
  workspace; foreign order → 404 "Order not found".
- `POST /api/payment/verifyPayment {razorpay_order_id, razorpay_payment_id,
  razorpay_signature}` → validates HMAC `order_id|payment_id`; bad signature → 400
  "Invalid payment signature"; missing fields → 400 zod.
- `POST /api/webhooks/razorpay` — signature-verified webhook; bad signature → 401
  "Invalid signature".
- Checkout is opened with `key` + `order_id` only (no client amount).

### 9.6 Billing UI rules `[O]`

- "Payments are not configured" when no gateway config; "Razorpay is not available"
  when the script cannot load.
- After verify, poll `getOrder` every 3 s for up to 20 tries.
- Analytics event `paymentReceived {credits}` with tag `payment-<orderId>`.
- Card failure logs `{code, reason, source, step, orderId, paymentId, description}`.

---

## 10. State machines

### 10.1 Project progress `[O]`

Stages (keys under `progress.stages`): `scriptSource`, `extraction`, `enhancement`,
`castPrompts`, `castImages` (the UI also tolerates additional keys).

```
stage.state ∈ {pending, partial, done, outdated, failed, n/a}
progress = {currentStage: int, percent: number, stages: {key: {state, done?, total?}}}
```

UI projection into 4 bars: `[scriptSource+extraction] [enhancement] [castPrompts+castImages] [video]`;
a bar is done when all its stages are `done` or `n/a`; the first incomplete bar is
"current"; the rest are "todo". Sidebar dots use the raw stage state.

### 10.2 Script version lifecycle `[O]`

```
V1 draft ──edit──► V1 draft
   │
   ├─ generate (enhance) ─► V2 status=generating ─► generated ─► (edit) ─► generated
   │                                   └─ error ─► status=error, errorReason
   ├─ approve/use enhanced ─► scriptSource=enhanced, liveV2ScriptId set
   └─ use originals ─► scriptSource=original (V2 kept, switchable until extraction)

Locking: lockStatus = not_locked | locked
Editing rules (editBlockedReason): generating · not_generated · enhanced-in-use ·
assets_extracting · assets_extracted
```

### 10.3 Asset extraction `[O]`

```
idle ──extractAssets──► extracting (poll getAddEpisodesStatus / pollScriptAssets, 3 s)
                           ├─ done ─► extracted (assetsExtracted[])
                           ├─ fail ─► error (toast, retry)
                           └─ cancelExtractAssets ─► cancelled (hold released)
```

### 10.4 Asset (look) generation `[O][D]`

```
pending ─► generating ─► completed
                └──────► failed
```
Batch submit returns `{total}` immediately; per-item ledger rows appear as each item
starts (`status: pending`) and settle (`completed`). Polling endpoints take `{ids}`
and return rows with `url`/`status`.

### 10.5 Storyboard shot and video take `[O][I]`

```
shot:  empty ─► generating(image) ─► ready ─► (edit prompt) ─► regenerating ─► ready
take:  pending ─► generating ─► completed | failed
       selectVideoId chooses the active take; syncVideoStatus reconciles provider state
```

Video takes are created per shot (`generateVideo`, `batchGenerateVideo`), polled with
`checkVideoStateList {projectId, scriptId, videoIds[]}`, and deleted with `delVideo {id}`.

### 10.6 BGM `[O]`

```
generateBgm {…} → {jobId} ──pollBgm {jobId, projectId}──► ready → appears in getBgmList
                                                        └─► failed
```

### 10.7 Continuity panel `[O]`

```
getContinuityPrompt → prompt
generateContinuityPanel {…} → {versionId, version}
editContinuityPanelWithMarkers {markers} → new {versionId, version}
pollingContinuityPanel {projectId, ids} / getContinuityPanelHistory / deleteContinuityPanelHistory {id}
```

### 10.8 Editor track/media `[O][I]`

```
addTrack {projectId, scriptId, duration} → track
saveTrackMedias {projectId, trackId, medias[]} → persisted timeline
deleteTrack {id}
compile → render job → Compilations entry (ready/failed)
```

### 10.9 Invite and membership `[O][D]`

```
invited (email-bound, 7 d) ──accept (matching email)──► member(role)
      ├─ resend ─► invited (new mail, same token/window)
      ├─ revoke ─► revoked
      └─ expire ─► expired
member: role change (admin only) · removal (admin, not owner) · leave (self, org)
```

### 10.10 Order/payment — see §9.5.

---

## 11. API catalogue

Conventions `[O]`:

- Base path `/api` (browser sees `/kronicle-api/api`); auth endpoints under `/py-api`.
- **POST + JSON** is the default; GET is marked explicitly.
- Success envelope: `{"code":200,"data":…,"message":"success"}`.
- All workspace-scoped calls send `x-agency-id`; all send `Accept-Language`,
  `X-Timezone`, and body `locale`.
- Errors are the same envelope with a non-200 `code` **or** HTTP status (see §12);
  the client treats `code !== 200` as failure for the `data`-returning helpers.

### 11.1 Auth, session, user

| Method | Path | Request | Response / behaviour | Tag |
|---|---|---|---|---|
| POST | `/py-api/v1/users/auth/send-otp` | `{email}` | `{verification_id, otp_length:4}`; anti-abuse may return `UPDATE_APP` | `[D]` |
| POST | `/py-api/v1/users/auth/verify-otp` | `{verification_id, code, email}` | sets `kronicleToken` + `jwtToken`; errors `INVALID_OTP`, `INVALID_REQUEST`, `RE-VERIFY_OTP` | `[D]` |
| POST | `/py-api/v1/logout` | — | clears cookies | `[D][I]` |
| GET | `/api/auth/me` | — | `{user:{userId,name,email,avatar,…}}` (shape `[I]`) | `[O]` |
| GET | `/api/user/check` | — | `{onboarded: bool}` (client treats error as `true`) | `[O]` |
| POST | `/api/user/onboard` | `{type:'individual'|'org', name}` | `{onboarded:true, agency…}`; error "Couldn't set up your workspace" | `[O]` |
| GET | `/api/user/permissions` | `?projectId=` | `{permissions:[…], features:{team?}, …}` as `data` | `[O]` |
| POST | `/api/user/updateProfile` | `{name?, avatar?}` | updated user | `[D]` |

### 11.2 Workspace / members / invites

| Method | Path | Request | Response | Tag |
|---|---|---|---|---|
| GET (also POST seen) | `/api/agency/getMyAgency` | `{}` | `{current, agencies:[{id,name,type,role,active?}], isMaalik?}` | `[O][D]` |
| POST | `/api/agency/listMembers` | `{limit:200, offset:0}` | `{members:[{userId,name,email,role,…}]}` | `[O]` |
| POST | `/api/agency/inviteMember` | `{email, role}` | `{invite:{…, link}}` | `[O][D]` |
| POST | `/api/agency/listInvites` | `{}` | `{invites:[{inviteId,email,role,expiresAt,status}]}` | `[O]` |
| POST | `/api/agency/getInviteInfo` | `{token}` | workspace/inviter/role | `[O][D]` |
| POST | `/api/agency/acceptInvite` | `{token}` | membership | `[O]` |
| POST | `/api/agency/changeRole` | `{userId, role}` | ok | `[O]` |
| POST | `/api/agency/removeMember` | `{userId}` | ok | `[O]` |
| POST | `/api/agency/leaveAgency` | `{}` | ok | `[O]` |
| POST | `/api/agency/renameAgency` | `{name}` | ok | `[O]` |
| POST | `/api/agency/upgradeToOrg` | `{name?}` | ok (no bonus) | `[O][D]` |
| POST | `/api/agency/moveProject` | `{projectId, targetAgencyId}` | ok | `[O]` |
| POST | `/api/agency/resendInvite` | `{inviteId}` | ok | `[O]` |
| POST | `/api/agency/revokeInvite` | `{inviteId}` | ok | `[O]` |
| POST | `/api/share/listMembers` | `{projectId}` | `{owner:{userId,…}, shares:[{userId,role,name,email}]}` | `[O]` |
| POST | `/api/share/addMember` | `{projectId, userId, role}` | ok | `[O]` |
| POST | `/api/share/removeMember` | `{projectId, userId}` | ok | `[O]` |

### 11.3 Wallet, ledger, payments

| Method | Path | Request | Response | Tag |
|---|---|---|---|---|
| GET | `/api/wallet/detail` | — | `{balanceCredits, heldCredits, totalCredits}` | `[O]` |
| GET | `/api/wallet/transactions` | query `limit, cursor, type?, from?, to?` | `{items[], nextCursor}` | `[O]` |
| POST | `/api/wallet/quote` | `{items:[{key,action,…}]}` | `{items:[{key,credits}], …}` | `[O]` |
| POST | `/api/payment/listPlans` | `{}` | `{plans[], currency, country}` | `[O]` |
| POST | `/api/payment/createOrder` | `{planId, currency}` | `{orderId, planId, amount, currency, amountPaise, credits, gatewayOrderId, keyId}` | `[O][D]` |
| POST | `/api/payment/getOrder` | `{orderId}` | `{status, credits, …}` | `[O]` |
| POST | `/api/payment/verifyPayment` | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` | `{status}` | `[O][D]` |
| POST | `/api/webhooks/razorpay` | gateway payload + signature header | 200/401 | `[D]` |

### 11.4 Projects and setup

| Method | Path | Request | Response | Tag |
|---|---|---|---|---|
| POST | `/api/project/analyzeScript` | `{text}` or `{episodes:[{name,content}], fileName}` | `{language, estimatedMinutes, estimatedSeconds, needsDuration, preambleChars, structuredText, splitPresetId, episodes:[…], suggestions:{name, videoRatio, directingStyleId}, cached}` | `[O]` |
| POST | `/api/project/createFromScript` | `{text, name, videoRatio, directingStyleId, splitPresetId, episodes[], targetEpisodeSeconds?}` | `{projectId, episodeCount}` | `[O]` |
| POST | `/api/project/addProject` | `{type, artStyle, directorManual, videoRatio, imageModel, videoModel, imageQuality, mode, name…, visualFields:{…}}` | `{projectId}` | `[O]` |
| POST | `/api/project/addExtensionProject` | extension payload | `{projectId}` | `[O]` |
| POST | `/api/project/addLocaliseProject` | localisation payload | `{projectId}` | `[O]` |
| POST | `/api/project/addWorkflow` | `{projectId, workflow}` | ok (errors swallowed) | `[O]` |
| POST | `/api/project/getProject` | `{tab:'all', page, pageSize:5, sort:'newest', q:''}` | `{list:[project], total, page…}` | `[O]` |
| POST | `/api/project/getScriptMarketTypes` | `{}` | `{types:[…]}` | `[O]` |
| POST | `/api/project/getVisualManual` | `{}` | `[{name, stylePath, image[]}]` | `[O]` |
| POST | `/api/project/queryDirectorManual` | `{}` | `[{name, directorManual, image[], description}]` | `[O]` |
| POST | `/api/project/getModelDetails` | `{key:'productionAgent'}` | `{think: bool, …}` | `[O]` |
| POST | `/api/project/editProject` | `{id, name?, artStyle?, directorManual?, imageModel?, videoModel?, videoRatio?, imageQuality?, mode?}` | ok | `[O]` |
| POST | `/api/project/delProject` | `{id}` | ok | `[O]` |
| POST | `/api/general/getSingleProject` | `{id}` | `[project]` (array) | `[O]` |
| POST | `/api/general/updateProject` | project patch | ok | `[O]` |
| POST | `/api/modelSelect/getModelList` | `{type:'text'|'image'|'video'}` | `[{id, value, label, recommended?, mode[], durationResolutionMap[], audio?, …}]` | `[O]` |
| POST | `/api/modelSelect/getModelDetail` | `{modelId}` | `{mode[], durationResolutionMap[], audio?, …}` | `[O]` |
| POST | `/api/config/getClientConfig` | `{}` | `{home:{defaultFrame, defaultTargetEpisodeSeconds, defaultDirectingStyleId, maxScriptChars, …}, models…}` (auth required) | `[O][D]` |

### 11.5 Scripts and episodes

| Method | Path | Request | Response | Tag |
|---|---|---|---|---|
| POST | `/api/script/getScrptApi` | `{projectId, type?}` | `[{id, name, content, type, episodeNumber, sortIndex, activeScriptId, editable, editBlockedReason, relatedAssets[], file?}]` | `[O]` |
| POST | `/api/script/batchAddScript` | `{projectId, data:[{scriptName, scriptData}]}` | ok | `[O]` |
| POST | `/api/script/addScript` | `{name, content, projectId, assets:[]}` | ok | `[O]` |
| POST | `/api/script/updateScript` | `{id, name, content, assets:[ids]}` | ok | `[O]` |
| POST | `/api/script/delScript` | `{ids:[]}` | ok | `[O]` |
| POST | `/api/script/exportScript` | `{id}` | **blob** (zip) | `[O]` |
| POST | `/api/script/extractAssets` | `{projectId, scriptIds?, groupSize}` | job/ack | `[O]` |
| POST | `/api/script/cancelExtractAssets` | `{ids:[]}` | ok (releases hold) | `[O][D]` |
| POST | `/api/script/pollScriptAssets` | `{ids:[]}` | per-script asset state | `[O]` |
| POST | `/api/script/getAddEpisodesStatus` | `{projectId}` | `{adding, error?, …}` (polled 3 s while adding) | `[O]` |
| POST | `/api/scriptEnhancement/getPlanData` | `{projectId}` | `{enhancements[], scriptSource, missingEnhancement[], assetsExtracted[]}` | `[O]` |
| POST | `/api/scriptEnhancement/generate` | `{projectId, sourceScriptIds[], instructions?}` / `{projectId, scriptSource:'original'|'enhanced'}` / `{projectId, checkStatus:true}` | `{copied, blocked[]}` / `{republished}` / `{generating}` | `[O]` |
| POST | `/api/scriptEnhancement/updateV2` | `{projectId, sourceScriptId, content}` | ok | `[O]` |
| POST | `/api/common/detectRegexPattern` | `{textSample: string(≤8000), previousPatterns[]}` | `{data:{patterns[], label?}}` | `[O]` |
| POST | `/api/common/getBigImage` | `{url}` | `{url: cdnPrefixed}` (no server fetch) | `[O][D]` |

### 11.6 Assets, cast and looks

| Method | Path | Request | Response | Tag |
|---|---|---|---|---|
| POST | `/api/assets/getAssetsApi` | `{projectId, type?, name?, page, limit}` | `{data:[asset], total}` | `[O]` |
| POST | `/api/assets/getAssetCounts` | `{projectId}` | counts per type | `[D]` |
| POST | `/api/assets/uploadClip` | `{base64Data, projectId, name}` | `{asset}` | `[O]` |
| POST | `/api/assetsGenerate/batchPolishAssetsPrompt` | `{projectId, items:[{assetsId,type,name,describe}], concurrentCount}` | `{total}` + later ledger | `[O][D]` |
| POST | `/api/assetsGenerate/batchGenerateImageAssets` | `{projectId, model, resolution, concurrentCount, items:[{id,type,name,prompt}]}` | `{total}` + later ledger | `[O][D]` |
| POST | `/api/cornerScape/getAllAssets` | `{projectId}` | `{roles[], scenes[], props[], …}` | `[D]` |

### 11.7 Production

All under `/api/production`; all POST.

| Path | Request | Response / purpose | Tag |
|---|---|---|---|
| `/getFlowData` | `{projectId, episodesId}` | flow JSON for the episode | `[O]` |
| `/saveFlowData` | `{projectId, episodesId, data}` | ok | `[O]` |
| `/plan/getPlan` | `{projectId, scriptId}` | plan (scenes/shots/beats) | `[D][I]` |
| `/plan/generatePlan` | `{projectId, scriptId, …}` | plan job | `[D][I]` |
| `/derived/getDerived` | `{projectId, scriptId, …}` | per-asset variants | `[D][I]` |
| `/anchor/getPlan` | `{projectId, scriptId}` | anchors | `[D]` |
| `/anchor/update` | anchor patch | ok | `[O]` |
| `/anchor/batchGenerateImage` | `{projectId, scriptId, items[]}` | `{items, warning?}` | `[O]` |
| `/anchor/batchDelete` | `{ids, projectId}` | ok | `[O]` |
| `/anchor/pollingImage` | `{ids}` | rows with url/status | `[O]` |
| `/anchor/updateAnchorUrl` | `{id, url, flowId}` | ok | `[O]` |
| `/assets/getAssetsPage` | `{projectId, scriptId, page, limit}` | `{data[], total}` | `[O]` |
| `/assets/batchGenerateAssetsImage` | `{projectId, scriptId, items[]}` | array/`{items}` | `[O]` |
| `/assets/pollingImage` | `{ids}` | rows | `[O]` |
| `/assets/updateAssetsUrl` | `{id, url, flowId}` | ok | `[O]` |
| `/assets/deleteAssetsDireve` | `{id, projectId}` | ok | `[O]` |
| `/storyboard/getStoryboardData` | `{projectId, scriptId, name?, page, limit}` | `{data[], total}` | `[O]` |
| `/storyboard/getShots` | `{projectId, scriptId}` | shot list | `[D]` |
| `/storyboard/getTable` | `{projectId, scriptId}` | table view | `[D]` |
| `/storyboard/batchGenerateImage` | `{projectId, scriptId, items[]}` | `{items[], warning?}` | `[O]` |
| `/storyboard/pollingImage` | `{ids}` | rows | `[O]` |
| `/storyboard/previewImage` | `{storyboardIds, projectId}` | preview URL(s) | `[O]` |
| `/storyboard/downPreviewImage` | `{storyboardIds}` | **blob** | `[O]` |
| `/storyboard/updateStoryboardUrl` | `{id, url, flowId}` | ok | `[O]` |
| `/storyboard/editStoryboardInfo` | `{id, prompt, videoDesc}` | ok | `[O]` |
| `/workbench/getGenerateData` | `{projectId, scriptId}` | `{storyboardList[], trackList[], anchorList[]}` | `[O]` |
| `/workbench/generateVideo` | `{projectId, scriptId, videoId/storyboardId, prompt, duration, model, …}` | take (job) | `[O][I]` |
| `/workbench/batchGenerateVideo` | `{projectId, scriptId, items[]}` | takes | `[O]` |
| `/workbench/checkVideoStateList` | `{projectId, scriptId, videoIds[]}` | `[{id,state,src}]` | `[O]` |
| `/workbench/syncVideoStatus` | `{projectId, scriptId}` | reconciled states | `[O]` |
| `/workbench/selectVideo` | `{id or projectId/scriptId/videoId}` | ok | `[O]` |
| `/workbench/delVideo` | `{id}` | ok | `[O]` |
| `/workbench/updateVideoPrompt` | `{id, prompt}` | ok | `[O]` |
| `/workbench/updateVideoDuration` | `{id, duration}` | ok | `[O]` |
| `/workbench/generateVideoPrompt` | `{projectId, scriptId, …}` | prompt text | `[O]` |
| `/workbench/repromptVideoPrompt` | `{projectId, currentPrompt, instruction}` | new prompt | `[O]` |
| `/workbench/repromptImagePrompt` | `{projectId, currentPrompt, instruction}` | new prompt | `[O]` |
| `/workbench/getFileUrl` | `{items:[{id, sources?}]}` | array or map `"id:sources" → url` | `[O]` |
| `/workbench/getAudioBindAssetsList` | `{assetsIds[]}` | bound audio assets | `[O]` |
| `/workbench/generateBgm` | `{projectId, scriptId, mood/duration, …}` | `{jobId}` | `[O]` |
| `/workbench/pollBgm` | `{jobId, projectId}` | `{status, url?}` | `[O]` |
| `/workbench/getBgmList` | `{projectId, scriptId}` | `[{id,name,url,duration}]` | `[O]` |
| `/workbench/getContinuityPrompt` | `{projectId, scriptId, editPrompt:''}` | `{prompt}` | `[O]` |
| `/workbench/generateContinuityPanel` | `{projectId, scriptId, …}` | `{versionId, version}` | `[O]` |
| `/workbench/pollingContinuityPanel` | `{projectId, ids}` (+ AbortSignal) | statuses | `[O]` |
| `/workbench/getContinuityPanelHistory` | `{projectId, scriptId}` | versions | `[O]` |
| `/workbench/editContinuityPanelWithMarkers` | `{…, markers}` | `{versionId, version}` | `[O]` |
| `/workbench/deleteContinuityPanelHistory` | `{id}` | ok | `[O]` |
| `/workbench/addTrack` | `{projectId, scriptId, duration}` | track | `[O]` |
| `/workbench/deleteTrack` | `{id}` | ok | `[O]` |
| `/workbench/saveTrackMedias` | `{projectId, trackId, medias[]}` | ok | `[O]` |
| `/workbench/detectStatutoryWarning` | `{prompt}` | warning flags | `[O]` |
| `/workbench/updateTrackStatutoryWarning` | `{…}` | ok | `[O]` |
| `/editImage/getImageFlow` | `{id}` | flow | `[O]` |
| `/editImage/saveImageFlow` | `{…}` | ok | `[O]` |
| `/editImage/updateImageFlow` | `{...fields, flowId}` | ok | `[O]` |
| `/editImage/generateFlowImage` | flow payload | image job | `[O]` |
| `/editImage/uploadImage` | `{base64Data, projectId, scriptId}` | `{url}` | `[O]` |

### 11.8 Chat / agents / analytics

| Method | Path | Request | Response | Tag |
|---|---|---|---|---|
| GET | `/api/chat/stream` | `?isolationKey=<project>:<agent>:<script>` | SSE/stream; 204 when no stream; 401 unauth | `[D]` |
| POST | `/api/agents/getMemory` | `{…}` | memory rows | `[D]` |
| POST | `/next-api/k` | analytics event | 204 | `[D]` |
| GET | `/next-api/version` | — | `{version}` | `[D]` |

---

## 12. Error model `[O][D]`

### 12.1 Envelope

```json
{"code": 400|401|403|404|409|402, "message": "human string", "data": {...}}
```

HTTP status and `code` are usually equal. The client rejects when `code !== 200` for
helpers that unwrap `data`, and attaches `httpStatus` to rejected objects.

### 12.2 Status map

| HTTP | Body | Trigger / client behaviour |
|---|---|---|
| 400 | zod issue summary | Invalid body (`planId` string/float/0/negative, missing razorpay fields). |
| 400 | `Unknown plan` | Unknown `planId`. |
| 400 | `Invalid payment signature` | Bad HMAC. |
| 400 | `INVALID_OTP` / `INVALID_REQUEST` | Wrong OTP code. |
| 400 | `RE-VERIFY_OTP` / "OTP Expired" | Cross-email or expired OTP. |
| 401 | `Token not provided` / `Invalid token` | Session missing/expired → refresh attempt → login redirect. |
| 402 (or message match) | `insufficient (wallet )?(balance|credits)` / `not enough credits` | Client rewrites message to the "out of credits" copy and shows a `noCredits` toast. |
| 403 | `You are not a member of this organisation` | Bad `x-agency-id`; client returns to `/home` with an error. |
| 403 | `Permission denied` | Missing permission key; toast + `access-changed` event. |
| 403 | `{"code":"AGENCY_DISABLED"}` | Workspace off → global disabled screen. |
| 404 | `Project not found` / `Not found` / `Order not found` | Cross-tenant object access (used deliberately instead of 403). |
| 409 | `Prices changed for your location` | Currency mismatch. |
| 401 | `Invalid signature` | Razorpay webhook. |
| 5xx | `Something went wrong` | Status screen 500; Sentry capture with `area: api`, `status`, `path`. |

### 12.3 Client-side error UX

- Toast for most failures, deduplicated; some endpoints suppress toasts
  (`/agency/getMyAgency`, `/user/permissions`, 403 from list calls).
- Batch endpoints collapse many identical failures into one toast, tracked per URL
  prefix (`/batchG…`, `/generate…`, `/reprompt…`) and per response-key set.
- Analysis errors carry structured fields (`status`, `balance`, `required`,
  `minTargetEpisodeSeconds`) so the composer can offer "increase episode length" or
  "top up".

---

## 13. Script format, import and parsing

### 13.1 Accepted inputs `[O]`

- Paste (plain text), `.txt`, `.md` (decoded as UTF-8), `.docx` (Word raw-text
  extraction), `.pdf` (pdf.js 4.10.38 worker from a public CDN).
- One file per episode, or one large file that is split by episode headings.
- Multiple sources are concatenated for analysis; each keeps its file name.
- Character budget per import: `home.maxScriptChars` from client config (default
  **40 000** characters, also the per-script editor limit).

### 13.2 PDF text reconstruction `[O]`

Per page: take text items with `{str,x,y,w,h}`, sort by descending `y` then ascending
`x`; group items into lines when `|Δy| ≤ max(2, min(h₁,h₂)/2)`; order each line by `x`
and join with a space when the horizontal gap between runs exceeds 15% of glyph
height. Then strip repeated running headers/footers: collect the first and last two
lines of every page, and drop any line that appears on at least half the pages (or 3+
times) when it is in those edge positions. Pages are then joined with newlines.

### 13.3 Episode splitting `[O]`

A splitter preset is `{id, pattern}`. Candidates are tried; the preset with the most
heading matches (≥2) wins; otherwise the text is one episode.

- `single` — no split.
- `headings`/`episode` — heading forms such as `Series: …`, `EP <n>: <title>`,
  `Episode <n>`, `Season n`; headings are cleared of `#*_` decoration and used as the
  episode name (fallback `Episode <n>`).
- Chapter regex for CJK: `第 N 章/回/节` plus trailing title (default
  `chapterReg` in settings).
- Text before the first heading is "preamble" and is not saved as an episode
  ("text before Episode 1 isn't saved").
- The UI reports `splitPresetId`, `preambleChars`, first heading offset, episode count;
  when nothing splits: "No episode headings found, so this is one episode."

### 13.4 Screenplay grammar `[O]`

Two authoring modes are supported.

**(a) Explicit block markers.** A block may start with
`⟦scene⟧`, `⟦action⟧`, `⟦dialogue⟧`, `⟦transition⟧`, `⟦character⟧`, `⟦paren⟧`;
the rest of the block is the content.

**(b) Human screenplay.** Blocks are separated by blank lines. Line-level rules:

| Element | Rule |
|---|---|
| Episode header | `Series: <name>` / `EP <n>: <title>` (optionally with a prefix before `EP`); also a `Plot Synopsis` block and `Characters: …` block. |
| Scene heading | `<number> <location> <time> / <INT|EXT|ANDAR|BAHAR>`; time vocabulary includes `Day, Night, Morning, Afternoon, Evening, Din, Raat, Subah, Dopahar, Shaam`. Also classic `INT./EXT./I-E` prefixes. Scene number, location, time, and INT/EXT are extracted. |
| Transition | A bracketed line, or a line whose words are all in the transition vocabulary: `cut, fade, dissolve, flash, flashback, wipe, iris, crosscut, jumpcut, smashcut, matchcut, crossfade, fadeout, fadein`. |
| Dialogue | `NAME (cue): line` for up to 40 characters of name. |
| Voice-over | `OS|V.O.|V.S. (name, language): line`. |
| Parenthetical | `(text)` inside dialogue blocks. |
| Character cue alone | A short all-caps line preceding dialogue. |
| Page numbers / rules | `Page n of m`, bare numbers, and lines of 3+ dashes are removed. |

The renderer is screenplay-styled: scene headings bold uppercase; action full width;
character cues centred uppercase with an optional italic cue; dialogue centred in a
max-width column, left aligned; parentheticals italic; transitions right aligned;
`text-screenplay` typography.

The same grammar is used for the editor reader, the enhancement reader and the V2
output.

---

## 14. Media pipeline

### 14.1 Generation surfaces

| Surface | Text | Image | Video | Audio |
|---|---|---|---|---|
| Script analysis | ✓ (`script_analysis`) | — | — | — |
| Asset extraction | ✓ (`asset-extraction`) | — | — | — |
| Prompt polish (cast) | ✓ (`asset_prompt` text) | — | — | — |
| Look generation (cast/places/props) | — | ✓ (`asset_prompt` image) | — | — |
| Plan/storyboard prompts | ✓ (`universal_text` / `text.generate`) | — | — | — |
| Anchors, asset variants, storyboard frames | — | ✓ | — | — |
| Shot takes | — | — | ✓ | — |
| BGM | — | — | — | ✓ |

### 14.2 File handling `[O]`

- `getFileUrl {items:[{id, sources?}]}` resolves storage keys to signed/CDN URLs,
  returned as an array `{id,url}` or a map keyed `"<id>:<sources>"`.
- Media type is inferred from the extension: video `mp4|webm|mov|avi|mkv`; audio
  `mp3|wav|ogg|aac|flac|m4a`; otherwise image.
- Thumbnails: a hidden `<video>` seeks to 0 (or `end`−0.1 s), draws to a canvas and
  emits a JPEG data URL (quality 0.7). If that fails, the UI falls back to a
  placeholder.
- Images are served through `common/getBigImage` which prefixes the CDN (it does not
  fetch server-side — SSRF tested negative `[D]`).
- `script/exportScript` returns a zip blob; `storyboard/downPreviewImage` returns a
  blob download.
- Uploads: clips and editor images are sent as base64 data URLs
  (`assets/uploadClip`, `editImage/uploadImage`).
- Copying an image to the clipboard requires a secure context; otherwise the UI
  offers Download.

### 14.3 Model catalogue semantics `[O]`

A model row is `{id, value, label, recommended?, logo?, mode[], durationResolutionMap[],
audio?, …}`. The client composes the identifier as `id:value` when `value` has no
colon — e.g. `openai:google/gemini-3.1-flash-image`, `openai:gpt-image-2.5-flare`.
For video it derives spec chips:

- duration range from `durationResolutionMap[].duration` (min–max, else `Ns`);
- highest resolution token (e.g. `1k` → `1K`);
- `audio` when `true` or `"optional"`;
- image-reference count from `mode` entries matching `imageReference:<n>`;
- "Anchoring" when the model is in the anchoring set (Seedance 2.5 only).

`mode` vocabulary: `singleImage` (Single Image), `startEndRequired` / `endFrameOptional`
/ `startFrameOptional` (all shown as "Start & End Frames"), `text` (Text to Video),
`videoReference`, `imageReference`, `audioReference`.

### 14.4 Project poster

`thumbnail{vertical,key,square,web,dvd}`; the UI picks the first available in that
order. Posters are 2:3; the fallback is a deterministic two-colour gradient derived
from a hash of the show name plus initials.

---

## 15. Video editor — feature inventory

The editor is the least-covered surface in the captured bundles: the route, its error
copy and its API exist, but the component chunk was not captured. Everything below is
marked accordingly. **Design the replica to this contract and fill gaps from §19.**

### 15.1 Layout `[O]`

| Region | Contents |
|---|---|
| Top bar | project/episode name, undo/redo (implied), zoom (implied), `Compile` primary action, export/download, back to production. |
| Left — Library | "Your takes and media": generated takes from the workbench (grouped by shot), uploaded clips, audio (BGM + bound audio), images/posters. Click to preview, drag onto the timeline. Search/filter by kind. |
| Centre — Canvas/Preview | Video player for the playhead position; safe-area/frame guides (implied); transport controls (play/pause, frame step, timecode); when nothing is selected, the canvas properties live in the inspector. |
| Right — Inspector | Properties for the selected clip (source, in/out, duration, speed, volume, fit/fill) or for the canvas when nothing is selected (aspect ratio, background). |
| Bottom — Timeline | Ruler + playhead; **V lanes** (picture) above **A lanes** (sound); track headers with mute/solo/lock (implied); clips as blocks with thumbnail strips and waveform for audio. |
| Overlays | Compilations list (rendered outputs), render progress, error toasts, "Timeline not loaded" status screen. |

### 15.2 Timeline model `[O][I]`

| Concept | Contract |
|---|---|
| Track | `{id, projectId, scriptId, duration, medias[]}`; created with `workbench/addTrack {projectId, scriptId, duration}`; deleted with `deleteTrack {id}`. |
| Lane type | `V` = picture, `A` = sound (from the tour text). |
| Clip / media | Persisted as an element of `medias[]` via `saveTrackMedias {projectId, trackId, medias}`; each references a source (`assetsId`/`videoId`/`url`), a timeline start, an in-point and a duration. Exact field names beyond `medias` are `[?]`. |
| Split | Keyboard `S` splits the clip at the playhead. `[O]` |
| Delete | `Delete` removes the selected clip. `[O]` |
| Drag | Drag from library to a lane; drag clips to move between lanes/time; snapping (implied). |
| Selection | Single selection drives the inspector; multi-select (implied). |
| Playhead | Scrub ruler, frame-step, timecode display (implied). |
| Zoom | Timeline zoom (implied; not in captured code). |
| Undo/redo | Implied by editor convention; not confirmed. |

### 15.3 Feature matrix for the replica

| Feature | Priority | Evidence | Notes for replica |
|---|---|---|---|
| Multi-track timeline (V/A lanes) | must | `[O]` tour + track APIs | Start with 2 video + 2 audio lanes, growable. |
| Add/reorder/delete tracks | must | `addTrack`, `deleteTrack` | Track duration set at creation. |
| Drag clips from library | must | `[O]` tour | Group takes by shot; show source state. |
| Trim (in/out) | must | `[I]` | Inspector numeric fields + edge drag. |
| Split at playhead (`S`) | must | `[O]` | Also a toolbar button. |
| Delete clip (`Delete`) | must | `[O]` | With undo. |
| Move clip between lanes / time | must | `[I]` | Prevent overlap or ripple; choose ripple-off default. |
| Preview playback of composite | must | `[O]` canvas | HTML5 video elements synced to one clock, or a canvas compositor. |
| BGM: generate, list, attach | must | `generateBgm`, `pollBgm`, `getBgmList`, `saveTrackMedias` | BGM generation is a project/script-level job with polling. |
| Use asset-bound audio | must | `getAudioBindAssetsList` | Voices/dialogue audio. |
| Upload clip / image | must | `uploadClip`, `editImage/uploadImage` | base64 payload; size limits unknown. |
| Compile / export | must | `[O]` tour, "Compilations" | Server-side render (ffmpeg) → downloadable MP4; list of past renders. |
| Export single frame/poster | should | `[I]` (canvas thumbnails exist) | PNG at playhead. |
| Volume / fade | should | `[I]` | Inspector per clip; fade handles. |
| Speed / reverse | should | `[I]` | Inspector. |
| Fit / fill / crop | should | `[I]` | Canvas/inspector. |
| Subtitles / captions | could | `[?]` | Not observed; keep out of v1. |
| Transitions | could | `[?]` | Not observed. |
| Text/title overlays | could | `[?]` | Not observed. |
| Keyframes / effects | won't (v1) | none | Out of scope. |
| Multi-episode compile | could | `[?]` | Episode-scoped in production; editor is per episode `[I]`. |
| Statutory warning overlay | should | `detectStatutoryWarning`, `updateTrackStatutoryWarning` | Detect in prompts, store per track, render as a card/overlay. |
| Continuity panel reference | could | continuity APIs | Reference side panel, not a timeline element. |

### 15.4 Render/compile contract (proposed for replica) `[I]`

```
POST /api/production/workbench/... compile   (exact endpoint unknown)
  → {jobId}  → poll → {status:'rendering'|'ready'|'failed', url, duration, size}
Compilations list → [{id, episodeId, url, createdAt, status}]
```

Because the exact compile endpoint was not observed, the replica should implement
`POST /api/production/editor/compile` and a `GET …/compilations` list, and keep the
naming isolated so it can be renamed when the real contract is discovered.

---

## 16. AI Director and agents

- Every show and the production workbench expose a **Director**: a chat panel that
  accepts plain-language change requests for the current episode. `[O]`
- Streaming endpoint: `GET /api/chat/stream?isolationKey=<projectId>:<agent>:<scriptId>`.
  It returns 204 when no stream exists for that key and 401 unauthenticated; it is
  membership-scoped. `[D]`
- Agent memory is fetched with `POST /api/agents/getMemory`. `[D]`
- `POST /api/project/getModelDetails {key:'productionAgent'}` returns `{think:bool}`,
  used to decide whether to show the Director's reasoning. `[O]`
- Prompt tools in the workbench (`generateVideoPrompt`, `repromptVideoPrompt`,
  `repromptImagePrompt`, `generateContinuityPrompt`) are separate, non-chat calls;
  the Director is the conversational wrapper.
- Agents named in the client: a production agent (`productionAgent`), plus per-step
  agents implied by the isolation key. Exact roster is `[?]`.

---

## 17. Localization, theming, accessibility, telemetry

| Area | Behaviour |
|---|---|
| Locale | 7 locales; `Accept-Language` from `<html lang>`; `locale` in every JSON body; `cachedLocale` in `localStorage`. |
| Themes | Light / Dark / Auto, three preview tiles, persisted in `localStorage` key `setting`, applied pre-hydration to avoid flash. Editor font size options XS–XXL (12–22 px). |
| Typography scale | `hero, title, heading-lg/md/sm, body-lg/md/sm, label, label-sm, caption, overline, data, screenplay, indic`. |
| Colour tokens | `surface-1/2/3`, `border`, `border-strong`, `muted/subtle-foreground`, `brand`, `brand-wash`, `brand-text`, `brand-gradient`, `success`, `warning`, `info`, `destructive`, `scrim`, `skeleton`, `ring`. |
| A11y | Skip link, `aria-current` on nav, roving tab focus, `role="tablist"` on episode tabs, `aria-busy` skeletons, `prefers-reduced-motion` respected (`motion-safe:`), `sr-only` alternatives for icons, focus rings. |
| Responsive | Sidebar collapses under `md`; mobile top bar + slide-over; grids 1/2/4 columns; editor is desktop-first, tablet minimum `[I]`. |
| Analytics | Sentry browser + replay; navigation spans; API spans with `area/status/path`; feature tags (`feature: production`, `area: payment`). |
| PWA | `manifest.webmanifest`, icons, install prompt row in the profile menu. |

---

## 18. Implications for the clean-room replica

1. **Contract-first.** Adopt the `{code,message,data}` envelope and the
   `POST`-by-default API shape so the front end can be ported route-for-route.
   Implement `x-agency-id` middleware and 404-for-foreign-objects from day one.
2. **Two credit modes.** Build the ledger/wallet once with a mode switch:
   `vulnerable` (client `concurrentCount`, hold = concurrency × unit, settlement may
   go negative, org bonus 1000, self-invite allowed) and `fixed` (atomic
   `items × unit` reserve, server clamps, no negative balance, identity-bound bonus,
   membership caps). The lab (§Outcome B) drives both from the same engine.
3. **Mock providers behind the model abstraction.** `modelSelect/getModelList` +
   `getModelDetail` are enough to drive the UI; return a small catalogue with the
   same metadata (`mode`, `durationResolutionMap`, `audio`, `recommended`,
   `anchoring`) and generate deterministic placeholder images/videos with ffmpeg.
4. **Script grammar is the spine.** Implement the parser in §13 first; every later
   screen (episodes, enhancement, extraction, plan, storyboard) consumes its output.
   Keep both authoring modes (explicit markers + human screenplay).
5. **Progress is server-computed.** Return `progress.stages` and let the client derive
   bars/dots; do not compute progress in the browser.
6. **One flow engine for jobs.** `{status: pending|generating|completed|failed}` plus
   polling endpoints (`pollingImage`, `pollScriptAssets`, `checkVideoStateList`,
   `pollBgm`, `pollingContinuityPanel`) is the same pattern five times; build one
   job table with `kind`, `subjectId`, `state`, `result`, `error`.
7. **Editor scope.** Ship timeline + tracks + clips + trim/split + BGM + preview +
   server render first; leave transitions/text/keyframes out of v1.
8. **Copy rules.** Short functional labels only; the product voice is terse, film-set
   flavoured ("take", "scene", "closed set"), with sentence-case buttons and no
   exclamation marks. Keep user-facing strings in one dictionary per surface.
9. **Do not copy** proprietary source, marketing prose, sample scripts, or the
   provider prompt templates. Reproduce behaviour, not text.

Suggested build order (aligns with `docs/PLAN.md`): contracts + seed → auth/workspaces/
wallet → projects/scripts/parser → setup (look/director/models) → enhancement →
extraction/cast → plan/storyboard/video (mock providers) → editor + ffmpeg compile →
billing lab → E2E.

---

## 19. Unknowns and open questions

### 19.1 Not captured / not observed

1. **Production step payloads.** `plan/getPlan`, `generatePlan`, `derived/getDerived`
   request/response bodies (only names). What exactly is a "plan" (scenes → shots →
   beats?) and how it links to storyboard rows.
2. **Storyboard rows.** Field names beyond `id`, `prompt`, `videoDesc`, `url`,
   `status`; whether a row is a shot, a beat or a frame; ordering field.
3. **Video take request.** `generateVideo` and `batchGenerateVideo` bodies; model and
   duration selection granularity; whether duration is per shot or per take.
4. **Editor compile endpoint and response**, file format/bitrate, resolution policy,
   where "Compilations" is stored, retention.
5. **Track/media JSON.** Exact `medias[]` element schema (start/in/out/volume/
   transforms), lane count limits, whether `V`/`A` are fixed indices or dynamic.
6. **Compilations UI** beyond the tour sentence.
7. **Novel module.** Data model, chapter structure, continuity mechanics, and the
   "turn it into a show" conversion call.
8. **Platform console.** All screens and APIs (404 from normal accounts).
9. **Anchoring semantics.** How `anchor` relates to scenes versus shots; the
   "wide reference images that lock each scene's layout" flow.
10. **Continuity panel semantics.** What a "marker" is, how versions are compared,
    whether the panel is an image or a text prompt bundle.
11. **Model catalogue contents.** Full list, per-model credit multipliers, why
    `gpt-image-2.5-flare` returned a different model's output (routing observation in
    evidence; not pursued as a finding).
12. **Video credit price** beyond the reported ≈134 per 5 s clip; whether duration
    scales linearly.
13. **Enhancement price** per episode (cost chip exists; value unknown).
14. **Plan/asset-variant credit prices.**
15. **BGM model, duration, and price.**
16. **Extraction group size** default and price curve (`groupSize` param exists).
17. **Quota/limits**: max episodes per show, max projects per workspace, max members,
    max upload size, max batch size (100 accepted; cap unknown).
18. **`concurrentCount` validation**: only `1` and `1e9`-clamped were probed; other
    accepted ranges unknown.
19. **Pricing page content** (client-rendered; plan data known, marketing copy not).
20. **Support FAQ answers** (collapsed, not in HTML).
21. **Referral programme** — advertised, no implementation found in the app.
22. **`/series` and `/slate`** gating logic and content when signed in.
23. **Session refresh endpoint** (`/auth/refreshToken`) contract.
24. **Google sign-in** flow (button exists; Firebase popup/redirect details unknown).
25. **Logout revocation** — old `kronicleToken` remains valid until expiry `[D]`.
26. **Whether look/directing style are truly immutable after setup** (copy says so;
    server enforcement not tested).
27. **Delete-after-generate refund** behaviour (report: unproven).
28. **Multi-episode compile / season export.**
29. **Statutory-warning detection** inputs/outputs (text flags? region?).
30. **Voice assets**: voice catalogue, TTS provider, per-language lip-sync behaviour.

### 19.2 Decisions the replica must make

| Question | Recommendation |
|---|---|
| Exact `medias[]` schema | Define now (see §15.2) and document as the replica's contract; keep a `raw` passthrough for unknown keys. |
| Compile approach | Server-side ffmpeg job with a JSON edit-decision list; store renders on disk. |
| Provider mocks | Deterministic image (gradient + text), video (colour bars + timecode), audio (tone), so E2E is stable. |
| Credit precision | Store as decimal strings or integer micro-credits; the real system uses 6-decimal floats (e.g. 7.0224, −7.026371). |
| Script storage | One row per episode, `type` v1/v2, `sortIndex`, `episodeNumber`; keep the `activeScriptId` pointer so `getScrptApi` matches. |
| Timezones | Epoch seconds everywhere (`createdAt`), render in `X-Timezone`. |

---

## 20. Evidence index

| Source | What it proves |
|---|---|
| `docs/REFERENCE-OBSERVED.md` | Stack, route list, first API inventory, credit-bug summary. |
| `reports/KRONICLE-BILLING-SECURITY-REVIEW.md` | Wallet/ledger shapes, hold vs settlement, plans, order/verify/webhook, role matrix, tenancy behaviour, untested list. |
| `reports/KRONICLE-CREDIT-FARMING-CHAIN.md` | Bonus values, invite mechanics, aggregation, ledger reasons, quantification. |
| `raw/js-app/1k9c1lbv3potc.js` | Production API client (all `/production/*` calls + arg shapes), model catalogue semantics, media helpers, thumbnail generation. |
| `raw/js-app/07fzdyo9hkea8.js` | App shell, nav + permission map, project progress, workspace/agency API, settings menu, tours, sample scripts, profile menu. |
| `raw/js-app/1p340vf7t5jj6.js` | Project API + payloads, wallet detail, permissions store, settings defaults (batch size 5, script 40k, timeout 600 s), locales. |
| `raw/js-app/1jt-d28ieg8q7.js`, `0-2j9g2vf380d.js`, `0lraqytbiqfsj.js`, `13b-kvie2ldan.js`, `0t1bcv9qd9vch.js` | Home composer, create-from-script payload, split screen, episode list, delete/block reasons, look picker copy. |
| `raw/js-app/21xsn094kf7n9.js` | Enhancement screen: state model, generate/updateV2 payloads, dialogs, per-episode status, extract gating. |
| `raw/js-app/2nwx43xhixhqv.js` | Add-episodes modal, regex pattern generation, plans/quote helpers, show card modals. |
| `raw/js-app/0h7sacrz21vf_.js` | Billing: plans, quote actions, order/verify, Razorpay options, polling, failure UX. |
| `raw/js-app/00s8tve7jjvhs.js` | Screenplay parser and renderer, PDF/DOCX extraction, episode tabs. |
| `raw/js-app/2q-ipm499qot8.js` | Axios client, interceptors, headers, credit/session/permission error handling. |
| `raw/js-app/1hg8hnitxfoa8.js` | Brand/company facts, CDN bases, progress-message sets, status-screen copy keys. |
| `raw/js-app/398vwxki-l4io.js`, `214n00mr__ia3.js` | Status screens (404/403/waitlist/maintenance/500/503/editor load/workspace disabled). |
| `raw/js-app/0hlq0xhidc5lp.js` | Complete route manifest. |
| `evidence/raw/credit-bypass*`, `control-3-text`, `concurrent-count`, `independent-verify*` | Hold vs settle numbers, `concurrentCount` behaviour, ledger rows. |
| `evidence/raw/payment/` | Plan response, order response, tamper results, webhook rejection. |
| `evidence/raw/chain/`, `hetmehtaa-chain/`, `signup-bonus/` | Agency list shape, invite shape, bonuses, wallet transitions. |
| Live read-only fetches | `/` marketing structure, `/pitch` form fields, `/support` topics, `/series` and `/slate` sign-in gate, `listPlans` public response. |

_End of teardown._
