"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { useSession } from "@/components/session";
import { api, fmt, timeAgo } from "@/lib/api";
import { Badge, Button, Card, CardBody, Empty, Input, Textarea } from "@/components/ui";

interface Project {
  id: string; name: string; videoRatio: string; createTime: string; projectType: string;
}

export default function HomePage() {
  const { me } = useSession();
  const router = useRouter();
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<any>(null);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState<"analyze" | "start" | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await api<{ data: Project[] }>("/api/project/getProject", {});
      setProjects(res.data ?? []);
    } catch { /* ignore */ }
  }
  useEffect(() => { void load(); }, []);

  async function analyze() {
    setError("");
    if (!text.trim()) return;
    setBusy("analyze");
    try {
      const res = await api<any>("/api/project/analyzeScript", { text, fileName: "Pasted script", locale: "en" });
      setAnalysis(res.data);
      setName(res.data.suggestions?.name ?? "Untitled");
    } catch (e: any) {
      setError(e?.message ?? "Could not analyse the script");
    } finally { setBusy(null); }
  }

  async function start() {
    if (!analysis) return;
    setBusy("start");
    try {
      const res = await api<{ data: { projectId: string } }>("/api/project/createFromScript", {
        name, episodes: analysis.episodes, videoRatio: "9:16",
      });
      router.push(`/project/${res.data.projectId}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not create the project");
      setBusy(null);
    }
  }

  async function onFile(f: File | null) {
    if (!f) return;
    const t = await f.text();
    setText(t.slice(0, 2_000_000));
    setAnalysis(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{me?.access?.type === "org" ? "Organisation" : "Personal"} workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">What are we making today?</h1>
          <p className="mt-2 text-sm text-muted">Paste a script, drop a file, or describe an idea in a line.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <Sparkles className="size-4 text-[#c4b5fd]" />
          <span className="font-semibold">{fmt(me?.credits.balance ?? 0)}</span>
          <span className="text-muted">credits</span>
        </div>
      </div>

      {!analysis ? (
        <Card>
          <CardBody className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              maxLength={2_000_000}
              placeholder="Paste your script here, drop a file, or try “A spoilt billionaire's son crashes into a chaat stall in Prayagraj…”"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> Add files</Button>
                <span className="text-xs text-muted">TXT · MD · DOCX · PDF</span>
              </div>
              <Button onClick={analyze} loading={busy === "analyze"} disabled={!text.trim()}>
                {busy === "analyze" ? "Analysing…" : "Analyse"} <ArrowRight className="size-4" />
              </Button>
            </div>
            {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Check your episodes</div>
                <div className="text-xs text-muted">{analysis.episodeCount} episode{analysis.episodeCount === 1 ? "" : "s"} · {analysis.words} words · {analysis.language}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setAnalysis(null); setError(""); }}>Back</Button>
            </div>
            <div className="grid gap-3">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                {analysis.episodes.map((ep: any, i: number) => (
                  <div key={i} className="rounded-xl border border-line bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{ep.name}</div>
                      <Badge>~{Math.max(1, Math.round(ep.estimatedSeconds / 60))} min</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{ep.content}</p>
                  </div>
                ))}
              </div>
            </div>
            {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
            <div className="flex justify-end"><Button onClick={start} loading={busy === "start"}>Start <ArrowRight className="size-4" /></Button></div>
          </CardBody>
        </Card>
      )}

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recent shows</h2>
          <Link href="/shows" className="text-xs text-muted hover:text-fg">View all</Link>
        </div>
        {projects.length === 0 ? (
          <Empty title="No shows yet" body="Paste a script above to make your first show." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/project/${p.id}`} className="group rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand/40">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2"><FileText className="size-4 text-[#c4b5fd]" /></div>
                  <Badge>{p.videoRatio ?? "9:16"}</Badge>
                </div>
                <div className="truncate text-sm font-semibold group-hover:text-[#c4b5fd]">{p.name}</div>
                <div className="mt-1 text-xs text-muted">{timeAgo(Number(p.createTime))}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
