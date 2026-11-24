"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight, Clapperboard, Film, Image as ImageIcon, Loader2, Play, Sparkles, Wand2,
} from "lucide-react";
import { useSession } from "@/components/session";
import { api, fmt } from "@/lib/api";
import { Badge, Button, Card, CardBody, Empty, Input, Spinner } from "@/components/ui";

const TABS = ["Script", "Cast & places", "Plan", "Storyboard", "Video"] as const;
type Tab = (typeof TABS)[number];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { me, refresh } = useSession();
  const [tab, setTab] = useState<Tab>("Script");
  const [project, setProject] = useState<any>(null);
  const [scripts, setScripts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [shots, setShots] = useState<any[]>([]);
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const p = await api<any>(`/api/general/getSingleProject`, { id });
      const proj = Array.isArray(p) ? p[0] : p?.data?.[0] ?? p;
      setProject(proj);
      const s = await api<any>("/api/script/getScrptApi", { projectId: id });
      setScripts(s.data ?? []);
      const a = await api<any>("/api/cornerScape/getAllAssets", { projectId: id });
      setAssets(a.data?.data ?? []);
      const pl = await api<any>("/api/production/plan/getPlan", { projectId: id }).catch(() => null);
      setPlan(pl?.data ?? null);
      const sb = await api<any>("/api/production/storyboard/getStoryboardData", { projectId: id }).catch(() => null);
      setShots(sb?.data?.data ?? []);
      const fl = await api<any>("/api/production/getFlowData", { projectId: id, episodesId: s.data?.[0]?.id }).catch(() => null);
      const clips = (fl?.data?.clips ?? []).filter((c: any) => c.media_path?.endsWith(".mp4"));
      setVideo(clips.length ? { url: clips[clips.length - 1].media_path } : null);
    } catch (e: any) {
      setErr(e?.message ?? "Could not load the project");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>, then?: () => void) {
    setBusy(label); setErr("");
    try { await fn(); if (then) then(); await load(); await refresh(); }
    catch (e: any) { setErr(e?.message ?? "Action failed"); }
    finally { setBusy(""); }
  }

  const firstScript = scripts[0];
  const canEdit = me?.access?.role !== "viewer";

  if (loading) return <div className="flex items-center gap-3 p-8 text-muted"><Spinner /> Loading project…</div>;
  if (!project) return <div className="p-8 text-red-300">{err || "Project not found"}</div>;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted"><Link href="/home" className="hover:text-fg">Home</Link> / <span>{project.name}</span></div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          <div className="mt-1 text-xs text-muted">{scripts.length} episode{scripts.length === 1 ? "" : "s"} · {project.videoRatio ?? "9:16"} · {project.artStyle?.replaceAll("_", " ")}</div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm"><Sparkles className="size-4 text-[#c4b5fd]" /><span className="font-semibold">{fmt(me?.credits.balance ?? 0)}</span><span className="text-muted">credits</span></div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm ${tab === t ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}>{t}</button>
        ))}
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}

      {tab === "Script" && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Episodes</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={!canEdit || !!busy} loading={busy === "enhance"} onClick={() => run("enhance", () => api("/api/scriptEnhancement/generate", { projectId: id, scriptSource: "enhanced" }))}>
                    <Wand2 className="size-3.5" /> Make shoot-ready
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!canEdit || !!busy} loading={busy === "extract"} onClick={() => run("extract", () => api("/api/script/extractAssets", { projectId: id, groupSize: 5 }))}>
                    Extract assets
                  </Button>
                </div>
              </div>
              {scripts.map((s) => (
                <div key={s.id} className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">EP {s.episodeNumber} · {s.name}</div>
                    <Badge tone={s.extractState === 1 ? "good" : "neutral"}>{s.extractState === 1 ? "assets extracted" : "script"}</Badge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{s.content}</p>
                </div>
              ))}
              {!scripts.length && <Empty title="No episodes" body="Go back to Home and analyse a script." />}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-sm font-semibold">Progress</div>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  ["Script", scripts.length > 0],
                  ["Assets", assets.length > 0],
                  ["Plan", !!plan],
                  ["Storyboard", shots.length > 0],
                  ["Video", !!video],
                ].map(([label, done]) => (
                  <div key={String(label)} className="flex items-center justify-between">
                    <span className="text-muted">{label}</span>
                    <Badge tone={done ? "good" : "neutral"}>{done ? "done" : "pending"}</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-line bg-surface-2 p-3 text-xs leading-5 text-muted">
                The studio charges credits per action. Watch the balance in the top-right; every debit is in Usage.
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "Cast & places" && (
        <div className="mt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Cast & places</div>
              <div className="text-xs text-muted">Write prompts for every character, location and prop, then generate looks.</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={!canEdit || !assets.length || !!busy} loading={busy === "prompts"} onClick={() => run("prompts", () => api("/api/assetsGenerate/batchPolishAssetsPrompt", {
                projectId: id, concurrentCount: 5, otherTextPrompt: "", locale: "en",
                items: assets.map((a) => ({ assetsId: a.id, type: a.type, name: a.name, describe: a.describe })),
              }))}>Write prompts</Button>
              <Button size="sm" disabled={!canEdit || !assets.length || !!busy} loading={busy === "looks"} onClick={() => run("looks", () => api("/api/assetsGenerate/batchGenerateImageAssets", {
                projectId: id, model: project.imageModel, resolution: "1K", concurrentCount: 5,
                items: assets.map((a) => ({ id: a.id, type: a.type, name: a.name, prompt: a.prompt ?? a.describe })),
              }))}>Generate looks</Button>
            </div>
          </div>
          {assets.length === 0 ? <Empty title="No assets yet" body="Open the Script tab and extract assets first." action={<Button onClick={() => setTab("Script")}>Go to Script</Button>} /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((a) => (
                <Card key={a.id} className="overflow-hidden">
                  <div className="aspect-[3/4] w-full bg-surface-2">
                    {a.asset_url ? <img src={a.asset_url} alt={a.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted"><ImageIcon className="size-6" /></div>}
                  </div>
                  <CardBody className="space-y-2">
                    <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold">{a.name}</div><Badge>{a.type}</Badge></div>
                    <p className="line-clamp-3 text-xs leading-5 text-muted">{a.prompt ?? a.describe ?? "No prompt yet."}</p>
                    <div className="text-[11px] text-muted">{a.asset_url ? "Look generated" : "No look yet"}</div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Plan" && (
        <div className="mt-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div><div className="text-sm font-semibold">Plan</div><div className="text-xs text-muted">Lens, pacing and coverage for every scene.</div></div>
            <Button size="sm" disabled={!canEdit || !assets.length || !!busy} loading={busy === "plan"} onClick={() => run("plan", () => api("/api/production/plan/generatePlan", { projectId: id, scriptId: firstScript?.id, force: false, locale: "en" }))}>Build plan</Button>
          </div>
          {!plan ? <Empty title="No plan yet" body="Finalize the core assets, then build the plan." /> : (
            <div className="space-y-3">
              <Card><CardBody className="text-sm"><div className="text-muted">Lens</div><div className="mt-1">{plan.content?.lens}</div><div className="mt-3 text-muted">Pacing</div><div className="mt-1">{plan.content?.pacing}</div></CardBody></Card>
              {(plan.content?.scenes ?? []).map((s: any) => (
                <Card key={s.id}><CardBody>
                  <div className="flex items-center justify-between"><div className="text-sm font-semibold">{s.heading}</div><Badge>{(s.shots ?? []).length} shots</Badge></div>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {(s.shots ?? []).map((sh: any) => <div key={sh.shot} className="rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-xs text-muted">#{sh.shot} · {sh.framing} · {sh.move}</div>)}
                  </div>
                </CardBody></Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Storyboard" && (
        <div className="mt-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div><div className="text-sm font-semibold">Storyboard</div><div className="text-xs text-muted">Frames for every shot, ready for the timeline.</div></div>
            <Button size="sm" disabled={!canEdit || !plan || !!busy} loading={busy === "story"} onClick={() => run("story", () => api("/api/production/storyboard/batchGenerateImage", { projectId: id, scriptId: firstScript?.id, shots: 6, concurrentCount: 6 }))}>Generate 6 frames</Button>
          </div>
          {!shots.length ? <Empty title="No storyboard yet" body="Build the plan first, then generate the frames." action={<Button onClick={() => setTab("Plan")}>Go to Plan</Button>} /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shots.map((s) => (
                <Card key={s.id} className="overflow-hidden">
                  <div className="aspect-video bg-surface-2">{s.image_path ? <img src={s.image_path} alt={`shot ${s.shot_number}`} className="h-full w-full object-cover" /> : null}</div>
                  <CardBody className="py-3"><div className="flex items-center justify-between"><div className="text-sm font-medium">Shot {s.shot_number}</div><Badge>{s.scene}</Badge></div><p className="mt-1 line-clamp-2 text-xs text-muted">{s.prompt}</p></CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Video" && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div><div className="text-sm font-semibold">Video</div><div className="text-xs text-muted">Generate a clip from the first storyboard frame, then cut it in the editor.</div></div>
                <Button size="sm" disabled={!canEdit || !shots.length || !!busy} loading={busy === "video"} onClick={() => run("video", () => api("/api/production/workbench/generateVideo", { projectId: id, scriptId: firstScript?.id, trackId: "", storyboardIds: shots[0] ? [shots[0].id] : [] }))}>
                  <Play className="size-3.5" /> Generate clip
                </Button>
              </div>
              {video?.url ? (
                <video src={video.url} controls className="aspect-[9/16] max-h-[520px] w-full rounded-xl bg-black object-contain" />
              ) : (
                <div className="flex aspect-[9/16] max-h-[520px] items-center justify-center rounded-xl border border-dashed border-line bg-surface-2 text-sm text-muted">No clip yet.</div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <div className="text-sm font-semibold">Cut it</div>
              <p className="text-xs leading-5 text-muted">Open the timeline to trim, split, reorder and export the cut.</p>
              <Link href={`/editor/${id}`}><Button className="w-full"><Film className="size-4" /> Open editor <ArrowRight className="size-4" /></Button></Link>
              <div className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] leading-5 text-muted">
                V lanes are picture, A lanes are sound. S splits a clip, Delete removes it.
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
