# Models, tokens and pricing

Every AI model the product exposes, how a request is routed to one, how tokens
and credits are counted, and where the money goes in the ledger.

---

## 1. Model registry

The registry is returned by `POST /api/config/getClientConfig` and is also
stored on each project.

### 1.1 Image models

| Label | Model value | Provider key | Default |
|---|---|---|---|
| Nano Banana Flash | `openai:google/gemini-3.1-flash-image` | openai | ✓ |
| GPT Image 2.5 Flare | `openai:gpt-image-2.5-flare` | openai | |
| GPT Image 2 | `openai:gpt-image-2` | openai | |

Capabilities: text-to-image, image-to-image, character/scene/prop looks,
storyboard frames, 1K/2K/4K output quality.

### 1.2 Video models

| Label | Model value | Provider key | Default |
|---|---|---|---|
| MiniMax H3 | `minimax/h3` | wavespeed | |
| Wan 3.0 | `alibaba/wan-3.0` | wavespeed | |
| Seedance 2.0 Pro | `ep-20260727140143-rwmnp` | volcengine | ✓ |
| Seedance 2.0 Mini | `ep-20260904133405-tjttt` | volcengine | |

Capabilities: image-to-video and text-to-video clips, up to the provider's
duration/resolution limits, 9:16 / 16:9 / 1:1.

### 1.3 Text models

| Label | Model value | Provider key |
|---|---|---|
| DeepSeek V4 Flash | `deepinfra/deepseek-ai/DeepSeek-V4-Flash` | openai-compatible |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` | anthropic |
| Gemini 3.8 Flash | `google/gemini-3.8-flash` | google |

Used for: script analysis, prompt writing, plan generation, chat/director,
review/fix.

### 1.4 Defaults

```
imageModel  = openai:google/gemini-3.1-flash-image
videoModel  = volcengine:ep-20260727140143-rwmnp
imageQuality= 1K
videoRatio  = 9:16
artStyle    = Indian_Fantasy_Microdrama
```

### 1.5 Where the choice is stored

- `projects.image_model`, `projects.video_model`, `projects.image_quality`,
  `projects.video_ratio`, `projects.art_style`.
- Generation requests may override `model` / `resolution`; the server records
  them on `assets.model`, `assets.resolution`, `videos.model`.

---

## 2. Routing rules

1. The project's stored model is the default for every generation.
2. A request-level `model` overrides it for that call only.
3. Text stages use the text registry; image stages use the image registry;
   video stages use the video registry.
4. There is no automatic cross-provider fallback in the replica. A production
   adapter should implement: try primary → on 5xx/timeout retry once → on
   persistent failure mark the job failed and refund the hold.
5. A model value is an opaque string to the ledger; pricing is by **action**,
   not by model (except the image quote's 1K/4K split). Changing the model does
   not change the hold in the current build.

---

## 3. Provider adapter contract

A real adapter replaces the two mock functions in `apps/api/src/media.ts`:

```ts
type ImageRequest = {
  model: string; prompt: string; quality: "1K" | "2K" | "4K";
  referenceImage?: string; seed?: number;
};
type ImageResult = { url: string; width: number; height: number; costUsd?: number };

type VideoRequest = {
  model: string; prompt: string; imageUrl?: string;
  durationSec: number; resolution: "480p" | "720p" | "1080p";
};
type VideoResult = { url: string; durationSec: number; costUsd?: number };

type TextRequest = {
  model: string; system?: string; prompt: string; maxTokens?: number;
};
type TextResult = { text: string; inputTokens: number; outputTokens: number; costUsd?: number };
```

Rules:

- Return a public URL already stored in `storage/` (or an object store).
- Report the provider cost when available; use it for settlement.
- Never block the HTTP request on a long provider job; enqueue it.
- On failure, settle the ledger row as `failed` so the hold is refunded.
- Keep the model value in the asset/video row for audit.

---

## 4. Token accounting

### 4.1 Text

The replica uses a simple estimate:

```
inputTokens  = ceil(promptChars / 4)
outputTokens = 1000          (flat estimate for the hold)
```

`/api/wallet/quote` for `text.generate` returns:

```
credits = 4
breakdown = { inputTokens: 0, outputTokens: 1000, charsPerToken: 4, marginPercent: 0, priceSource: "flat_hold" }
```

A production adapter should settle from the provider's `usage` object:

```
credits = (inputTokens × inputRate + outputTokens × outputRate) × margin
```

with the rate table held server-side, never in the client.

### 4.2 Image

Priced per image, not per pixel:

```
hold   = count × 7.0224      (UNIT.image)
quote  = count × 8  (1K)  or  count × 14  (4K)
settle = provider cost per image (observed 7.026319)
```

4K output was observed at the same 7.026319 as 1K — image pricing is flat per
image in the current build. The quote's 4K = 14 is an estimate, not what the
ledger charged in the test.

### 4.3 Video

```
quote = clips × ceil(durationSec / 5) × 134
hold  = 134                  (UNIT.video, per clip)
```

The quote is an `upper_bound`; the ledger settles the provider cost. 5 s at
720p quoted 134 credits.

### 4.4 Asset extraction

```
quote = ceil(episodes / groupSize) × 4     (groupSize default 5)
hold  = 4                                  (UNIT.extract)
```

### 4.5 Script analysis / review

Flat 3 credits (`UNIT.analysis`, review.fix quote 3).

---

## 5. Credit price table

| Action | UNIT (hold) | Quote | Notes |
|---|---|---|---|
| text.generate | 3.135 | 4 | flat estimate |
| script.analysis | 3 | 3 | flat |
| image.generate | 7.0224 | 8 (1K) / 14 (4K) | per image |
| video.generate | 134 | 134 per 5 s clip | per clip |
| asset.extract | 4 | 4 per episode group | ceil |
| review.fix | – | 3 | flat |

Six-decimal rounding (`round6`). The ledger stores `credits_held`,
`credits_delta`, `status`, `gen_type`, `actor_user_id`.

---

## 6. Plans, bonuses and currency

### 6.1 Plans

| id | name | credits | amountPaise | INR |
|---|---|---|---|---|
| 1 | 100 credits | 100 | 10000 | ₹100 |
| 2 | 220 credits | 220 | 20000 | ₹200 |
| 3 | 550 credits | 550 | 50000 | ₹500 |

`creditsPerInr = 1`.

### 6.2 Bonuses

| Type | Credits |
|---|---|
| personal workspace | 100 |
| organisation | 1,000 |

The bonus is credited by `creditWallet` on onboarding/upgrade. It is **not**
per invite and **not** transferable.

### 6.3 Currency / region

- `listPlans` returns the plan's currency (INR in the observed build).
- `createOrder` accepts `{ planId, currency }`; a currency that does not match
  the plan/location returns `409 "Prices changed for your location"`.
- Client geo headers (`cf-ipcountry`, `x-forwarded-for`, `x-country`) do not
  change the plan in the observed build.

---

## 7. The money flow in the ledger

```
top-up:    balance += credits          ledger(type=topup, status=completed, delta=+credits)
hold:      balance -= hold             ledger(type=generation, status=pending, held=hold)
settle:    held -= hold                ledger.status=completed, delta=actual-held
           balance -= (actual - hold)
failure:   held -= hold                ledger.status=failed, refund
```

Invariants:

- a ledger row settles at most once (`status='pending'` guard);
- `wallets.held` equals the sum of pending `credits_held`;
- `wallets.balance` never goes negative in a fixed build; the observed live
  product allows it (OBS-002);
- every generation row records the actor and the gen type.

---

## 8. Cost and margin (scenario, not disclosure)

The API does not expose provider cost. The billing lab uses **$0.01 per
credit** only to translate credits into provider spend:

```
retail INR = credits × ₹1
provider USD = credits × $0.01
gross margin = 1 − (provider USD × FX) / retail INR
```

At ₹83/$: provider cost per credit ≈ ₹0.83, i.e. a ~17% gross margin before
infrastructure. Treat this as a scenario for the report, not a disclosed
price.

---

## 9. Adding a model

1. Add the label/value to `getClientConfig.models.<modality>`.
2. Add the provider adapter branch for the value prefix
   (`openai:`, `minimax/`, `alibaba/`, `volcengine`, `ep-…`, `anthropic/`,
   `google/`, `deepinfra/`).
3. Keep pricing by action; add a model-specific multiplier only if the
   provider cost differs materially.
4. Store the model on the project and on the generated asset/video row.
5. Add a smoke test: one image, one 5 s video, one text completion, and verify
   the ledger hold/settle.

---

## 10. Observed live values (for calibration)

| Observation | Value |
|---|---|
| image hold (asset batch) | 7.0224 |
| image settle | 7.026319 |
| text hold | 3.135 |
| text settle range | 1.377511 – 3.730337 |
| video quote 5 s 720p | 134 |
| extract quote 1 episode | 4 |
| analysis quote | 3 |
| 4K image settle | 7.026319 (same as 1K) |
| wallet observed negative | −6.259805 |

Use these as fixtures when rebuilding the ledger tests.
