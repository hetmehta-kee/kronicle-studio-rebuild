# Billing abuse lab

Play-money reproduction of the Kronicle credit engine. No live calls, no real
payments, no provider keys.

```bash
pnpm --filter @kronicle/lab start
pnpm --filter @kronicle/lab start -- --json --orgs 10 --batches 142 --items 100 --cc 1 --unit 7.0224
```

## What it shows

- `vulnerable` mode: `hold = min(items, concurrentCount ?? 1) × unit`, settlement
  `items × unit`. The balance goes negative and the platform performs far more
  work than the free credits.
- `fixed` mode: `hold = items × unit`, atomic, rejected when the balance cannot
  cover the batch. Same orgs, ~1× work.
- ₹ target: 10 org accounts × 1000 bonus = ₹10,000 of retail credits.
- Provider-cost target: at $0.01/credit, $10,000 of provider work needs ~1,424
  batches × 100 images at unit 7.0224 — about 10 org accounts at `cc=1`
  (~1,000,000 provider credits, ~100× amplification).
- Detector rules D1–D4: many new orgs, one admin across many orgs, negative
  balance, batch-size-vs-hold mismatch.

The lab is a model, not an attack tool. It does not create accounts or call
`kronicle.studio`.
