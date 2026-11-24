# Build plan

## Outcome A — working clean-room replica
Reproduce the product's behaviour end to end: auth, workspaces, credits,
scripts, episodes, enhancement, assets, plans, storyboards, video generation and
the inbuilt timeline editor. The frontend is fully usable; the backend uses mock
providers so the whole flow runs locally without third-party keys.

## Outcome B — billing lab and $10k impact model
Reproduce the credit engine in a safe lab with two modes:

- **vulnerable** — org bonus 1000/account, self-invite aggregation, client
  `concurrentCount` (default 1), batch settlement beyond the hold, parallel
  batches.
- **fixed** — full-batch atomic reserve, server-side concurrency, identity-bound
  bonus, invite-abuse controls, spend caps, negative-balance block.

The lab computes how many org accounts and batches reach $10,000 of provider
cost, shows the ledger, and runs an abuse detector. It never calls the live
service.

## Phases and owners

| Phase | Deliverable | Owner |
|---|---|---|
| 0 | Product teardown: screens, routes, workflows, API contracts, data model | architecture-mapper subagent |
| 0 | Stack/model research: Next.js, Express, SQLite, ffmpeg, model catalog, Razorpay test mode | researcher subagent |
| 0 | Video editor spec: timeline, tracks, clips, frames, export | general subagent |
| 0 | UI spec: screens, components, tokens, copy rules | general subagent |
| 1 | Monorepo scaffold, shared zod contracts, seed | main |
| 2 | API core: auth, workspaces, invites, wallet/ledger, projects, scripts, assets | main + backend subagent |
| 3 | Generation queue + mock text/image/video providers + ffmpeg export | main + backend subagent |
| 4 | Frontend shell: marketing, login, onboarding, home, settings, billing | main + frontend subagent |
| 5 | Studio flow: script → episodes → enhancement → cast/places → plan → variants → storyboard → workbench | frontend subagent |
| 6 | Video editor: timeline, tracks, clips, trim/split, frames, preview, export | video subagent |
| 7 | Billing lab + $10k simulator + detector | main |
| 8 | E2E, seed demo, walkthrough, screenshots | main |

## Non-goals
- Copying proprietary source/assets or long marketing copy.
- Attacking the live Kronicle service from the lab.
- Real payments or real third-party AI keys (adapters can be added later).

## Definition of done
- `pnpm dev` boots web + api; a new user can sign in with a dev OTP, create a
  project from a script, enhance, extract assets, generate looks, build a plan,
  storyboard, generate a clip, open the editor, trim/split/reorder, add BGM and
  export an MP4.
- The lab reproduces the vulnerable chain and the fixed chain, with a $10k
  cost table and a detector that flags the attack.
