"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Download, Film, Image as ImageIcon, Pause, Play, Save,
  Scissors, Trash2, Plus, Music,
} from "lucide-react";
import { useSession } from "@/components/session";
import { api, fmt } from "@/lib/api";
import { Badge, Button, Card, Spinner, cn } from "@/components/ui";

type Track = { id: string; name: string; kind: "video" | "audio" | "text" | "overlay" };
type Clip = {
  id: string; trackId: string; storyboardId?: string | null; mediaPath: string;
  startMs: number; durationMs: number; trimInMs: number; trimOutMs?: number | null;
  position: number; status: string; prompt?: string | null;
};

const PX_PER_SEC = 90;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const [project, setProject] = useState<any>(null);
  const [episodeId, setEpisodeId] = useState("");
  const [shots, setShots] = useState<any[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [err, setErr] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const p = await api<any>("/api/general/getSingleProject", { id });
      setProject(Array.isArray(p) ? p[0] : p?.data?.[0] ?? p);
      const s = await api<any>("/api/script/getScrptApi", { projectId: id });
      const ep = s.data?.[0]?.id ?? "";
      setEpisodeId(ep);
      const sb = await api<any>("/api/production/storyboard/getStoryboardData", { projectId: id });
      setShots(sb.data?.data ?? []);
      const flow = await api<any>("/api/production/getFlowData", { projectId: id, episodesId: ep });
      const t = (flow.data?.tracks ?? []).map((x: any) => ({ id: x.id, name: x.name, kind: x.kind }));
      const c = (flow.data?.clips ?? []).map((x: any) => ({
        id: x.id, trackId: x.track_id, storyboardId: x.storyboard_id, mediaPath: x.media_path ?? "",
        startMs: x.start_ms, durationMs: x.duration_ms, trimInMs: x.trim_in_ms, trimOutMs: x.trim_out_ms,
        position: x.position, status: x.status, prompt: x.prompt,
      }));
      setTracks(t.length ? t : [{ id: uid(), name: "V1", kind: "video" }]);
      setClips(c);
    } catch (e: any) { setErr(e?.message ?? "Could not load the editor"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const videoTrack = tracks.find((t) => t.kind === "video") ?? tracks[0];
  const selectedClip = clips.find((c) => c.id === selected) ?? null;

  useEffect(() => {
    if (selectedClip && videoRef.current && selectedClip.mediaPath.endsWith(".mp4")) {
      try { videoRef.current.currentTime = selectedClip.trimInMs / 1000; } catch { /* ignore */ }
    }
  }, [selectedClip?.id]);

  const durationMs = useMemo(() => Math.max(6000, ...clips.map((c) => c.startMs + c.durationMs)) + 2000, [clips]);
  const timelineWidth = Math.max(900, (durationMs / 1000) * PX_PER_SEC);

  function addStoryboards() {
    if (!videoTrack || !shots.length) return;
    let start = clips.filter((c) => c.trackId === videoTrack.id).reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
    const added: Clip[] = shots.map((s, i) => {
      const c: Clip = {
        id: uid(), trackId: videoTrack.id, storyboardId: s.id, mediaPath: s.image_path,
        startMs: start + i * 2000, durationMs: 2000, trimInMs: 0, trimOutMs: null,
        position: i, status: "ready", prompt: s.prompt,
      };
      return c;
    });
    setClips((prev) => [...prev, ...added]);
  }

  function addMediaClip(mediaPath: string, label?: string) {
    if (!videoTrack) return;
    const start = clips.filter((c) => c.trackId === videoTrack.id).reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
    setClips((prev) => [...prev, {
      id: uid(), trackId: videoTrack.id, mediaPath, startMs: start, durationMs: 2000,
      trimInMs: 0, trimOutMs: null, position: prev.length, status: "ready", prompt: label,
    }]);
  }

  function split() {
    if (!selectedClip) return;
    const local = playhead - selectedClip.startMs;
    if (local <= 100 || local >= selectedClip.durationMs - 100) return;
    const right: Clip = {
      ...selectedClip,
      id: uid(),
      startMs: selectedClip.startMs + local,
      durationMs: selectedClip.durationMs - local,
      trimInMs: selectedClip.trimInMs + local,
      trimOutMs: selectedClip.trimOutMs ?? selectedClip.trimInMs + selectedClip.durationMs,
    };
    setClips((prev) => prev.map((c) => c.id === selectedClip.id ? { ...c, durationMs: local, trimOutMs: c.trimInMs + local } : c).concat(right));
    setSelected(right.id);
  }

  function remove() {
    if (!selectedClip) return;
    setClips((prev) => prev.filter((c) => c.id !== selectedClip.id));
    setSelected(null);
  }

  function move(dir: -1 | 1) {
    if (!selectedClip) return;
    setClips((prev) => prev.map((c) => c.id === selectedClip.id ? { ...c, startMs: Math.max(0, c.startMs + dir * 500) } : c));
  }

  async function save() {
    setBusy("save"); setErr("");
    try {
      await api("/api/production/saveFlowData", {
        projectId: id, episodesId: episodeId,
        tracks: tracks.map((t, i) => ({ id: t.id, name: t.name, kind: t.kind, position: i })),
        clips: clips.map((c, i) => ({
          id: c.id, trackId: c.trackId, storyboardId: c.storyboardId, mediaPath: c.mediaPath,
          startMs: c.startMs, durationMs: c.durationMs, trimInMs: c.trimInMs, trimOutMs: c.trimOutMs,
          status: c.status, prompt: c.prompt, position: i,
        })),
      });
    } catch (e: any) { setErr(e?.message ?? "Could not save"); }
    finally { setBusy(""); }
  }

  async function compile() {
    setBusy("export"); setErr(""); setExportUrl("");
    try {
      const sorted = [...clips].sort((a, b) => a.startMs - b.startMs).filter((c) => c.mediaPath);
      const res = await api<any>("/api/editor/export", {
        clips: sorted.map((c) => ({
          path: c.mediaPath, trimInMs: c.trimInMs,
          trimOutMs: c.trimOutMs ?? c.trimInMs + c.durationMs,
          label: c.prompt ?? "Kronicle",
        })),
      });
      setExportUrl(res.data.url);
    } catch (e: any) { setErr(e?.message ?? "Export failed"); }
    finally { setBusy(""); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") remove();
      if (e.key.toLowerCase() === "s") split();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loading) return <div className="flex items-center gap-3 p-8 text-muted"><Spinner /> Loading editor…</div>;

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col bg-[#08090b]">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/project/${id}`} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-4" /></Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{project?.name ?? "Editor"}</div>
            <div className="text-[11px] text-muted">{clips.length} clips · {tracks.length} tracks · {fmt(me?.credits.balance ?? 0)} credits</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={save} loading={busy === "save"}><Save className="size-3.5" /> Save</Button>
          <Button size="sm" onClick={compile} loading={busy === "export"}><Download className="size-3.5" /> Compile</Button>
        </div>
      </div>

      {err && <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">{err}</div>}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-line p-3 lg:block scroll-thin">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Media pool</div>
          <Button size="sm" variant="secondary" className="mb-3 w-full" onClick={addStoryboards} disabled={!shots.length}><Plus className="size-3.5" /> Add storyboard frames</Button>
          <div className="space-y-2">
            {shots.map((s) => (
              <button key={s.id} onClick={() => addMediaClip(s.image_path, s.prompt)} className="group w-full overflow-hidden rounded-lg border border-line bg-surface text-left hover:border-brand/40">
                <div className="aspect-video bg-surface-2">{s.image_path && <img src={s.image_path} alt={`shot ${s.shot_number}`} className="h-full w-full object-cover" />}</div>
                <div className="flex items-center justify-between px-2 py-1.5 text-[11px]"><span>Shot {s.shot_number}</span><Plus className="size-3 text-muted group-hover:text-fg" /></div>
              </button>
            ))}
            {[...new Set(clips.filter((c) => c.mediaPath.endsWith(".mp4")).map((c) => c.mediaPath))].map((url) => (
              <button key={url} onClick={() => addMediaClip(url, "Generated clip")} className="w-full rounded-lg border border-line bg-surface px-2 py-2 text-left text-[11px] hover:border-brand/40">
                <Film className="mb-1 size-4 text-[#c4b5fd]" /> Generated clip
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 items-center justify-center bg-black p-4">
              {selectedClip ? (
                selectedClip.mediaPath.endsWith(".mp4") ? (
                  <video ref={videoRef} src={selectedClip.mediaPath} controls className="max-h-full max-w-full rounded-lg" />
                ) : (
                  <img src={selectedClip.mediaPath} alt="preview" className="max-h-full max-w-full rounded-lg object-contain" />
                )
              ) : exportUrl ? (
                <video src={exportUrl} controls className="max-h-full max-w-full rounded-lg" />
              ) : (
                <div className="text-center text-sm text-muted"><Film className="mx-auto mb-3 size-8" />Select a clip, or add storyboard frames from the media pool.</div>
              )}
            </div>
            <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-line p-3 xl:block scroll-thin">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Inspector</div>
              {selectedClip ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">{selectedClip.prompt ?? "Clip"}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="space-y-1"><span className="text-muted">Start (ms)</span><input type="number" value={selectedClip.startMs} onChange={(e) => setClips((p) => p.map((c) => c.id === selectedClip.id ? { ...c, startMs: Number(e.target.value) } : c))} className="h-8 w-full rounded border border-line bg-surface-2 px-2" /></label>
                    <label className="space-y-1"><span className="text-muted">Duration (ms)</span><input type="number" value={selectedClip.durationMs} onChange={(e) => setClips((p) => p.map((c) => c.id === selectedClip.id ? { ...c, durationMs: Number(e.target.value) } : c))} className="h-8 w-full rounded border border-line bg-surface-2 px-2" /></label>
                    <label className="space-y-1"><span className="text-muted">Trim in (ms)</span><input type="number" value={selectedClip.trimInMs} onChange={(e) => setClips((p) => p.map((c) => c.id === selectedClip.id ? { ...c, trimInMs: Number(e.target.value) } : c))} className="h-8 w-full rounded border border-line bg-surface-2 px-2" /></label>
                    <label className="space-y-1"><span className="text-muted">Trim out (ms)</span><input type="number" value={selectedClip.trimOutMs ?? ""} onChange={(e) => setClips((p) => p.map((c) => c.id === selectedClip.id ? { ...c, trimOutMs: e.target.value ? Number(e.target.value) : null } : c))} className="h-8 w-full rounded border border-line bg-surface-2 px-2" /></label>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => move(-1)}>←</Button>
                    <Button size="sm" variant="secondary" onClick={() => move(1)}>→</Button>
                    <Button size="sm" variant="secondary" onClick={split}><Scissors className="size-3.5" /> Split</Button>
                    <Button size="sm" variant="danger" onClick={remove}><Trash2 className="size-3.5" /></Button>
                  </div>
                  <div className="text-[11px] leading-5 text-muted">S splits at the playhead. Delete removes. Save writes the timeline; Compile exports with ffmpeg.</div>
                </div>
              ) : (
                <div className="text-xs leading-5 text-muted">No clip selected. Click a clip on the timeline or add a frame.</div>
              )}
              {exportUrl && (
                <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
                  <div className="mb-1 font-semibold">Compilation ready</div>
                  <a href={exportUrl} target="_blank" className="underline">Open MP4</a>
                </div>
              )}
            </aside>
          </div>

          <div className="h-[280px] shrink-0 border-t border-line bg-[#0c0e12]">
            <div className="flex h-9 items-center justify-between border-b border-line px-3 text-[11px] text-muted">
              <div className="flex items-center gap-2"><Badge>{playhead} ms</Badge><span className="hidden sm:inline">playhead</span></div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPlayhead(0)} className="rounded px-2 py-1 hover:bg-surface-2">{"|<"}</button>
                <button onClick={() => setPlayhead((p) => Math.max(0, p + 500))} className="rounded px-2 py-1 hover:bg-surface-2">+0.5s</button>
              </div>
            </div>
            <div className="scroll-thin h-[240px] overflow-auto">
              <div style={{ width: timelineWidth }} className="relative">
                <div className="sticky top-0 z-10 h-6 border-b border-line bg-[#0c0e12]" onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setPlayhead(Math.max(0, Math.round(((e.clientX - rect.left) / PX_PER_SEC) * 1000)));
                }}>
                  <div className="timeline-grid h-full" />
                </div>
                <div className="relative">
                  <div className="absolute bottom-0 top-0 z-20 w-px bg-[#ff5c8a]" style={{ left: (playhead / 1000) * PX_PER_SEC }} />
                  {tracks.map((t) => (
                    <div key={t.id} className="flex h-12 items-center border-b border-line/60">
                      <div className="sticky left-0 z-10 flex h-full w-16 shrink-0 items-center gap-1 border-r border-line bg-[#0c0e12] px-2 text-[10px] text-muted">
                        {t.kind === "audio" ? <Music className="size-3" /> : <Film className="size-3" />} {t.name}
                      </div>
                      <div className="relative h-full flex-1">
                        {clips.filter((c) => c.trackId === t.id).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                            className={cn(
                              "absolute top-1.5 flex h-9 items-center gap-1 overflow-hidden rounded-md border px-2 text-left text-[10px]",
                              selected === c.id ? "border-[#ff5c8a] bg-[#ff5c8a]/20 text-white" : "border-brand/40 bg-brand/15 text-[#d8ccff] hover:bg-brand/25",
                            )}
                            style={{ left: (c.startMs / 1000) * PX_PER_SEC, width: Math.max(44, (c.durationMs / 1000) * PX_PER_SEC - 2) }}
                            title={c.prompt ?? c.mediaPath}
                          >
                            {c.mediaPath.endsWith(".mp4") ? <Film className="size-3 shrink-0" /> : <ImageIcon className="size-3 shrink-0" />}
                            <span className="truncate">{c.prompt ?? "clip"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
