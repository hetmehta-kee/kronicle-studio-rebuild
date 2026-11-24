import { UNIT, holdFor, round6, type GenAction } from "@kronicle/shared";
import { ensureWallet, getWallet, ledger, run, uuid, now, one } from "./db.js";

export type BillingMode = "vulnerable" | "fixed";
export const billingMode = (): BillingMode =>
  process.env.BILLING_MODE === "fixed" ? "fixed" : "vulnerable";

export function walletDetail(agencyId: string) {
  const w = ensureWallet(agencyId);
  return {
    balanceCredits: round6(w.balance),
    heldCredits: round6(w.held),
    totalCredits: round6(w.balance + w.held),
  };
}

export function transactions(agencyId: string, limit = 50) {
  return ledger(agencyId, limit);
}

export function creditWallet(
  agencyId: string,
  amount: number,
  opts: { type?: "topup" | "adjustment"; reason?: string; actorUserId?: number } = {},
) {
  ensureWallet(agencyId);
  run("UPDATE wallets SET balance = balance + ? WHERE agency_id = ?", round6(amount), agencyId);
  run(
    `INSERT INTO ledger (id, agency_id, type, gen_type, status, credits_held, credits_delta, reason, actor_user_id, created_at)
     VALUES (?, ?, ?, NULL, 'completed', 0, ?, ?, ?, ?)`,
    uuid(),
    agencyId,
    opts.type ?? "topup",
    round6(amount),
    opts.reason ?? null,
    opts.actorUserId ?? null,
    now(),
  );
}

export class InsufficientCredits extends Error {
  constructor(public shortfall: number) {
    super("insufficient credits");
  }
}

export function holdCredits(
  agencyId: string,
  amount: number,
  meta: { genType: string; actorUserId?: number; items?: number; unit?: number },
) {
  const w = ensureWallet(agencyId);
  if (w.balance < amount) throw new InsufficientCredits(round6(amount - w.balance));
  const ledgerId = uuid();
  run("UPDATE wallets SET balance = balance - ?, held = held + ? WHERE agency_id = ?", round6(amount), round6(amount), agencyId);
  run(
    `INSERT INTO ledger (id, agency_id, type, gen_type, status, credits_held, credits_delta, reason, actor_user_id, meta, created_at)
     VALUES (?, ?, 'generation', ?, 'pending', ?, 0, NULL, ?, ?, ?)`,
    ledgerId,
    agencyId,
    meta.genType,
    round6(amount),
    meta.actorUserId ?? null,
    JSON.stringify({ items: meta.items, unit: meta.unit }),
    now(),
  );
  return ledgerId;
}

export function settleCredits(ledgerId: string, actual: number, status: "completed" | "failed" = "completed") {
  const row = one<{ id: string; agency_id: string; credits_held: number; status: string }>(
    "SELECT id, agency_id, credits_held, status FROM ledger WHERE id = ?",
    ledgerId,
  );
  if (!row || row.status !== "pending") return;
  const held = Number(row.credits_held);
  const charged = round6(actual);
  const delta = round6(charged - held);
  run(
    "UPDATE wallets SET held = held - ?, balance = balance - ? WHERE agency_id = ?",
    held,
    delta,
    row.agency_id,
  );
  run(
    "UPDATE ledger SET status = ?, credits_delta = ? WHERE id = ?",
    status,
    -charged,
    ledgerId,
  );
}

export function computeHold(items: number, concurrentCount: number | undefined, unit: number) {
  return holdFor(items, concurrentCount, unit, billingMode());
}

export function quoteItems(items: Array<Record<string, unknown>>, agencyId: string) {
  const priced = items.map((raw) => {
    const item = raw as {
      key?: string;
      action?: GenAction;
      text?: { promptChars?: number };
      image?: { count?: number; size?: string };
      video?: { durationSec?: number; clips?: number };
      extract?: { episodes?: number; groupSize?: number };
    };
    const action = item.action ?? "text.generate";
    let credits = 0;
    let breakdown: Record<string, unknown> = {};
    switch (action) {
      case "script.analysis":
        credits = UNIT.analysis;
        breakdown = { flatFee: true };
        break;
      case "image.generate": {
        const count = Math.max(1, Number(item.image?.count ?? 1));
        const size = item.image?.size ?? "1K";
        const unit = size === "4K" ? 14 : 8;
        credits = count * unit;
        breakdown = { images: count, size };
        break;
      }
      case "video.generate": {
        const clips = Math.max(1, Number(item.video?.clips ?? 1));
        const secs = Math.max(1, Number(item.video?.durationSec ?? 5));
        credits = clips * Math.ceil(secs / 5) * UNIT.video;
        breakdown = { clips, secondsPerClip: secs, resolution: "720p" };
        break;
      }
      case "asset.extract": {
        const episodes = Math.max(1, Number(item.extract?.episodes ?? 1));
        const group = Math.max(1, Number(item.extract?.groupSize ?? 5));
        credits = Math.ceil(episodes / group) * UNIT.extract;
        breakdown = { episodes, groupSize: group };
        break;
      }
      case "review.fix":
        credits = 3;
        breakdown = { flatFee: true };
        break;
      default:
        credits = UNIT.text;
        breakdown = { inputTokens: 25, outputTokens: 1000, priceSource: "flat_hold" };
    }
    return { key: item.key ?? action, action, credits: round6(credits), reserveCredits: round6(credits), estimateType: "estimate", breakdown };
  });
  const total = round6(priced.reduce((s, i) => s + i.credits, 0));
  const w = getWallet(agencyId)!;
  return {
    items: priced,
    totalCredits: total,
    wallet: {
      available: round6(w.balance),
      canAfford: w.balance >= total,
      shortfallCredits: round6(Math.max(0, total - w.balance)),
    },
  };
}
