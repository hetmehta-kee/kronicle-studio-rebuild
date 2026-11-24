"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, BookOpen, ChevronDown, Clapperboard, CreditCard, Home, LogOut, Menu,
  Plus, Settings, Sparkles, Users, X,
} from "lucide-react";
import { useSession } from "./session";
import { Badge, Button, Spinner, cn } from "./ui";
import { fmt } from "@/lib/api";

const nav = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/shows", label: "Shows", icon: Clapperboard },
  { href: "/novel", label: "Novel", icon: BookOpen, soon: true },
];
const settingsNav = [
  { href: "/settings/general", label: "General", icon: Settings },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/usage", label: "Usage", icon: Activity },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, agencies, active, activeId, loading, switchAgency, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (!loading && me && !me.onboarded) router.replace("/onboarding");
  }, [loading, me, pathname, router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-muted"><Spinner /> Loading studio…</div>
      </div>
    );
  }

  const sidebar = (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-line bg-[#0e1014] px-3 py-4">
      <Link href="/home" className="mb-5 flex items-center gap-2 px-2">
        <span className="grid size-8 place-items-center rounded-xl brand-gradient text-white"><Sparkles className="size-4" /></span>
        <span className="text-[17px] font-semibold tracking-tight">kronicle</span>
        <Badge tone="brand">kee</Badge>
      </Link>

      <div className="mb-4 rounded-xl border border-line bg-surface p-2">
        <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted">Workspace</div>
        <div className="relative">
          <select
            value={activeId}
            onChange={(e) => switchAgency(e.target.value)}
            className="w-full appearance-none rounded-lg bg-surface-2 px-2.5 py-2 text-sm font-medium outline-none"
          >
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name} · {a.type === "org" ? "Organisation" : "Personal"}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted" />
        </div>
        <div className="flex items-center justify-between px-2 pt-2 text-[11px] text-muted">
          <span>{active?.role ?? "member"}</span>
          <Link href="/onboarding" className="inline-flex items-center gap-1 hover:text-fg"><Plus className="size-3" /> New</Link>
        </div>
      </div>

      <nav className="space-y-1">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.soon ? "#" : n.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors",
              pathname === n.href || (n.href !== "/home" && pathname.startsWith(n.href)) ? "bg-surface-2 text-fg" : "hover:bg-surface hover:text-fg",
              n.soon && "pointer-events-none opacity-40",
            )}
          >
            <n.icon className="size-4" /> {n.label}
            {n.soon && <Badge>soon</Badge>}
          </Link>
        ))}
      </nav>

      <div className="mt-5 px-3 text-[10px] uppercase tracking-wider text-muted">Settings</div>
      <nav className="mt-1 space-y-1">
        {settingsNav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors",
              pathname === n.href ? "bg-surface-2 text-fg" : "hover:bg-surface hover:text-fg",
            )}
          >
            <n.icon className="size-4" /> {n.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-2 border-t border-line pt-3">
        <Link href="/settings/billing" className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5 hover:bg-surface-2">
          <span className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-[#c4b5fd]" /> Credits</span>
          <span className="text-sm font-semibold">{fmt(me.credits.balance)}</span>
        </Link>
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{me.name}</div>
            <div className="truncate text-[11px] text-muted">{me.email}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} title="Log out"><LogOut className="size-4" /></Button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative h-full">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line px-4 md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>{open ? <X className="size-5" /> : <Menu className="size-5" />}</Button>
          <span className="font-semibold">kronicle</span>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
