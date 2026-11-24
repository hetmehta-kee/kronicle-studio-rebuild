# Security notes (authorised research)

These notes summarise the Kronicle testing that motivated the lab. Full evidence
lives in the engagement:

`/Users/het/SecurityHarness/engagements/auto/web-20261124-073125/`

- `reports/KRONICLE-BILLING-SECURITY-REVIEW.md`
- `reports/KRONICLE-CREDIT-FARMING-CHAIN.md`
- `findings/candidates/F-001…`, `F-002…`, `F-003…`
- `evidence/raw/{concurrent-count,independent-verify-cc,credit-bypass,chain,signup-bonus}/`

## Findings
- **F-004 (High)** — cross-tenant asset URL overwrite (IDOR write). An account
  that is not a member of the victim workspace changed the victim's asset image
  URL via `POST /api/production/assets/updateAssetsUrl` using a random `flowId`.
  Reproduced and reverted; evidence `evidence/raw/asset-idor/`. The endpoint
  requires authentication (401 without a token). Sibling checks: the anchor and
  storyboard writers could not be exercised on the live project because it had
  no anchor or storyboard rows; they remain **inconclusive**, not negative.
  `SECURITY_MODE=vulnerable` in the replica reproduces the cross-tenant write;
  `SECURITY_MODE=fixed` returns 404 for the outsider and 400 for a wrong flow.
- **F-001 / F-003 (High)** — the credit hold is
  `min(items, concurrentCount ?? 1) × unit`; settlement is `items × unit`.
  `concurrentCount` is client-controlled and defaults to 1. Parallel batches all
  pass the tiny hold check before settlement, so a 1000-credit wallet can settle
  ~100x its balance (100 items, cc=1). Independently reproduced; verdict engine
  VALID/high; CHALLENGED pending operator confirmation.
- **F-002 (Medium)** — a new org gets 1000 credits with only email OTP; a main
  login invited as admin to N orgs can spend all N wallets. Disposable inboxes
  work.
- **OBS-001 (Low)** — OTP verify showed no lockout in 10 attempts; send-side
  anti-abuse exists. Not brute-forced at 10k attempts.
- Payment integration held: server-authoritative amount, HMAC signature, webhook
  signature, owner-scoped orders, no merchant secret exposed.
- Tenant isolation held: `x-agency-id` membership check, object scoping, invite
  email binding, role checks.
- Session logout does not revoke the old `kronicleToken` (low).

## ₹10,000, not $10,000
The user's target is **₹10,000 of retail credits**, i.e. **10 org accounts ×
1000 bonus credits**. With the parallel hold collapse, those 10 wallets can
settle about **1,000,000 provider credits** (~₹10 lakh retail; ~$9,972 at
$0.01/credit). The lab models exactly that:
- vulnerable: 10 orgs × 142 parallel 100-image batches = 1,420 batches,
  997,180.8 work credits, final −987,180.8, **99.7×**;
- fixed: 10 batches, 7,022.4 work credits, **0.70×**.

## Boundary
The lab uses play money and mock providers. No mass account creation was run
against the live service. The live proof is limited to one farm org on the
owner's account (1000 credits; a 3-item cc=1 batch held 3.135; personal wallet
untouched). Scaling to 10 orgs on production is the part we did not execute.

## Fix order
1. Reserve `items.length × unit` atomically; ignore client `concurrentCount` for
   billing; cap items; re-check per dispatch; block negative settlement.
2. Identity-bind the org bonus; grant after first paid top-up; block disposable
   domains; rate-limit org creation.
3. Cap org memberships/adminships; detect self-invite rings; add spend velocity
   caps.
