"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { api, timeAgo } from "@/lib/api";
import { Badge, Button, Empty, Spinner } from "@/components/ui";

interface Project { id: string; name: string; videoRatio: string; createTime: string }

export default function ShowsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await api<{ data: Project[] }>("/api/project/getProject", {});
        setProjects(res.data ?? []);
      } catch { setProjects([]); }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shows</h1>
          <p className="mt-1 text-sm text-muted">Everything in this workspace.</p>
        </div>
        <Link href="/home"><Button><Plus className="size-4" /> New show</Button></Link>
      </div>
      {projects === null ? (
        <div className="flex items-center gap-3 text-muted"><Spinner /> Loading shows…</div>
      ) : projects.length === 0 ? (
        <Empty title="No shows in this workspace" body="Create one from the home screen." action={<Link href="/home"><Button>Start a show</Button></Link>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/project/${p.id}`} className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand/40">
              <div className="mb-3 flex items-start justify-between">
                <div className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2"><FileText className="size-4 text-[#c4b5fd]" /></div>
                <Badge>{p.videoRatio ?? "9:16"}</Badge>
              </div>
              <div className="truncate text-sm font-semibold">{p.name}</div>
              <div className="mt-1 text-xs text-muted">{timeAgo(Number(p.createTime))}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
