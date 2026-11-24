# PRD — Kronicle clean-room replica (`kronicle.kee`)

## 1. Product
A local-first, fully working replica of the Kronicle AI micro-drama studio:
script → episodes → enhancement → cast/places → plan → variants → storyboard →
video → timeline editor → export. The backend runs without third-party keys; every
provider is a deterministic mock. A billing lab reproduces the observed credit
engine in `vulnerable` and `fixed` modes.

## 2. Users and jobs
- **Creator (personal)** — make a short episode from a script; 100 free credits.
- **Studio admin** — create an org (1000 credits), invite editors/viewers, buy
  credits, see usage.
- **Editor** — create/edit projects and generate; no billing or member management.
- **Viewer** — read-only.
- **Researcher** — run the lab, compare vulnerable/fixed, read the detector.

## 3. Scope
### Auth
- Email OTP (4 digits, 5 min), dev code returned to the client for the replica.
- JWT `kronicleToken` cookie (2 h), `x-agency-id` workspace header.
- Roles: admin/editor/viewer with the observed permission keys.
- Invite tokens: 32 random bytes, 7 days, email-bound.

### Workspaces
- Personal (100 credits) or org (1000 credits) at onboarding; one workspace per
  account for the farm model; orgs can invite.
- Member list, invites, role changes, remove/leave, rename, upgrade, move project.

### Credits / billing
- Wallet: balance, held, total; append-only ledger.
- Quote → hold → settle. Unit prices: text 3.135, image 7.0224, video 134,
  extract 4, analysis 3.
- Plans: ₹100/100, ₹200/220, ₹500/550; mock orders + HMAC signature + webhook;
  `mockPay` for the demo.
- `BILLING_MODE=vulnerable|fixed` (vulnerable is the observed behaviour; fixed is
  the recommended policy).

### Studio
- Analyze a pasted script into episodes (suggested name, ratio, style).
- Create a project + V1 scripts.
- Extract assets from the script (role/scene/tool), edit descriptions.
- Generate prompts and image looks.
- Build a plan (lens, pacing, 3 scenes × 6 shots).
- Generate storyboard frames.
- Generate a 2 s video clip from a frame.

### Editor
- Media pool, one video track (extendable), clip blocks.
- Select, move, trim in/out, set start/duration, split at playhead, delete.
- Save the timeline; compile with ffmpeg to an MP4.
- Preview images/video in the player.

### Billing lab
- Shared engine, two policies, farm-org aggregation, parallel batches.
- ₹ target (10 orgs = ₹10,000), $ provider target, amplification.
- Detector rules D1–D4.

## 4. Backend design
- **Runtime**: Node 22+ (tested 26), Express 4, `node:sqlite` (`DatabaseSync`),
  zod 3, JWT, ffmpeg CLI.
- **Tables**: users, otps, agencies, memberships, invites, wallets, ledger,
  projects, scripts, assets, asset_images, plans, storyboards, tracks, clips,
  videos, orders (see `docs/REFERENCE-OBSERVED.md`).
- **Auth**: cookie/Bearer JWT; `authRequired` + `adminOnly` +
  `requirePermission`; `x-agency-id` membership check.
- **Billing**: `holdCredits`, `settleCredits`, `computeHold`; one ledger row per
  batch. `BILLING_MODE` changes the hold formula only.
- **Providers**: `svgImage`, `renderClipVideo`, `exportTimeline`; replace with real
  adapters (OpenAI/Replicate/Volcengine, Razorpay, S3) behind the same functions.
- **Video**: ffmpeg re-encode per clip (720×1280, 30 fps, yuv420p), concat demuxer
  for the cut.

## 5. Non-functional
- Runs offline; no real keys; no payment network.
- `pnpm dev` boots both apps; typecheck passes.
- Data in `apps/api/storage`; reset by deleting the DB.
- Clean-room: no proprietary source/assets/long copy.

## 6. Success criteria
- A new user can complete the full flow in under five minutes and export an MP4.
- Billing page adds credits via mock pay and shows the ledger.
- Team invite creates a copyable email-bound link; accept joins the org.
- Lab prints vulnerable vs fixed and the ₹10,000 / $10,000 models with detector
  flags.

## 7. Out of scope (next iterations)
- Novel/webnovel, platform console, assets library, support/legal.
- BGM, continuity panels, image-flow editor, uploads, transitions, ducking,
  multi-track drag/drop, Remotion titles.
- Real providers/payments/email/S3; automated tests/CI.

## 8. Risks
- **IP**: clean-room only; the UI copies structure, not proprietary files.
- **Abuse**: the vulnerable mode is a lab; never point it at the live service.
- **Provider cost**: mocks keep the demo free; real adapters need budgets and caps.
- **Version drift**: research recommends Next 16 / Zod 4 / Node 26 `Database`;
  upgrade after feature parity.
