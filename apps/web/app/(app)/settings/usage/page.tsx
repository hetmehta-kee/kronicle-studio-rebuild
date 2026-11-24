"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { api, fmt, timeAgo } from "@/lib/api";
import { Badge, Card, Spinner } from "@/components/ui";

interface Tx { id: string; type: string; genType?: string; status: string; creditsHeld: number; creditsDelta: number; createdAt: number; actorUserId?: number }

export default function UsagePage() {
  const [tx, setTx] = useState<Tx[] | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<any>("/api/wallet/transactions?limit=200");
        setTx(res.data.items ?? []);
      } catch { setTx([]); }
    })();
  }, []);

  const rows = useMemo(() => {
    if (!tx) return [];
    if (filter === "all") return tx;
    if (filter === "debit") return tx.filter((t) => t.creditsDelta < 0);
    if (filter === "credit") return tx.filter((t) => t.creditsDelta > 0);
    return tx.filter((t) => t.genType === filter);
  }, [tx, filter]);

  const spent = (tx ?? []).filter((t) => t.creditsDelta < 0).reduce((s, t) => s + t.creditsDelta, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-muted">Who used this workspace's credits, on what and when.</p>
        </div>
        <Card className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <Activity className="size-4 text-[#c4b5fd]" />
          <span className="text-muted">Spent</span>
          <span className="font-mono font-semibold">{fmt(Math.abs(spent))}</span>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {[
          ["all", "All"], ["debit", "Debit"], ["credit", "Credit"],
          ["asset_prompt", "Prompts"], ["asset-extraction", "Extraction"], ["script_analysis", "Analysis"],
          ["storyboard_image", "Storyboard"], ["workbench_video_generation", "Video"],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === v ? "border-brand/50 bg-brand/10 text-[#c4b5fd]" : "border-line text-muted hover:text-fg"}`}>{l}</button>
        ))}
      </div>

      {tx === null ? (
        <div className="flex items-center gap-3 text-muted"><Spinner /> Loading usage…</div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">What</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Held</th><th className="px-4 py-2.5 text-right">Credits</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No credits were used in these filters.</td></tr>}
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-4 py-2.5 text-xs text-muted">{timeAgo(t.createdAt)}</td>
                  <td className="px-4 py-2.5">{t.type === "topup" ? "Top up" : (t.genType ?? "Generation").replaceAll("_", " ")}</td>
                  <td className="px-4 py-2.5"><Badge tone={t.status === "completed" ? "good" : t.status === "failed" ? "bad" : "warn"}>{t.status}</Badge></td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">{t.creditsHeld ? fmt(t.creditsHeld) : "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${t.creditsDelta >= 0 ? "text-emerald-300" : ""}`}>{t.creditsDelta >= 0 ? "+" : ""}{fmt(t.creditsDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
