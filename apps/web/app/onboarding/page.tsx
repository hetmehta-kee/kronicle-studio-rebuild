"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, User, Sparkles, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Input, Label, Spinner } from "@/components/ui";

export default function OnboardingPage() {
  const router = useRouter();
  const [type, setType] = useState<"individual" | "org">("individual");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const me = await api<{ onboarded: boolean; name: string }>("/api/auth/me");
        if (me.onboarded) setExisting(me.name);
      } catch { router.replace("/login"); }
      finally { setLoading(false); }
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await api<{ data: { agencyId: string } }>("/api/user/onboard", { type, name: name || (type === "org" ? "Studio" : "Personal") });
      window.localStorage.setItem("agencyId", res.data.agencyId);
      window.location.href = "/home";
    } catch (err: any) {
      setError(err?.message ?? "Could not create the workspace");
      setSaving(false);
    }
  }

  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;

  if (existing) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl brand-gradient text-white"><Sparkles className="size-5" /></div>
          <h1 className="text-2xl font-semibold">Your workspace is ready</h1>
          <p className="mt-2 text-sm text-muted">You already have a workspace. Head back to the studio.</p>
          <Link href="/home"><Button className="mt-6">Go to home <ArrowRight className="size-4" /></Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl brand-gradient text-white"><Sparkles className="size-4" /></span>
          <span className="text-lg font-semibold">kronicle</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">How will you use it?</h1>
        <p className="mt-2 text-sm text-muted">Shows, credits and people live in a workspace. You can upgrade to a team later, but not go back.</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setType("individual")}
              className={`rounded-2xl border p-4 text-left transition-colors ${type === "individual" ? "border-brand/60 bg-brand/5" : "border-line bg-surface hover:bg-surface-2"}`}>
              <User className="mb-3 size-5 text-[#c4b5fd]" />
              <div className="flex items-center gap-2 text-sm font-semibold">Just me <Badge>100 credits</Badge></div>
              <p className="mt-1 text-xs leading-5 text-muted">One seat and personal credits. You can't invite people.</p>
            </button>
            <button type="button" onClick={() => setType("org")}
              className={`rounded-2xl border p-4 text-left transition-colors ${type === "org" ? "border-brand/60 bg-brand/5" : "border-line bg-surface hover:bg-surface-2"}`}>
              <Building2 className="mb-3 size-5 text-[#c4b5fd]" />
              <div className="flex items-center gap-2 text-sm font-semibold">My team <Badge tone="brand">1000 credits</Badge></div>
              <p className="mt-1 text-xs leading-5 text-muted">A studio, agency or team. Invite people and share credits.</p>
            </button>
          </div>

          <div>
            <Label>{type === "org" ? "Organisation name" : "Workspace name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "org" ? "Studio or company name" : "Your workspace name"} maxLength={80} />
            <p className="mt-2 text-xs text-muted">
              {type === "org" ? "You'll be its admin: invite people, share shows and buy credits." : "Only you work here. You can rename it later in Settings."}
            </p>
          </div>

          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
          <Button type="submit" size="lg" className="w-full" loading={saving}>Continue</Button>
        </form>
      </div>
    </div>
  );
}
