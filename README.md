# kronicle.kee

A clean-room, fully working replica of the Kronicle product observed at
`kronicle.studio`, plus a billing-abuse lab. Built for product learning and
authorised security research; no proprietary source, assets or long marketing
copy are copied.

## What this is

- **`apps/web`** — Next.js 15 / React 19 frontend: marketing, OTP login,
  onboarding, workspace switcher, home, settings (general/team/billing/usage),
  script → episodes → enhancement → cast & places → plan → asset variants →
  storyboard → video workbench, and the inbuilt video editor.
- **`apps/api`** — Express API with SQLite (`node:sqlite`), zod contracts, JWT
  cookies, mock OTP, workspaces/orgs/invites/roles, credit wallet + ledger,
  quote → hold → settle, generation queue with mock text/image/video providers,
  mock Razorpay orders/signatures, ffmpeg video export.
- **`packages/shared`** — shared zod schemas, types and pricing constants.
- **`labs/billing-abuse`** — the same billing engine in two modes:
  `vulnerable` (client-controlled `concurrentCount`, org-bonus farming,
  self-invite aggregation) and `fixed` (full-batch reserve, server-side
  concurrency, identity-bound bonus, caps). Includes a $10k impact model,
  an attack simulator and an abuse-detection dashboard.

## Why clean-room

The live application's code and assets are proprietary. This repo reproduces the
**behaviour, flows, contracts and UX structure** — not the source files. UI
labels that are functional are matched; marketing copy is rewritten. If you own
the original or have permission, you can swap in the exact copy/assets.

## Boundaries

- The billing lab uses **play money and mock providers**. It does not attack
  `kronicle.studio`.
- The production chain found during testing is documented in the security
  report; the lab exists to reproduce and fix it safely, not to scale it against
  the live service.

## Quick start

```bash
pnpm install
pnpm dev            # web :3210 + api :4000
pnpm lab            # billing lab CLI / dashboard data
```

Seed data, demo accounts and the end-to-end walkthrough live in `docs/DEMO.md`.

## Docs

- `docs/PLAN.md` — phased build plan and ownership
- `docs/PRD.md` — product requirements, roles, workflows, non-goals
- `docs/PRODUCT-TEARDOWN.md` — observed screens, flows, API contracts, data model
- `docs/UI-SPEC.md` — screens, components, tokens, copy rules
- `docs/API-CONTRACTS.md` — endpoint-by-endpoint contracts
- `docs/DATA-MODEL.md` — tables, relations, invariants
- `docs/RESEARCH-STACK.md` — versions, libraries, provider/Razorpay notes
- `docs/VIDEO-EDITOR-SPEC.md` — timeline, tracks, clips, frames, export
- `docs/BILLING-LAB.md` — vulnerable vs fixed billing, ₹10k/$10k model, detection
- `docs/BUILD-STATUS.md` — what works, what is mocked, what is next
- `docs/SECURITY-NOTES.md` — the findings behind the lab and the boundary
- `docs/DEMO.md` — how to run and what to click
