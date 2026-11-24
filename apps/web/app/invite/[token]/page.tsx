"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Spinner } from "@/components/ui";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<any>("/api/agency/getInviteInfo", { token });
        setInfo(res.data);
      } catch (e: any) {
        if (e?.status === 401) setNeedLogin(true);
        else setError(e?.message ?? "This invite is invalid or has expired");
      } finally { setLoading(false); }
    })();
  }, [token]);

  async function accept() {
    setAccepting(true); setError("");
    try {
      const res = await api<any>("/api/agency/acceptInvite", { token });
      window.localStorage.setItem("agencyId", res.data.agencyId);
      window.location.href = "/home";
    } catch (e: any) {
      setError(e?.message ?? "Could not accept the invite");
      setAccepting(false);
    }
  }

  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl brand-gradient text-white"><Sparkles className="size-4" /></span>
          <span className="text-lg font-semibold">kronicle</span>
        </div>

        {needLogin ? (
          <>
            <h1 className="text-2xl font-semibold">Sign in to join</h1>
            <p className="mt-2 text-sm text-muted">This invite is for a specific email. Sign in with that email to accept it.</p>
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
              <Button className="mt-6 w-full">Sign in <ArrowRight className="size-4" /></Button>
            </Link>
          </>
        ) : error && !info ? (
          <>
            <h1 className="text-2xl font-semibold">Invite unavailable</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <Link href="/home"><Button variant="secondary" className="mt-6 w-full">Go home</Button></Link>
          </>
        ) : info ? (
          <>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted">You were invited</div>
            <h1 className="text-2xl font-semibold">Join {info.agencyName}</h1>
            <p className="mt-2 text-sm text-muted">You were invited as <Badge tone="brand">{info.role}</Badge>. The invite expires in 7 days.</p>
            {!info.emailMatches && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                This invite was sent to a different email. Sign in with the invited address to accept it.
              </div>
            )}
            {info.alreadyMember && <div className="mt-4 text-xs text-muted">You're already a member of this workspace.</div>}
            {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
            <Button className="mt-6 w-full" onClick={accept} loading={accepting} disabled={!info.emailMatches}>Accept invite</Button>
            <p className="mt-3 text-center text-xs text-muted">You keep your personal workspace too.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
