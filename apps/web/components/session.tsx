"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

export interface Me {
  id: string;
  user_id: number;
  email: string;
  name: string;
  username: string;
  onboarded: boolean;
  permissions: string[];
  credits: { balance: number; held: number };
  access?: { workspaceId: string; role: string; type: string; permissions: string[] } | null;
}
export interface Agency {
  id: string;
  name: string;
  type: "individual" | "org";
  role: "admin" | "editor" | "viewer";
}

interface SessionValue {
  me: Me | null;
  agencies: Agency[];
  activeId: string;
  active: Agency | null;
  loading: boolean;
  refresh: () => Promise<void>;
  switchAgency: (id: string) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // Read the session without a workspace header first: a stale localStorage
      // id must not turn a valid login into a 403.
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("agencyId") : "";
      if (typeof window !== "undefined") window.localStorage.removeItem("agencyId");
      const meRes = await api<Me>("/api/auth/me");
      const ag = await api<{ data: { agencies: Agency[] } }>("/api/agency/getMyAgency", {});
      const list = ag.data.agencies ?? [];
      setAgencies(list);
      const pick = stored && list.some((a) => a.id === stored) ? stored : meRes.access?.workspaceId ?? list[0]?.id ?? "";
      if (pick) window.localStorage.setItem("agencyId", pick);
      setActiveId(pick);
      // Re-read the session for the chosen workspace so credits/role match it.
      setMe(pick && pick !== meRes.access?.workspaceId ? await api<Me>("/api/auth/me") : meRes);
    } catch {
      setMe(null);
      setAgencies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const switchAgency = useCallback((id: string) => {
    window.localStorage.setItem("agencyId", id);
    setActiveId(id);
    window.location.reload();
  }, []);

  const logout = useCallback(async () => {
    try { await api("/api/auth/logout", {}); } catch { /* ignore */ }
    window.location.href = "/login";
  }, []);

  const active = useMemo(() => agencies.find((a) => a.id === activeId) ?? null, [agencies, activeId]);
  const value: SessionValue = { me, agencies, activeId, active, loading, refresh: load, switchAgency, logout };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside provider");
  return v;
}
