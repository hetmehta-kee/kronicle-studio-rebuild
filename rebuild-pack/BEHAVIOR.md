# Behaviour specification

Every user-visible flow, its state transitions, and the edge cases the rebuild
must reproduce. Copy in quotes is the replica's copy unless marked
"(reference)" for observed live wording.

---

## 1. Actors and states

| Actor | Can |
|---|---|
| Visitor | request OTP, see plans, open demo (local) |
| New user | verify OTP, onboard, create a personal or org workspace |
| Viewer | read projects, open editor, chat (read), no generation |
| Editor | create/edit projects, generate, upload, move projects |
| Admin | everything, plus members, billing, workspace settings |
| Owner | the admin who created the agency; cannot be removed by others |

Project stages: `script → assets → plan → variants → storyboard → video`.
Script extract state: `0` not extracted, `1` extracted, `-1` cancelled.
Asset: `ready → completed`; storyboard: `image_ready`; clip/video: `ready`.

---

## 2. Boot and session

1. The shell calls `GET /api/auth/me`.
2. `200` → render the app with the user, permissions, credits, active agency.
3. `401` and `DEMO_MODE` on → `POST /api/demo/session`, then retry `/me`.
4. `401` otherwise → `/login`.
5. The active agency is remembered in `localStorage.agencyId`; the API client
   sends it as `x-agency-id`. Switching workspaces reloads the shell data.
6. Logout clears the cookie; the old JWT remains valid until expiry (known
   low finding), so a copied token is not revoked.

---

## 3. Authentication

### 3.1 Request OTP

- Input: work email. Empty/invalid → inline error, no request.
- Success: switch to the 4-digit code screen, copy:
  "Check your email" / "We sent a 4-digit code to {email}. It expires in 5 minutes."
- Resend is disabled with a countdown (`Resend in 0:13`), then enabled.
- Server returns `verification_id`; the local build also returns `dev_code`.

### 3.2 Verify OTP

- Four single-digit inputs; typing auto-advances; backspace goes back; paste
  fills all four.
- Wrong code → "Invalid OTP"; expired → "OTP Expired, Please try again".
- The verify button is disabled until four digits are present.
- Success → cookie set; if the user is new → `/onboarding`; else `/home` or the
  `next` query param.
- 10 wrong attempts had no lockout in the observed live build (OBS-001).

### 3.3 Onboarding

- Fields: display name, workspace name, type (personal / organisation).
- Personal → 100 credits; organisation → 1,000 credits.
- Creates the agency, membership (admin), wallet, bonus ledger row, marks the
  user onboarded.
- Redirect to `/home`.

---

## 4. Workspaces and team

### 4.1 Workspace switcher

- Lists every membership; the active one is marked.
- Switching sends the new `x-agency-id`; all lists (projects, wallet, team)
  reload.
- A switched-off workspace shows: "This workspace has been switched off" /
  "Its projects and credits are paused. Contact support, or open another
  workspace."

### 4.2 Invite flow

1. Admin opens Settings → Team → Invite.
2. Enters email + role (`admin`/`editor`/`viewer`).
3. Server creates a 32-byte token, 7-day expiry, bound to the email; sends the
   invite link (or returns it locally).
4. Invitee opens `/invite/<token>`; must be signed in as the invited email.
5. Accept → membership created; redirect to the workspace.
6. Errors: wrong email → 403; expired/used token → "This invite is invalid or
   has expired"; already a member → idempotent/already-in message.

Inviting does **not** credit the invitee. The org bonus is tied to agency
creation, not membership.

### 4.3 Roles

- Admin can change any member's role, except demoting the last admin.
- Editor cannot invite, change roles, remove members, pay, or delete projects.
- Viewer is read-only.
- Removing a member revokes their access immediately; their personal wallet is
  untouched.
- Leaving: an owner must transfer ownership or the request fails.

### 4.4 Upgrade personal → org

- Adds team features and the org label.
- In the observed live build it did **not** add a second bonus and did **not**
  reset a negative balance.

### 4.5 Move project

- Admin selects a destination workspace.
- Allowed only if the caller may add projects to the target.
- Cross-tenant target → 403 "You are not allowed to add projects to the target
  workspace"; the project stays put.
- After a legitimate move, generation on the project charges the destination
  wallet.

---

## 5. Home

- Heading: "What are we making today?" (reference).
- Input: paste a script, drop a file (TXT/MD/DOCX/PDF), or type an idea.
- "Analyse" is disabled while empty or busy.
- Recent shows: grid of project cards with ratio, name, relative time; empty
  state "No shows yet — Paste a script above to make your first show."
- Credits pill: balance, link to Billing.
- New project CTA: "New".

### 5.1 Analyse

1. `analyzeScript` holds 3 credits and settles immediately.
2. Splits by blank lines; one paragraph = one episode; otherwise a single
   episode.
3. Returns episode names (first sentence, max 48 chars), word counts,
   estimated seconds (`words / 2.6`), estimated minutes (`words / 150`),
   suggested name/ratio/style.
4. The UI shows the episode list and "Create" action.
5. Empty text → 400; > 2,000,000 chars → "Script too long".

### 5.2 Create project

- Uses the analysed episodes (or one default), the chosen name and model
  defaults.
- Creates the project + scripts; redirect to `/project/<id>`.
- No extra charge for creation in the replica.

---

## 6. Project screen

Tabs: **Script**, **Cast & places**, **Plan**, **Storyboard**, **Video**.
Header: project name, ratio, credits; actions "Make shoot-ready" and
"Extract assets" when applicable.

### 6.1 Script

- Lists episodes: `EP 1 · <name>`, status ("assets extracted"), text.
- Edit/save script (editor+).
- "Extract assets" runs `extractAssets`: names become assets of type
  role/scene/tool (round-robin), script marked extracted. Hold 4 credits;
  settle 4.
- "Make shoot-ready" runs `scriptEnhancement`: prefixes `SHOOT-READY`, adds a
  note, charges `scripts × 3.135`.
- Cancel extraction sets `extract_state=-1`; polling reports it.

### 6.2 Cast & places

- Cards for role/scene/tool assets with look image, name, type, state.
- "Generate prompt" (batch polish) writes a cinematic prompt; charge per item
  (hold 3.135 each, settle actual).
- "Generate look" (batch image) produces an image per asset; hold 7.0224 per
  active item, settle ~7.026.
- A look can be locked; history keeps previous images.
- Empty state: "No cast or places yet — extract assets from the script."

### 6.3 Plan

- "Generate plan" requires at least one script and one asset; otherwise 400
  "Extract the assets for this episode before building the plan".
- Produces JSON: lens, pacing, 3 scenes × 6 shots with framing/move.
- Charge 3.135 (text unit); stored on `plans`.

### 6.4 Storyboard

- "Generate frames" creates `shots` frames (default 6, max 12) with image
  prompts and camera notes.
- Hold: vulnerable `min(shots, cc ?? shots) × 7.0224`; fixed `shots × 7.0224`.
- Frames show as a grid; each has a preview and a video prompt.

### 6.5 Video

- "Generate clip" takes the first storyboard frame, renders a clip, creates a
  video row and a clip on the video track.
- Charge 134 (video unit).
- "Open editor" navigates to `/editor/<projectId>`.
- Empty state: "Generate a clip from the first storyboard frame, then cut it in
  the editor."

---

## 7. Generation behaviour (all stages)

- A request validates scope and items **before** any hold.
- Hold succeeds → work starts; the UI shows a progress/pending state.
- Settlement runs asynchronously (job or timer) with the actual cost.
- Failure → `settleCredits(..., "failed")` refunds the hold.
- Insufficient credits → 402 `{message:"Insufficient credits"}`; the UI shows
  "Not enough credits" with the balance and a top-up link.
- A batch is processed item by item in the replica; each item gets its own
  hold/settle. Peak held is one unit with `cc=1` (the F-001/F-003 shape).
- Results are polled (`pollScriptAssets`, `pollingImage`, `checkVideoStateList`
  on the live contract) or refreshed after the request.

---

## 8. Editor

Route `/editor/<projectId>`. Header: project name, "N clips · N tracks ·
N credits", Save, Compile.

- **Media pool**: storyboard frames ("Shot 1…N") and generated clips; clicking
  adds a 2 s clip at the end of the video track.
- **Preview**: selected clip (video or image) or the compiled export.
- **Inspector**: start, duration, trim in/out; move ±500 ms; Split at playhead;
  Delete.
- **Timeline**: video/audio lanes, clips positioned by `start_ms`, playhead
  ruler, click to seek, `+0.5s` step.
- **Keyboard**: `S` splits, Delete/Backspace removes.
- **Save** persists tracks+clips (`saveFlowData`), replacing the project's
  timeline.
- **Compile** sends clips sorted by start to `editor/export`; the API trims,
  concatenates and writes an MP4; the inspector shows "Compilation ready" +
  "Open MP4".
- Empty state: "Select a clip, or add storyboard frames from the media pool."
- Export errors surface inline; a failed clip remains selected.

---

## 9. Billing

### 9.1 Billing screen

- Balance (negative shown in destructive colour), held, total.
- Plans: 100/₹100, 220/₹200, 550/₹500; "Buy credits".
- Ledger: generation rows with gen type, status, held/delta, actor, time.
- "Top up" opens the checkout.

### 9.2 Checkout

1. `createOrder {planId, currency}` → server order (amount/credits from plan).
2. Razorpay checkout opens with `keyId` + `gatewayOrderId`; no client amount.
3. On success, the client polls `getOrder` and/or calls `verifyPayment`.
4. `verifyPayment` validates the HMAC and marks the order paid; the wallet is
   credited once.
5. Failure/cancel → order stays pending; no credit.
6. Wrong currency → 409 "Prices changed for your location, reload the plans".
7. Pending orders are visible as pending; no double credit on retry.

### 9.3 Ledger semantics

- Top-up: `+credits`, completed.
- Hold: `balance → held`, pending row.
- Settle: `held → 0`, `balance -= actual`, completed row with delta.
- Failure: hold refunded, failed row.
- Negative balance is possible in the vulnerable build; UI shows it in
  destructive colour.

### 9.4 Lab modes

- `BILLING_MODE=vulnerable` reproduces the hold collapse for testing.
- `BILLING_MODE=fixed` reserves `items × unit`.
- The billing lab (`labs/billing-abuse`) models 10 orgs and vulnerable vs fixed.

---

## 10. Chat

- Input at the project level; send on Enter.
- `POST /api/chat/send` returns the user + assistant messages.
- `POST /api/chat/stream` streams SSE deltas; the UI appends tokens and ends on
  `[DONE]`.
- `getMemory` loads the last 40 messages on open.
- Reply is grounded in project state: counts of scripts, completed looks,
  plan, frames, clips, and the next recommended stage.
- A foreign project id → 404, no transcript leak.
- Empty message → no request; long message is truncated in the reply quote.

---

## 11. Uploads

- Image: png/jpeg/webp, base64 data URL, max 40 MB.
- Clip: mp4/webm/mov, same cap.
- The server stores a UUID filename derived from the MIME type; the client gets
  `/media/uploads/<uuid>.<ext>`.
- Uploading an image with an `assetId` in the same project adds it to history
  and updates the primary look.
- Unsupported type → 400 "Unsupported type …"; empty → 400; oversize → 400.

---

## 12. Demo and lab

- Root `/` → `/home`; with `DEMO_MODE` on and no session, the shell creates
  `demo@kronicle.studio`, org "Kronicle Studio", **10,000 credits**, and a
  seeded "The Lighthouse Keeper" project (script, 3 looks, plan, 6 frames,
  clip). `/welcome` holds the marketing page.
- `/login?lab=1` exposes the lab form: `researcher@kronicle.local` /
  `research-3000!`, org "Research Lab", **3,000 credits**.
- Both endpoints are loopback-only and 404 with `DEMO_MODE=false`.

---

## 13. Error, loading and empty states

| Situation | Behaviour |
|---|---|
| Loading lists | skeleton/spinner; no layout jump |
| Empty projects | "No shows yet" + analyse prompt |
| Empty assets | "No cast or places yet" |
| Empty frames | "Generate frames" CTA |
| No clip | "Select a clip…" |
| 401 | redirect to `/login` |
| 402 | "Not enough credits" + top-up |
| 403 | inline "Forbidden — your role does not include …" |
| 404 on a project | "Not found" screen/back to home |
| 500 | generic "Something went wrong"; no stack to the client |
| Network error | inline retry; no silent success |

---

## 14. Concurrency and races

- The wallet check and hold are not transactional across requests in the
  vulnerable build; parallel batches can all pass the check.
- Settlement is idempotent on a pending row.
- Project save replaces tracks/clips in a transaction-like sequence; a partial
  failure should roll back in a rebuild.
- Two invites to the same email: the newest token wins; old ones should be
  revocable.
- Two checkout success callbacks: the order status guard prevents double
  credit (verify this in a rebuild with a unique constraint/transaction).

---

## 15. Data lifecycle

- Deleting a project is a soft delete; children remain for audit.
- Deleting an agency test tenant should remove memberships, invites, projects,
  ledger and wallet in one transaction.
- Media files are not deleted when a row is soft-deleted; a cleanup job should
  remove orphans after a retention window.
- The ledger is append-only; corrections are adjustments, never deletes.
