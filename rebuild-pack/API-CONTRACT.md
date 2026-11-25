# API contract

All routes are JSON unless noted. The envelope is:

```json
{ "code": 200, "data": {}, "message": "success" }
```

Auth is the `kronicleToken` cookie or `Authorization: Bearer <jwt>`. Workspace
selection is `x-agency-id: <agencyId>`; without it the first membership is
used. `auth` means a valid session; `admin` means `adminOnly`; `perm:x` means
`requirePermission("x")`.

The replica's request-otp/verify paths are `/api/auth/request-otp` and
`/api/auth/verify-otp`. The live target uses a separate auth proxy
(`/py-api/v1/users/auth/send-otp` + verify); the session/JWT contract is the
same.

---

## Auth and user

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/auth/request-otp` | – | `{email}` | `{verification_id, otp_length, dev_code?}` |
| POST | `/api/auth/verify-otp` | – | `{email, otp, verification_id}` | sets cookie; user + onboarding state |
| GET | `/api/auth/me` | auth | – | user, permissions, abilities, credits, access |
| POST | `/api/auth/logout` | auth | – | clears cookie |
| GET | `/api/user/check` | auth | – | onboarding + workspace summary |
| POST | `/api/user/onboard` | auth | `{name, workspaceName, type}` | creates first agency, bonus, membership |
| GET | `/api/user/permissions` | auth | – | role + permission list |
| POST | `/api/user/updateProfile` | auth | `{name}` | updated user |

## Agency / team

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/agency/getMyAgency` | auth | `{}` | current agency + list |
| POST | `/api/agency/inviteMember` | admin | `{email, role}` | invite + token |
| POST | `/api/agency/listInvites` | admin | `{}` | invites |
| POST | `/api/agency/getInviteInfo` | auth | `{token}` | agency/email/role/expiry |
| POST | `/api/agency/acceptInvite` | auth | `{token}` | membership |
| POST | `/api/agency/listMembers` | auth | `{limit,offset}` | members + roles |
| POST | `/api/agency/changeRole` | admin | `{userId, role}` | updated role |
| POST | `/api/agency/removeMember` | admin | `{userId}` | removed |
| POST | `/api/agency/leaveAgency` | auth | `{}` | left (owner must transfer first) |
| POST | `/api/agency/renameAgency` | admin | `{name}` | renamed |
| POST | `/api/agency/upgradeToOrg` | admin | `{name?}` | org + bonus |
| POST | `/api/agency/resendInvite` | admin | `{inviteId}` | fresh token |
| POST | `/api/agency/revokeInvite` | admin | `{inviteId}` | revoked |
| POST | `/api/agency/moveProject` | admin | `{projectId, targetAgencyId}` | moved if allowed |

## Config

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/config/getClientConfig` | auth | `{}` | home defaults, model registry, billing ratio |

## Wallet

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| GET | `/api/wallet/detail` | auth | – | `{balanceCredits, heldCredits, totalCredits}` |
| GET | `/api/wallet/transactions` | auth | – | `{items:[ledger]}` |
| POST | `/api/wallet/quote` | auth | `{items:[{key,action,...}]}` | priced items + affordability |

Quote item shapes:

```json
{"key":"t","action":"text.generate","text":{"promptChars":0}}
{"key":"i","action":"image.generate","image":{"count":1,"size":"1K"}}
{"key":"v","action":"video.generate","video":{"clips":1,"durationSec":5}}
{"key":"e","action":"asset.extract","extract":{"episodes":1,"groupSize":5}}
{"key":"a","action":"script.analysis"}
{"key":"r","action":"review.fix"}
```

## Payment

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/payment/listPlans` | – | `{}` | `{plans, currency, country}` |
| POST | `/api/payment/createOrder` | perm:billing.pay | `{planId, currency}` | `{orderId, amount, credits, gatewayOrderId, keyId}` |
| POST | `/api/payment/getOrder` | auth | `{orderId}` | owner-scoped order |
| POST | `/api/payment/verifyPayment` | auth | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` | paid + credited |
| POST | `/api/payment/mockPay` | auth | `{orderId}` | dev only (404 in prod) |
| POST | `/api/webhooks/razorpay` | – | raw Razorpay event | HMAC check + idempotent update |

## Projects and scripts

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/project/analyzeScript` | perm:generate.run | `{text}` | episodes, words, estimate, suggestions |
| POST | `/api/project/createFromScript` | perm:project.create | `{name, episodes, imageModel?, videoModel?, videoRatio?, artStyle?}` | `{projectId}` |
| POST | `/api/project/getProject` | auth | `{}` | agency projects |
| POST | `/api/project/addProject` | perm:project.create | project fields | `{projectId}` |
| POST | `/api/project/editProject` | perm:project.edit | `{id, ...fields}` | updated |
| POST | `/api/project/delProject` | perm:project.delete | `{id}` | soft deleted |
| POST | `/api/general/getSingleProject` | auth | `{id}` | project |
| POST | `/api/script/getScrptApi` | auth | `{projectId}` | scripts |
| POST | `/api/script/batchAddScript` | perm:project.edit | `{projectId, scripts}` | added |
| POST | `/api/script/updateScript` | perm:project.edit | `{id, name?, content?}` | updated |
| POST | `/api/script/delScript` | perm:project.edit | `{id}` | deleted |
| POST | `/api/script/extractAssets` | perm:generate.run | `{projectId}` | started scripts |
| POST | `/api/script/cancelExtractAssets` | auth | `{ids}` | cancelled |
| POST | `/api/script/pollScriptAssets` | auth | `{ids}` | extract states |
| POST | `/api/scriptEnhancement/generate` | perm:generate.run | `{projectId}` | shoot-ready results |

## Assets

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/cornerScape/getAllAssets` | auth | `{projectId}` | UI-shaped assets + history |
| POST | `/api/assets/getAssetsApi` | auth | `{projectId}` | raw assets + total |
| POST | `/api/assets/getAssetCounts` | auth | `{projectId}` | counts |
| POST | `/api/assetsGenerate/batchPolishAssetsPrompt` | perm:generate.run | `{projectId, items, concurrentCount}` | total |
| POST | `/api/assetsGenerate/batchGenerateImageAssets` | perm:generate.run | `{projectId, items, concurrentCount, model, resolution}` | total |
| POST | `/api/assets/uploadClip` | perm:project.edit | `{projectId, dataUrl, filename?}` | `{url, id, bytes}` |
| POST | `/api/production/editImage/uploadImage` | perm:project.edit | `{projectId, dataUrl, assetId?}` | `{url, bytes}` |

## Production

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/production/plan/generatePlan` | perm:generate.run | `{projectId, scriptId}` | plan content |
| POST | `/api/production/plan/getPlan` | auth | `{projectId}` | latest plan |
| POST | `/api/production/storyboard/batchGenerateImage` | perm:generate.run | `{projectId, scriptId, shots, concurrentCount}` | frames |
| POST | `/api/production/storyboard/getStoryboardData` | auth | `{projectId}` | frames |
| POST | `/api/production/getFlowData` | auth | `{projectId, episodesId?}` | plan, storyboards, tracks, clips |
| POST | `/api/production/saveFlowData` | auth | `{projectId, tracks, clips}` | saved |
| POST | `/api/production/workbench/addTrack` | auth | `{projectId, name, kind, position}` | `{id}` |
| POST | `/api/production/workbench/generateVideo` | perm:generate.run | `{projectId, trackId?, scriptId?}` | `{id, url, clipId, trackId}` |
| POST | `/api/production/workbench/getGenerateData` | auth | `{projectId}` | storyboards, tracks, anchors |
| POST | `/api/production/workbench/getFileUrl` | auth | `{items}` | id → URL map |
| POST | `/api/production/assets/updateAssetsUrl` | perm:project.edit | `{id, url, flowId}` | updated (scope-checked in fixed mode) |
| POST | `/api/production/anchor/updateAnchorUrl` | perm:project.edit | `{id, url, flowId}` | updated |
| POST | `/api/production/storyboard/updateStoryboardUrl` | perm:project.edit | `{id, url, flowId}` | updated |
| POST | `/api/production/workbench/updateVideoPrompt` | perm:project.edit | `{id, prompt}` | updated |

## Editor, chat, system

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/editor/export` | auth | `{clips:[{path, trimInMs, trimOutMs, label}]}` | `{url}` |
| POST | `/api/chat/send` | auth | `{projectId, message}` | `{messages, reply}` |
| POST | `/api/chat/stream` | auth | `{projectId, message}` | SSE stream |
| POST | `/api/agents/getMemory` | auth | `{projectId}` | `{memory, summary, tokensEstimate}` |
| GET | `/api/system/jobs` | admin | – | `{jobs}` |
| GET | `/api/version` | – | – | `{release}` |

## Demo / lab (loopback only)

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/demo/session` | `{}` | demo user + 10,000 credits + seeded project |
| POST | `/api/auth/dev-login` | `{email, password}` | lab user + 3,000 credits |

Disabled by `DEMO_MODE=false`; both reject non-loopback clients.

---

## Examples

### Create order

```http
POST /api/payment/createOrder
x-agency-id: <agency>
Content-Type: application/json

{"planId":1,"currency":"INR"}
```

```json
{"code":200,"data":{"orderId":"…","planId":1,"amount":"100.00","currency":"INR","amountPaise":10000,"credits":100,"gatewayOrderId":"order_…","keyId":"rzp_live_…"},"message":"success"}
```

### Image batch

```http
POST /api/assetsGenerate/batchGenerateImageAssets
x-agency-id: <agency>
Content-Type: application/json

{"projectId":"…","items":[{"id":"…","name":"…","type":"role","describe":"…","prompt":"…"}],"concurrentCount":1,"model":"openai:google/gemini-3.1-flash-image","resolution":"1K"}
```

### Chat stream

```
data: {"event":"start","userMessageId":"…"}

data: {"delta":"On **Project**: …"}

data: {"event":"done","messageId":"…"}

data: [DONE]
```

### Export

```json
{"clips":[{"path":"/media/videos/x.mp4","trimInMs":0,"trimOutMs":2000,"label":"Shot 1"}]}
```

---

## Error conventions

| Status | Meaning |
|---|---|
| 400 | validation (`{message, errors[]}`) |
| 401 | token missing/invalid |
| 402 | insufficient credits |
| 403 | role or workspace forbidden |
| 404 | not found / outside agency |
| 409 | price or region mismatch |
| 500 | unexpected |

Object routes return 404 for another agency's id rather than 403, to avoid
existence leaks. The URL writers are the exception in vulnerable mode (see
`SECURITY.md`).
