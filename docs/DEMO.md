# Demo — run it

## Prerequisites
- Node 22+ (tested on 26), pnpm, ffmpeg on PATH.

## Boot
```bash
cd /Users/het/kronicle.kee
pnpm install
pnpm dev          # api :4000 + web :3210
```
Open **http://localhost:3210**. It opens the studio directly — no login — with **10,000 demo credits** and a seeded project. (Marketing copy lives at `/welcome`.) Use `/login` if you want the real OTP flow.

## Walkthrough (about five minutes)
1. **Sign in** with any email (e.g. `demo@kronicle.local`). The four-digit code is
   shown on the page as `Dev OTP: …` (mock email).
2. **Onboard** as *My team* (organisation) → `+1000` credits. Personal is `+100`.
3. **Home** → paste a script → **Analyse** → review episodes → **Start**.
4. **Project → Script** → **Extract assets**.
5. **Cast & places** → **Write prompts** → **Generate looks** (SVG looks).
6. **Plan** → **Build plan**.
7. **Storyboard** → **Generate 6 frames**.
8. **Video** → **Generate clip** (ffmpeg 2 s clip) → **Open editor**.
9. **Editor**: click the clip, **+0.5s**, **Split**, **Save**, **Compile** →
   **Open MP4**. The export is a real ffmpeg concat under `apps/api/storage/exports`.
10. **Billing** → **Pay ₹100** → mock Razorpay adds 100 credits. The ledger shows
    every debit/credit.
11. **Team** → invite an email, copy the link. **Usage** → filter the ledger.

## Lab
```bash
pnpm lab
pnpm lab -- --json --orgs 10 --batches 142 --items 100 --cc 1 --unit 7.0224
```
The lab prints vulnerable vs fixed, the ₹10,000 target, the $10,000 provider
model and detector flags. No live calls.

## Reset
Delete `apps/api/storage/kronicle.db*` and restart the API for a clean dataset.
