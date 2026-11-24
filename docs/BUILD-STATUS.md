# Build status

## Working (tested end to end)
- Email OTP login (dev code on screen), JWT cookie, onboarding (personal 100 /
  org 1000), workspace switcher, roles admin/editor/viewer.
- Invites: create, list, email-bound token, accept, role change, remove, leave,
  rename, upgrade personal → org.
- Wallet: balance/held/total, ledger, quote, plans, mock order + verify/HMAC +
  webhook, mock pay, negative balance.
- Studio: analyse script → project + episodes → extract assets → prompts →
  image looks → plan → storyboard frames → video clip.
- Editor: media pool, timeline track/clip, select, start/duration/trim inputs,
  split at playhead, move, delete, save, ffmpeg compile to MP4.
- Billing/team/usage/general screens, marketing/pricing, invite page.
- Billing lab: vulnerable vs fixed engine, ₹ target, $ provider target,
  detector, JSON/CLI.
- **No-login demo mode**: root opens `/home` with a local demo session, 10,000
  credits, a fully seeded project and a pre-seeded editor clip. `DEMO_MODE=false`
  disables it; the endpoint is loopback-only.

## Mocked
- AI providers (text/image/video) are deterministic local mocks; images are SVG,
  videos are ffmpeg colour/testsrc clips.
- Razorpay is a local mock (`rzp_test_kronicle`, HMAC with a dev secret); no
  payment network.
- Email is not sent; the OTP/link is returned to the client. Invite links are
  copyable.

## Not built yet (specs exist)
- Novel/webnovel module, platform console, assets library page, support/legal.
- BGM, continuity panels, image-flow editor, uploads, real transitions/ducking,
  multi-track drag/drop, Remotion titles.
- Real provider adapters, real Razorpay, email delivery, S3/CloudFront.
- Automated tests, E2E harness, CI.
- Next 16 / Zod 4 / `node:sqlite` Database rename (research recommends; current
  build is Next 15.5.29 / Zod 3 / DatabaseSync alias and passes typecheck).

## Specs
- `docs/PRODUCT-TEARDOWN.md` (~1,450 lines)
- `docs/UI-SPEC.md` (~2,300 lines)
- `docs/VIDEO-EDITOR-SPEC.md` (~1,724 lines)
- `docs/BILLING-LAB.md` (~2,074 lines)
- `docs/RESEARCH-STACK.md` (~1,156 lines)
- `docs/REA.md` / `evidence-refs/` — REA application evidence (43 chunks,
  197 MB JSON, route inventory, limitations).
