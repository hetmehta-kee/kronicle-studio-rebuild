"use client";
import { useEffect, useState } from "react";
import { Building2, Check, Copy, User } from "lucide-react";
import { useSession } from "@/components/session";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardBody, Input, Label } from "@/components/ui";

export default function GeneralSettingsPage() {
  const { me, active, activeId, refresh } = useSession();
  const [name, setName] = useState(active?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { setName(active?.name ?? ""); }, [active?.name]);

  const admin = me?.access?.role === "admin";
  const isOrg = active?.type === "org";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg(""); setBusy(true);
    try {
      await api("/api/agency/renameAgency", { name });
      setMsg("Workspace renamed.");
      await refresh();
    } catch (e: any) { setErr(e?.message ?? "Could not rename"); }
    finally { setBusy(false); }
  }

  async function upgrade() {
    if (!confirm("Upgrade this workspace to an organisation? This cannot be undone.")) return;
    setErr(""); setMsg(""); setBusy(true);
    try {
      await api("/api/agency/upgradeToOrg", { name });
      setMsg("Workspace upgraded to an organisation.");
      await refresh();
    } catch (e: any) { setErr(e?.message ?? "Could not upgrade"); }
    finally { setBusy(false); }
  }

  async function copyId() {
    await navigator.clipboard.writeText(activeId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">General</h1>
      <p className="mt-1 text-sm text-muted">Workspace identity and access.</p>

      <Card className="mt-6">
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2">
              {isOrg ? <Building2 className="size-4 text-[#c4b5fd]" /> : <User className="size-4 text-[#c4b5fd]" />}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">{active?.name} <Badge tone={isOrg ? "brand" : "neutral"}>{isOrg ? "Organisation" : "Personal"}</Badge></div>
              <div className="text-xs text-muted">Your role: {active?.role}</div>
            </div>
          </div>

          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>Workspace name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!admin} />
            </div>
            {admin && <Button type="submit" loading={busy}>Save</Button>}
          </form>

          <div>
            <Label>Workspace ID</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">{activeId}</code>
              <Button size="sm" variant="secondary" onClick={copyId}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}</Button>
            </div>
          </div>

          {!isOrg && admin && (
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="text-sm font-semibold">Upgrade to an organisation</div>
              <p className="mt-1 text-xs text-muted">Invite people and share credits. This can't be undone: an organisation can't go back to personal.</p>
              <Button className="mt-3" variant="secondary" onClick={upgrade} loading={busy}>Upgrade</Button>
            </div>
          )}

          {msg && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{msg}</div>}
          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
