# Billing abuse lab — specification

**Status:** draft v1.0 · 24 November 2026
**Package:** `labs/billing-abuse` (`@kronicle/lab`)
**Source reports:** `KRONICLE-BILLING-SECURITY-REVIEW.md`,
`KRONICLE-CREDIT-FARMING-CHAIN.md` (authorised engagement `web-20261124-073125`)
**Safety:** play money only. Mock providers only. Never the live service.

---

## 0. TL;DR

The lab runs the **same billing API** in two modes selected by one server-side flag:

| Mode | Hold formula | Result |
|---|---|---|
| `vulnerable` | `hold = min(items, concurrentCount ?? 1) × unit` | 100-item batch holds 7.02 image credits, settles ~702.6; wallets go negative |
| `fixed` | `hold = items × unit` (atomic) | 100-item batch holds 702.24; a 1,000-credit org can afford one batch |

With the observed bonuses (`org_bonus +1000`, `signup_bonus +100`) and
self-invite aggregation, the vulnerable engine reaches **$10,000 of mock provider
cost with 10 farm orgs + 1 main login, 1,424 batches of 100 images** (142,400
images, 1,000,502.4 credits, **99.06× amplification** over 10,100 free credits).
The fixed engine needs **~1,180–1,425 verified identities** (including the main
login) for the same $10,000 — linear, identity-bound, capped and detectable.

The lab exists to reproduce that contrast safely, not to scale the attack.

---

## 1. Purpose and scope

### 1.1 What the lab proves

1. The credit-hold defect is a **billing-integrity** defect, not a UI quirk:
   reservation is scoped to a client-supplied concurrency window instead of the
   batch.
2. The defect **composes** with the workspace invite model and the org bonus:
   one login can be admin of N farm orgs and spend N wallets.
3. A **fixed engine** with six controls removes the amplification and makes the
   abuse linear, bounded and visible.
4. An **abuse detector** can identify the chain from ledger, batch, wallet,
   membership, device and IP data alone.

### 1.2 Non-goals

- Not a production billing engine. The fixed engine is a reference
  implementation, not a certified ledger.
- Not a load test, scanner or live-target tool.
- No real payments, real Razorpay calls, real AI provider keys or real emails.
- No copying of proprietary source, assets or long marketing copy. The lab is a
  clean-room reproduction of observed behaviour and contracts.

### 1.3 Safety invariants (non-negotiable)

| Invariant | Enforcement |
|---|---|
| No network egress | Provider adapters are injected mocks; `fetch` is stubbed in tests and throws |
| No live target | No hostname from the engagement is present in config, fixtures or tests |
| No real money | All balances are synthetic credits; USD is a lab rate card |
| No real PII | Synthetic emails, IDs, IPs and device IDs only |
| Vulnerable mode is local-only | Binds `127.0.0.1`; requires `LAB_ALLOW_VULNERABLE=1`; refuses `NODE_ENV=production` |
| Fixed is the default | `BILLING_MODE` defaults to `fixed`; vulnerable requires an explicit choice and a red startup banner |

---

## 2. The observed defect

### 2.1 The chain in one diagram

```
attacker
  │
  ├─ M: main login (one identity, one browser profile)
  │    └─ personal workspace: signup_bonus +100
  │
  ├─ for i in 1..N:
  │    F_i: disposable email → OTP → onboard as org
  │         └─ farm_i: org_bonus +1000
  │         └─ inviteMember(email=M, role=admin) → token
  │    M: acceptInvite(token) → admin of farm_i
  │
  └─ M: x-agency-id: farm_i
       └─ batch with I items, concurrentCount=1
            hold  = min(I, 1) × unit = unit
            settle = I × unit
            → provider work is done; wallet goes negative
```

The attacker controls both sides of every invite, so email binding, role checks
and the `x-agency-id` membership check all pass legitimately. No payment
instrument is involved.

### 2.2 Observed baseline (authorised engagement)

| Observation | Value |
|---|---|
| Personal bonus | `signup_bonus +100` |
| Org bonus | `org_bonus +1000` |
| Invited user | also receives a personal `+100` |
| Text unit | `3.135` credits/item |
| Image unit | `7.0224` credits/item |
| 100-item text batch, `cc=5` | held `15.675`, settled `212.068715` |
| 10-image batch, `cc=5`, balance `65.338791` | held `35.112`, settled `71.598596`, final `-6.259805` |
| 20-item text batch, `cc=1` | held `3.135` |
| 5-item text batch, `cc` omitted | held `3.135` (default 1) |
| 3 × 10-item text, parallel, `cc=1` | total held `9.405` for 30 items |
| One login, three wallets | `100 + 1000 + 314.839515 = 1,414.839515` credits |
| 3-item text batch, `cc=1`, farm wallet | held `3.135`, settled `8.447101` across 3 rows; farm balance `988.009133` after the project's other charges |

The per-item settlement varies with provider and model. The lab treats the
**hold unit** and **settlement unit** as separate profile inputs so the observed
variance can be reproduced without pretending it is exact.

### 2.3 Why the existing controls do not stop it

| Control | Why it passes |
|---|---|
| `x-agency-id` membership check | M really is an admin of every farm org |
| Invite email binding | Attacker owns the inviter and invitee inboxes |
| Role checks | Admin is *intended* to invite and spend |
| Balance check | Passes on the one-item hold; settlement happens later |
| Payment gateway | Not involved; no payment is made |
| Per-request item cap | At least 100 items accepted; still enough to amplify |

### 2.4 Finding mapping

| Finding | Root cause | Lab control | Tests |
|---|---|---|---|
| F-001 / F-003 | Client-controlled `concurrentCount` collapses the hold | Full-batch reserve, server concurrency, negative block | TC-01…TC-08, TC-11 |
| F-002 | 1,000 credits per disposable-email org | Identity-bound bonus, verification, org-creation caps | TC-05, TC-09, TC-10 |
| Aggregation | One login can be admin of N orgs | Membership/invite caps, ring detection | TC-09, TC-13 |
| Abuse visibility | Negative balances and hold/batch mismatch were not alerted | Detector D1…D10 | TC-13, TC-14 |

---

## 3. Engine contract: same API, one mode flag

### 3.1 Mode selection

The mode is **server-side configuration**, never a billing request parameter.
A client must not be able to choose the vulnerable engine.

| Surface | Value |
|---|---|
| Environment | `BILLING_MODE=vulnerable` or `BILLING_MODE=fixed` (default `fixed`) |
| CLI | `--mode vulnerable` or `--mode fixed` |
| Persisted config | `lab_config` key `engine_mode` |
| Lab API | `GET /api/lab/config` → `{ mode, vulnerableAllowed }` |
| Local switch | `POST /api/lab/mode` (localhost only; vulnerable requires `confirm: "VULNERABLE"`) |

Startup guards for vulnerable mode:

```text
BILLING_MODE=vulnerable
  requires LAB_ALLOW_VULNERABLE=1
  requires NODE_ENV !== "production"
  binds 127.0.0.1 only
  prints a red banner and writes an audit event
```

`fixed` is the only mode allowed for any non-loopback bind.

### 3.2 Shared routes

Both modes expose identical routes, methods and response shapes:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/user/onboard` | create personal or org workspace; grant bonus |
| `POST` | `/api/agency/inviteMember` | invite an email with a role |
| `POST` | `/api/agency/acceptInvite` | accept an email-bound token |
| `GET` | `/api/agency/getMyAgency` | list workspaces and roles |
| `GET` | `/api/wallet/detail` | wallet balance, held, available |
| `GET` | `/api/wallet/transactions` | ledger page |
| `POST` | `/api/wallet/quote` | price a batch |
| `POST` | `/api/assetsGenerate/batchPolishAssetsPrompt` | text batch |
| `POST` | `/api/assetsGenerate/batchGenerateImageAssets` | image batch |
| `POST` | `/api/production/workbench/batchGenerateVideo` | video batch |
| `POST` | `/api/payment/createOrder` | mock order (play money) |
| `POST` | `/api/webhooks/mock-provider` | mock settlement callback |

The route handlers call a `BillingPolicy`; they do not branch on mode.

### 3.3 Strategy interface

```ts
export interface BillingPolicy {
  readonly mode: "vulnerable" | "fixed";

  quote(input: QuoteInput): Quote;
  reserve(tx: Tx, quote: Quote): ReserveResult;   // atomic
  settle(tx: Tx, batch: Batch, actual: SettleInput): SettleResult;
  grantBonus(tx: Tx, identity: Identity, workspace: Workspace): GrantResult;
  canInvite(tx: Tx, invite: InviteInput): InviteDecision;
  canSpend(tx: Tx, wallet: Wallet, amountMicro: number): SpendDecision;
}
```

- `VulnerablePolicy` implements the observed formulas and permissive invitation
  and spending rules.
- `FixedPolicy` implements section 6.
- A contract test instantiates both with the same fixtures and asserts response
  shape parity; only the documented policy outcomes differ.

### 3.4 Parity rules

1. Same JSON field names, same status codes for validation (400) and auth (401/403).
2. Policy refusals use stable codes: `INSUFFICIENT_CREDITS` (402),
   `MEMBERSHIP_LIMIT` (403), `SELF_INVITE_RING` (403), `SPEND_CAP` (429),
   `BONUS_ALREADY_GRANTED` (409), `SETTLEMENT_BLOCKED` (409),
   `MODE_MISMATCH` (409).
3. Every response includes `engineMode` in lab endpoints; billing responses may
   include it only in development.
4. No route-level `if (mode === ...)`; a lint rule rejects it.
5. The ledger schema is identical; only the values and allowed invariants differ.

### 3.5 Safety guards

- `POST /api/lab/reset` requires `{ "confirm": "RESET" }`.
- `POST /api/lab/mode` is loopback-only and refuses vulnerable mode without
  `LAB_ALLOW_VULNERABLE=1`.
- The server logs every mode change to `audit_events`.
- The CLI prints the mode in every command header and in JSON output.
- The vulnerable dashboard shows a persistent red banner:
  `VULNERABLE ENGINE — PLAY MONEY — DO NOT EXPOSE`.

---

## 4. Billing formulas

### 4.1 Definitions

| Symbol | Meaning | Storage |
|---|---|---|
| `I` | `items.length` — number of items in the batch | integer |
| `u` | hold unit price, credits per item | micro-credits |
| `s` | settlement unit price, credits per item | micro-credits |
| `c` | client `concurrentCount` | integer or omitted |
| `H` | batch hold, credits | micro-credits |
| `S` | batch settlement, credits | micro-credits |
| `credits` | wallet total credits (may go negative in vulnerable mode) | micro-credits |
| `held` | reserved credits | micro-credits |
| `available` | `credits - held` | micro-credits |

Money is stored as **integer micro-credits** (`1 credit = 1,000,000 micro`) to
avoid floating-point drift. Display uses six decimal places.

### 4.2 Vulnerable engine

The exact observed form is:

```text
hold       = min(items, concurrentCount ?? 1) × unit
settlement = items × unit
```

Generalised for the lab (separate hold and settlement unit prices):

```text
c_eff = min(max(c ?? 1, 1), I)          // c omitted → 1; values > I clamp to I
H     = min(I, c ?? 1) × u              // exact observed formula
S     = I × s                           // settlement is per item
accept iff available ≥ H                // one balance check at submission
on settle: held = held - H; credits = credits - S
```

Equivalent integer form:

```text
c_eff_micro = min(max(c ?? 1, 1), I)
H_micro     = min(I, c ?? 1) * u_micro
S_micro     = I * s_micro
accept      = (credits_micro - held_micro) >= H_micro
```

Notes:

- The hold is **decoupled from the batch**. `H` depends on `c`, not on `I`,
  except when `c > I`.
- Only the first `c` items are notionally covered by the hold. The remaining
  `I - c` items are dispatched and settled without a fresh balance check.
- Settlement may take `credits` below zero. The vulnerable engine does not
  reject it; the provider work has already happened.
- Parallel submissions each run the same check. If all holds are placed before
  any settlement, a wallet supports `floor(credits / H)` batches.

### 4.3 Fixed engine

```text
c_sched = clamp(c ?? 4, 1, 16)          // scheduling hint only, never billing
H       = I × u                         // full-batch atomic reserve
S       = min(I × s, H)                 // never settle above the reserve
accept iff available ≥ H                // atomic conditional update
on settle: held = held - H; credits = credits - S
reject if credits - S < 0               // negative-balance block
```

Key differences:

| Property | Vulnerable | Fixed |
|---|---|---|
| Hold basis | `min(I, c)` | `I` |
| Client role | Chooses the reserve size | Scheduling hint only |
| Reserve atomicity | Per request, not batch-scoped | One conditional `UPDATE` for the whole batch |
| Settlement ceiling | None (`I × s`) | `H` (price ceiling) |
| Negative balance | Allowed | Blocked |
| Parallel amplification | `I / min(I, c)` | 1 |

### 4.4 `concurrentCount` validation

Observed on the target and preserved as contract:

| Input | Vulnerable result | Fixed result |
|---|---|---|
| `1` | accepted; `H = u` | accepted; scheduling `1`; `H = I × u` |
| omitted | accepted; default `1`; `H = u` | accepted; scheduling `4`; `H = I × u` |
| `0` | `400` | `400` |
| `-1` | `400` | `400` |
| `0.5` | `400` | `400` |
| `"1"` (string) | `400` | `400` |
| `1e9` | accepted; `c_eff = I`; `H = I × u` | accepted; scheduling clamp `16`; `H = I × u` |
| `> I` | accepted; `c_eff = I`; `H = I × u` | accepted; scheduling clamp `16` |

The lab must reproduce the `1e9` clamp and the omitted-field default because
they are part of the observed contract. Fixed mode may accept the field but must
never use it for money.

### 4.5 Worked examples

**Example A — text, 20 items, `cc=1`, wallet 1,000**

```text
H = min(20, 1) × 3.135 = 3.135
S = 20 × 2.1207        = 42.414
available after hold    = 996.865
final after settle      = 957.586
```

The vulnerable engine held 3.135 for 42.414 of work. The fixed engine holds
`20 × 3.135 = 62.70`.

**Example B — image, 10 items, `cc=5`, wallet 65.338791**

```text
H = min(10, 5) × 7.0224 = 35.112
S = 10 × 7.1598596      = 71.598596   (recorded batch total)
final                    = -6.259805
```

The fixed engine would require `10 × 7.0224 = 70.224 > 65.338791` and return
`402 INSUFFICIENT_CREDITS` before any job is created.

**Example C — text, 100 items, `cc=5`, wallet 808.771035**

```text
H = min(100, 5) × 3.135 = 15.675
S = 100 × 2.12068715    = 212.068715
final                    = 596.702320
```

The hold was 13.5× smaller than the settlement. Fixed holds
`100 × 3.135 = 313.50`, which fully covers the settlement.

### 4.6 Invariants

Always true in both modes:

```text
available = credits - held
held >= 0
sum(open batch holds) = wallet.held
ledger is append-only; corrections are compensating entries
batch settlement is idempotent (unique idempotency key)
```

Additional fixed-mode invariants:

```text
credits >= 0
settle <= hold
hold = items × unit
one org bonus per identity
memberships per identity <= cap
```

Vulnerable mode intentionally violates `credits >= 0` and `settle <= hold`.
Those violations are the experiment.

---

## 5. Bonuses and self-invite aggregation

### 5.1 Grants

| Grant | Amount | Trigger | Scope |
|---|---|---|---|
| `signup_bonus` | `+100` | first personal workspace onboarding | one per identity |
| `org_bonus` | `+1000` | organisation workspace creation | vulnerable: one per org; fixed: one per verified identity |
| invited user personal | `+100` | first login of an invitee | one per identity |

Ledger reason strings are stable: `signup_bonus`, `org_bonus`, `purchase`,
`generation_hold`, `generation_settle`, `batch_release`.

The landing page's "refer a studio → 5,000 credits" is **not implemented** in the
observed app: no referral endpoint, no `referral` ledger reason, and accepting an
invite did not change the inviter's balance. The lab must not model it.

### 5.2 The invite flow

```text
F_i (farm owner, disposable email)
  POST /api/agency/inviteMember
       { "email": "<M email>", "role": "admin" }
  → 32-byte token, email-bound, 7-day expiry

M (main login)
  POST /api/agency/acceptInvite
       { "token": "<token>" }
  → membership (farm_i, M, admin)

M
  GET /api/agency/getMyAgency
  → [ personal, farm_1, …, farm_N ] with role "admin"
  GET /api/wallet/detail  with  x-agency-id: farm_i
  → farm_i wallet (1000 credits)
```

The attacker controls `F_i` and `M` mailboxes, so the email binding is not a
control. The membership check is not a control either: M is a legitimate admin.

### 5.3 Aggregation graph

```text
identity F_1 ──owns──> workspace farm_1 ──admin──> identity M
identity F_2 ──owns──> workspace farm_2 ──admin──> identity M
...
identity F_N ──owns──> workspace farm_N ──admin──> identity M
identity M   ──owns──> personal workspace (100)

M's org admin memberships: N (personal ownership is separate)
M's spendable wallets: N × 1000 + 100
```

The lab should render this graph in the dashboard and expose
`adminOrgCount(identity)`.

### 5.4 Fixed controls for aggregation

- Inviter and invitee must be **distinct verified identities**, not merely
  distinct email strings.
- Max **2 org admin memberships** per identity (5 memberships total; personal
  ownership does not count).
- Max **1 org creation** per verified identity per 30 days.
- Max **2 org creations** per device/IP per 30 days.
- New-org admin invites require the org to be at least 24 hours old **or** to
  have a paid top-up.
- Shared device/IP between inviter and invitee is blocked for admin invites.
- Disposable email domains are rejected for org owners and admin invitees.
- Max 10 pending invites per org; max 5 invite accepts per identity per 24 hours.

### 5.5 Observed proof to preserve as a fixture

The engagement proved the aggregation on the target with one login as admin of
three wallets:

```text
personal:          100.000000
farm-e (org):    1,000.000000
recon-b-org:       314.839515
total:           1,414.839515
```

A 3-item text batch with `concurrentCount: 1` on the farm wallet held `3.135`
and settled `8.447101`; the farm balance ended at `988.009133` after the
project's other charges (`script_analysis -3`, `asset-extraction -0.543766`),
while the personal wallet stayed untouched. The lab fixture `fx_three_wallets`
should reproduce those numbers with synthetic IDs.

---

## 6. Fixed engine rules

These rules are the reference fix. Each has an enforcement point, a failure mode
and at least one test.

### 6.1 R1 — Full-batch atomic reserve

**Rule:** reserve `I × u` for the entire batch in one transaction, before any
provider job is created.

```sql
BEGIN IMMEDIATE;

UPDATE wallets
SET held_micro = held_micro + :hold_micro,
    version = version + 1,
    updated_at = :now
WHERE id = :wallet_id
  AND credits_micro - held_micro >= :hold_micro;

-- changes() = 0 → ROLLBACK, 402 INSUFFICIENT_CREDITS
```

- One hold row per batch, not per concurrency chunk.
- `hold_micro = items_count * unit_micro` (integer).
- An idempotency key on the batch prevents duplicate holds on retry.
- No dispatch until the hold row commits.

**Failure mode:** a 100-item image batch on a 500-credit wallet returns 402 and
creates zero jobs.

### 6.2 R2 — Server-side concurrency

**Rule:** `concurrentCount` is a scheduling hint only.

```text
c_sched = clamp(c ?? 4, 1, 16)
billing_hold = items × unit          // ignores c_sched
dispatch chunks = c_sched            // affects ordering only
```

- The server never derives money from a client number.
- The scheduler may run 1–16 jobs at a time; each job is already covered by the
  full-batch hold.
- If the scheduler needs a different chunk size, it changes throughput, not price.

**Failure mode:** `cc=1` on a 100-item batch still holds `100 × unit`.

### 6.3 R3 — Identity-bound bonus

**Rule:** the org bonus belongs to a **verified identity**, once.

```text
grant org_bonus iff
  identity.phone_verified = 1 OR identity.payment_verified = 1
  AND no prior org_bonus for this identity
  AND org creation caps pass
```

Schema support: `bonus_grants.policy_key TEXT UNIQUE` is set to
`<identity_id>:org_bonus` in fixed mode and left `NULL` in vulnerable mode
(SQLite allows multiple `NULL`s in a unique index).

- Being invited as admin does **not** grant an org bonus to the invitee.
- Personal `+100` is once per identity, not once per workspace.
- Unverified orgs may exist but receive `0` bonus until verified.
- A verified identity that creates a second org gets no second bonus.
- Normalize email case/whitespace only; plus-addressing must not create a new
  verified identity. Phone/payment binding, not the email string, is the control.

**Failure mode:** the same identity creating three orgs receives one bonus, not
three.

### 6.4 R4 — Invite caps

**Rule:** bound the aggregation graph.

| Cap | Default |
|---|---|
| Admin memberships per identity (org only) | 2 |
| Total memberships per identity | 5 |
| Orgs created per identity / 30 days | 1 |
| Orgs created per device/IP / 30 days | 2 |
| Pending invites per org | 10 |
| Invite accepts per identity / 24 hours | 5 |
| Inviter = invitee identity | deny |
| Shared device/IP for admin invite | deny |
| Disposable email domain for org/admin | deny |

**Failure mode:** M accepts two farm invites; the third returns
`403 MEMBERSHIP_LIMIT`; a same-device invite returns `403 SELF_INVITE_RING`.

### 6.5 R5 — Spend caps

**Rule:** cap velocity and exposure independently of the balance.

| Cap | Default |
|---|---|
| Items per batch | 100 |
| Open batches per workspace | 5 |
| Open batches per identity | 10 |
| Settled credits per workspace / 24h | 1,000 (free), 10× plan (paid) |
| Settled credits per identity / 24h | 5,000 unverified, 25,000 verified |
| Batch submissions per wallet / 60s | 20 |
| Provider cost per identity / 24h | $100 (lab rate card) |

The 1,000-credit free cap allows four 100-item text batches
(`4 × 212.07 = 848.28`) or one 100-item image batch (`702.24`); the next batch is
rejected by the cap even if credits remain.

**Failure mode:** a wallet with 10,000 paid credits still cannot settle more
than the 24-hour cap; the next batch returns `429 SPEND_CAP`.

### 6.6 R6 — Negative-balance block

**Rule:** no wallet may go below zero, and no new work starts at or below zero.

```sql
UPDATE wallets
SET credits_micro = credits_micro - :settle_micro,
    held_micro = held_micro - :hold_micro,
    version = version + 1
WHERE id = :wallet_id
  AND held_micro >= :hold_micro
  AND credits_micro - :settle_micro >= 0;

-- changes() = 0 → ROLLBACK, 409 SETTLEMENT_BLOCKED, alert D3
```

- Settlement is guaranteed `<= hold` by R1 and the price ceiling.
- If a provider price update makes actual exceed the ceiling, the excess is
  **not** taken from the wallet; the batch is flagged `pricing_variance` and the
  difference is absorbed by the platform.
- New batches are rejected when `available <= 0`.
- A negative wallet (legacy/data import) is frozen until reconciled.

**Failure mode:** a forced over-settlement rolls back, leaves the wallet at its
pre-settlement value, marks the batch `settlement_blocked`, and raises D3.

### 6.7 Additional fixed rules

- Re-check `available` before each dispatch chunk (defence in depth).
- Cap `items.length` at the API boundary and in the DB (`CHECK`).
- Idempotency key on submit and settle.
- Ledger append-only; no updates, no deletes.
- Price changes apply to new quotes only; existing holds keep their quoted unit.
- Refunds release the unused hold and never create credits.
- A cancelled batch releases the full remaining hold atomically.

### 6.8 Fixed limits table

Put these in `packages/shared/src/pricing.ts` and mirror them in
`lab_config` so tests can override them explicitly:

```ts
export const FIXED = {
  orgBonus: 1_000,
  personalBonus: 100,
  itemCap: 100,
  maxAdminMemberships: 2,        // org memberships; personal ownership excluded
  maxMemberships: 5,
  orgsPerIdentity30d: 1,
  orgsPerDevice30d: 2,
  pendingInvitesPerOrg: 10,
  inviteAcceptsPerIdentity24h: 5,
  openBatchesPerWorkspace: 5,
  openBatchesPerIdentity: 10,
  dailyWorkspaceCredits: 1_000,
  dailyIdentityCredits: 5_000,
  dailyVerifiedCredits: 25_000,
  submissionsPerMinute: 20,
  schedulerConcurrency: { min: 1, max: 16, default: 4 },
} as const;
```

---

## 7. Relational schema

### 7.1 Money representation

- All credit columns are `INTEGER` micro-credits.
- `1 credit = 1,000,000 micro`.
- Format with `formatCredits(micro) => (micro / 1e6).toFixed(6)`.
- Never use `REAL` for money.
- USD is derived at the presentation layer from `usd_per_credit` and is play
  money.

### 7.2 DDL (SQLite, `node:sqlite`)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE lab_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- engine_mode, org_bonus_micro, personal_bonus_micro,
-- usd_per_credit, item_cap, fixed limits, disposable_domains

CREATE TABLE runs (
  id          TEXT PRIMARY KEY,
  mode        TEXT NOT NULL CHECK (mode IN ('vulnerable','fixed')),
  inputs_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE identities (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  email_domain    TEXT NOT NULL,
  phone_verified  INTEGER NOT NULL DEFAULT 0 CHECK (phone_verified IN (0,1)),
  payment_verified INTEGER NOT NULL DEFAULT 0 CHECK (payment_verified IN (0,1)),
  device_id       TEXT,
  signup_ip       TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE workspaces (
  id                TEXT PRIMARY KEY,
  run_id            TEXT REFERENCES runs(id),
  kind              TEXT NOT NULL CHECK (kind IN ('personal','org')),
  name              TEXT NOT NULL,
  owner_identity_id TEXT NOT NULL REFERENCES identities(id),
  plan              TEXT NOT NULL DEFAULT 'free',
  verified_for_bonus INTEGER NOT NULL DEFAULT 0 CHECK (verified_for_bonus IN (0,1)),
  created_at        TEXT NOT NULL
);

CREATE TABLE memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  identity_id  TEXT NOT NULL REFERENCES identities(id),
  role         TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
  invited_by   TEXT REFERENCES identities(id),
  created_at   TEXT NOT NULL,
  PRIMARY KEY (workspace_id, identity_id)
);

CREATE TABLE invites (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inviter_identity_id TEXT NOT NULL REFERENCES identities(id),
  email              TEXT NOT NULL,
  email_normalized   TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
  token_hash         TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL CHECK (status IN ('pending','accepted','revoked','expired')),
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL,
  accepted_by        TEXT REFERENCES identities(id),
  accepted_at        TEXT
);

CREATE TABLE wallets (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  credits_micro INTEGER NOT NULL DEFAULT 0,
  held_micro    INTEGER NOT NULL DEFAULT 0 CHECK (held_micro >= 0),
  version       INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);

CREATE TABLE batches (
  id                   TEXT PRIMARY KEY,
  run_id               TEXT REFERENCES runs(id),
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id),
  actor_identity_id    TEXT NOT NULL REFERENCES identities(id),
  gen_type             TEXT NOT NULL CHECK (gen_type IN ('text','image','video')),
  items_count          INTEGER NOT NULL CHECK (items_count > 0),
  unit_micro           INTEGER NOT NULL CHECK (unit_micro > 0),
  settle_unit_micro    INTEGER NOT NULL CHECK (settle_unit_micro > 0),
  requested_concurrency INTEGER,
  effective_concurrency INTEGER NOT NULL CHECK (effective_concurrency >= 1),
  hold_micro           INTEGER NOT NULL CHECK (hold_micro >= 0),
  settle_micro         INTEGER,
  status               TEXT NOT NULL CHECK (status IN (
                         'quoted','held','dispatched','settled',
                         'cancelled','rejected','settlement_blocked')),
  idempotency_key      TEXT UNIQUE,
  created_at           TEXT NOT NULL,
  settled_at           TEXT
);

CREATE TABLE batch_items (
  batch_id        TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  item_index      INTEGER NOT NULL CHECK (item_index >= 0),
  provider_job_id TEXT,
  status          TEXT NOT NULL CHECK (status IN ('queued','running','done','failed','cancelled')),
  settle_micro    INTEGER,
  PRIMARY KEY (batch_id, item_index)
);

CREATE TABLE provider_jobs (
  id           TEXT PRIMARY KEY,
  batch_id     TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  item_index   INTEGER NOT NULL,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  cost_micro   INTEGER NOT NULL CHECK (cost_micro >= 0),
  status       TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
  created_at   TEXT NOT NULL
);

CREATE TABLE ledger (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT REFERENCES runs(id),
  wallet_id           TEXT NOT NULL REFERENCES wallets(id),
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
  batch_id            TEXT REFERENCES batches(id),
  item_index          INTEGER,
  entry_type          TEXT NOT NULL CHECK (entry_type IN (
                        'bonus','purchase','hold','settle',
                        'release','refund','adjustment')),
  reason              TEXT NOT NULL,
  gen_type            TEXT CHECK (gen_type IN ('text','image','video')),
  credits_delta_micro INTEGER NOT NULL DEFAULT 0,
  credits_held_micro  INTEGER NOT NULL DEFAULT 0 CHECK (credits_held_micro >= 0),
  held_after_micro    INTEGER NOT NULL CHECK (held_after_micro >= 0),
  balance_after_micro INTEGER NOT NULL,
  available_after_micro INTEGER NOT NULL,
  actor_identity_id   TEXT REFERENCES identities(id),
  idempotency_key     TEXT UNIQUE,
  created_at          TEXT NOT NULL
);

CREATE TABLE bonus_grants (
  id           TEXT PRIMARY KEY,
  identity_id  TEXT NOT NULL REFERENCES identities(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind         TEXT NOT NULL CHECK (kind IN ('signup_bonus','org_bonus')),
  amount_micro INTEGER NOT NULL CHECK (amount_micro >= 0),
  policy_key   TEXT UNIQUE,          -- fixed: '<identity>:<kind>'; vulnerable: NULL
  granted_at   TEXT NOT NULL
);

CREATE TABLE audit_events (
  id           TEXT PRIMARY KEY,
  run_id       TEXT REFERENCES runs(id),
  identity_id  TEXT REFERENCES identities(id),
  workspace_id TEXT REFERENCES workspaces(id),
  device_id    TEXT,
  ip           TEXT,
  event_type   TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);

CREATE TABLE detections (
  id            TEXT PRIMARY KEY,
  run_id        TEXT REFERENCES runs(id),
  rule_id       TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('identity','workspace','wallet','batch','device','ip')),
  subject_id    TEXT NOT NULL,
  summary       TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','closed')),
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_workspaces_owner   ON workspaces(owner_identity_id, created_at);
CREATE INDEX idx_memberships_identity ON memberships(identity_id, role);
CREATE INDEX idx_invites_email_status ON invites(email_normalized, status);
CREATE INDEX idx_batches_workspace  ON batches(workspace_id, created_at);
CREATE INDEX idx_batches_run        ON batches(run_id, created_at);
CREATE INDEX idx_ledger_wallet      ON ledger(wallet_id, created_at);
CREATE INDEX idx_ledger_run         ON ledger(run_id, created_at);
CREATE INDEX idx_bonus_identity     ON bonus_grants(identity_id, kind);
CREATE INDEX idx_audit_device       ON audit_events(device_id, created_at);
CREATE INDEX idx_detections_status  ON detections(status, severity);
```

### 7.3 Invariants and triggers

```sql
CREATE TRIGGER trg_ledger_no_update
BEFORE UPDATE ON ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;

CREATE TRIGGER trg_ledger_no_delete
BEFORE DELETE ON ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;
```

Application-level checks (inside the same transaction as the write):

| Invariant | Check |
|---|---|
| `available = credits - held` | computed, never stored without derivation |
| `held >= 0` | DB `CHECK` + conditional updates |
| open holds equal `wallet.held` | reconciliation query below |
| fixed `credits >= 0` | conditional settle update |
| fixed `hold = items × unit` | policy assertion at reserve |
| fixed `settle <= hold` | policy assertion at settle |
| one org bonus per identity | `bonus_grants.policy_key` unique |
| batch submit idempotent | unique `batches.idempotency_key` |
| settle idempotent | unique `ledger.idempotency_key` |

### 7.4 Reconciliation queries

```sql
-- Wallet totals
SELECT id, credits_micro, held_micro,
       credits_micro - held_micro AS available_micro
FROM wallets;

-- Holds must match open batches
SELECT w.id AS wallet_id,
       w.held_micro,
       COALESCE(SUM(b.hold_micro), 0) AS open_holds_micro
FROM wallets w
LEFT JOIN batches b
  ON b.workspace_id = w.workspace_id
 AND b.status IN ('held','dispatched')
GROUP BY w.id
HAVING w.held_micro != COALESCE(SUM(b.hold_micro), 0);

-- Ledger sum must equal wallet balance
SELECT w.id,
       w.credits_micro,
       COALESCE(SUM(l.credits_delta_micro), 0) AS ledger_sum_micro
FROM wallets w
LEFT JOIN ledger l ON l.wallet_id = w.id
GROUP BY w.id
HAVING w.credits_micro != COALESCE(SUM(l.credits_delta_micro), 0);

-- Negative wallets (vulnerable expected, fixed forbidden)
SELECT w.id, w.workspace_id, w.credits_micro,
       w.credits_micro - w.held_micro AS available_micro
FROM wallets w
WHERE w.credits_micro < 0 OR w.credits_micro - w.held_micro < 0;
```

The initial bonus ledger rows make the sum reconcile: `credits` starts at 0 and
every bonus, purchase, settlement and refund appears in the ledger. Holds have
`credits_delta_micro = 0` and therefore do not affect the sum; they only affect
`held_after_micro`.

---

## 8. Lab architecture

### 8.1 Package layout

```text
labs/billing-abuse/
  package.json                 # name: @kronicle/lab; start → src/cli.ts
  src/
    cli.ts                     # sim, chain, detect, ledger, test, serve, reset, export
    config.ts                  # mode, limits, rate card, paths
    db.ts                      # schema, migrations, transactions
    engine/
      policy.ts                # BillingPolicy interface
      vulnerable.ts            # observed formulas + permissive onboarding
      fixed.ts                 # six fixed rules
      index.ts                 # createPolicy(mode)
    domain/
      identities.ts
      workspaces.ts
      invites.ts
      wallet.ts
      batches.ts
      ledger.ts
    providers/
      mock-text.ts
      mock-image.ts
      mock-video.ts
      index.ts                 # deterministic mock provider registry
    simulator.ts               # pure functions + persisted runs
    detector.ts                # D1…D10
    server.ts                  # 127.0.0.1 dashboard + lab API
    dashboard/
      index.html               # server-rendered or tiny client
      app.js
  test/
    fixtures.ts
    policy.contract.test.ts
    vulnerable.chain.test.ts
    fixed.blocks.test.ts
    simulator.test.ts
    detector.test.ts
    ledger.test.ts
  README.md                    # how to run the lab; links to docs/BILLING-LAB.md
```

`pnpm lab` at the repo root maps to `pnpm --filter @kronicle/lab start`.

Integration: `apps/api` may import `createPolicy` and the wallet service from
`@kronicle/lab`; the standalone lab server mounts the same routes on `:4100`.
Both modes use the `packages/shared` zod contracts and the lab's own SQLite file
(never the replica or production database).

### 8.2 Runtime and config

- Node 22+ (`node:sqlite`, ESM, `node --test`).
- TypeScript executed with `tsx` in dev; `tsc` for typecheck.
- SQLite file at `labs/billing-abuse/.data/lab.db` (gitignored) or `:memory:`
  in tests.
- Deterministic clock and ID generator in tests (`fx_now`, `fx_id_*`).
- No environment secrets. No `.env` required.

```ts
// config.ts (shape)
export interface LabConfig {
  mode: "vulnerable" | "fixed";
  orgBonusMicro: number;        // 1_000_000_000
  personalBonusMicro: number;   //   100_000_000
  usdPerCredit: number;         // 0.01 (play money)
  itemCap: number;              // 100
  vulnerableAllowed: boolean;   // env guard
  fixed: typeof FIXED;
}
```

### 8.3 Billing routes

The lab mounts the same route names as the replica API, backed by the selected
policy:

| Route | Vulnerable behaviour | Fixed behaviour |
|---|---|---|
| `POST /api/user/onboard` | org → `+1000` | org → `+1000` only if verified and first org |
| `POST /api/agency/inviteMember` | any admin may invite | caps, distinct identity, device/IP checks |
| `POST /api/agency/acceptInvite` | accepts, adds membership | caps, ring checks |
| `POST /api/assetsGenerate/...` | `H = min(I, c) × u` | `H = I × u` |
| `GET /api/wallet/detail` | may show negative | never negative |
| `POST /api/wallet/quote` | returns vulnerable `H` | returns fixed `H` |

The route layer validates with zod (same schemas in both modes), then calls
`policy.reserve` / `policy.settle`. It never computes money itself.

### 8.4 Lab routes

Localhost only, no CORS, no auth (documented as a local research tool):

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/lab/health` | liveness, mode, version |
| `GET` | `/api/lab/config` | active mode, limits, rate card |
| `POST` | `/api/lab/mode` | switch mode (guarded) |
| `POST` | `/api/lab/simulate` | pure simulation; persists a run |
| `POST` | `/api/lab/run` | execute the mock chain (creates identities/orgs/batches) |
| `POST` | `/api/lab/verify-identity` | mock phone/payment verification (no SMS, no charge) |
| `GET` | `/api/lab/runs` | run list |
| `GET` | `/api/lab/runs/:id` | run summary |
| `GET` | `/api/lab/runs/:id/batches` | batch table |
| `GET` | `/api/lab/runs/:id/ledger` | ledger rows |
| `GET` | `/api/lab/runs/:id/detections` | detector output |
| `POST` | `/api/lab/detect` | re-run detector for a run |
| `POST` | `/api/lab/reset` | wipe lab DB (confirm `RESET`) |

`POST /api/lab/simulate` request:

```json
{
  "mode": "vulnerable",
  "orgs": 10,
  "itemsPerBatch": 100,
  "unitPrice": 7.0224,
  "settleUnitPrice": 7.026,
  "batches": 1424,
  "concurrency": 1,
  "targetUsd": 10000,
  "usdPerCredit": 0.01,
  "includePersonal": true
}
```

Response: the simulator output object in section 9.2.

`/api/lab/simulate` may model either mode without changing the server.
`/api/lab/run` executes under the active server mode and returns `409
MODE_MISMATCH` if the requested mode differs; switch with `/api/lab/mode` first.

### 8.5 Mock providers

| Provider | Behaviour | Cost |
|---|---|---|
| `mock-text` | returns a deterministic string after 5–20 ms | `settleUnit × items` |
| `mock-image` | returns a 1×1 PNG data URI | `settleUnit × items` |
| `mock-video` | returns a 0-byte MP4 placeholder | `settleUnit × clips` |

- No network calls, no API keys, no real model output.
- Optional `--fail-rate` for settlement tests; failures release the hold and
  create no debit.
- Optional `--latency-ms` to make parallel batches observable in the dashboard.
- The provider registry is injected into the engine; tests replace it with a
  synchronous fake.
- Identity verification is mocked too: `POST /api/lab/verify-identity` sets
  `phone_verified`/`payment_verified` without sending an SMS or charging a card.
  Fixed-mode fixtures may seed verified identities directly.

### 8.6 Determinism

- Run IDs are monotonic (`run_0001`).
- Identity/workspace/batch IDs are deterministic per fixture.
- Timestamps come from a clock interface; tests freeze it.
- Simulator uses integer micro-credits and documented rounding.
- A run can be exported and replayed from `inputs_json`; the result must match.

---

## 9. Simulator

### 9.1 Inputs

| Flag | Meaning | Default |
|---|---|---|
| `--orgs N` | number of farm orgs | `10` |
| `--items I` | items per batch | `100` |
| `--unit U` | hold unit price, credits/item | `7.0224` |
| `--settle-unit S` | settlement unit price, credits/item | `7.026` |
| `--batches B` | requested batch count | capacity |
| `--concurrency C` | client `concurrentCount` | `1` (vulnerable), `4` (fixed scheduling) |
| `--mode` | `vulnerable` or `fixed` | `fixed` |
| `--target-usd` | impact target | `10000` |
| `--usd-per-credit` | lab rate card | `0.01` |
| `--org-bonus` | override org bonus | `1000` |
| `--personal-bonus` | override personal bonus | `100` |
| `--no-personal` | exclude the main personal wallet | included |
| `--format` | `table`, `json`, `jsonl` | `table` |

### 9.2 Outputs

```json
{
  "runId": "run_0007",
  "mode": "vulnerable",
  "inputs": {
    "orgs": 10,
    "itemsPerBatch": 100,
    "unitPrice": 7.0224,
    "settleUnitPrice": 7.026,
    "batches": 1424,
    "concurrency": 1,
    "targetUsd": 10000,
    "usdPerCredit": 0.01,
    "includePersonal": true
  },
  "freeCredits": 10100,
  "holdPerBatch": 7.0224,
  "holdsPerOrg": 142,
  "personalHolds": 14,
  "batchesPerOrg": 142,
  "personalBatches": 14,
  "capacityBatches": 1434,
  "executedBatches": 1424,
  "itemsDelivered": 142400,
  "providerCredits": 1000502.4,
  "chargedCredits": 1000502.4,
  "absorbedCredits": 0,
  "providerUsd": 10005.024,
  "amplification": 99.06,
  "finalBalanceCredits": -990402.4,
  "negativeWallets": 11,
  "target": {
    "targetUsd": 10000,
    "batchesNeeded": 1424,
    "orgsNeeded": 10,
    "identitiesNeeded": 11,
    "freeCreditsForTarget": 10100,
    "providerCreditsForTarget": 1000502.4,
    "chargedCreditsForTarget": 1000502.4,
    "absorbedCreditsForTarget": 0,
    "providerUsdForTarget": 10005.024,
    "amplificationForTarget": 99.06,
    "feasible": true
  },
  "warnings": []
}
```

Definitions:

- `freeCredits` — bonuses under the run's N orgs, plus the personal wallet if
  included.
- `holdPerBatch` — `H` under the selected mode and concurrency.
- `holdsPerOrg` — `floor(orgBonus / H)`; the parallel reserve capacity of one
  farm wallet. This is the vulnerable capacity basis.
- `personalHolds` — `floor(personalBonus / H)`.
- `batchesPerOrg` — sustainable batches per org under the mode:
  vulnerable = `holdsPerOrg` (all holds placed before settlement);
  fixed = `H > orgBonus ? 0 : 1 + floor((orgBonus - H) / S)` (sequential, with
  the unused hold released after each settlement).
- `personalBatches` — the same calculation for the personal wallet.
- `capacityBatches` — `orgs × batchesPerOrg + personalBatches`.
- `executedBatches` — `min(requested batches, capacityBatches)`.
- `providerCredits` — actual mock provider work, `executedBatches × items ×
  settleUnit`. This is **not** capped by the hold.
- `chargedCredits` — wallet debit under the mode's settlement rule. Fixed mode
  caps the debit at the hold; the difference is `absorbedCredits`.
- `absorbedCredits` — `providerCredits - chargedCredits`; the platform's
  `pricing_variance` in fixed mode.
- `providerUsd` — `providerCredits × usdPerCredit`.
- `amplification` — `providerCredits / freeCredits`; impact per free credit.
- `finalBalanceCredits` — `freeCredits - chargedCredits` (aggregate; per-wallet
  values are in the ledger).
- `negativeWallets` — wallets whose charged credits exceed their bonus. Allocate
  the personal wallet first, then org wallets in ID order.
- `batchesNeeded` — `ceil((targetUsd / usdPerCredit) / (items × settleUnit))`;
  the target is provider cost, so the uncapped provider rate is used.
- `orgsNeeded` — smallest N such that capacity covers `batchesNeeded`, using the
  personal wallet first.
- `identitiesNeeded` — `orgsNeeded + 1` (the main login).
- `feasible` — false when `batchesPerOrg = 0` (the hold exceeds the org bonus) or
  caps make the path impossible.

### 9.3 Formulas

```ts
const free =
  orgs * orgBonus + (includePersonal ? personalBonus : 0);

const holdPerBatch = mode === "fixed"
  ? items * unit
  : Math.min(items, concurrency ?? 1) * unit;

const holdsPerOrg = Math.floor(orgBonus / holdPerBatch);
const personalHolds = includePersonal
  ? Math.floor(personalBonus / holdPerBatch)
  : 0;

const settlePerBatch = mode === "fixed"
  ? items * Math.min(settleUnit, unit)   // wallet debit, capped at price ceiling
  : items * settleUnit;

const providerPerBatch = items * settleUnit;   // actual provider work, uncapped

// Vulnerable: parallel holds. Fixed: sequential batches, unused hold released.
const batchesPerOrg = mode === "fixed"
  ? (holdPerBatch > orgBonus
      ? 0
      : 1 + Math.floor((orgBonus - holdPerBatch) / settlePerBatch))
  : holdsPerOrg;

const personalBatches = includePersonal
  ? (mode === "fixed"
      ? (holdPerBatch > personalBonus
          ? 0
          : 1 + Math.floor((personalBonus - holdPerBatch) / settlePerBatch))
      : personalHolds)
  : 0;

const capacity = orgs * batchesPerOrg + personalBatches;
const executed = Math.min(batches ?? capacity, capacity);

const providerCredits = executed * providerPerBatch;
const chargedCredits = executed * settlePerBatch;
const absorbedCredits = providerCredits - chargedCredits;
const providerUsd = providerCredits * usdPerCredit;
const amplification = providerCredits / free;
const finalBalance = free - chargedCredits;

const batchesNeeded = Math.ceil(
  (targetUsd / usdPerCredit) / providerPerBatch
);
const orgsNeeded = batchesPerOrg === 0
  ? null
  : Math.ceil(
      Math.max(0, batchesNeeded - personalBatches) / batchesPerOrg
    );
```

All credit arithmetic is done in micro-credits; the formulas above are shown in
credits for readability.

**Parallel regime assumption:** all holds are placed before any settlement, and
the reserve transaction serializes them. This is the attack's best case and the
number the report quantifies. A serial regime (settle between submissions) is
strictly weaker for the attacker; the lab may expose `--serial` for comparison
but the default is parallel.

### 9.4 Profiles and the $10,000 table

Lab profiles (settlement units are the measured or extrapolated averages):

| Profile | Hold unit | Settle/item | Items/batch | Hold/batch | Holds per 1k | Work per 1k wallet | Batches for $10k | Orgs for $10k | Free credits | Amplification |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| text | 3.135 | 2.1207 | 100 | 3.135 | 318 | 67,438 | 4,716 | 15 | 15,100 | 66.23× |
| image | 7.0224 | 7.026 | 100 | 7.0224 | 142 | 99,769 | 1,424 | 10 | 10,100 | 99.06× |
| video (10 clips) | 134 | 134 | 10 | 134 | 7 | 9,380 | 747 | 107 | 107,100 | 9.35× |
| video (100 clips) | 134 | 134 | 100 | 134 | 7 | 93,800 | 75 | 11 | 11,100 | 90.54× |

Numbers in the table include the main personal wallet (`+100`, 14 image holds,
31 text holds). Without the personal wallet, image needs 11 orgs for $10k; text
still needs 15. Free credits always include the personal 100, even when
`holdPerBatch > 100`; in that case the personal wallet can hold zero batches.
The `$10k` tables use `batches = batchesNeeded`; omitting `--batches` runs the
full capacity, which can exceed the target.

**Vulnerable totals at $10k:**

| Profile | Orgs | Main login | Batches | Items/clips | Provider credits | Provider USD | Final aggregate balance |
|---|---:|---:|---:|---:|---:|---:|---:|
| text | 15 | 1 | 4,716 | 471,600 | 1,000,122.12 | $10,001.22 | −985,022.12 |
| image | 10 | 1 | 1,424 | 142,400 | 1,000,502.40 | $10,005.02 | −990,402.40 |
| video (10) | 107 | 1 | 747 | 7,470 | 1,000,980.00 | $10,009.80 | −893,880.00 |
| video (100) | 11 | 1 | 75 | 7,500 | 1,005,000.00 | $10,050.00 | −993,900.00 |

**Fixed contrast (same request shapes):**

| Profile | Hold/batch | Batches per 1,000-credit org | Batches for $10k | Orgs for $10k | 10 orgs provider cost |
|---|---:|---:|---:|---:|---:|
| text, 100 items | 313.50 | 4 | 4,716 | 1,179 | $84.83 |
| image, 100 items | 702.24 | 1 | 1,424 | 1,424 | $70.26 |
| video, 10 clips | 1,340 | 0 (hold > bonus) | — | infeasible without paid credits | $0.00 |

The image figure is **provider cost**; the 10 wallets are debited $70.22
(`702.24` each), and $0.04 of price variance is absorbed.

Fixed text gets a fourth batch because settlement (212.07) is below the hold
(313.50): the unused reserve returns, leaving 151.72 credits after four batches.
The fifth batch needs a 313.50 hold and is rejected. Identities for $10k are
`orgs + 1` (the main login): 1,180 text, 1,425 image.
The fixed engine turns a 10-org chain into a ~1,180–1,425-identity cost centre.
That is the point of the lab: the fix does not make bonus abuse impossible; it
makes it **linear, identity-bound, capped and visible**.

**Rate-card caveat:** `$0.01 per credit` is a lab assumption, not Kronicle's real
COGS. Every table is reproducible with `--usd-per-credit`; do not present the USD
figures as measured provider invoices. The credit figures are the measured-based
model; the USD figures are play money.

### 9.5 CLI examples

The vulnerable examples assume `LAB_ALLOW_VULNERABLE=1`; without it the CLI
refuses the mode.

```bash
# Vulnerable image chain that reaches $10k
pnpm lab sim \
  --mode vulnerable \
  --orgs 10 \
  --items 100 \
  --unit 7.0224 \
  --settle-unit 7.026 \
  --batches 1424 \
  --concurrency 1 \
  --target-usd 10000 \
  --format json

# Same request through the fixed engine
pnpm lab sim \
  --mode fixed \
  --orgs 10 \
  --items 100 \
  --unit 7.0224 \
  --settle-unit 7.026 \
  --batches 1424 \
  --target-usd 10000 \
  --format json

# Execute the mock chain (creates identities, orgs, invites, batches, ledger)
pnpm lab chain \
  --mode vulnerable \
  --orgs 10 \
  --items 100 \
  --unit 7.0224 \
  --batches 1424

# Detector over the last run
pnpm lab detect --run run_0007

# Ledger and export
pnpm lab ledger --run run_0007 --format table
pnpm lab export --run run_0007 --out ./evidence/lab-run-0007

# Dashboard
pnpm lab serve --port 4100
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | success |
| `2` | fixed policy blocked the requested chain |
| `3` | detector raised one or more high/critical findings |
| `4` | simulation infeasible (hold exceeds bonus, caps) |
| `5` | invariant/reconciliation failure |

### 9.6 Sample output (fixed, same inputs as the vulnerable chain)

```json
{
  "mode": "fixed",
  "orgs": 10,
  "freeCredits": 10100,
  "holdPerBatch": 702.24,
  "holdsPerOrg": 1,
  "personalHolds": 0,
  "batchesPerOrg": 1,
  "personalBatches": 0,
  "capacityBatches": 10,
  "executedBatches": 10,
  "itemsDelivered": 1000,
  "providerCredits": 7026,
  "chargedCredits": 7022.4,
  "absorbedCredits": 3.6,
  "providerUsd": 70.26,
  "amplification": 0.696,
  "finalBalanceCredits": 3077.6,
  "target": {
    "batchesNeeded": 1424,
    "orgsNeeded": 1424,
    "identitiesNeeded": 1425,
    "freeCreditsForTarget": 1424100,
    "providerCreditsForTarget": 1000502.4,
    "chargedCreditsForTarget": 999989.76,
    "absorbedCreditsForTarget": 512.64,
    "providerUsdForTarget": 10005.024,
    "amplificationForTarget": 0.7025,
    "feasible": true
  },
  "warnings": [
    "10 orgs deliver 0.7% of the $10,000 target under the fixed engine"
  ]
}
```

### 9.7 Sensitivity and assumptions

- **Items per batch** is the largest lever. Image at 10 items/batch needs ~101
  orgs; at 100 items/batch, 10 orgs. The API cap (≥100 observed) is therefore a
  real control, not a detail.
- **Unit price** scales the hold and the settlement linearly in the same
  direction; it changes the org count only through rounding.
- **Settlement ratio** (`settle/unit`) is the amplification multiplier. Text
  settled below its hold unit in the 100-item sample (2.12 vs 3.135), yet the
  batch amplification still reached 13.5× because the hold was one item.
- **Provider throughput** is not modelled. The 142 holds per wallet can be
  submitted quickly; the provider may take much longer to complete 14,200
  images. The lab reports cost, not wall-clock.
- **Rate limits / OTP friction** are not modelled in the simulator. The live
  service showed `UPDATE_APP` after repeated OTP sends; that is operational
  friction, not a billing control.
- **Video** is only dangerous when a batch contains multiple clips: with
  `items=1`, hold equals settlement and amplification is 1×. The report flagged
  this path as unexercised; the lab models it explicitly rather than implying it
  was proven on the target.
- **Percentages and totals** are rounded for display; assertions use
  micro-credits.

---

## 10. Ledger output example

### 10.1 Vulnerable run: one 1,000-credit org, three 100-image batches, `cc=1`

Setup: `unit = 7.0224`, `settle/item = 7.026`, `I = 100`, `H = 7.0224`,
`S = 702.6`.

| # | Entry | Reason | Batch | `credits_delta` | `credits_held` | `balance_after` | `held_after` | `available_after` |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | bonus | `org_bonus` | — | +1,000.000000 | 0 | 1,000.000000 | 0 | 1,000.000000 |
| 2 | hold | `generation_hold` | b1 | 0 | 7.022400 | 1,000.000000 | 7.022400 | 992.977600 |
| 3 | hold | `generation_hold` | b2 | 0 | 7.022400 | 1,000.000000 | 14.044800 | 985.955200 |
| 4 | hold | `generation_hold` | b3 | 0 | 7.022400 | 1,000.000000 | 21.067200 | 978.932800 |
| 5 | settle | `generation_settle` | b1 | −702.600000 | 7.022400 | 297.400000 | 14.044800 | 283.355200 |
| 6 | settle | `generation_settle` | b2 | −702.600000 | 7.022400 | −405.200000 | 7.022400 | −412.222400 |
| 7 | settle | `generation_settle` | b3 | −702.600000 | 7.022400 | −1,107.800000 | 0 | −1,107.800000 |

Observations:

- The three holds total `21.0672`, well below the `2,107.8` of work.
- After the first settlement only `283.3552` is available — less than the
  `702.24` a full-batch hold would need in the fixed engine. By the second
  settlement the vulnerable wallet is negative.
- `credits_held` is the per-entry hold amount (the observed ledger shape). The
  authoritative pool is `held_after`; do not sum `credits_held` to reconcile.
- The ledger sum of `credits_delta` is `1,000 − 2,107.8 = −1,107.8`, which equals
  the final balance.

### 10.2 Fixed run: same setup

| # | Entry | Reason | Batch | `credits_delta` | `credits_held` | `balance_after` | `held_after` | `available_after` |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | bonus | `org_bonus` | — | +1,000.000000 | 0 | 1,000.000000 | 0 | 1,000.000000 |
| 2 | hold | `generation_hold` | b1 | 0 | 702.240000 | 1,000.000000 | 702.240000 | 297.760000 |
| 3 | settle | `generation_settle` | b1 | −702.240000 | 702.240000 | 297.760000 | 0 | 297.760000 |
| — | rejected | `INSUFFICIENT_CREDITS` | b2 | — | — | 297.760000 | 0 | 297.760000 |

- Batch b2 never gets a hold row because `available 297.76 < 702.24`.
- The settlement uses the price ceiling `min(702.6, 702.24) = 702.24`; the
  `0.36` price variance is recorded as `pricing_variance`, not a debit.
- The wallet never goes negative; the batch is rejected before any job exists.

### 10.3 JSONL shape

```jsonl
{"seq":2,"runId":"run_0007","walletId":"wal_farm_01","workspaceId":"ws_farm_01","batchId":"bat_01","entryType":"hold","reason":"generation_hold","genType":"image","creditsDeltaMicro":0,"creditsHeldMicro":7022400,"heldAfterMicro":7022400,"balanceAfterMicro":1000000000,"availableAfterMicro":992977600,"createdAt":"2026-11-24T10:00:00.000Z"}
{"seq":3,"runId":"run_0007","walletId":"wal_farm_01","workspaceId":"ws_farm_01","batchId":"bat_02","entryType":"hold","reason":"generation_hold","genType":"image","creditsDeltaMicro":0,"creditsHeldMicro":7022400,"heldAfterMicro":14044800,"balanceAfterMicro":1000000000,"availableAfterMicro":985955200,"createdAt":"2026-11-24T10:00:01.000Z"}
{"seq":4,"runId":"run_0007","walletId":"wal_farm_01","workspaceId":"ws_farm_01","batchId":"bat_03","entryType":"hold","reason":"generation_hold","genType":"image","creditsDeltaMicro":0,"creditsHeldMicro":7022400,"heldAfterMicro":21067200,"balanceAfterMicro":1000000000,"availableAfterMicro":978932800,"createdAt":"2026-11-24T10:00:02.000Z"}
{"seq":5,"runId":"run_0007","walletId":"wal_farm_01","workspaceId":"ws_farm_01","batchId":"bat_01","entryType":"settle","reason":"generation_settle","genType":"image","creditsDeltaMicro":-702600000,"creditsHeldMicro":7022400,"heldAfterMicro":14044800,"balanceAfterMicro":297400000,"availableAfterMicro":283355200,"createdAt":"2026-11-24T10:00:05.000Z"}
{"seq":6,"runId":"run_0007","walletId":"wal_farm_01","workspaceId":"ws_farm_01","batchId":"bat_02","entryType":"settle","reason":"generation_settle","genType":"image","creditsDeltaMicro":-702600000,"creditsHeldMicro":7022400,"heldAfterMicro":7022400,"balanceAfterMicro":-405200000,"availableAfterMicro":-412222400,"createdAt":"2026-11-24T10:00:06.000Z"}
{"seq":7,"runId":"run_0007","walletId":"wal_farm_01","workspaceId":"ws_farm_01","batchId":"bat_03","entryType":"settle","reason":"generation_settle","genType":"image","creditsDeltaMicro":-702600000,"creditsHeldMicro":7022400,"heldAfterMicro":0,"balanceAfterMicro":-1107800000,"availableAfterMicro":-1107800000,"createdAt":"2026-11-24T10:00:07.000Z"}
```

The dashboard renders the same rows as a table and offers CSV/JSONL export.

---

## 11. Abuse detection

### 11.1 Rule catalog

The first four rules are the required signals from the engagement. The rest are
defence in depth.

| ID | Rule | Signal | Severity | Action |
|---|---|---|---|---|
| D1 | `ORG_FARM_DEVICE` | ≥3 org workspaces created per device/IP in 24h | high | block new org creation; review |
| D2 | `ADMIN_CONCENTRATION` | one identity is admin of ≥3 orgs created in 7d, or ≥2 orgs it does not own | high | freeze bonus/spend; review graph |
| D3 | `NEGATIVE_BALANCE` | wallet `credits < 0` or `available < 0` | critical | block generation; alert finance |
| D4 | `HOLD_BATCH_MISMATCH` | `hold < 0.5 × items × unit` for items ≥ 10, or `settle > 2 × hold` | high | block batch; reconcile |
| D5 | `BONUS_VELOCITY` | >1 org bonus per identity/device/domain in 30d | high | deny bonus; review |
| D6 | `DISPOSABLE_DOMAIN` | org owner or admin invitee on a disposable domain | medium | require verification |
| D7 | `INVITE_RING` | M accepts invites from ≥3 orgs sharing device/IP, or the same pair repeats across orgs | high | revoke memberships; review |
| D8 | `PARALLEL_BURST` | >20 batch submissions per wallet in 60s | medium | rate-limit; review |
| D9 | `SPEND_ANOMALY` | 24h settled credits > 3× plan allowance | medium | cap; review |
| D10 | `SETTLE_OVER_HOLD` | settlement exceeds hold by >5% | high | block settlement; investigate pricing |

### 11.2 SQL

**D1 — many orgs per device/IP**

```sql
SELECT i.device_id,
       i.signup_ip,
       COUNT(DISTINCT w.id) AS orgs_24h
FROM workspaces w
JOIN identities i ON i.id = w.owner_identity_id
WHERE w.kind = 'org'
  AND w.created_at >= datetime('now', '-1 day')
GROUP BY i.device_id, i.signup_ip
HAVING COUNT(DISTINCT w.id) >= 3;
```

**D2 — one admin across many new orgs**

```sql
SELECT m.identity_id,
       COUNT(*) AS admin_orgs_7d,
       SUM(CASE WHEN w.owner_identity_id != m.identity_id THEN 1 ELSE 0 END)
         AS invited_admin_orgs
FROM memberships m
JOIN workspaces w ON w.id = m.workspace_id
WHERE m.role = 'admin'
  AND w.kind = 'org'
  AND w.created_at >= datetime('now', '-7 days')
GROUP BY m.identity_id
HAVING COUNT(*) >= 3
    OR SUM(CASE WHEN w.owner_identity_id != m.identity_id THEN 1 ELSE 0 END) >= 2;
```

**D3 — negative balances**

```sql
SELECT w.id AS wallet_id,
       w.workspace_id,
       w.credits_micro,
       w.held_micro,
       w.credits_micro - w.held_micro AS available_micro
FROM wallets w
WHERE w.credits_micro < 0
   OR w.credits_micro - w.held_micro < 0;
```

**D4 — batch size vs hold**

```sql
SELECT b.id AS batch_id,
       b.workspace_id,
       b.gen_type,
       b.items_count,
       b.unit_micro,
       b.hold_micro,
       b.settle_micro,
       b.hold_micro * 1.0 / (b.items_count * b.unit_micro) AS hold_ratio,
       CASE WHEN b.settle_micro IS NOT NULL
            THEN b.settle_micro * 1.0 / b.hold_micro END AS settle_ratio
FROM batches b
WHERE b.items_count >= 10
  AND (
    b.hold_micro * 2 < b.items_count * b.unit_micro
    OR (b.settle_micro IS NOT NULL AND b.settle_micro > b.hold_micro * 2)
  );
```

**D5 — bonus velocity**

```sql
SELECT i.device_id,
       i.email_domain,
       COUNT(*) AS grant_count,
       COUNT(DISTINCT g.identity_id) AS identities_with_bonus
FROM bonus_grants g
JOIN identities i ON i.id = g.identity_id
WHERE g.kind = 'org_bonus'
  AND g.granted_at >= datetime('now', '-30 days')
GROUP BY i.device_id, i.email_domain
HAVING COUNT(*) > 1;
```

**D7 — invite ring (membership graph)**

```sql
WITH admin_edges AS (
  SELECT m.identity_id AS admin_identity,
         w.owner_identity_id AS owner_identity,
         i.device_id,
         i.signup_ip
  FROM memberships m
  JOIN workspaces w ON w.id = m.workspace_id
  JOIN identities i ON i.id = w.owner_identity_id
  WHERE m.role = 'admin'
    AND w.kind = 'org'
    AND m.identity_id != w.owner_identity_id
)
SELECT admin_identity,
       COUNT(DISTINCT owner_identity) AS distinct_owners,
       COUNT(DISTINCT device_id) AS devices,
       COUNT(DISTINCT signup_ip) AS ips
FROM admin_edges
GROUP BY admin_identity
HAVING COUNT(DISTINCT owner_identity) >= 3
    OR (COUNT(DISTINCT owner_identity) >= 2 AND COUNT(DISTINCT device_id) = 1);
```

### 11.3 Detection output schema

```json
{
  "runId": "run_0007",
  "generatedAt": "2026-11-24T10:05:00.000Z",
  "engineMode": "vulnerable",
  "findings": [
    {
      "ruleId": "D2",
      "severity": "high",
      "subjectType": "identity",
      "subjectId": "id_main",
      "summary": "admin of 10 orgs created in the last 7 days",
      "evidence": {
        "adminOrgCount": 10,
        "invitedAdminOrgCount": 10,
        "ownerIdentities": ["id_farm_01", "…"],
        "deviceIds": ["dev_01"],
        "window": "7d"
      },
      "action": "freeze_bonus_and_review"
    }
  ]
}
```

### 11.4 Tuning and false positives

- **Shared office IP/NAT**: D1 should require device correlation or a disposable
  domain signal before blocking; a single IP alone is weak.
- **Legitimate agency groups**: D2's "≥2 orgs it does not own" can be normal for
  consultants. Pair it with new-org age, device overlap and bonus velocity.
- **Provider price variance**: D10's 5% threshold must not fire on normal model
  price changes; compare to the quoted ceiling, not to the previous invoice.
- **Refunds and cancellations**: exclude `released` holds from D4; only settled
  batches count for the settle/hold ratio.
- **Test/lab runs**: detector output is tagged `runId`; production alerts must
  exclude lab runs.

### 11.5 Dashboard integration

- Every detection links to the subject (identity, workspace, wallet, batch).
- One-click "explain" shows the rule's SQL and the rows that fired.
- Detections are recomputed on demand and after each run; the dashboard shows
  open/ack/closed counts.
- Fixed-mode runs should produce zero D1–D4 findings for the same fixtures; that
  is a test assertion, not an assumption.

---

## 12. Dashboard and CLI

### 12.1 CLI commands

| Command | Purpose |
|---|---|
| `pnpm lab sim` | pure simulation; writes a `runs` row |
| `pnpm lab chain` | execute the mock chain end to end |
| `pnpm lab detect` | run D1–D10 over a run |
| `pnpm lab ledger` | print ledger (`table`, `jsonl`, `csv`) |
| `pnpm lab export` | export run + ledger + detections to a directory |
| `pnpm lab test` | run the test suite |
| `pnpm lab serve` | local dashboard on `127.0.0.1:4100` |
| `pnpm lab reset` | wipe the lab DB (confirm) |

Global flags: `--mode`, `--format`, `--db`, `--verbose`, `--no-color`.
`--mode vulnerable` requires `LAB_ALLOW_VULNERABLE=1`; the CLI refuses otherwise.

### 12.2 Dashboard pages

```text
┌─────────────────────────────────────────────────────────────────────┐
│  BILLING ABUSE LAB        mode: VULNERABLE        [red banner]      │
├─────────────────────────────────────────────────────────────────────┤
│  Free credits   Provider cost   Amplification   Negative wallets    │
│  10,100         $10,005.02      99.06×          11                 │
├─────────────────────────────────────────────────────────────────────┤
│  [Overview] [Orgs] [Batches] [Ledger] [Detections] [Simulator]     │
└─────────────────────────────────────────────────────────────────────┘
```

| Page | Content |
|---|---|
| Overview | cards above, target progress bar, run selector, fixed-vs-vulnerable comparison |
| Orgs | table of identities → owned orgs → admin memberships; graph highlighting one login → N orgs |
| Batches | id, workspace, type, items, requested/effective concurrency, hold, settle, ratios, status |
| Ledger | filterable append-only rows; wallet balance/held/available; CSV/JSONL export |
| Detections | rule, severity, subject, summary, evidence, action; ack/close |
| Simulator | form for N orgs/items/unit/batches; side-by-side fixed result; "run chain" button |

The mode switch is a guarded control at the top right. It is disabled on any
non-loopback bind. Switching to vulnerable requires typing `VULNERABLE`.

### 12.3 API endpoints

See section 8.4. All are `127.0.0.1` only. Example:

```bash
curl -s http://127.0.0.1:4100/api/lab/simulate \
  -H 'content-type: application/json' \
  -d '{"mode":"vulnerable","orgs":10,"itemsPerBatch":100,"unitPrice":7.0224,"batches":1424}' \
  | jq '.target'
```

```json
{
  "targetUsd": 10000,
  "batchesNeeded": 1424,
  "orgsNeeded": 10,
  "identitiesNeeded": 11,
  "freeCreditsForTarget": 10100,
  "providerCreditsForTarget": 1000502.4,
  "providerUsdForTarget": 10005.024,
  "amplificationForTarget": 99.06,
  "feasible": true
}
```

### 12.4 Example session

```text
$ pnpm lab chain --mode vulnerable --orgs 10 --items 100 --unit 7.0224 --batches 1424
mode=vulnerable run=run_0007
created identities=11 workspaces=11 invites=10 batches=1424
free credits=10,100
provider credits=1,000,502.4  provider usd=$10,005.02  amplification=99.06x
negative wallets=11
detections: D1 high, D2 high, D3 critical, D4 high
ledger: 1,424 batch holds + 1,424 batch settlements (item rows optional)

$ pnpm lab sim --mode fixed --orgs 10 --items 100 --unit 7.0224 --batches 1424
mode=fixed run=run_0008
free credits=10,100
hold/batch=702.24  batches executed=10  provider usd=$70.26
target requires orgs=1,424 identities=1,425
fixed blocks 99.3% of the requested work with the same 10 orgs
```

The exact ledger row count depends on whether settlement is recorded per batch
or per item; the example uses batch-level rows for readability.

---

## 13. Test plan

### 13.1 Fixtures

| Fixture | Wallet | Type | Items | `cc` | Unit | Settle | Purpose |
|---|---|---:|---:|---:|---:|---:|---|
| `fx_text_1000` | 1,000 | text | 20 | 1 | 3.135 | 2.1207 | hold collapse |
| `fx_text_omitted` | 1,000 | text | 5 | omitted | 3.135 | 2.1207 | default 1 |
| `fx_image_65` | 65.338791 | image | 10 | 5 | 7.0224 | 7.1598596 | negative balance |
| `fx_text_parallel` | 30 | text | 10 × 3 | 1 | 3.135 | 2.1207 | parallel holds |
| `fx_text_100` | 808.771035 | text | 100 | 5 | 3.135 | 2.12068715 | 13.5× under-reserve |
| `fx_image_500` | 500 | image | 100 | 1 | 7.0224 | 7.026 | fixed block |
| `fx_three_wallets` | 100 / 1,000 / 314.839515 | mixed | 3 | 1 | 3.135 | 2.8157 | observed aggregation |
| `fx_farm_10` | 10 × 1,000 + 100 | image | 100 | 1 | 7.0224 | 7.026 | $10k model |

All fixtures use synthetic identities, workspaces, emails, device IDs and IPs.

### 13.2 Test cases

| ID | Scenario | Vulnerable expected | Fixed expected |
|---|---|---|---|
| TC-01 | 20 text items, `cc=1`, wallet 1,000 | 200; hold 3.135; 20 jobs | 200; hold 62.70; 20 jobs |
| TC-02 | 5 text items, `cc` omitted | hold 3.135 | hold 15.675 |
| TC-03 | 10 images, `cc=5`, wallet 65.338791 | 200; hold 35.112; settle 71.598596; final −6.259805 | 402 `INSUFFICIENT_CREDITS`; 0 jobs; balance unchanged |
| TC-04 | 3 × 10 text, `cc=1`, wallet 30, parallel | all 3 accepted; total hold 9.405; settle 63.621; final −33.621 | all 3 rejected (hold 31.35 each); balance 30 |
| TC-05 | 3 farm orgs + main login | 3,100 free; M admin of 3 | M admin of ≤2; org bonus once per verified identity |
| TC-06 | 100 text, `cc=5`, wallet 808.771035 | hold 15.675; settle 212.068715; final 596.70232 | hold 313.50; settle min(212.068715, 313.50); final 596.70232 |
| TC-07 | 100 images, `cc=1`, wallet 500 | 200; hold 7.0224; settle 702.6; final −202.6 | 402; 0 jobs |
| TC-08 | `cc` = 0 / −1 / 0.5 / `"1"` / `1e9` | 400 for first four; `1e9` clamps to items | same validation; `1e9` scheduling clamp 16 |
| TC-09 | M accepts 3 admin invites | M admin of 3 | third `403 MEMBERSHIP_LIMIT`; same-device invite `403 SELF_INVITE_RING` |
| TC-10 | same identity creates 3 orgs | 3 × 1,000 bonus | second org `403 ORG_CREATION_CAP`; if allowed, no second bonus (`409 BONUS_ALREADY_GRANTED`) |
| TC-11 | forced settle above hold | allowed; wallet negative | rollback; `409 SETTLEMENT_BLOCKED`; D3; wallet ≥ 0 |
| TC-12 | 24h spend cap with 10,000 paid credits | no cap; accepts | first batch accepted; second `429 SPEND_CAP` |
| TC-13 | detector on the vulnerable $10k run | D1, D2, D3, D4 fire | no D1–D4 for the same fixtures |
| TC-14 | ledger/wallet reconciliation | ledger sum = final balance; holds release | same, and no negative wallet |
| TC-15 | replay settle with same idempotency key | one debit only | one debit only |
| TC-16 | same request through both modes | hold differs by `min(I,c)` | hold = `I × u`; no route-level mode branch |

### 13.3 Detailed acceptance

**TC-01 / TC-02 — hold collapse and default**

```text
given wallet 1000, text unit 3.135
when POST batchPolishAssetsPrompt {items: 20, concurrentCount: 1}
then status 200, body.total = 20
and wallet.held = 3.135
and available = 996.865
and 20 provider jobs exist
```

Fixed:

```text
when the same request runs in fixed mode
then wallet.held = 62.70
and available = 937.30
and 20 provider jobs exist
```

Omitted `cc` must produce the same vulnerable hold (3.135) and the fixed hold
(15.675 for 5 items).

**TC-03 — negative balance**

```text
given wallet 65.338791, image unit 7.0224, settle total 71.598596
when POST batchGenerateImageAssets {items: 10, concurrentCount: 5}
then status 200, body.total = 10
and hold = 35.112
and after settlement wallet.credits = -6.259805
and ledger records 10 item settlements (each `creditsHeld` 7.0224) or one
batch row (`creditsHeld` 702.24)
```

Fixed:

```text
then status 402 INSUFFICIENT_CREDITS
and zero provider jobs
and wallet.credits = 65.338791
and no ledger hold/settle row
```

**TC-04 — parallel batches**

Vulnerable, wallet 30, three concurrent submissions of 10 text items at `cc=1`:

```text
hold each = 3.135; total held = 9.405
all three return 200
settlement = 3 × 10 × 2.1207 = 63.621
final = 30 - 63.621 = -33.621
```

Fixed: each hold is 31.35; all three return 402 because 31.35 > 30; no jobs.

**TC-05 / TC-09 / TC-10 — aggregation and bonus identity**

```text
vulnerable:
  create farm_1..farm_3 with disposable identities
  each invites M as admin; M accepts
  M.getMyAgency() returns 3 orgs + personal, all admin
  sum(wallets) = 3,100

fixed:
  M accepts at most 2 org admin memberships
  farm_3 invite -> 403 MEMBERSHIP_LIMIT
  same device/IP invite -> 403 SELF_INVITE_RING
  same identity's second org -> 403 ORG_CREATION_CAP; if creation is
  allowed by config, bonus 0 / 409 BONUS_ALREADY_GRANTED
```

**TC-07 — full-batch reserve**

```text
given wallet 500, image unit 7.0224, items 100
vulnerable: hold 7.0224, accept, settle 702.6, final -202.6
fixed:      hold 702.24 > 500, 402, zero jobs
```

**TC-11 — negative-balance block**

Use a test-only hook `forceSettleOverage(batchId)` that sets the settlement to
`credits + 1` and bypasses the price ceiling:

```text
fixed:  settle runs in a transaction; credits - settle < 0
        -> rollback, batch.status = settlement_blocked
        -> 409 SETTLEMENT_BLOCKED
        -> D3 detection
        -> wallet.credits unchanged and >= 0
```

**TC-13 — detector**

```text
run the vulnerable fx_farm_10 chain
expect findings contains D1 (device), D2 (admin concentration),
D3 (negative wallet), D4 (hold/batch mismatch)

run the fixed fx_farm_10 chain
expect no D1-D4 findings
expect D6 only if the fixture intentionally uses a disposable domain
```

**TC-14 — reconciliation**

```sql
-- must return zero rows after every run
SELECT w.id
FROM wallets w
LEFT JOIN ledger l ON l.wallet_id = w.id
GROUP BY w.id
HAVING w.credits_micro != COALESCE(SUM(l.credits_delta_micro), 0);

SELECT w.id
FROM wallets w
LEFT JOIN batches b
  ON b.workspace_id = w.workspace_id
 AND b.status IN ('held','dispatched')
GROUP BY w.id
HAVING w.held_micro != COALESCE(SUM(b.hold_micro), 0);
```

Fixed additionally asserts:

```sql
SELECT COUNT(*) FROM wallets WHERE credits_micro < 0;       -- 0
SELECT COUNT(*) FROM batches WHERE settle_micro > hold_micro; -- 0
```

**TC-16 — mode parity**

Call the same route with the same fixture in both modes; assert:

- same status class and JSON keys;
- `hold` differs exactly as the formula predicts;
- a spy on `BillingPolicy` confirms the route called `reserve`, not a mode
  branch;
- no response leaks a client-selectable mode.

### 13.4 Definition of done

- `pnpm lab test` passes all TC-01…TC-16.
- `pnpm lab sim` reproduces the $10k table within micro-credit rounding.
- Vulnerable chain run produces negative wallets and D1–D4.
- Fixed chain run produces zero negative wallets and no D1–D4.
- Dashboard shows both runs side by side with the same request shape.
- Ledger reconciles exactly; holds release to zero.
- No network egress in the test run.
- `docs/BILLING-LAB.md` (this file) is the source of truth for the constants.

---

## 14. Responsible disclosure and safety

### 14.1 Lab safety

- **Play money, mock providers.** The lab never calls Razorpay, an AI provider,
  an email provider or `kronicle.studio`.
- **No live target.** Do not point any lab command at the production hostname,
  its IPs or its CDN. The config has no production URL.
- **Vulnerable mode is a fixture.** It is intentionally insecure. Bind it to
  `127.0.0.1`, require `LAB_ALLOW_VULNERABLE=1`, refuse production, and never
  deploy it.
- **No real credentials.** No tokens, cookies, API keys or account emails from
  the engagement are stored in this repo.
- **Synthetic data only.** Identities, emails, device IDs and IPs are generated;
  the observed numbers are reproduced as constants, not as live records.
- **Do not scale the chain.** The lab is for reproduction, regression testing and
  fix validation. Running it against a third-party service is out of scope and
  unlawful.

### 14.2 Disclosure

The underlying behaviour was found during an authorised engagement and reported
through the engagement's channel. This lab is a defensive reproduction.

- Share the lab privately with the vendor for validation; do not publish a
  turnkey exploit.
- Coordinate disclosure with the vendor's published security contact or the
  engagement's agreed channel.
- Default window: **90 days** from vendor notification, or earlier by mutual
  agreement after the fix is deployed and verified.
- The public write-up, if any, should describe the **class** of defect and the
  fix, not a step-by-step farming recipe against a live service.
- Do not include real account identifiers, cookies, tokens, payment data or
  provider keys in screenshots, reports or commits.
- If you are a third party and you find this behaviour independently: stop at
  the minimum proof, report it privately, and do not retain other users' data.

### 14.3 Data handling

- Engagement evidence remains in the engagement workspace, not in this repo.
- The lab may reference evidence **paths and SHA-256 hashes**; it must not copy
  raw cookies, tokens, emails or other users' content.
- Reports and dashboards use synthetic IDs (`id_main`, `ws_farm_01`).
- Export directories are gitignored and contain only lab-generated data.

### 14.4 Legal and ethics

- Authorised testing only. The original work was performed under the
  engagement's rules of engagement with `lab_mode: true`.
- The lab is not a claim that the vendor's production system is exploitable in
  every deployment; it reproduces observed behaviour on the tested build.
- The fixed engine is a reference, not a guarantee of PCI/SSO/ledger compliance.
- No real payment is completed, no real credits are purchased, and no provider
  work is billed.

---

## 15. Open questions

1. **Real provider COGS per credit.** The lab uses `$0.01/credit`. If the vendor
   provides a real rate card, replace `usd_per_credit` and regenerate the table;
   the credit counts do not change.
2. **Real item cap.** The observed API accepted at least 100 items. The lab caps
   at 100. If the production cap is higher, the image/video org counts fall
   proportionally; if lower, they rise.
3. **Org-bonus intent.** Is the 1,000-credit org grant an unconditional trial or
   a verified-account benefit? The fix priority changes: anti-abuse only vs
   identity binding.
4. **Invite caps.** The defaults (2 admin memberships, 1 org per identity/30d)
   are product policy, not measured constants. The lab makes them configurable.
5. **Video batch cap.** The video path was not exercised on the target. The lab
   models 10- and 100-clip batches to show sensitivity; do not treat either as
   observed.
6. **Settlement price variance.** The observed per-item settlement varied
   (text 2.44–3.40, image 7.026–7.71). The fixed engine's price ceiling absorbs
   variance; the exact accounting treatment (platform absorbs vs customer
   top-up) is a product decision.
7. **Refund-on-delete.** The engagement could not prove whether deleting a
   generated asset refunds its credits. The lab models refunds as hold release
   only; a separate refund policy is out of scope until proven.

---

## Appendix A. Glossary

| Term | Meaning |
|---|---|
| **Identity** | A login (email + OTP in the observed app) |
| **Workspace / agency** | A tenant selected by `x-agency-id`; personal or org |
| **Membership** | `(workspace, identity, role)`; roles admin/editor/viewer |
| **Farm org** | An org created by a disposable identity solely to obtain the org bonus and invite the main login |
| **Main login (M)** | The attacker's primary identity; admin of N farm orgs |
| **Wallet** | One credit balance per workspace |
| **Hold** | Credits reserved at batch submission |
| **Settlement** | Actual debit after provider work completes |
| **Available** | `credits - held`; the number the balance check uses |
| **Unit** | Credits per item at hold time |
| **Settle unit** | Credits per item at settlement time |
| **Amplification** | `provider credits / free credits`; 1.0× means no leverage |
| **Parallel regime** | All holds placed before any settlement; the attack's best case |

## Appendix B. Source mapping

| Lab element | Source |
|---|---|
| `hold = min(items, cc ?? 1) × unit` | F-001 / F-003, reproduced on text and image pipelines |
| `settlement = items × unit` | F-001/F-003; 100-item text settled 212.068715 against a 15.675 hold |
| Org bonus 1,000 / personal 100 | F-002; A/B/C ledgers |
| Self-invite aggregation | Chain report; one login admin of 100 + 1,000 + 314.839515 |
| 3-item `cc=1` hold 3.135 | Chain report, live account execution |
| Fixed rules | Remediation sections of both reports |
| Detection rules | Chain report "Why the existing controls do not stop it" + review impact sections |
| $10k model | Chain report quantification, recomputed with exact floor and the personal wallet |

The lab is a clean-room reproduction. The source reports remain the authority for
what was observed; this specification is the authority for what the lab must
implement.
