"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CreditCard, Sparkles } from "lucide-react";
import { useSession } from "@/components/session";
import { api, fmt, money, timeAgo } from "@/lib/api";
import { Badge, Button, Card, CardBody, Spinner } from "@/components/ui";

interface Plan { id: number; name: string; credits: number; amountPaise: number; prices: { currency: string; amount: string }[] }
interface Tx { id: string; type: string; genType?: string; status: string; creditsHeld: number; creditsDelta: number; createdAt: number; reason?: string }

export default function BillingPage() {
  const { me, active, refresh } = useSession();
  const [wallet, setWallet] = useState<{ balanceCredits: number; heldCredits: number; totalCredits: number } | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [selected, setSelected] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [w, p, t] = await Promise.all([
      api<any>("/api/wallet/detail"),
      api<any>("/api/payment/listPlans", {}),
      api<any>("/api/wallet/transactions?limit=20"),
    ]);
    setWallet(w.data);
    setPlans(p.data.plans ?? []);
    setTx(t.data.items ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function buy() {
    setErr(""); setMsg("");
    if (me?.access?.role !== "admin") { setErr("Only workspace admins can buy credits."); return; }
    setBusy(true);
    try {
      const order = await api<any>("/api/payment/createOrder", { planId: selected, currency: "INR" });
      await api("/api/payment/mockPay", { orderId: order.data.orderId });
      setMsg(`Payment received — ${order.data.credits} credits added (mock checkout).`);
      await load();
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Payment failed");
    } finally { setBusy(false); }
  }

  if (!wallet) return <div className="flex items-center gap-3 p-8 text-muted"><Spinner /> Loading billing…</div>;
  const admin = me?.access?.role === "admin";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buy credits</h1>
          <p className="mt-1 text-sm text-muted">The more you buy, the more extra credits you get.</p>
        </div>
        <Card className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">Balance</div>
          <div className="flex items-baseline gap-1.5"><Sparkles className="size-4 text-[#c4b5fd]" /><span className="text-xl font-semibold">{fmt(wallet.balanceCredits)}</span><span className="text-xs text-muted">credits</span></div>
          {wallet.heldCredits > 0 && <div className="text-[11px] text-muted">{fmt(wallet.heldCredits)} held</div>}
        </Card>
      </div>

      {wallet.balanceCredits < 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 size-4" /> Your balance is negative. Top up to keep generating, or ask an admin.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p, i) => {
          const activePlan = selected === p.id;
          return (
            <button key={p.id} onClick={() => setSelected(p.id)} className={`rounded-2xl border p-5 text-left transition-colors ${activePlan ? "border-brand/60 bg-brand/5" : "border-line bg-surface hover:bg-surface-2"}`}>
              <div className="flex items-start justify-between">
                <div className="text-2xl font-semibold">{money(p.amountPaise)}</div>
                {activePlan && <Check className="size-4 text-[#c4b5fd]" />}
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm"><Sparkles className="size-4 text-[#c4b5fd]" /> {p.credits} credits</div>
              <div className="mt-1 text-xs text-muted">{i === 0 ? "Base rate" : "+10% extra"}</div>
            </button>
          );
        })}
      </div>

      <Card className="mt-5">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">{plans.find((p) => p.id === selected)?.credits ?? 0} credits</div>
            <div className="text-xs text-muted">Mock Razorpay checkout · no real charge</div>
          </div>
          <Button onClick={buy} loading={busy} disabled={!admin}>
            <CreditCard className="size-4" /> {admin ? `Pay ${money((plans.find((p) => p.id === selected)?.amountPaise ?? 0))}` : "Admins only"}
          </Button>
        </CardBody>
      </Card>

      {msg && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{msg}</div>}
      {err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recent credit activity</h2>
          <Badge>{active?.name}</Badge>
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">What</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Credits</th></tr>
            </thead>
            <tbody>
              {tx.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No activity yet.</td></tr>}
              {tx.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-4 py-2.5 text-xs text-muted">{timeAgo(t.createdAt)}</td>
                  <td className="px-4 py-2.5">{t.type === "topup" ? (t.reason === "org_bonus" ? "Organisation bonus" : t.reason === "signup_bonus" ? "Signup bonus" : "Top up") : (t.genType ?? "Generation").replaceAll("_", " ")}</td>
                  <td className="px-4 py-2.5"><Badge tone={t.status === "completed" ? "good" : t.status === "failed" ? "bad" : "warn"}>{t.status}</Badge></td>
                  <td className={`px-4 py-2.5 text-right font-mono ${t.creditsDelta >= 0 ? "text-emerald-300" : "text-fg"}`}>{t.creditsDelta >= 0 ? "+" : ""}{fmt(t.creditsDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
