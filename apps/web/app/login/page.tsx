"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Mail, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Input, Spinner } from "@/components/ui";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [next, setNext] = useState("/home");
  const [labEmail, setLabEmail] = useState("researcher@kronicle.local");
  const [labPassword, setLabPassword] = useState("research-3000!");
  const [labBusy, setLabBusy] = useState(false);
  const [labError, setLabError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(params.get("next") || "/home");
    if (params.get("lab") === "1") return;
    void (async () => {
      try {
        const me = await api<{ onboarded: boolean }>("/api/auth/me");
        window.location.href = me.onboarded ? (params.get("next") || "/home") : "/onboarding";
      } catch { /* signed out */ }
    })();
  }, []);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ verification_id: string; dev_code: string }>("/api/auth/request-otp", { email });
      setVerificationId(res.verification_id);
      setDevCode(res.dev_code);
      setStep("code");
    } catch (err: any) {
      setError(err?.message ?? "Could not send the code");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/verify-otp", { email, otp: code, verification_id: verificationId });
      window.localStorage.removeItem("agencyId");
      const check = await api<{ onboarded: boolean }>("/api/user/check");
      window.location.href = check.onboarded ? next : "/onboarding";
    } catch (err: any) {
      setError(err?.message ?? "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function labLogin(e: React.FormEvent) {
    e.preventDefault();
    setLabBusy(true); setLabError("");
    try {
      const res = await api<any>("/api/auth/dev-login", { email: labEmail, password: labPassword });
      window.localStorage.setItem("agencyId", res.agencyId);
      window.location.href = "/home";
    } catch (err: any) {
      setLabError(err?.message ?? "Lab login failed");
      setLabBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-line bg-[#0e1014] p-10 lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl brand-gradient text-white"><Sparkles className="size-4" /></span>
          <span className="text-lg font-semibold">kronicle</span>
        </Link>
        <div>
          <div className="text-3xl font-semibold leading-tight tracking-tight">Every episode.<br />One workspace.</div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">
            Sign in with your work email. We send a four-digit code — no password to remember.
          </p>
        </div>
        <div className="text-xs text-muted">Clean-room replica · mock OTP · no real payments</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid size-8 place-items-center rounded-xl brand-gradient text-white"><Sparkles className="size-4" /></span>
            <span className="text-lg font-semibold">kronicle</span>
          </div>

          {step === "email" ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Welcome to Kronicle</h1>
              <p className="mt-2 text-sm text-muted">Continue with Google, or use your work email.</p>
              <button disabled className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-sm text-muted opacity-60">
                Continue with Google (not wired in the replica)
              </button>
              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted">
                <span className="h-px flex-1 bg-line" /> or use your work email <span className="h-px flex-1 bg-line" />
              </div>
              <form onSubmit={sendCode} className="space-y-3">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" autoFocus required />
                {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
                <Button type="submit" className="w-full" size="lg" loading={loading}>Continue with email <ArrowRight className="size-4" /></Button>
              </form>
            </>
          ) : (
            <>
              <button onClick={() => { setStep("email"); setError(""); }} className="mb-6 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft className="size-3.5" /> Back</button>
              <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm text-muted">We sent a 4-digit code to <span className="text-fg">{email}</span>. It expires in 5 minutes.</p>
              {devCode && (
                <div className="mt-4 rounded-xl border border-dashed border-brand/40 bg-brand/5 px-3 py-2 text-sm">
                  Dev OTP: <span className="font-mono font-semibold text-[#c4b5fd]">{devCode}</span>
                </div>
              )}
              <form onSubmit={verify} className="mt-5 space-y-3">
                <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" inputMode="numeric" className="text-center text-2xl tracking-[0.5em]" autoFocus required />
                {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
                <Button type="submit" className="w-full" size="lg" loading={loading} disabled={code.length !== 4}>Verify and continue</Button>
              </form>
              <button onClick={() => setStep("email")} className="mt-4 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><Mail className="size-3.5" /> Use a different email</button>
            </>
          )}

          <details className="mt-6 rounded-xl border border-line bg-surface p-3">
            <summary className="cursor-pointer text-xs text-muted">Lab access · local · 3,000 credits</summary>
            <form onSubmit={labLogin} className="mt-3 space-y-2">
              <Input value={labEmail} onChange={(e) => setLabEmail(e.target.value)} placeholder="researcher@kronicle.local" />
              <Input type="password" value={labPassword} onChange={(e) => setLabPassword(e.target.value)} placeholder="Lab password" />
              <Button type="submit" className="w-full" loading={labBusy}>Open lab account</Button>
              {labError && <div className="text-xs text-red-300">{labError}</div>}
            </form>
            <p className="mt-2 text-[11px] leading-5 text-muted">Loopback-only lab credential; no real Kronicle account. Use <code>/login?lab=1</code> if the demo auto-opens.</p>
          </details>

          <p className="mt-8 text-center text-[11px] leading-5 text-muted">
            By continuing you agree to the terms and privacy policy of this clean-room replica.
          </p>
        </div>
      </div>
    </div>
  );
}
