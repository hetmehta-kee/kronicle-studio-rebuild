# Security model and findings

This is the security chapter of the rebuild. It states the boundaries the
system must enforce, the controls that held in testing, the findings that
motivated the lab, and the deliberate vulnerable modes used to reproduce them.

---

## 1. Trust boundaries

```
untrusted: browser input, headers, uploaded data URLs, webhook body
  │
  ├── auth boundary: OTP → JWT → user
  ├── tenancy boundary: x-agency-id → membership → agency
  ├── object boundary: project/asset/order id → agency ownership
  ├── money boundary: quote → hold → settle → ledger
  ├── provider boundary: model value → adapter → URL
  └── payment boundary: plan → order → HMAC → wallet
```

Every boundary is enforced server-side. The client may choose *what* to ask
for (plan, model, batch size) but never *how much it costs* or *whose data it
touches*.

---

## 2. Controls that must hold

### Identity

- OTP is 4 digits, bound to verification id + email, 5-minute expiry, single
  use.
- JWT is HttpOnly, SameSite=Lax, 2-hour expiry; the user is reloaded from the
  DB on every request.
- Logout clears the cookie; token revocation is a known gap.
- Rate-limit OTP request and verify in a production build (the live build had
  no verify lockout in 10 attempts — OBS-001).

### Tenancy

- `x-agency-id` must resolve to a membership; otherwise 403.
- Every project child query joins through `projects.agency_id`.
- Foreign ids return 404, not 403.
- Invites are random 32-byte tokens, email-bound, expiring.
- Roles: editor cannot invite/pay/delete; viewer read-only.
- `moveProject` requires permission in the target workspace; cross-tenant 403.

### Money

- Plan amount/credits are server-side; client `amount`, `credits`, `price`,
  `plan` objects are ignored.
- Currency must match the plan/location; mismatch 409.
- `verifyPayment` checks the HMAC and the order owner; another workspace's
  order is 404.
- Webhook checks the HMAC over the raw body; invalid → 401.
- The key **secret** never leaves the server; only `keyId` is public.
- `mockPay` must not exist in production (it returned 404 live).
- Settlement is idempotent on a `pending` ledger row.
- The wallet must not go negative; the live build allows it (OBS-002).

### Generation

- Hold before dispatch; validate items before hold.
- Reserve the whole batch (`items × unit`) in the fixed build; ignore client
  `concurrentCount` for billing.
- Cap items per request and per window.
- Failure refunds the hold.
- Cap prompt size, image count, video duration.

### Objects and URLs

- URL writers must verify `asset.agency_id == req.agencyId` and (if kept)
  `flowId` ownership.
- Allowlist asset URLs to the app's own CDN/S3; reject arbitrary hosts.
- Uploads: MIME allowlist, extension from MIME, UUID filename, size cap, no SVG.

---

## 3. Findings

### F-001 / F-003 (High) — hold/settle collapse

```
hold = min(items, concurrentCount ?? 1) × unit
settle = items × unit
```

`concurrentCount` is client-controlled and defaults to 1. A batch of 100
images holds one image and settles 100; parallel batches all pass the check
before settlement. Observed live: a 2-item image batch held 7.0224 and settled
two rows of ~7.026; a 3-duplicate batch held one unit and charged three.

Impact: a wallet can consume far past its balance; the platform carries the
debt. Reproduced live and in the lab.

Fix: reserve `items × unit` atomically; ignore `cc` for billing; cap items;
re-check per dispatch; block negative settlement.

### F-002 (Medium) — free org bonus

A new organisation gets 1,000 credits with only email OTP; a main login invited
as admin to N orgs can spend all N wallets. Disposable inboxes work. Inviting a
third party does **not** grant them credits; the bonus is per org, not per
invite.

Fix: identity-bind the bonus, grant after a paid top-up or verified domain,
limit org creation, detect self-invite rings.

### F-004 (High) — cross-tenant asset URL overwrite

`POST /api/production/assets/updateAssetsUrl` updates by asset id without an
agency check; `flowId` accepts any UUID. An account not in the victim workspace
changed the victim's asset URL and the victim saw it. Reproduced and reverted.
Read routes were scoped (404), so this is a write-side gap.

Fix: scope by `asset.agency_id` + project membership; validate/remove
`flowId`; allowlist URLs.

Sibling writers (`updateAnchorUrl`, `updateStoryboardUrl`, `updateVideoPrompt`)
were not fully exercised (no anchor/storyboard rows on the victim project);
mark them inconclusive, not negative. `SECURITY_MODE=fixed` is the regression
test.

### OBS-001 (Low) — no OTP verify lockout

10 wrong attempts were accepted; the send side had anti-abuse. Not tested at
scale.

### OBS-002 (High) — negative wallet balance

`recon-a-org` ended at **−6.259805 credits** after completed `asset_prompt`
settlements; settlement does not re-check the balance. Evidence in the
engagement's `evidence/raw/negative-balance/`.

---

## 4. Payment test matrix (all held)

| Test | Result |
|---|---|
| `createOrder` with extra `amount/credits/price/plan` | ignored; server plan |
| `currency: USD` | 409 region guard |
| duplicate `planId` / `currency` keys | last wins; no mismatch/bypass |
| `coupon` / `promoCode` / `discount` fields | ignored |
| `cf-ipcountry`, `x-forwarded-for`, `x-country` | no plan change |
| `planId` invalid type/value | 400 |
| fake `verifyPayment` signature | 400 invalid signature |
| another workspace's order | 404 |
| webhook invalid signature | 401 |
| `mockPay` in production | 404 |
| key secret in client | not found |
| quote negative / huge / unknown action | 400 |
| hidden grant/transfer/refund/coupon routes | 404 |

Gaps: replay with a genuine signature and refund/chargeback were not testable
without a real payment/secret.

---

## 5. Credit movement

- No transfer/gift/coupon/referral primitive.
- Credits move only by payment top-up or the org bonus.
- Membership shares the org wallet; personal wallets stay separate.
- Project move is allowed only between workspaces the actor belongs to; future
  generation charges the destination wallet.
- Cross-tenant move is 403.

The exploitable part is the bonus + hold gap, not a transfer bug.

---

## 6. Batch billing deep pass (image path)

- 2-item batch, `cc=1`: one hold (7.0224), two settlements (~7.026 each).
- 3 duplicates: no dedupe; one hold at request time; three settlements.
- 51-item request: passed schema validation (quote caps at 50); failed only on
  the fake asset — no cap check before lookup.
- 4K image: accepted and produced 4K; charged the same 7.026 as 1K.
- Mixed valid+invalid: 404 before hold; no stuck credits.
- Quote bounds: image 1–50, video duration >0, extract episodes ≥1, text
  promptChars 0–2,000,000.

Fix: enforce the same caps at the generation endpoint, reserve the whole batch,
and price model/resolution deliberately.

---

## 7. Deliberate lab modes

| Mode | Effect |
|---|---|
| `BILLING_MODE=vulnerable` | `min(items, cc ?? 1) × unit` |
| `BILLING_MODE=fixed` | `items × unit` |
| `SECURITY_MODE=vulnerable` | URL writers look up by id only; any UUID flowId |
| `SECURITY_MODE=fixed` | agency scope + flow validation; outsider 404, wrong flow 400 |
| `DEMO_MODE=true` | loopback demo/lab sessions only |

Use the vulnerable mode to reproduce, the fixed mode as the regression test.

---

## 8. Rebuild security checklist

- [ ] Every route has `authRequired` unless explicitly public.
- [ ] Every object route joins through `projects.agency_id`.
- [ ] `holdCredits` and `settleCredits` run in a transaction; no negative
      balance.
- [ ] Batch reserve is `items × unit`, independent of `cc`.
- [ ] Item/size caps at the generation endpoint, not only the quote.
- [ ] URL writers scope by agency and validate/remove `flowId`.
- [ ] Uploads allowlist MIME, derive extension, cap size, no SVG.
- [ ] Payment amount server-side; HMAC verify + webhook; order owner.
- [ ] Webhook idempotency keyed by gateway order/payment id.
- [ ] OTP rate limits; invite rate limits; org-creation limits.
- [ ] Logout/token revocation (or short TTL + refresh rotation).
- [ ] Test F-001/F-003, F-002, F-004, OBS-002 in both modes.
