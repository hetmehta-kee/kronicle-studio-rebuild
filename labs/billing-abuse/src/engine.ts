/**
 * Billing lab engine: play-money wallet, vulnerable vs fixed hold policy,
 * farm-org aggregation, ₹ target math and abuse detection.
 * Never touches the live service.
 */

export type Mode = "vulnerable" | "fixed";

export interface LedgerRow {
  id: number;
  type: "topup" | "generation";
  genType?: string;
  status: "pending" | "completed" | "failed";
  held: number;
  delta: number;
  items?: number;
  mode: Mode;
}

export class Wallet {
  balance: number;
  held = 0;
  ledger: LedgerRow[] = [];
  private seq = 0;
  constructor(public name: string, balance = 0) {
    this.balance = balance;
    if (balance) this.ledger.push(this.row("topup", "completed", 0, balance));
  }
  private row(type: "topup" | "generation", status: "pending" | "completed" | "failed", held: number, delta: number, genType?: string, items?: number): LedgerRow {
    return { id: ++this.seq, type, genType, status, held, delta, items, mode: "vulnerable" };
  }
  available() { return this.balance; }
  hold(amount: number, genType: string, items: number, mode: Mode) {
    const r = this.row("generation", "pending", amount, 0, genType, items);
    r.mode = mode;
    this.balance = round6(this.balance - amount);
    this.held = round6(this.held + amount);
    this.ledger.push(r);
    return r;
  }
  settle(row: LedgerRow, actual: number) {
    row.status = "completed";
    row.delta = round6(-actual);
    this.held = round6(this.held - row.held);
    this.balance = round6(this.balance - (actual - row.held));
  }
}

export function round6(n: number) { return Math.round(n * 1e6) / 1e6; }

export function holdFor(items: number, cc: number | undefined, unit: number, mode: Mode) {
  const count = mode === "fixed" ? items : Math.min(items, cc ?? 1);
  return round6(count * unit);
}

export interface BatchResult {
  ok: boolean;
  hold: number;
  actual: number;
  reason?: string;
}

export function runBatch(wallet: Wallet, opts: { items: number; cc?: number; unit: number; mode: Mode; genType?: string }): BatchResult {
  const hold = holdFor(opts.items, opts.cc, opts.unit, opts.mode);
  if (wallet.balance < hold) return { ok: false, hold, actual: 0, reason: "insufficient" };
  const row = wallet.hold(hold, opts.genType ?? "image.generate", opts.items, opts.mode);
  const actual = round6(opts.items * opts.unit);
  wallet.settle(row, actual);
  return { ok: true, hold, actual };
}

export interface FarmParams {
  orgs: number;
  batchesPerOrg: number;
  items: number;
  cc: number;
  unit: number;
  mode: Mode;
  bonusPerOrg?: number;
}

export interface FarmResult {
  mode: Mode;
  orgs: number;
  freeCredits: number;
  batches: number;
  accepted: number;
  rejected: number;
  workCredits: number;
  heldAtSubmit: number;
  finalBalance: number;
  retailValueInr: number;
  providerCostUsd: number;
  amplification: number;
}

export function runFarm(p: FarmParams): FarmResult {
  const bonus = p.bonusPerOrg ?? 1000;
  const orgs = p.orgs;
  const freeCredits = orgs * bonus;
  const wallets = Array.from({ length: orgs }, (_, i) => new Wallet(`farm-${i + 1}`, bonus));
  let accepted = 0, rejected = 0, work = 0, heldAtSubmit = 0;
  // Model the exploit as parallel submission: every batch takes its (tiny)
  // hold before any settlement lands. This is the only way the small hold
  // turns into work far beyond the balance.
  for (const w of wallets) {
    const pending: Array<{ row: ReturnType<Wallet["hold"]>; actual: number }> = [];
    for (let b = 0; b < p.batchesPerOrg; b++) {
      const hold = holdFor(p.items, p.cc, p.unit, p.mode);
      if (w.balance < hold) { rejected++; continue; }
      const row = w.hold(hold, "image.generate", p.items, p.mode);
      pending.push({ row, actual: round6(p.items * p.unit) });
      accepted++;
      heldAtSubmit += hold;
    }
    for (const item of pending) {
      w.settle(item.row, item.actual);
      work += item.actual;
    }
  }
  const finalBalance = round6(wallets.reduce((s, w) => s + w.balance, 0));
  return {
    mode: p.mode,
    orgs,
    freeCredits,
    batches: p.batchesPerOrg * orgs,
    accepted,
    rejected,
    workCredits: round6(work),
    heldAtSubmit: round6(heldAtSubmit),
    finalBalance,
    retailValueInr: round6(work * 1), // ₹1 per credit in this model
    providerCostUsd: round6(work * 0.01),
    amplification: round6(work / freeCredits),
  };
}

/** Org accounts needed for a ₹ retail-credit target (1 credit = ₹1). */
export function orgsForRupeeTarget(targetInr: number, bonus = 1000) {
  return Math.ceil(targetInr / bonus);
}

/** Batches/orgs needed for a provider-cost target at the given unit and cost. */
export function orgsForProviderTarget(targetUsd: number, unit: number, items: number, cc: number, mode: Mode, bonus = 1000, costPerCredit = 0.01) {
  const requiredWork = targetUsd / costPerCredit;
  const perBatch = items * unit;
  const batches = Math.ceil(requiredWork / perBatch);
  const hold = holdFor(items, cc, unit, mode);
  const creditsNeeded = batches * hold;
  return { requiredWork: round6(requiredWork), batches, orgs: Math.ceil(creditsNeeded / bonus) };
}

export interface DetectionEvent {
  userId: string;
  orgsAdmin: number;
  orgsCreated24h: number;
  walletBalance: number;
  batchItems: number;
  batchHold: number;
}

export function detect(events: DetectionEvent[]) {
  const flags: Array<{ userId: string; rule: string; detail: string }> = [];
  for (const e of events) {
    if (e.orgsCreated24h >= 3) flags.push({ userId: e.userId, rule: "D1_many_new_orgs", detail: `${e.orgsCreated24h} orgs created in 24h` });
    if (e.orgsAdmin >= 5) flags.push({ userId: e.userId, rule: "D2_admin_of_many_orgs", detail: `admin of ${e.orgsAdmin} orgs` });
    if (e.walletBalance < 0) flags.push({ userId: e.userId, rule: "D3_negative_balance", detail: `balance ${e.walletBalance}` });
    if (e.batchHold > 0 && e.batchItems / e.batchHold > 3) flags.push({ userId: e.userId, rule: "D4_batch_hold_mismatch", detail: `${e.batchItems} items vs hold ${e.batchHold}` });
  }
  return flags;
}
