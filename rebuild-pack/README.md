# Kronicle rebuild pack

A self-contained description of the Kronicle Studio architecture, data model,
API, model registry, credit/token accounting and product behaviour — enough to
rebuild the replica from scratch without copying the original source.

The working replica lives at `/Users/het/kronicle.kee` (apps/web, apps/api,
packages/shared, labs). This pack is the specification; the code is the
reference implementation.

## Contents

| File | What it covers |
|---|---|
| `ARCHITECTURE.md` | The main document: topology, auth, tenancy, data model, wallet, jobs, pipeline, chat, uploads, editor, billing, security, ops, rebuild order |
| `MODELS-AND-PRICING.md` | Every AI model, provider, routing rule, token accounting and credit price |
| `DATA-MODEL.md` | Table-by-table schema, relationships and invariants |
| `schema.sql` | Runnable SQLite schema |
| `API-CONTRACT.md` | Every endpoint, method, auth/role, request and response |
| `BEHAVIOR.md` | Every flow and state machine, with edge cases and errors |
| `SECURITY.md` | Trust boundaries, controls, findings, lab modes and test matrix |
| `REBUILD-CHECKLIST.md` | Ordered build plan with acceptance checks |

## Status of the source

- The replica is functional end to end: OTP auth, onboarding, workspaces,
  invites/roles, wallet/ledger, script → assets → plan → storyboard → video,
  editor save/compile, billing, team, usage, chat, uploads, demo and lab modes.
- It is **not** pixel-perfect and not every reference feature is present. See
  `docs/BUILD-STATUS.md` in the repo for the exact built/not-built list.
- AI providers, Razorpay and email are mocked locally. The live target uses
  real providers and Razorpay; the contracts are the same.
- Two deliberate lab modes exist: `BILLING_MODE` and `SECURITY_MODE`
  (`vulnerable` reproduces a finding, `fixed` is the regression test).

## Rebuild in one paragraph

pnpm workspace with `apps/web` (Next.js App Router), `apps/api` (Express +
SQLite) and `packages/shared` (units, plans, permissions). Start the API on
4000 and the web app on 3210. The API owns all writes, the wallet ledger and
the job queue; the web app only calls `/api`. Create the schema from
`schema.sql`, then follow `REBUILD-CHECKLIST.md` section by section.

## Source map

| Concern | Reference implementation |
|---|---|
| HTTP routes | `apps/api/src/index.ts` |
| Schema + helpers | `apps/api/src/db.ts` |
| Wallet / holds / quotes | `apps/api/src/wallet.ts` |
| Durable jobs | `apps/api/src/jobs.ts` |
| Mock media (SVG/ffmpeg) | `apps/api/src/media.ts` |
| Demo + lab seeding | `apps/api/src/demo.ts` |
| Units, plans, roles | `packages/shared/src/index.ts` |
| Web shell / screens | `apps/web/app`, `apps/web/components` |
| Billing abuse lab | `labs/billing-abuse` |
| Deep product teardown | `docs/PRODUCT-TEARDOWN.md` |
| UI spec | `docs/UI-SPEC.md` |
| Editor spec | `docs/VIDEO-EDITOR-SPEC.md` |
| Security findings | `docs/SECURITY-NOTES.md` and the engagement report |
