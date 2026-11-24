# Observed reference (for subagents)

Target: `https://kronicle.studio` (authorised test engagement). Do not copy
proprietary source or long copy; summarise behaviour and contracts.

## Stack observed
- Next.js App Router / Turbopack / React 19, nginx + AWS ALB, CloudFront static.
- Express JSON API at `/api/*`, zod validation, JWT cookies.
- Python auth at `/py-api/*`: 4-digit email OTP -> Firebase custom token ->
  `kronicleToken` (HS256, 2 h) + `jwtToken` (HS512, 14 d).
- Multi-tenant "agency" workspaces; `x-agency-id` header selects the active one.
- Roles: admin (billing.pay, members.manage), editor (generate), viewer.
- Credits: quote -> hold -> provider job -> settle; ledger rows carry
  `creditsHeld`, `creditsDelta`, `genType`, `status`.
- Payments: Razorpay live, INR plans 100/220/550 credits, order-based checkout,
  HMAC `order_id|payment_id`, webhook at `/api/webhooks/razorpay`.
- Video: production workspace (plan, asset variants, storyboard, workbench,
  tracks/clips/BGM), editor `/production` and `/assets`.
- Models exposed by `POST /api/config/getClientConfig`: text (DeepSeek, Claude,
  Gemini, GPT, Grok, Kimi, MiniMax, GLM), image (gemini-3.1-flash-image,
  gpt-image-2.5-*, gpt-image-2), video (minimax/h3, alibaba/wan-3.0,
  volcengine Seedance 2.0/2.5). All via provider abstractions; mocks are fine.

## Screens / routes
`/` marketing + pricing, `/login`, `/login/onboarding`, `/home`,
`/home/settings/{general,team,billing,usage}`, `/home/shows`,
`/home/script-split`, `/home/pick-look`, `/home/pick-director`,
`/home/pick-models`, `/scriptEnhancement`, `/cornerScape` (Cast & places),
`/production` (workbench: Script, Script assets, Plan, Asset Variants,
Storyboard, Video), `/assets`, `/invite/<token>`, `/legal/*`, `/support`.

## API inventory (observed)
Auth/session: `GET /api/auth/me`, `/api/user/session-check`, `/api/user/check`,
`POST /api/user/onboard`, `GET /api/user/permissions`,
`POST /api/user/updateProfile`, `/py-api/v1/users/auth/send-otp|verify-otp`.
Wallet: `GET /api/wallet/detail`, `GET /api/wallet/transactions`,
`POST /api/wallet/quote`.
Payment: `POST /api/payment/{listPlans,createOrder,getOrder,verifyPayment}`,
`POST /api/webhooks/razorpay`.
Workspace: `POST /api/agency/{getMyAgency,inviteMember,listInvites,getInviteInfo,
acceptInvite,changeRole,removeMember,leaveAgency,moveProject,renameAgency,
upgradeToOrg,resendInvite,revokeInvite}`, `GET /api/agency/getMyAgency`.
Project/script: `/api/project/{getProject,addProject,editProject,delProject,
createFromScript,addWorkflow,addExtensionProject,addLocaliseProject,
getScriptMarketTypes,analyzeScript}`, `/api/general/{getSingleProject,
updateProject}`, `/api/script/{getScrptApi,batchAddScript,updateScript,
delScript,exportScript,extractAssets,cancelExtractAssets,pollScriptAssets,
getAddEpisodesStatus}`.
Assets/cast: `/api/cornerScape/getAllAssets`, `/api/assets/getAssetsApi`,
`/api/assets/getAssetCounts`, `/api/assets/uploadClip`,
`/api/assetsGenerate/{batchPolishAssetsPrompt,batchGenerateImageAssets}`.
Production: `/api/production/{getFlowData,saveFlowData}`,
`/api/production/plan/{getPlan,generatePlan}`,
`/api/production/derived/getDerived`,
`/api/production/anchor/{getPlan,update,batchGenerateImage,batchDelete,
pollingImage,updateAnchorUrl}`,
`/api/production/assets/{getAssetsPage,batchGenerateAssetsImage,
pollingImage,updateAssetsUrl,deleteAssetsDireve}`,
`/api/production/storyboard/{getStoryboardData,getShots,getTable,
batchGenerateImage,pollingImage,previewImage,downPreviewImage,
updateStoryboardUrl,editStoryboardInfo}`,
`/api/production/workbench/{getGenerateData,generateVideo,batchGenerateVideo,
checkVideoStateList,getFileUrl,generateBgm,pollBgm,getBgmList,
generateVideoPrompt,repromptVideoPrompt,repromptImagePrompt,
updateVideoPrompt,updateVideoDuration,getContinuityPrompt,
generateContinuityPanel,pollingContinuityPanel,getContinuityPanelHistory,
editContinuityPanelWithMarkers,deleteContinuityPanelHistory,addTrack,
deleteTrack,saveTrackMedias,selectVideo,syncVideoStatus,delVideo,
detectStatutoryWarning,updateTrackStatutoryWarning}`,
`/api/production/editImage/{generateFlowImage,getImageFlow,saveImageFlow,
updateImageFlow,uploadImage}`.
Model/chat: `/api/modelSelect/{getModelList,getModelDetail}`,
`/api/project/getModelDetails`, `/api/agents/getMemory`,
`GET /api/chat/stream?isolationKey=<project>:<agent>:<script>`.
Config: `POST /api/config/getClientConfig`.
Analytics: `POST /next-api/k`, `GET /next-api/version`.

## Credit bug (for the lab)
`hold = min(items.length, concurrentCount ?? 1) x unit_price`; settlement is
`items.length x unit_price`. `concurrentCount` is client-controlled, min 1,
default 1. Org onboarding grants 1000; personal 100; invites are email-bound and
an org admin can invite a main login to N orgs. Report:
`/Users/het/SecurityHarness/engagements/auto/web-20261124-073125/reports/`.

## Artifacts to read
- JS chunks: `/Users/het/SecurityHarness/engagements/auto/web-20261124-073125/raw/js-app/`
- API/payment evidence: `.../evidence/raw/`
- Reports: `.../reports/KRONICLE-BILLING-SECURITY-REVIEW.md`,
  `.../KRONICLE-CREDIT-FARMING-CHAIN.md`
- Test account creds (tokens rotate): `.../state/creds/env.sh`
- Live app: `https://kronicle.studio` (public pages; if an authenticated call is
  needed, use the browser contexts or the existing evidence, not new mass actions).
