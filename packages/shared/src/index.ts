export const ROLES = ["admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: [
    "billing.pay",
    "generate.run",
    "members.manage",
    "project.create",
    "project.delete",
    "project.edit",
    "project.move",
    "project.view",
    "session.use",
    "workspace.manage",
  ],
  editor: [
    "generate.run",
    "project.create",
    "project.edit",
    "project.move",
    "project.view",
    "session.use",
  ],
  viewer: ["project.view", "session.use"],
};

export const PLANS = [
  { id: 1, name: "100 credits", credits: 100, amountPaise: 10000, currency: "INR" },
  { id: 2, name: "220 credits", credits: 220, amountPaise: 20000, currency: "INR" },
  { id: 3, name: "550 credits", credits: 550, amountPaise: 50000, currency: "INR" },
] as const;

export const BONUS = { personal: 100, org: 1000 } as const;

/** Unit prices used by the observable ledger (fractional credits are real). */
export const UNIT = {
  text: 3.135,
  image: 7.0224,
  video: 134,
  extract: 4,
  analysis: 3,
} as const;

export type GenAction =
  | "text.generate"
  | "script.analysis"
  | "image.generate"
  | "video.generate"
  | "asset.extract"
  | "review.fix";

export const GEN_ACTIONS: GenAction[] = [
  "text.generate",
  "script.analysis",
  "image.generate",
  "video.generate",
  "asset.extract",
  "review.fix",
];

export const PROJECT_STAGES = [
  "script",
  "assets",
  "plan",
  "variants",
  "storyboard",
  "video",
] as const;

export const GEN_STATUS = ["pending", "completed", "failed"] as const;
export type GenStatus = (typeof GEN_STATUS)[number];

export type AgencyType = "individual" | "org";

export interface WalletDetail {
  balanceCredits: number;
  heldCredits: number;
  totalCredits: number;
}

export interface WalletRow {
  id: string;
  type: "topup" | "generation" | "adjustment";
  genType?: string;
  status: GenStatus;
  creditsHeld: number;
  creditsDelta: number;
  reason?: string;
  actorUserId: number;
  createdAt: number;
}

export function holdFor(items: number, concurrentCount: number | undefined, unit: number, mode: "vulnerable" | "fixed") {
  const count = mode === "fixed" ? items : Math.min(items, concurrentCount ?? 1);
  return round6(count * unit);
}

export function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
