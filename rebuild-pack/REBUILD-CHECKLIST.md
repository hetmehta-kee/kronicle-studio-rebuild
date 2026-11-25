# Rebuild checklist

Ordered plan to rebuild the replica from this pack. Each phase ends with an
acceptance check; do not move on until it passes.

---

## 0. Prerequisites

- Node 24 + pnpm.
- ffmpeg on PATH (export/clips).
- Ports: web **3210**, API **4000**.
- Repo layout:

```
kronicle/
  apps/api/
  apps/web/
  packages/shared/
  labs/billing-abuse/
  rebuild-pack/
```

---

## 1. Workspace and shared package

- [ ] `pnpm-workspace.yaml` includes `apps/*`, `packages/*`, `labs/*`.
- [ ] `packages/shared/src/index.ts` exports:
  - roles + permissions,
  - `PLANS` (100/₹100, 220/₹200, 550/₹500),
  - `BONUS` (personal 100, org 1000),
  - `UNIT` (text 3.135, image 7.0224, video 134, extract 4, analysis 3),
  - `holdFor(items, cc, unit, mode)` and `round6`.
- [ ] Typecheck passes.

**Acceptance:** `pnpm --filter @kronicle/shared typecheck` clean.

---

## 2. Database

- [ ] Create `apps/api/src/db.ts` with `DatabaseSync`, WAL, `foreign_keys`.
- [ ] Apply `rebuild-pack/schema.sql`.
- [ ] Add helpers: `one`, `all`, `run`, `now`, `uuid`; user/agency/membership/
      wallet helpers; `createAgency` (admin membership + wallet); `ledger`.
- [ ] Add the `assets.prompt_state` migration.

**Acceptance:** a fresh `storage/kronicle.db` has all tables; `PRAGMA
integrity_check` returns `ok`.

---

## 3. Auth

- [ ] `request-otp` → 4-digit code, 5 min, `verification_id`.
- [ ] `verify-otp` → id+email+code+expiry+unused; create user; JWT; cookie.
- [ ] `authRequired` → bearer/cookie, reload user, resolve agency, membership.
- [ ] `requirePermission` / `adminOnly`.
- [ ] `/api/auth/me` shape (user, permissions, abilities, credits, access).
- [ ] Logout clears cookie.

**Acceptance:** login with a disposable inbox; wrong code 400; foreign
`x-agency-id` 403; no token 401.

---

## 4. Onboarding and bonuses

- [ ] `POST /api/user/onboard` creates agency + membership + wallet + bonus.
- [ ] Personal 100; org 1,000; ledger row written.
- [ ] `upgradeToOrg` does not double-grant (match the observed behaviour).

**Acceptance:** new personal wallet = 100; new org = 1,000; ledger shows the
bonus.

---

## 5. Tenancy

- [ ] Invite with 32-byte token, 7-day expiry, email-bound.
- [ ] Accept validates the signed-in email.
- [ ] List members/invites; change role; remove; leave; rename; revoke/resend.
- [ ] `moveProject` checks the target permission; cross-tenant 403.
- [ ] `getClientConfig` returns defaults + model registry.

**Acceptance:** invite to A cannot be accepted by B; editor cannot invite;
moveProject to a foreign agency 403.

---

## 6. Wallet

- [ ] `walletDetail` = balance/held/total.
- [ ] `holdCredits`: check balance, move to held, pending ledger.
- [ ] `settleCredits`: pending-only, release + delta, failed refunds.
- [ ] `creditWallet`: completed top-up/adjustment.
- [ ] `quoteItems` for all six actions with the formulas in
      `MODELS-AND-PRICING.md`.
- [ ] `BILLING_MODE` vulnerable/fixed.

**Acceptance:** hold 3.135 appears in held; settle moves it; double settle is a
no-op; insufficient credits 402.

---

## 7. Projects and pipeline

- [ ] `analyzeScript`: split, estimates, suggestions, 3-credit charge.
- [ ] `createFromScript` / `addProject` / `editProject` / `delProject`.
- [ ] Scripts CRUD; `extractAssets` (names → role/scene/tool); cancel/poll;
      enhancement.
- [ ] Assets list/counts; prompt polish; image batch; history.
- [ ] Plan generation; storyboard frames; flow data; save flow; add track;
      generate video.
- [ ] Mock media: `svgImage`, `renderClipVideo`, `exportTimeline`.

**Acceptance:** one project runs script → assets → looks → plan → frames →
clip; every stage scoped by agency; media URLs resolve under `/media`.

---

## 8. Jobs

- [ ] `jobs` table + worker (1 s tick, conditional claim, 3 attempts, backoff).
- [ ] `registerJob("settle")` calls `settleCredits`.
- [ ] Replace every `setTimeout` money path with `enqueueJob("settle", …)`.
- [ ] `GET /api/system/jobs` (admin).

**Acceptance:** restart the API mid-hold; the pending row settles after boot
exactly once.

---

## 9. Chat, uploads, URL writers

- [ ] `chat/send`, `chat/stream` (SSE), `agents/getMemory`; project scoping.
- [ ] `uploadClip`, `uploadImage`; MIME allowlist; UUID names; 40 MB cap.
- [ ] URL writers with `SECURITY_MODE` vulnerable/fixed.

**Acceptance:** SSE emits start/deltas/done; foreign project 404; a 41 MB
upload 400; fixed mode blocks a cross-tenant URL write.

---

## 10. Editor

- [ ] Load flow data; media pool; add clip; select; split; trim; move; delete;
      save; compile.
- [ ] Export trims + concatenates with ffmpeg; returns a URL.

**Acceptance:** add two frames, split one, save, compile; the MP4 opens and is
the expected duration.

---

## 11. Billing

- [ ] Plans endpoint.
- [ ] `createOrder` uses the server plan; currency guard 409.
- [ ] `getOrder` owner-scoped.
- [ ] `verifyPayment` HMAC + owner; credit once.
- [ ] Webhook HMAC over raw body; idempotent.
- [ ] `mockPay` dev-only (404 in production).
- [ ] Ledger UI shows hold/settle.

**Acceptance:** tampered amount ignored; fake signature 400; another
workspace's order 404; invalid webhook 401; paid order credits once.

---

## 12. Web screens

- [ ] Login (OTP + resend + lab form at `?lab=1`).
- [ ] Onboarding.
- [ ] Shell: workspace switcher, credits, nav.
- [ ] Home: analyse, recent shows, empty state.
- [ ] Project: Script, Cast & places, Plan, Storyboard, Video.
- [ ] Editor.
- [ ] Settings: General, Team, Billing, Usage.
- [ ] Invite accept.
- [ ] Marketing at `/welcome`; root redirects to `/home`.

**Acceptance:** a fresh browser can go login → onboard → create → generate →
edit → compile without a console error.

---

## 13. Demo and lab

- [ ] `DEMO_MODE` on: root opens the studio; demo session 10,000 credits;
      seeded "The Lighthouse Keeper".
- [ ] Lab login: `researcher@kronicle.local` / `research-3000!`, 3,000 credits.
- [ ] Loopback-only; disabled by `DEMO_MODE=false`.

**Acceptance:** a new isolated browser context opens `/home` with 10,000
credits and compiles the seeded clip.

---

## 14. Security verification

- [ ] F-001/F-003: batch `cc=1` hold is one unit; fixed holds N.
- [ ] F-002: org bonus 1,000; invite does not credit the invitee.
- [ ] F-004: fixed mode 404 cross-tenant; 400 wrong flow.
- [ ] OBS-002: fixed build cannot go negative.
- [ ] Payment matrix in `SECURITY.md` all negative.
- [ ] No transfer/grant routes.

**Acceptance:** the vulnerable/fixed toggles flip the results exactly as
documented.

---

## 15. Operations

- [ ] `.env.example` with every variable.
- [ ] `pnpm dev` starts API + web.
- [ ] Health: `/api/version`; jobs: `/api/system/jobs`.
- [ ] Backup `storage/` + DB together.
- [ ] Typecheck + smoke script.

**Acceptance:** from a clean clone, following this checklist produces a working
studio at `http://localhost:3210` and an API at `http://localhost:4000`.
