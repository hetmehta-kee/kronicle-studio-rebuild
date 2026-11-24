import { detect, orgsForProviderTarget, orgsForRupeeTarget, runFarm, type Mode } from "./engine.js";

function arg(name: string, fallback: number) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const json = process.argv.includes("--json");
const orgs = arg("orgs", 10);
const batches = arg("batches", 142);
const items = arg("items", 100);
const cc = arg("cc", 1);
const unit = arg("unit", 7.0224);
const targetInr = arg("target-inr", 10000);
const targetUsd = arg("target-usd", 10000);

const vulnerable = runFarm({ orgs, batchesPerOrg: batches, items, cc, unit, mode: "vulnerable" });
const fixed = runFarm({ orgs, batchesPerOrg: batches, items, cc, unit, mode: "fixed" });
const rupeeOrgs = orgsForRupeeTarget(targetInr);
const providerTarget = orgsForProviderTarget(targetUsd, unit, items, cc, "vulnerable");

const result = {
  scenario: { orgs, batchesPerOrg: batches, items, cc, unit, modeNote: "vulnerable uses min(items, cc); fixed uses items" },
  targets: {
    rupee: { targetInr, orgsNeeded: rupeeOrgs, note: "10 org accounts x 1000 bonus = 10,000 credits at ₹1/credit" },
    provider: { targetUsd, ...providerTarget },
  },
  vulnerable,
  fixed,
  detector: detect([{
    userId: "main-login", orgsAdmin: orgs, orgsCreated24h: orgs,
    walletBalance: vulnerable.finalBalance, batchItems: items, batchHold: vulnerable.heldAtSubmit / Math.max(1, vulnerable.accepted),
  }]).slice(0, 8),
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const row = (label: string, v: FarmResult) =>
    `${label.padEnd(11)} | orgs ${String(v.orgs).padStart(3)} | batches ${String(v.batches).padStart(5)} | accepted ${String(v.accepted).padStart(5)} | work ${v.workCredits.toLocaleString("en-IN")} credits | held ${v.heldAtSubmit.toLocaleString("en-IN")} | final ${v.finalBalance.toLocaleString("en-IN")} | ₹${v.retailValueInr.toLocaleString("en-IN")} retail | $${v.providerCostUsd.toLocaleString("en-US")} provider | ${v.amplification}x`;
  console.log("Kronicle billing lab — play money, no live calls\n");
  console.log(row("vulnerable", vulnerable));
  console.log(row("fixed", fixed));
  console.log("");
  console.log(`₹${targetInr.toLocaleString("en-IN")} retail-credit target: ${rupeeOrgs} org accounts (1000 each).`);
  console.log(`$${targetUsd.toLocaleString("en-US")} provider-cost target: ${providerTarget.batches.toLocaleString("en-US")} batches / ${providerTarget.orgs.toLocaleString("en-US")} org accounts at hold ${unit}/batch.`);
  console.log("");
  console.log("Detector");
  for (const f of result.detector) console.log(`  ${f.rule}: ${f.detail}`);
}

// Local type import for the non-JSON branch.
import type { FarmResult } from "./engine.js";
