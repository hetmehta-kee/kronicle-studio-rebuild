"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Mail, UserPlus } from "lucide-react";
import { useSession } from "@/components/session";
import { api, timeAgo } from "@/lib/api";
import { Badge, Button, Card, CardBody, Input, Label, Spinner } from "@/components/ui";

interface Member { userId: number; name: string; email: string; role: string; joinedAt: number }
interface Invite { id: string; email: string; role: string; expiresAt: number; createdAt: number }

export default function TeamPage() {
  const { me, active } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([
      api<any>("/api/agency/listMembers", { limit: 200, offset: 0 }),
      api<any>("/api/agency/listInvites", {}).catch(() => ({ data: { invites: [] } })),
    ]);
    setMembers(m.data.members ?? []);
    setInvites(i.data.invites ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLink(""); setBusy(true);
    try {
      const res = await api<any>("/api/agency/inviteMember", { email, role });
      setLink(res.data.link);
      setEmail("");
      await load();
    } catch (e: any) { setErr(e?.message ?? "Could not invite"); }
    finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const admin = me?.access?.role === "admin";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-muted">People and invites for <span className="text-fg">{active?.name}</span>.</p>

      <Card className="mt-6">
        <CardBody>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4 text-[#c4b5fd]" /> Invite someone</div>
          {admin ? (
            <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@studio.com" required />
              </div>
              <div className="w-36">
                <Label>Role</Label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none">
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <Button type="submit" loading={busy}>Send invite</Button>
            </form>
          ) : (
            <p className="text-sm text-muted">Only workspace admins can invite people.</p>
          )}
          {err && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
          {link && (
            <div className="mt-3 rounded-xl border border-dashed border-brand/40 bg-brand/5 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted"><Mail className="size-3.5" /> Invite link (email is not sent in the replica)</div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs">{link}</code>
                <Button size="sm" variant="secondary" onClick={copy}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Members</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
              <tr><th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Joined</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-t border-line">
                  <td className="px-4 py-3"><div className="font-medium">{m.name}</div><div className="text-xs text-muted">{m.email}</div></td>
                  <td className="px-4 py-3"><Badge tone={m.role === "admin" ? "brand" : "neutral"}>{m.role}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted">{timeAgo(m.joinedAt)}</td>
                </tr>
              ))}
              {!members.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">No members yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      {admin && invites.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Pending invites</h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Expires</th></tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-4 py-3">{i.email}</td>
                    <td className="px-4 py-3"><Badge>{i.role}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(i.expiresAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
