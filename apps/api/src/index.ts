import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { BONUS, PLANS, ROLE_PERMISSIONS, UNIT, round6 } from "@kronicle/shared";
import {
  all,
  createAgency,
  createUser,
  ensureWallet,
  getAgency,
  getMembership,
  getUserByEmail,
  getUserById,
  getWallet,
  ledger,
  listAgencies,
  now,
  one,
  run,
  uuid,
} from "./db.js";
import { adminOnly, authRequired, clearSessionCookie, requirePermission, setSessionCookie, signToken } from "./auth.js";
import {
  InsufficientCredits,
  billingMode,
  computeHold,
  creditWallet,
  holdCredits,
  quoteItems,
  settleCredits,
  transactions,
  walletDetail,
} from "./wallet.js";
import { exportTimeline, renderClipVideo, svgImage, STORAGE } from "./media.js";
import { ensureDemo } from "./demo.js";
import { resolve } from "node:path";

class BadRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-kronicle-secret-change-me";
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "dev-razorpay-secret";
const RZP_WEBHOOK = process.env.RAZORPAY_WEBHOOK_SECRET ?? "dev-razorpay-webhook";

app.use(cors({ origin: ["http://localhost:3210", "http://127.0.0.1:3000"], credentials: true }));
app.use(cookieParser());
app.use(
  express.json({
    limit: "8mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use("/media", express.static(resolve(STORAGE)));

const ok = (res: express.Response, data: unknown) => res.json({ code: 200, data, message: "success" });
const bad = (res: express.Response, message: string, status = 400, code = 400) =>
  res.status(status).json({ code, data: null, message });
const h = (fn: (req: express.Request, res: express.Response) => Promise<unknown> | unknown) =>
  (req: express.Request, res: express.Response) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (err instanceof InsufficientCredits) {
        return res.status(402).json({ code: 402, data: null, message: "Insufficient credits" });
      }
      console.error(err);
      if (!res.headersSent) res.status(500).json({ message: "Something went wrong" });
    });
  };

const agency = (req: express.Request) => req.agencyId;
const needAgency = (req: express.Request, res: express.Response) => {
  if (!req.agencyId) {
    bad(res, "No workspace", 400);
    return null;
  }
  return req.agencyId;
};
const userByNumeric = (n: number) => one<{ id: string }>("SELECT id FROM users WHERE user_id = ?", n);
const planFor = (id: number) => PLANS.find((p) => p.id === id);

/* ------------------------------------------------------------------ auth */

app.post("/api/auth/request-otp", h(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, "Invalid email");
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const id = uuid();
  run("INSERT INTO otps (id, email, code, expires_at, consumed) VALUES (?, ?, ?, ?, 0)", id, email, code, now() + 5 * 60_000);
  return res.status(200).json({
    message: "OTP sent successfully",
    email,
    verification_id: id,
    otp_length: 4,
    dev_code: code,
  });
}));

app.post("/api/auth/verify-otp", h(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const otp = String(req.body?.otp ?? req.body?.code ?? "").trim();
  const verificationId = String(req.body?.verification_id ?? "");
  const row = one<{ id: string; code: string; expires_at: number; consumed: number }>(
    "SELECT id, code, expires_at, consumed FROM otps WHERE id = ? AND email = ?",
    verificationId,
    email,
  );
  if (!row || row.consumed || row.expires_at < now()) return res.status(400).json({ error_code: "RE-VERIFY_OTP", error_message: "OTP Expired, Please try again" });
  if (row.code !== otp) return res.status(400).json({ error_code: "INVALID_OTP", error_message: "Invalid OTP" });
  run("UPDATE otps SET consumed = 1 WHERE id = ?", row.id);
  let user = getUserByEmail(email);
  if (!user) user = createUser(email, email.split("@")[0]);
  const token = signToken(user);
  setSessionCookie(res, token);
  return res.json({ message: "OTP verified successfully", token, user: { id: user.id, email: user.email, name: user.name } });
}));

app.get("/api/auth/me", authRequired, h(async (req, res) => {
  const user = req.user!;
  const role = req.role;
  const agencies = listAgencies(user.id);
  const agency = req.agencyId ? getAgency(req.agencyId) : null;
  const wallet = req.agencyId ? walletDetail(req.agencyId) : { balanceCredits: 0, heldCredits: 0, totalCredits: 0 };
  const permissions = role ? ROLE_PERMISSIONS[role] : [];
  return res.json({
    id: user.id,
    user_id: user.user_id,
    email: user.email,
    username: user.name,
    name: user.name,
    authMethod: "jwt",
    onboarded: agencies.length > 0,
    permissions,
    abilities: [
      { action: "read", subject: "Kronicle" },
      { action: "write", subject: "Kronicle" },
      { action: "generate", subject: "Kronicle" },
      { action: "use", subject: "Kronicle" },
    ],
    credits: { balance: wallet.balanceCredits, held: wallet.heldCredits },
    access: agency
      ? { workspaceId: agency.id, role, type: agency.type, permissions, features: { billing: true, generation: true, projects: true, team: agency.type === "org" } }
      : null,
  });
}));

app.post("/api/auth/logout", authRequired, h(async (_req, res) => {
  clearSessionCookie(res);
  return res.json({ code: 200, data: { loggedOut: true }, message: "success" });
}));

app.get("/api/user/check", authRequired, h(async (req, res) => {
  const user = req.user!;
  const agencies = listAgencies(user.id);
  return res.json({
    onboarded: agencies.length > 0,
    user: { id: user.id, userId: String(user.user_id), name: user.name, email: user.email },
  });
}));

app.post("/api/user/onboard", authRequired, h(async (req, res) => {
  const user = req.user!;
  const existing = listAgencies(user.id);
  if (existing.length) return ok(res, { onboarded: true, agencyId: existing[0].id });
  const type = req.body?.type === "org" ? "org" : "individual";
  const name = String(req.body?.name ?? (type === "org" ? "Studio" : "Personal")).slice(0, 80) || "Workspace";
  const agencyId = createAgency(user.id, name, type);
  const bonus = type === "org" ? BONUS.org : BONUS.personal;
  creditWallet(agencyId, bonus, { type: "topup", reason: type === "org" ? "org_bonus" : "signup_bonus", actorUserId: user.user_id });
  return ok(res, { onboarded: true, agencyId, type, bonus });
}));

app.get("/api/user/permissions", authRequired, h(async (req, res) => {
  const role = req.role ?? "viewer";
  const agency = req.agencyId ? getAgency(req.agencyId) : null;
  return res.json({
    code: 200,
    data: {
      "dashboard.view.settings": true,
      "dashboard.view.allProjects": role === "admin",
      "dashboard.project.delete": role === "admin",
      "dashboard.project.transfer": role === "admin",
      "dashboard.project.create": role !== "viewer",
      "workspace.view.production": true,
      "workspace.view.cornerScape": true,
      "workspace.view.scriptEnhancement": true,
      "workspace.view.videoEditor": true,
      "workspace.assets.edit": role !== "viewer",
      "workspace.production.generate": role !== "viewer",
    },
    message: "success",
    access: agency
      ? { workspaceId: agency.id, role, type: agency.type, permissions: ROLE_PERMISSIONS[role], features: { billing: true, generation: true, projects: true, team: agency.type === "org" } }
      : null,
  });
}));

app.post("/api/user/updateProfile", authRequired, h(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name || name.length > 120) return bad(res, "Name must be 1 to 120 characters");
  run("UPDATE users SET name = ? WHERE id = ?", name, req.user!.id);
  return ok(res, { name });
}));

/* --------------------------------------------------------------- agency */

app.post("/api/agency/getMyAgency", authRequired, h(async (req, res) => {
  const agencies = listAgencies(req.user!.id);
  const currentId = req.agencyId ?? agencies[0]?.id;
  const current = agencies.find((a) => a.id === currentId) ?? agencies[0] ?? null;
  return ok(res, { current, agencies, isMaalik: false, onboarded: agencies.length > 0 });
}));

app.post("/api/agency/inviteMember", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const role = ["admin", "editor", "viewer"].includes(req.body?.role) ? req.body.role : "editor";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, "Invalid email");
  const token = crypto.randomBytes(32).toString("base64url");
  const id = uuid();
  run(
    "INSERT INTO invites (id, agency_id, email, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    agencyId,
    email,
    role,
    token,
    now() + 7 * 24 * 60 * 60_000,
  );
  return ok(res, { id, email, role, expiresAt: now() + 7 * 24 * 60 * 60_000, link: `http://localhost:3210/invite/${token}`, emailSent: true });
}));

app.post("/api/agency/listInvites", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const invites = all(
    "SELECT id, email, role, expires_at AS expiresAt, accepted_at AS acceptedAt FROM invites WHERE agency_id = ? AND accepted_at IS NULL ORDER BY expires_at DESC",
    agencyId,
  );
  return ok(res, { invites });
}));

app.post("/api/agency/getInviteInfo", authRequired, h(async (req, res) => {
  const token = String(req.body?.token ?? "");
  const invite = one<{ id: string; agency_id: string; email: string; role: string; expires_at: number }>(
    "SELECT id, agency_id, email, role, expires_at FROM invites WHERE token = ?",
    token,
  );
  if (!invite) return bad(res, "This invite is invalid or has expired", 404);
  if (invite.expires_at < now()) return bad(res, "This invite is invalid or has expired", 404);
  const agency = getAgency(invite.agency_id);
  const already = !!getMembership(invite.agency_id, req.user!.id);
  return ok(res, {
    agencyName: agency?.name ?? "Workspace",
    role: invite.role,
    expiresAt: invite.expires_at,
    emailMatches: invite.email === req.user!.email,
    alreadyMember: already,
  });
}));

app.post("/api/agency/acceptInvite", authRequired, h(async (req, res) => {
  const token = String(req.body?.token ?? "");
  const invite = one<{ id: string; agency_id: string; email: string; role: string; expires_at: number }>(
    "SELECT id, agency_id, email, role, expires_at FROM invites WHERE token = ?",
    token,
  );
  if (!invite || invite.expires_at < now()) return bad(res, "This invite is invalid or has expired", 404);
  if (invite.email !== req.user!.email) return bad(res, "This invite was sent to a different email address; sign in with that email to accept it", 403);
  if (!getMembership(invite.agency_id, req.user!.id)) {
    run("INSERT INTO memberships (id, agency_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)", uuid(), invite.agency_id, req.user!.id, invite.role, now());
  }
  run("UPDATE invites SET accepted_at = ? WHERE id = ?", now(), invite.id);
  return ok(res, { agencyId: invite.agency_id, role: invite.role });
}));

app.post("/api/agency/listMembers", authRequired, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const limit = Math.min(200, Math.max(1, Number(req.body?.limit ?? 50)));
  const offset = Math.max(0, Number(req.body?.offset ?? 0));
  const members = all(
    `SELECT u.user_id AS userId, u.name, u.email, m.role, m.created_at AS joinedAt
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.agency_id = ? ORDER BY m.created_at ASC LIMIT ? OFFSET ?`,
    agencyId, limit, offset,
  );
  return ok(res, { members, total: members.length });
}));

app.post("/api/config/getClientConfig", authRequired, h(async (_req, res) => {
  return ok(res, {
    home: { defaultDirectingStyleId: "fast-cut-microdrama", frames: ["9:16", "16:9", "1:1"], defaultFrame: "9:16", fileTypes: ["txt", "pdf", "docx"], maxScriptChars: 2000000, analysisCredits: 3, defaultTargetEpisodeSeconds: 120 },
    projectDefaults: { imageModel: "openai:google/gemini-3.1-flash-image", videoModel: "volcengine:ep-20260727140143-rwmnp", imageQuality: "1K" },
    models: {
      image: [
        { id: "openai", label: "Nano Banana Flash", value: "openai:google/gemini-3.1-flash-image", type: "image" },
        { id: "openai", label: "GPT Image 2.5 Flare", value: "openai:gpt-image-2.5-flare", type: "image" },
        { id: "openai", label: "GPT Image 2", value: "openai:gpt-image-2", type: "image" },
      ],
      video: [
        { id: "wavespeed", label: "MiniMax H3", value: "minimax/h3", type: "video" },
        { id: "wavespeed", label: "Wan 3.0", value: "alibaba/wan-3.0", type: "video" },
        { id: "volcengine", label: "Seedance 2.0 Pro", value: "ep-20260727140143-rwmnp", type: "video" },
        { id: "volcengine", label: "Seedance 2.0 Mini", value: "ep-20260904133405-tjttt", type: "video" },
      ],
      text: [
        { id: "openai", label: "DeepSeek V4 Flash", value: "deepinfra/deepseek-ai/DeepSeek-V4-Flash", type: "text" },
        { id: "openai", label: "Claude Sonnet 4.6", value: "anthropic/claude-sonnet-4-6", type: "text" },
        { id: "openai", label: "Gemini 3.8 Flash", value: "google/gemini-3.8-flash", type: "text" },
      ],
    },
    billing: { creditsPerInr: 1 },
  });
}));

app.post("/api/agency/changeRole", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const target = userByNumeric(Number(req.body?.userId));
  const role = ["admin", "editor", "viewer"].includes(req.body?.role) ? req.body.role : null;
  if (!target || !role) return bad(res, "Member not found", 404);
  if (!getMembership(agencyId, target.id)) return bad(res, "Member not found", 404);
  run("UPDATE memberships SET role = ? WHERE agency_id = ? AND user_id = ?", role, agencyId, target.id);
  return ok(res, { userId: Number(req.body.userId), role });
}));

app.post("/api/agency/removeMember", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const target = userByNumeric(Number(req.body?.userId));
  if (!target || !getMembership(agencyId, target.id)) return bad(res, "Member not found", 404);
  const admins = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE agency_id = ? AND role = 'admin'", agencyId)!.n);
  if (target.id === req.user!.id && admins <= 1) return bad(res, "Make someone else an admin first", 400);
  run("DELETE FROM memberships WHERE agency_id = ? AND user_id = ?", agencyId, target.id);
  return ok(res, true);
}));

app.post("/api/agency/leaveAgency", authRequired, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  if (req.role === "admin") {
    const admins = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE agency_id = ? AND role = 'admin'", agencyId)!.n);
    if (admins <= 1) return bad(res, "Make someone else an admin first", 400);
  }
  run("DELETE FROM memberships WHERE agency_id = ? AND user_id = ?", agencyId, req.user!.id);
  return ok(res, true);
}));

app.post("/api/agency/renameAgency", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const name = String(req.body?.name ?? "").trim();
  if (!name || name.length > 80) return bad(res, "Name must be 1 to 80 characters");
  run("UPDATE agencies SET name = ? WHERE id = ?", name, agencyId);
  return ok(res, { id: agencyId, name });
}));

app.post("/api/agency/upgradeToOrg", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  run("UPDATE agencies SET type = 'org' WHERE id = ?", agencyId);
  return ok(res, { id: agencyId, type: "org" });
}));

app.post("/api/agency/resendInvite", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const id = String(req.body?.inviteId ?? "");
  const inv = one<{ token: string; expires_at: number }>("SELECT token, expires_at FROM invites WHERE id = ? AND agency_id = ?", id, agencyId);
  if (!inv) return bad(res, "Invite not found", 404);
  return ok(res, { id, link: `http://localhost:3210/invite/${inv.token}`, expiresAt: inv.expires_at });
}));

app.post("/api/agency/revokeInvite", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  run("DELETE FROM invites WHERE id = ? AND agency_id = ?", String(req.body?.inviteId ?? ""), agencyId);
  return ok(res, true);
}));

app.post("/api/agency/moveProject", authRequired, adminOnly, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const target = String(req.body?.targetAgencyId ?? "");
  const project = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, agencyId);
  if (!project) return bad(res, "Not found", 404);
  if (!getMembership(target, req.user!.id)) return bad(res, "Not found", 404);
  run("UPDATE projects SET agency_id = ? WHERE id = ?", target, projectId);
  return ok(res, true);
}));

/* --------------------------------------------------------------- wallet */

app.get("/api/wallet/detail", authRequired, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  return ok(res, walletDetail(agencyId));
}));

app.get("/api/wallet/transactions", authRequired, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  return ok(res, { items: transactions(agencyId, limit), nextCursor: null });
}));

app.post("/api/wallet/quote", authRequired, h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return bad(res, "Invalid parameters");
  return ok(res, quoteItems(items, agencyId));
}));

/* -------------------------------------------------------------- payment */

app.post("/api/payment/listPlans", h(async (_req, res) => {
  return ok(res, {
    plans: PLANS.map((p) => ({ id: p.id, name: p.name, credits: p.credits, prices: [{ currency: p.currency, symbol: "₹", amount: (p.amountPaise / 100).toFixed(2) }], amountPaise: p.amountPaise })),
    currency: "INR",
    country: "IN",
  });
}));

app.post("/api/payment/createOrder", authRequired, requirePermission("billing.pay"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const planId = Number(req.body?.planId);
  const currency = String(req.body?.currency ?? "INR");
  const plan = Number.isInteger(planId) && planId > 0 ? planFor(planId) : undefined;
  if (!plan) return bad(res, "Unknown plan, or it cannot be bought in this currency", 400);
  if (currency !== plan.currency) return res.status(409).json({ code: 400, data: null, message: "Prices changed for your location, reload the plans" });
  const id = uuid();
  const gatewayOrderId = `order_${crypto.randomBytes(9).toString("hex")}`;
  run(
    "INSERT INTO orders (id, agency_id, user_id, plan_id, amount_paise, credits, currency, gateway_order_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
    id,
    agencyId,
    req.user!.id,
    plan.id,
    plan.amountPaise,
    plan.credits,
    plan.currency,
    gatewayOrderId,
    now(),
  );
  return ok(res, {
    orderId: id,
    planId: plan.id,
    amount: (plan.amountPaise / 100).toFixed(2),
    currency: plan.currency,
    amountPaise: plan.amountPaise,
    credits: plan.credits,
    gatewayOrderId,
    keyId: process.env.RAZORPAY_KEY_ID ?? "rzp_test_kronicle",
  });
}));

app.post("/api/payment/getOrder", authRequired, h(async (req, res) => {
  const orderId = String(req.body?.orderId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return bad(res, "Invalid parameters");
  const order = one<any>("SELECT * FROM orders WHERE id = ? AND agency_id = ?", orderId, req.agencyId);
  if (!order) return bad(res, "Order not found", 404);
  return ok(res, {
    id: order.id,
    planId: order.plan_id,
    amount: (order.amount_paise / 100).toFixed(2),
    currency: order.currency,
    credits: order.credits,
    status: order.status,
    paymentId: order.payment_id,
    createdAt: order.created_at,
    amountPaise: order.amount_paise,
  });
}));

function verifySignature(orderId: string, paymentId: string, signature: string, secret = RZP_SECRET) {
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function markPaid(order: any, paymentId: string) {
  if (order.status === "paid") return;
  run("UPDATE orders SET status = 'paid', payment_id = ? WHERE id = ?", paymentId, order.id);
  creditWallet(order.agency_id, order.credits, { type: "topup", reason: "payment", actorUserId: order.user_id });
}

app.post("/api/payment/verifyPayment", authRequired, h(async (req, res) => {
  const rzpOrder = String(req.body?.razorpay_order_id ?? "");
  const rzpPayment = String(req.body?.razorpay_payment_id ?? "");
  const signature = String(req.body?.razorpay_signature ?? "");
  if (!rzpOrder || !rzpPayment || !signature) return bad(res, "Invalid parameters");
  const order = one<any>("SELECT * FROM orders WHERE gateway_order_id = ? AND agency_id = ?", rzpOrder, req.agencyId);
  if (!order) return bad(res, "Order not found", 404);
  if (!verifySignature(rzpOrder, rzpPayment, signature)) return bad(res, "Invalid payment signature", 400);
  markPaid(order, rzpPayment);
  return ok(res, { status: "paid", orderId: order.id, credits: order.credits });
}));

app.post("/api/payment/mockPay", authRequired, h(async (req, res) => {
  const orderId = String(req.body?.orderId ?? "");
  const order = one<any>("SELECT * FROM orders WHERE id = ? AND agency_id = ?", orderId, req.agencyId);
  if (!order) return bad(res, "Order not found", 404);
  const paymentId = `pay_mock_${crypto.randomBytes(6).toString("hex")}`;
  const signature = crypto.createHmac("sha256", RZP_SECRET).update(`${order.gateway_order_id}|${paymentId}`).digest("hex");
  markPaid(order, paymentId);
  return ok(res, { status: "paid", paymentId, signature, gatewayOrderId: order.gateway_order_id });
}));

app.post("/api/webhooks/razorpay", h(async (req, res) => {
  const signature = String(req.headers["x-razorpay-signature"] ?? "");
  const raw = (req as any).rawBody as Buffer | undefined;
  if (!raw) return res.status(400).json({ message: "No body" });
  const expected = crypto.createHmac("sha256", RZP_WEBHOOK).update(raw).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return res.status(401).json({ message: "Invalid signature" });
  }
  const event = req.body;
  if (event?.event === "payment.captured") {
    const entity = event?.payload?.payment?.entity;
    const order = one<any>("SELECT * FROM orders WHERE gateway_order_id = ?", entity?.order_id);
    if (order) markPaid(order, entity?.id ?? "unknown");
  }
  return res.json({ status: "ok" });
}));

/* -------------------------------------------------------------- projects */

app.post("/api/project/analyzeScript", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const text = String(req.body?.text ?? "").trim();
  if (!text) return bad(res, "Invalid parameters");
  if (text.length > 2_000_000) return bad(res, "Script too long");
  const ledgerId = holdCredits(agencyId, UNIT.analysis, { genType: "script_analysis", actorUserId: req.user!.user_id, items: 1, unit: UNIT.analysis });
  settleCredits(ledgerId, UNIT.analysis);
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = paras.length > 1 ? paras : [text];
  const episodes = chunks.map((content, i) => {
    const words = content.split(/\s+/).filter(Boolean).length;
    return {
      name: `Episode ${i + 1}: ${content.split(/[.!?]/)[0].slice(0, 48) || "Untitled"}`,
      content,
      chars: content.length,
      words,
      estimatedSeconds: Math.max(8, Math.round(words / 2.6)),
      endsOn: content.split(/[.!?]/).filter(Boolean).slice(-1)[0] ?? content.slice(-80),
    };
  });
  const words = episodes.reduce((s, e) => s + e.words, 0);
  const nameGuess = episodes[0].name.replace(/^Episode \d+:\s*/, "").split(" ").slice(0, 4).join(" ") || "Untitled";
  return ok(res, {
    splitMethod: chunks.length > 1 ? "paragraph" : "single",
    episodeCount: episodes.length,
    episodes,
    splitPresetId: "episode",
    preambleChars: 0,
    removed: [],
    structuredText: episodes.map((e) => `${e.name}\n${e.content}`).join("\n\n"),
    language: "English",
    words,
    estimatedMinutes: Math.max(1, Math.round(words / 150)),
    estimatedSeconds: episodes.reduce((s, e) => s + e.estimatedSeconds, 0),
    needsDuration: false,
    targetEpisodeSeconds: null,
    suggestions: { name: nameGuess, videoRatio: "9:16", directingStyleId: "fantasy-microdrama" },
    aiSuggested: true,
    cached: false,
  });
}));

app.post("/api/project/createFromScript", authRequired, requirePermission("project.create"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const name = String(req.body?.name ?? "Untitled").slice(0, 120);
  const episodes = Array.isArray(req.body?.episodes) && req.body.episodes.length
    ? req.body.episodes
    : [{ name: "Episode 1", content: String(req.body?.script ?? req.body?.text ?? "A new story.") }];
  const projectId = uuid();
  run(
    `INSERT INTO projects (id, agency_id, user_id, name, project_type, image_model, video_model, image_quality, video_ratio, art_style, director_manual, created_at)
     VALUES (?, ?, ?, ?, 'video', ?, ?, '1K', ?, ?, ?, ?)`,
    projectId,
    agencyId,
    req.user!.id,
    name,
    req.body?.imageModel ?? "openai:google/gemini-3.1-flash-image",
    req.body?.videoModel ?? "volcengine:ep-20260727140143-rwmnp",
    req.body?.videoRatio ?? "9:16",
    req.body?.artStyle ?? "Indian_Fantasy_Microdrama",
    req.body?.directorManual ?? "Indian_Fantasy_Microdrama",
    now(),
  );
  episodes.forEach((e: any, i: number) => {
    run(
      "INSERT INTO scripts (id, project_id, name, content, episode_number, version, type, status, created_at) VALUES (?, ?, ?, ?, ?, 1, 'v1', 'ready', ?)",
      uuid(),
      projectId,
      String(e.name ?? `Episode ${i + 1}`),
      String(e.content ?? ""),
      i + 1,
      now(),
    );
  });
  return ok(res, { projectId });
}));

app.post("/api/project/getProject", authRequired, h(async (req, res) => {
  const rows = all<any>("SELECT * FROM projects WHERE agency_id = ? AND status != 'deleted' ORDER BY created_at DESC", req.agencyId);
  return ok(res, rows.map((p) => ({
    id: p.id, projectType: p.project_type, imageModel: p.image_model, imageQuality: p.image_quality,
    videoModel: p.video_model, name: p.name, intro: "", type: "", artStyle: p.art_style,
    directorManual: p.director_manual, videoRatio: p.video_ratio, createTime: String(p.created_at),
    userId: p.user_id, agencyId: p.agency_id,
  })));
}));

app.post("/api/project/addProject", authRequired, requirePermission("project.create"), h(async (req, res) => {
  const projectId = uuid();
  run(
    `INSERT INTO projects (id, agency_id, user_id, name, project_type, image_model, video_model, image_quality, video_ratio, art_style, director_manual, created_at)
     VALUES (?, ?, ?, ?, 'video', ?, ?, ?, ?, ?, ?, ?)`,
    projectId, req.agencyId, req.user!.id, String(req.body?.name ?? "Untitled").slice(0, 120),
    req.body?.imageModel ?? "openai:google/gemini-3.1-flash-image",
    req.body?.videoModel ?? "volcengine:ep-20260727140143-rwmnp",
    req.body?.imageQuality ?? "1K", req.body?.videoRatio ?? "9:16",
    req.body?.artStyle ?? "Indian_Fantasy_Microdrama", req.body?.directorManual ?? "Indian_Fantasy_Microdrama", now(),
  );
  return ok(res, { message: "Project added successfully", projectId });
}));

app.post("/api/project/editProject", authRequired, requirePermission("project.edit"), h(async (req, res) => {
  const id = String(req.body?.id ?? req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", id, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  if (req.body?.name) run("UPDATE projects SET name = ? WHERE id = ?", String(req.body.name).slice(0, 120), id);
  return ok(res, true);
}));

app.post("/api/project/delProject", authRequired, requirePermission("project.delete"), h(async (req, res) => {
  const id = String(req.body?.id ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", id, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  run("UPDATE projects SET status = 'deleted' WHERE id = ?", id);
  return ok(res, true);
}));

app.post("/api/general/getSingleProject", authRequired, h(async (req, res) => {
  const id = String(req.body?.id ?? "");
  const p = one<any>("SELECT * FROM projects WHERE id = ? AND agency_id = ?", id, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  return res.json([p]);
}));

/* --------------------------------------------------------------- scripts */

app.post("/api/script/getScrptApi", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const scripts = all<any>("SELECT * FROM scripts WHERE project_id = ? ORDER BY episode_number ASC", projectId);
  return ok(res, scripts.map((s) => {
    const assets = all<any>("SELECT id, name FROM assets WHERE script_id = ?", s.id);
    return {
      id: s.id, name: s.name, content: s.content, estimatedSeconds: Math.max(3, Math.round(s.content.split(/\s+/).length / 2.6)),
      endsOn: s.content.split(/[.!?]/).filter(Boolean).slice(-1)[0] ?? s.content.slice(-80),
      version: s.version, type: s.type, sourceScriptId: null, editable: s.extract_state == null,
      editBlockedReason: s.extract_state === 1 ? "assets_extracted" : null, selectedVersion: null,
      activeScriptId: s.id, extractState: s.extract_state, errorReason: s.extract_state === -1 ? "Cancelled" : null,
      createTime: String(s.created_at), episodeNumber: s.episode_number, sortIndex: s.episode_number,
      relatedAssets: assets, progress: { currentStage: "plan", percent: 0, stages: { plan: "pending", table: "pending", video: "pending", anchors: "pending", derived: "pending", extraction: s.extract_state === 1 ? "done" : "pending", storyboard: "pending", otherAssets: "pending" } },
    };
  }));
}));

app.post("/api/script/batchAddScript", authRequired, requirePermission("project.edit"), h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const scripts = Array.isArray(req.body?.scripts) ? req.body.scripts : [];
  scripts.forEach((s: any, i: number) => {
    run("INSERT INTO scripts (id, project_id, name, content, episode_number, version, type, status, created_at) VALUES (?, ?, ?, ?, ?, 1, 'v1', 'ready', ?)", uuid(), projectId, String(s.name ?? `Episode ${i + 1}`), String(s.content ?? ""), i + 1, now());
  });
  return ok(res, true);
}));

app.post("/api/script/updateScript", authRequired, requirePermission("project.edit"), h(async (req, res) => {
  const id = String(req.body?.id ?? "");
  const s = one<{ project_id: string }>("SELECT project_id FROM scripts WHERE id = ?", id);
  if (!s || !one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", s.project_id, req.agencyId)) return bad(res, "Project not found", 404);
  run("UPDATE scripts SET name = ?, content = ? WHERE id = ?", String(req.body?.name ?? ""), String(req.body?.content ?? ""), id);
  return ok(res, true);
}));

app.post("/api/script/delScript", authRequired, requirePermission("project.edit"), h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  for (const id of ids) {
    const s = one<{ project_id: string }>("SELECT project_id FROM scripts WHERE id = ?", String(id));
    if (s && one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", s.project_id, req.agencyId)) {
      run("DELETE FROM scripts WHERE id = ?", String(id));
      run("DELETE FROM assets WHERE script_id = ?", String(id));
    }
  }
  return ok(res, true);
}));

const STOP = new Set(["The", "A", "An", "And", "But", "In", "On", "At", "To", "Of", "For", "With", "He", "She", "They", "It", "His", "Her", "Their"]);

function extractNames(content: string) {
  const caps = [...content.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})\b/g)]
    .map((m) => m[1])
    .filter((w) => !STOP.has(w.split(" ")[0]));
  const freq = new Map<string, number>();
  for (const c of caps) freq.set(c, (freq.get(c) ?? 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (ranked.length >= 3) return ranked.slice(0, 3);
  return ["Lead Character", "Main Location", "Key Object"];
}

app.post("/api/script/extractAssets", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const scripts = all<any>("SELECT * FROM scripts WHERE project_id = ?", projectId);
  const started: any[] = [];
  for (const s of scripts) {
    if (s.extract_state === 1) continue;
    const names = extractNames(s.content);
    const types = ["role", "scene", "tool"];
    names.forEach((n, i) => {
      run(
        "INSERT INTO assets (id, project_id, script_id, name, type, describe, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)",
        uuid(), projectId, s.id, n.slice(0, 80), types[i % 3], `A ${types[i % 3]} from the script: ${n}`, now(),
      );
    });
    run("UPDATE scripts SET extract_state = 1 WHERE id = ?", s.id);
    started.push({ scriptId: s.id, episodeNumber: s.episode_number });
  }
  if (started.length) {
    const ledgerId = holdCredits(agencyId, UNIT.extract, { genType: "asset-extraction", actorUserId: req.user!.user_id, items: started.length, unit: UNIT.extract });
    setTimeout(() => settleCredits(ledgerId, UNIT.extract), 1200);
  }
  return ok(res, { started, waiting: [], skipped: 0, waitingMessage: null });
}));

app.post("/api/script/cancelExtractAssets", authRequired, h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  for (const id of ids) run("UPDATE scripts SET extract_state = -1 WHERE id = ?", String(id));
  return ok(res, true);
}));

app.post("/api/script/pollScriptAssets", authRequired, h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  return ok(res, ids.map((id: any) => one("SELECT id, extract_state AS extractState FROM scripts WHERE id = ?", String(id))));
}));

app.post("/api/scriptEnhancement/generate", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const scripts = all<any>("SELECT * FROM scripts WHERE project_id = ?", projectId);
  if (!scripts.length) return ok(res, { results: [], copied: 0, blocked: [] });
  const ledgerId = holdCredits(agencyId, scripts.length * UNIT.text, { genType: "universal_text", actorUserId: req.user!.user_id, items: scripts.length, unit: UNIT.text });
  scripts.forEach((s) => {
    const enhanced = `SHOOT-READY\n\n${s.content}\n\n[Enhanced for screen: stronger hook, clearer turns, stronger cliffhanger.]`;
    run("UPDATE scripts SET content = ? WHERE id = ?", enhanced, s.id);
  });
  setTimeout(() => settleCredits(ledgerId, scripts.length * UNIT.text), 1500);
  return ok(res, { scriptSource: req.body?.scriptSource ?? "original", results: scripts.map((s) => ({ sourceScriptId: s.id, episodeNumber: s.episode_number, status: "generating", alreadyRunning: false })), republished: 0, copied: 0, blocked: [] });
}));

app.post("/api/cornerScape/getAllAssets", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const assets = all<any>("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC", projectId);
  return ok(res, {
    data: assets.map((a) => ({
      id: a.id, name: a.name, prompt: a.prompt, remark: null, type: a.type, describe: a.describe,
      scriptId: a.script_id, imageId: a.image_path ? a.id : null, assetsId: null, projectId: a.project_id,
      flowId: null, startTime: 0, promptState: a.prompt ? "completed" : null, state: a.image_path ? "completed" : a.state,
      model: a.model, resolution: a.resolution, asset_url: a.image_path, filePath: a.image_path,
      tier: "core", lookLocked: !!a.look_locked, historyImages: all("SELECT id, path AS asset_url, path AS filePath, created_at AS createdAt FROM asset_images WHERE asset_id = ? ORDER BY created_at DESC", a.id),
      relatedAudio: [], referenceImages: [], sceneCount: 0, shotCount: 0, episodeNumbers: [1],
    })),
  });
}));

app.post("/api/assets/getAssetsApi", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const assets = all<any>("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC", projectId);
  return ok(res, { data: assets, total: assets.length });
}));

app.post("/api/assets/getAssetCounts", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const n = one<{ n: number }>("SELECT COUNT(*) AS n FROM assets WHERE project_id = ?", projectId)!.n;
  return ok(res, { core: n, other: 0, total: n });
}));

/* ------------------------------------------------------------ generation */

function scheduleSettle(ledgerId: string, actual: number, delay: number) {
  setTimeout(() => {
    try { settleCredits(ledgerId, actual); } catch (e) { console.error("settle failed", e); }
  }, delay);
}

app.post("/api/assetsGenerate/batchPolishAssetsPrompt", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return bad(res, "Invalid parameters");
  const itemsForAsset = items.map((it: any) => {
    const aid = String(it.assetsId ?? it.id ?? "");
    const asset = one<any>("SELECT * FROM assets WHERE id = ? AND project_id = ?", aid, projectId);
    if (!asset) throw new BadRequestError("Asset does not exist", 404);
    return { asset, item: it };
  });
  const hold = computeHold(items.length, Number(req.body?.concurrentCount), UNIT.text);
  const ledgerId = holdCredits(agencyId, hold, { genType: "asset_prompt", actorUserId: req.user!.user_id, items: items.length, unit: UNIT.text });
  try {
    itemsForAsset.forEach(({ asset, item }: any) => {
      const prompt = `Cinematic ${asset.type} portrait of ${item.name ?? asset.name}: ${item.describe ?? asset.describe ?? "a striking subject"}. Photorealistic, dramatic key light, 85mm, shallow depth of field, film grain.`;
      run("UPDATE assets SET prompt = ?, prompt_state = 'completed' WHERE id = ?", prompt, asset.id);
    });
  } catch (e) {
    settleCredits(ledgerId, 0, "failed");
    throw e;
  }
  scheduleSettle(ledgerId, items.length * UNIT.text, 2500);
  return ok(res, { total: items.length });
}));

app.post("/api/assetsGenerate/batchGenerateImageAssets", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return bad(res, "Invalid parameters");
  for (const it of items) {
    const asset = one("SELECT id FROM assets WHERE id = ? AND project_id = ?", String(it.id ?? ""), projectId);
    if (!asset) return bad(res, "Asset does not exist", 404);
  }
  const hold = computeHold(items.length, Number(req.body?.concurrentCount), UNIT.image);
  const ledgerId = holdCredits(agencyId, hold, { genType: "asset_prompt", actorUserId: req.user!.user_id, items: items.length, unit: UNIT.image });
  items.forEach((it: any) => {
    const url = svgImage(it.name ?? "Asset", String(it.prompt ?? "").slice(0, 60), "LOOK");
    run("INSERT INTO asset_images (id, asset_id, path, model, created_at) VALUES (?, ?, ?, ?, ?)", uuid(), String(it.id), url, req.body?.model ?? "mock-image", now());
    run("UPDATE assets SET image_path = ?, state = 'completed', model = ?, resolution = ?, prompt = COALESCE(prompt, ?) WHERE id = ?", url, req.body?.model ?? "mock-image", req.body?.resolution ?? "1K", String(it.prompt ?? ""), String(it.id));
  });
  scheduleSettle(ledgerId, items.length * UNIT.image, 3000);
  return ok(res, { total: items.length });
}));

app.post("/api/production/plan/generatePlan", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const scriptId = String(req.body?.scriptId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const scripts = all<any>("SELECT * FROM scripts WHERE project_id = ? ORDER BY episode_number ASC", projectId);
  if (!scripts.length) return bad(res, "Extract the assets for this episode before building the plan", 400);
  const hasAssets = one("SELECT id FROM assets WHERE project_id = ? LIMIT 1", projectId);
  if (!hasAssets) return bad(res, "Extract the assets for this episode before building the plan", 400);
  const ledgerId = holdCredits(agencyId, UNIT.text, { genType: "universal_text", actorUserId: req.user!.user_id, items: 1, unit: UNIT.text });
  const content = {
    lens: "24mm wide, 50mm push-in, 85mm close-ups",
    pacing: "fast-cut microdrama",
    scenes: scripts.slice(0, 3).map((s, i) => ({
      id: `1-${i + 1}`,
      heading: `SCENE ${i + 1} — ${s.name}`,
      shots: Array.from({ length: 6 }, (_, j) => ({ shot: j + 1, framing: j % 3 === 0 ? "wide" : j % 3 === 1 ? "medium" : "close", move: j % 2 ? "handheld push-in" : "static" })),
    })),
  };
  run("INSERT INTO plans (id, project_id, script_id, content, status, created_at) VALUES (?, ?, ?, ?, 'ready', ?)", uuid(), projectId, scriptId || scripts[0].id, JSON.stringify(content), now());
  scheduleSettle(ledgerId, UNIT.text, 1800);
  return ok(res, content);
}));

app.post("/api/production/plan/getPlan", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const plan = one<any>("SELECT * FROM plans WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", projectId);
  if (!plan) return ok(res, null);
  return ok(res, { id: plan.id, content: JSON.parse(plan.content), status: plan.status });
}));

app.post("/api/production/storyboard/batchGenerateImage", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const scriptId = String(req.body?.scriptId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const count = Math.min(12, Math.max(1, Number(req.body?.shots ?? 6)));
  const hold = computeHold(count, Number(req.body?.concurrentCount ?? count), UNIT.image);
  const ledgerId = holdCredits(agencyId, hold, { genType: "storyboard_image", actorUserId: req.user!.user_id, items: count, unit: UNIT.image });
  const created: any[] = [];
  for (let i = 0; i < count; i++) {
    const img = svgImage(`Shot ${i + 1}`, "storyboard frame", "STORYBOARD");
    const id = uuid();
    run(
      "INSERT INTO storyboards (id, project_id, script_id, shot_number, scene, prompt, image_path, video_prompt, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'image_ready', ?)",
      id, projectId, scriptId || null, i + 1, `Scene 1-${Math.floor(i / 3) + 1}`, `Cinematic frame ${i + 1}`,
      img, `Camera pushes in on shot ${i + 1}`, now(),
    );
    created.push({ id, image: img, shot: i + 1 });
  }
  scheduleSettle(ledgerId, count * UNIT.image, 3000);
  return ok(res, { items: created, warning: null });
}));

app.post("/api/production/storyboard/getStoryboardData", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const rows = all<any>("SELECT * FROM storyboards WHERE project_id = ? ORDER BY shot_number ASC", projectId);
  return ok(res, { data: rows, total: rows.length });
}));

app.post("/api/production/getFlowData", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const plan = one<any>("SELECT * FROM plans WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", projectId);
  const storyboards = all<any>("SELECT * FROM storyboards WHERE project_id = ? ORDER BY shot_number ASC", projectId);
  const tracks = all<any>("SELECT * FROM tracks WHERE project_id = ? ORDER BY position ASC", projectId);
  const clips = all<any>("SELECT * FROM clips WHERE track_id IN (SELECT id FROM tracks WHERE project_id = ?) ORDER BY position ASC", projectId);
  return ok(res, { plan: plan ? { id: plan.id, content: JSON.parse(plan.content) } : null, storyboards, tracks, clips });
}));

app.post("/api/production/saveFlowData", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
  const clips = Array.isArray(req.body?.clips) ? req.body.clips : [];
  run("DELETE FROM clips WHERE track_id IN (SELECT id FROM tracks WHERE project_id = ?)", projectId);
  run("DELETE FROM tracks WHERE project_id = ?", projectId);
  tracks.forEach((t: any, i: number) => {
    run("INSERT INTO tracks (id, project_id, script_id, name, kind, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", String(t.id), projectId, req.body?.episodesId ?? null, String(t.name ?? `Track ${i + 1}`), String(t.kind ?? "video"), i, now());
  });
  clips.forEach((c: any, i: number) => {
    run("INSERT INTO clips (id, track_id, storyboard_id, media_path, start_ms, duration_ms, trim_in_ms, trim_out_ms, position, status, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", String(c.id), String(c.trackId), c.storyboardId ?? null, c.mediaPath ?? null, Number(c.startMs ?? 0), Number(c.durationMs ?? 2000), Number(c.trimInMs ?? 0), c.trimOutMs ?? null, i, c.status ?? "ready", c.prompt ?? null, now());
  });
  return ok(res, true);
}));

app.post("/api/production/workbench/addTrack", authRequired, h(async (req, res) => {
  const id = uuid();
  run("INSERT INTO tracks (id, project_id, script_id, name, kind, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, String(req.body?.projectId ?? ""), req.body?.scriptId ?? null, String(req.body?.name ?? "Video"), String(req.body?.kind ?? "video"), Number(req.body?.position ?? 0), now());
  return ok(res, { id });
}));

app.post("/api/production/workbench/generateVideo", authRequired, requirePermission("generate.run"), h(async (req, res) => {
  const agencyId = needAgency(req, res);
  if (!agencyId) return;
  const projectId = String(req.body?.projectId ?? "");
  const p = one("SELECT id FROM projects WHERE id = ? AND agency_id = ?", projectId, req.agencyId);
  if (!p) return bad(res, "Not found", 404);
  const sb = one<any>("SELECT * FROM storyboards WHERE project_id = ? ORDER BY shot_number ASC LIMIT 1", projectId);
  const label = sb?.prompt ?? "Kronicle shot";
  const url = await renderClipVideo(label, 2);
  const ledgerId = holdCredits(agencyId, UNIT.video, { genType: "workbench_video_generation", actorUserId: req.user!.user_id, items: 1, unit: UNIT.video });
  let trackId = String(req.body?.trackId ?? "");
  if (!trackId || !one("SELECT id FROM tracks WHERE id = ? AND project_id = ?", trackId, projectId)) {
    trackId = uuid();
    run("INSERT INTO tracks (id, project_id, script_id, name, kind, position, created_at) VALUES (?, ?, ?, 'Video', 'video', 0, ?)", trackId, projectId, req.body?.scriptId ?? null, now());
  }
  const videoId = uuid();
  run("INSERT INTO videos (id, project_id, script_id, clip_id, path, status, created_at) VALUES (?, ?, ?, NULL, ?, 'ready', ?)", videoId, projectId, req.body?.scriptId ?? null, url, now());
  const clipId = uuid();
  run("INSERT INTO clips (id, track_id, storyboard_id, media_path, start_ms, duration_ms, trim_in_ms, trim_out_ms, position, status, prompt, created_at) VALUES (?, ?, ?, ?, 0, 2000, 0, NULL, 0, 'ready', ?, ?)", clipId, trackId, sb?.id ?? null, url, label, now());
  scheduleSettle(ledgerId, UNIT.video, 1800);
  return ok(res, { id: videoId, url, clipId, trackId });
}));

app.post("/api/production/workbench/getGenerateData", authRequired, h(async (req, res) => {
  const projectId = String(req.body?.projectId ?? "");
  return ok(res, {
    storyboardList: all("SELECT * FROM storyboards WHERE project_id = ? ORDER BY shot_number ASC", projectId),
    trackList: all("SELECT * FROM tracks WHERE project_id = ? ORDER BY position ASC", projectId),
    anchorList: all("SELECT * FROM assets WHERE project_id = ?", projectId),
  });
}));

app.post("/api/production/workbench/getFileUrl", authRequired, h(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const out: Record<string, string> = {};
  for (const it of items) {
    const id = String(it.id ?? it);
    const sb = one<any>("SELECT image_path FROM storyboards WHERE id = ?", id);
    const cl = one<any>("SELECT media_path FROM clips WHERE id = ?", id);
    const vd = one<any>("SELECT path FROM videos WHERE id = ?", id);
    const url = sb?.image_path ?? cl?.media_path ?? vd?.path;
    if (url) out[id] = url;
  }
  return ok(res, { data: out });
}));

app.post("/api/editor/export", authRequired, h(async (req, res) => {
  const clips = Array.isArray(req.body?.clips) ? req.body.clips : [];
  const url = await exportTimeline(clips.map((c: any) => ({ path: String(c.path ?? ""), trimInMs: Number(c.trimInMs ?? 0), trimOutMs: c.trimOutMs ? Number(c.trimOutMs) : undefined, label: c.label })));
  return ok(res, { url });
}));

app.post("/api/demo/session", h(async (req, res) => {
  if (process.env.DEMO_MODE === "false") return res.status(404).json({ message: "Not found" });
  const ip = req.ip ?? "";
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
  if (!local) return res.status(403).json({ message: "Demo mode is local only" });
  const { user, agencyId } = await ensureDemo();
  setSessionCookie(res, signToken(user));
  return res.json({ demo: true, agencyId, email: user.email, credits: walletDetail(agencyId) });
}));

app.get("/api/version", h(async (_req, res) => res.json({ release: "kronicle.kee-dev" })));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof BadRequestError) return res.status(err.status).json({ code: err.status, data: null, message: err.message });
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`Kronicle API on http://localhost:${PORT} (billing=${billingMode()})`);
});
