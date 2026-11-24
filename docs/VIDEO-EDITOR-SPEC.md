# Video Editor Specification — clean-room replica

Status: draft v1 · Owner: video-editor workstream · Scope: `/production` (workbench) + `/editor` (timeline) + `/assets` (media pool)

This document specifies the **timeline video editor** for the Kronicle clean-room replica: the
screens, the document model, every interaction, the API contracts behind them, the generation
and polling state machines, the ffmpeg export pipeline, performance budgets, keyboard map and
a phased implementation plan.

It is written to be implemented directly. It is **not** a copy of proprietary code: contracts
are re-derived from observed request shapes and product behaviour, and anything invented for
the replica is marked `DESIGNED`.

## 0. Evidence legend

| Mark | Meaning |
|---|---|
| `OBSERVED` | Path and argument shape seen in the captured client bundle. |
| `PARTIAL` | Path observed, request body inferred from call sites/neighbouring code. |
| `DESIGNED` | Replica-only addition (timeline document, compile, granular ops). |
| `COPY` | User-facing string reproduced *for behaviour*; paraphrase before shipping marketing copy. |

Evidence sources:

- `docs/REFERENCE-OBSERVED.md` — route/API inventory.
- `raw/js-app/1k9c1lbv3potc.js` — workbench + production API client (module `433144`) and the
  response-envelope wrapper (module `255955`): `fetch -> { code, message, data }`, non-200 throws.
- `raw/js-app/07fzdyo9hkea8.js` — route map and in-product guided tours, including `/editor`:
  *“V lanes are picture, A lanes are sound. S splits a clip, Delete removes it.”*,
  *“Renders the finished video. It then appears under Compilations.”*
- `raw/js-app/1g9rvd7y3l1gc.js` — `/production` error boundary module name `[workbench]`.

Everything in this document is behaviour-level. No proprietary identifiers, assets or long copy
are used.

---

## 1. Scope

### 1.1 In scope

1. Selecting a **project (show) → episode (script)** and loading its production state.
2. The **storyboard → takes → timeline** assembly flow.
3. The **timeline editor** at `/editor`: tracks, clips, trimming, splitting, ripple delete,
   reordering, snapping, zoom, frame thumbnails, preview playback, audio mixing, transitions,
   text overlays, per-clip prompt/regenerate, continuity panels, statutory-warning overlay.
4. **BGM** generation, selection and mixing.
5. **Save/autosave**, conflict handling, undo/redo.
6. **Compile/export** (resolution, fps, format) with ffmpeg worker sketches.
7. Backend contracts for every operation, including generation credits accounting.
8. Performance targets, keyboard shortcuts, implementation phases and acceptance tests.

### 1.2 Out of scope

- Payments, auth internals, workspace membership (owned by the auth/billing specs).
- Script enhancement, plan and storyboard *generation* UX (owned by the studio-flow spec);
  this document only consumes their outputs and specifies the handoff into the timeline.
- Server-side video generation providers beyond a mock adapter contract.
- Realistic colour grading, multicam, keyframes/automation curves, nested sequences,
  collaboration cursors. Listed as future work in §20.4.

### 1.3 Roles and entitlements

| Role | Editor access |
|---|---|
| `admin` | full edit, generate, compile, billing |
| `editor` | full edit, generate, compile (workspace credits) |
| `viewer` | timeline read-only, preview + download only |

All API calls carry the session cookies (`kronicleToken`, `jwtToken`) and the active workspace
header `x-agency-id`. Write/generate routes require `editor` or `admin`. The UI hides generate
actions for `viewer` and renders a read-only banner (`DESIGNED` copy).

Every `generate*` operation is metered by the credit engine (quote → hold → provider job →
settle). The client must never send a concurrency value; the server owns concurrency and price
(`DESIGNED` hard rule for the replica; the reference exposes this as a known weakness).

---

## 2. Surfaces and navigation

```
/home/shows                     shows list
  └─ /production?projectId&scriptId
        ├─ step: Script
        ├─ step: Script assets
        ├─ step: Plan
        ├─ step: Asset variants
        ├─ step: Storyboard   → shots, stills, per-shot prompt, videoDesc
        └─ step: Video        → takes per shot, BGM, continuity, "Open editor"
  └─ /editor?projectId&scriptId&timelineId
        ├─ library (media pool)
        ├─ canvas + transport
        ├─ timeline (V lanes, A lanes)
        ├─ inspector (clip or canvas)
        └─ compile panel → Compilations
  └─ /assets             assets, clips, voices (upload source for the pool)
```

`/editor` is reachable from `/production` (Video step) and from the top nav. The reference route
list contains `/editor` (its own chunk, guarded by the route map), and the tour names four
anchors: `library`, `timeline`, `inspector`, `compile`. Those four anchors become the layout
regions in §5.

### 2.1 Context bar (project / episode / script)

A sticky top bar with three pickers:

1. **Show** — `projectId`. Changing it resets episode and timeline.
2. **Episode** — `scriptId` (a script row is an episode: title, order, duration estimate,
   original/enhanced text). Default = last opened episode for this show, else first by order.
3. **Timeline version** — `timelineId` (usually one per episode; list only if >1).

Rules:

- The selection is encoded in the URL (`?projectId=&scriptId=&timelineId=`) so reload/deep links
  are stable, and mirrored to `localStorage["kronicle:editor:last"]`.
- Switching episode while dirty triggers the same guard as navigation (§9.3): `Save & switch`,
  `Discard`, `Cancel`.
- If the project has no episode, render an empty state with **Open Script** and **Back to shows**.
- Fetch on mount, in parallel: `getGenerateData`, `getFlowData`, `getStoryboardData`, and
  `getAssetsPage` page 1. The editor renders skeleton lanes until the timeline document resolves.

---

## 3. End-to-end flow

```
Script ──▶ Episodes ──▶ Enhancement ──▶ Cast & places ──▶ Plan
   └─▶ Asset variants ──▶ Storyboard(shots + stills)
            └─▶ per-shot video takes (generate / batch / poll / select)
                     └─▶ assemble onto tracks ──▶ editor: trim, split, order, text,
                          transitions, BGM, statutory warning ──▶ compile ──▶ Compilations
```

### 3.1 Storyboard → timeline assembly (the important handoff)

Input: `storyboardList` (ordered shots) and, per shot, a `videoList` of takes with a
`selectVideoId`.

Algorithm (`assembleFromStoryboard`):

```
cursor = 0
for shot in storyboardList ordered by shot.order:
    take = shot.videoList.find(v => v.id === shot.selectVideoId)
           ?? last take with src and state not in {generating, failed}
    if take is null: continue                      # leave a gap marker, never block assembly
    dur = min(take.durationMs, shot.targetDurationMs ?? take.durationMs)
    clip = newClip({ startMs: cursor, durationMs: dur, srcInMs: take.trimInMs ?? 0,
                     mediaId: take.mediaId, provenance: { storyboardId: shot.id, videoId: take.id,
                     takeIndex: shot.videoList.indexOf(take), prompt: shot.prompt,
                     model: take.model, seed: take.seed } })
    append(clip) to V1
    cursor += dur
```

- Assembly never overwrites existing non-empty V1 without confirmation. Two actions:
  **Assemble** (append after the last clip) and **Replace track** (confirm dialog).
- Shots with no take appear as **placeholder clips** (dashed outline, `status: "empty"`) so the
  editor shows what is missing rather than silently skipping.
- `V1` is created on demand via `addTrack` with the episode duration if no track exists.
- After assembly the timeline is saved once (`saveTrackMedias` with the whole array).

### 3.2 Takes

A shot can hold many takes. The selected take drives assembly and preview; all takes remain in
the library sheet for that shot. `selectVideo` marks the active take server-side so the
production step and the editor agree.

---

## 4. Data model

### 4.1 Conventions

- IDs: UUID v7 strings (reference: all object types UUID).
- Timestamps: ISO-8601 UTC strings.
- **Time unit: integer milliseconds everywhere in JSON.** Positions are *frame-quantised*
  (`q(ms) = round(ms / 1000 * fps) * 1000 / fps`, rounded to integer ms) so UI frame stepping and
  server rendering agree. The UI displays `HH:MM:SS:FF`; the API never sees frames.
- Audio gain: linear `0..2` in JSON; the UI shows dB (`20*log10(gain)`), floor `-60 dB` = mute.
- Coordinates for overlays: normalised `0..1` relative to the canvas, origin top-left.
- All documents carry `revision` (monotonic integer) for optimistic concurrency.

### 4.2 Entities

```
Project (show)
 └─ Script (episode)
     ├─ Storyboard (shot list)  ── Shot ── Take(video) ── Media
     ├─ Timeline (1..n)         ── Track ── Clip ── Media
     ├─ BgmTrack (generated)    ── Media
     ├─ ContinuityPanel         ── version history
     └─ Compilation (export)
Media = asset clip | uploaded clip | generated take | BGM | image still | rendered poster
```

### 4.3 TypeScript model (authoritative shapes)

```ts
type Id = string;                       // uuid v7
type Ms = number;                       // integer milliseconds, frame-quantised

interface Timeline {
  id: Id;
  projectId: Id;
  scriptId: Id;                         // episode
  name: string;
  fps: 24 | 25 | 30 | 60;
  width: number;                        // 1080 default
  height: number;                       // 1920 default (9:16)
  aspect: "9:16" | "16:9" | "1:1" | "4:5" | "3:4";
  durationMs: Ms;                       // derived: max clip end, min = episode duration
  tracks: Track[];
  markers: Marker[];
  statutoryWarning: StatutoryWarning | null;
  masterGain: number;                   // 0..2
  revision: number;
  createdAt: string;
  updatedAt: string;
}

type TrackKind = "video" | "overlay" | "audio" | "text";

interface Track {
  id: Id;
  timelineId: Id;
  kind: TrackKind;
  index: number;                        // lane order within kind; V1, V2, A1, A2, O1, T1
  name: string;                         // "V1", "BGM", "Titles"
  muted: boolean;
  solo: boolean;
  locked: boolean;
  hidden: boolean;                      // video/overlay/text only
  gain: number;                         // audio only, 0..2
  clips: Clip[];                        // sorted by startMs, non-overlapping per track
  statutoryWarning?: StatutoryWarning;  // per-track override (audio tracks excluded)
  revision: number;
}

interface Clip {
  id: Id;
  trackId: Id;
  kind: "video" | "image" | "audio" | "text";
  mediaId: Id | null;                   // null for text clips
  startMs: Ms;                          // timeline position
  durationMs: Ms;                       // timeline duration (post-speed)
  srcInMs: Ms;                          // source in-point
  srcOutMs: Ms;                         // source out-point
  speed: number;                        // 0.25..4
  gain: number;                         // 0..2 (audio-bearing clips)
  fadeInMs: Ms;
  fadeOutMs: Ms;
  transform: { x: number; y: number; scale: number; rotation: number; opacity: number };
  transitionIn: Transition | null;      // overlap with the previous clip on this track
  text?: TextPayload;                   // kind === "text"
  provenance?: ClipProvenance;          // generated clips only
  status: "ready" | "generating" | "failed" | "empty";
  locked: boolean;
  label?: string;                       // user label, shown on the clip
  revision: number;
}

interface Transition {
  type: "crossfade" | "dip-to-black" | "whip-pan" | "none";
  durationMs: Ms;                       // <= min(prev.durationMs, this.durationMs, 2000)
  audio: "crossfade" | "cut";
}

interface ClipProvenance {
  storyboardId?: Id;
  videoId?: Id;                         // the take
  takeIndex?: number;
  prompt?: string;
  videoPrompt?: string;
  model?: string;
  seed?: number;
  continuityVersionId?: Id;
  generatedAt?: string;
}

interface TextPayload {
  content: string;                      // <= 280 chars, newlines allowed
  fontFamily: string;                   // "Inter", "Noto Sans Devanagari", ...
  fontSizePx: number;                   // at 1080-wide reference, scaled to canvas
  fontWeight: 400 | 500 | 600 | 700;
  color: string;                        // #RRGGBB
  background: string | null;            // #RRGGBBAA
  stroke: { color: string; widthPx: number } | null;
  align: "left" | "center" | "right";
  anchor: "top" | "middle" | "bottom";
  safeArea: boolean;                    // keep inside 10% inset
  animationIn: "none" | "fade" | "slide-up";
  animationOut: "none" | "fade" | "slide-down";
}

interface Media {
  id: Id;
  projectId: Id;
  scriptId?: Id;
  type: "video" | "image" | "audio";
  source: "asset" | "upload" | "generated" | "bgm" | "rendered";
  name: string;
  url: string;                          // resolved, short-lived signed URL
  posterUrl?: string;
  durationMs: Ms;                       // 0 for images
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  bytes?: number;
  state: "ready" | "processing" | "failed";
  createdAt: string;
}

interface Take {                         // generated video candidate for a shot
  id: Id;                               // == videoId
  storyboardId: Id;
  mediaId: Id | null;
  src: string | null;
  state: "queued" | "generating" | "ready" | "failed";
  durationMs: Ms;
  model: string;
  prompt: string;
  seed?: number;
  error?: string;
}

interface BgmJob {
  jobId: Id;
  projectId: Id;
  scriptId: Id;
  prompt: string;
  mood?: string;
  durationMs: Ms;
  state: "submitting" | "queued" | "generating" | "ready" | "failed";
  mediaId?: Id;
  url?: string;
  error?: string;
}

interface ContinuityPanel {
  id: Id;
  projectId: Id;
  versionId: Id;
  version: number;
  storyboardId?: Id;
  prompt: string;
  markers: Array<{ x: number; y: number; w: number; h: number; note: string }>;
  imageUrl: string;
  createdAt: string;
}

interface StatutoryWarning {
  required: boolean;
  categories: Array<"tobacco" | "alcohol" | "drugs" | "gambling" | "violence" | "sexual">;
  text: string;                         // rendered banner text
  position: "top" | "bottom";
  startMs: Ms;
  endMs: Ms | null;                     // null = entire programme
  style: { background: string; color: string; fontSizePx: number; opacity: number };
  assetUrl?: string;                    // pre-rendered PNG preferred
}

interface Marker {
  id: Id;
  atMs: Ms;
  label: string;
  color: string;
}

interface Compilation {
  id: Id;
  projectId: Id;
  scriptId: Id;
  timelineId: Id;
  state: "queued" | "rendering" | "finalizing" | "ready" | "failed" | "cancelled";
  progress: number;                     // 0..1
  settings: ExportSettings;
  outputUrl?: string;
  posterUrl?: string;
  durationMs?: Ms;
  bytes?: number;
  error?: string;
  createdAt: string;
}

interface ExportSettings {
  width: number;
  height: number;
  fps: 24 | 25 | 30 | 60;
  format: "mp4" | "webm" | "mov";
  videoCodec: "h264" | "vp9" | "hevc";
  crf: number;                          // 16..28
  preset: "veryfast" | "fast" | "medium" | "slow";
  audioCodec: "aac" | "opus";
  audioBitrateKbps: 128 | 192 | 256;
  loudnessTargetLufs: number;           // default -14
}
```

### 4.4 Example timeline document

```json
{
  "id": "0193f0a1-7c2e-7b31-9a55-0b6f0e2f4c11",
  "projectId": "0193ef10-1a2b-7c40-8d11-2f3a4b5c6d7e",
  "scriptId": "0193ef22-3b4c-7d51-9e22-3a4b5c6d7e8f",
  "name": "EP01 — Cellar Dawn",
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "aspect": "9:16",
  "durationMs": 112000,
  "markers": [{ "id": "mk_1", "atMs": 15000, "label": "Act 2", "color": "#7C5CFF" }],
  "masterGain": 1,
  "statutoryWarning": {
    "required": true,
    "categories": ["tobacco"],
    "text": "Smoking is injurious to health.",
    "position": "bottom",
    "startMs": 0,
    "endMs": null,
    "style": { "background": "#000000B3", "color": "#FFFFFF", "fontSizePx": 34, "opacity": 0.9 }
  },
  "revision": 12,
  "tracks": [
    {
      "id": "trk_v1", "timelineId": "0193f0a1-...", "kind": "video", "index": 1, "name": "V1",
      "muted": false, "solo": false, "locked": false, "hidden": false, "gain": 1, "revision": 4,
      "clips": [
        {
          "id": "clp_01", "trackId": "trk_v1", "kind": "video", "mediaId": "med_101",
          "startMs": 0, "durationMs": 4800, "srcInMs": 200, "srcOutMs": 5000,
          "speed": 1, "gain": 1, "fadeInMs": 0, "fadeOutMs": 200,
          "transform": { "x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1 },
          "transitionIn": null,
          "provenance": {
            "storyboardId": "sb_01", "videoId": "vid_9f2", "takeIndex": 1,
            "prompt": "Theo weaves glowing Aether-Silk in the cellar, lantern light, 9:16",
            "model": "seedance-2.5", "seed": 884213, "generatedAt": "2026-11-24T09:12:00Z"
          },
          "status": "ready", "locked": false, "label": "Cellar wide", "revision": 2
        },
        {
          "id": "clp_02", "trackId": "trk_v1", "kind": "video", "mediaId": "med_102",
          "startMs": 4800, "durationMs": 5200, "srcInMs": 0, "srcOutMs": 5200,
          "speed": 1, "gain": 1, "fadeInMs": 0, "fadeOutMs": 0,
          "transform": { "x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1 },
          "transitionIn": { "type": "crossfade", "durationMs": 500, "audio": "crossfade" },
          "status": "ready", "label": "Hands close-up", "revision": 1
        }
      ]
    },
    {
      "id": "trk_a1", "timelineId": "0193f0a1-...", "kind": "audio", "index": 1, "name": "A1",
      "muted": false, "solo": false, "locked": false, "hidden": false, "gain": 1, "revision": 3,
      "clips": [
        {
          "id": "clp_bgm", "trackId": "trk_a1", "kind": "audio", "mediaId": "med_bgm_7",
          "startMs": 0, "durationMs": 112000, "srcInMs": 0, "srcOutMs": 112000,
          "speed": 1, "gain": 0.25, "fadeInMs": 1500, "fadeOutMs": 3000,
          "transform": { "x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1 },
          "transitionIn": null, "status": "ready", "label": "BGM — tense strings", "revision": 1
        }
      ]
    },
    {
      "id": "trk_t1", "timelineId": "0193f0a1-...", "kind": "text", "index": 1, "name": "Titles",
      "muted": false, "solo": false, "locked": false, "hidden": false, "gain": 1, "revision": 1,
      "clips": [
        {
          "id": "clp_title", "trackId": "trk_t1", "kind": "text", "mediaId": null,
          "startMs": 1200, "durationMs": 3000, "srcInMs": 0, "srcOutMs": 3000,
          "speed": 1, "gain": 1, "fadeInMs": 300, "fadeOutMs": 300,
          "transform": { "x": 0.5, "y": 0.82, "scale": 1, "rotation": 0, "opacity": 1 },
          "transitionIn": null,
          "text": {
            "content": "CELLAR DAWN", "fontFamily": "Inter", "fontSizePx": 64,
            "fontWeight": 600, "color": "#FFFFFF", "background": null,
            "stroke": { "color": "#000000", "widthPx": 2 }, "align": "center",
            "anchor": "bottom", "safeArea": true, "animationIn": "fade", "animationOut": "fade"
          },
          "status": "ready", "revision": 1
        }
      ]
    }
  ]
}
```

### 4.5 Track model rules

| Kind | Lane prefix | Contents | Notes |
|---|---|---|---|
| `video` | `V1..Vn` | timed video or image clips | V1 is the base picture; V2+ composite above |
| `overlay` | `O1..On` | watermarks, logos, PiP, statutory banner | renders above all `video` tracks |
| `audio` | `A1..An` | clip audio, BGM, SFX, voice | A1 is programme audio; A2+ mix |
| `text` | `T1..Tn` | text clips | renders above `overlay` |

- Composite order: `video (Vn..V1, bottom→top)` → `overlay` → `text`. Audio mixes all `audio`
  tracks plus detachable audio from video clips.
- Exactly one clip may occupy a given moment per track. Overlap is only allowed as a
  **transition overlap** (§6.12) and only between *adjacent* clips, `<= 2000 ms`.
- Deleting the last clip leaves the track (explicit track delete only).
- `LOCKED` tracks reject all mutations; the UI shows a lock and disables drop.

### 4.6 SQLite schema sketch (replica backend)

```sql
CREATE TABLE timelines (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, script_id TEXT NOT NULL,
  name TEXT NOT NULL, fps INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
  aspect TEXT NOT NULL, doc_json TEXT NOT NULL,   -- markers, statutory, masterGain, ordering
  revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE tracks (
  id TEXT PRIMARY KEY, timeline_id TEXT NOT NULL, kind TEXT NOT NULL, idx INTEGER NOT NULL,
  name TEXT NOT NULL, flags_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE clips (
  id TEXT PRIMARY KEY, track_id TEXT NOT NULL, kind TEXT NOT NULL, media_id TEXT,
  start_ms INTEGER NOT NULL, duration_ms INTEGER NOT NULL,
  src_in_ms INTEGER NOT NULL, src_out_ms INTEGER NOT NULL, speed REAL NOT NULL DEFAULT 1,
  gain REAL NOT NULL DEFAULT 1, fade_in_ms INTEGER NOT NULL DEFAULT 0,
  fade_out_ms INTEGER NOT NULL DEFAULT 0, transform_json TEXT NOT NULL,
  transition_json TEXT, text_json TEXT, provenance_json TEXT,
  status TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0, label TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX clips_track_start ON clips(track_id, start_ms);
CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, script_id TEXT,
  kind TEXT NOT NULL,                 -- video|image|bgm|continuity|compile
  state TEXT NOT NULL, payload_json TEXT NOT NULL, result_json TEXT,
  provider_ref TEXT, credits_held INTEGER NOT NULL DEFAULT 0,
  credits_settled INTEGER NOT NULL DEFAULT 0, error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE compilations (
  id TEXT PRIMARY KEY, timeline_id TEXT NOT NULL, project_id TEXT NOT NULL,
  state TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, settings_json TEXT NOT NULL,
  output_url TEXT, poster_url TEXT, duration_ms INTEGER, bytes INTEGER,
  error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

`doc_json` keeps the ordered track index list and timeline-level settings so whole-track saves
stay cheap while `GET timeline` can be assembled in one query per table.

---

## 5. Editor UI

### 5.1 Layout (desktop, ≥1280 px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Context bar: Show ▾   Episode ▾   Timeline ▾     [Assemble] [Save: Saved] [Compile] │
├───────────────┬──────────────────────────────────────────┬───────────────────┤
│ Library       │ Canvas                                   │ Inspector         │
│ (media pool)  │  ┌────────────────────────────┐          │ (clip / canvas)   │
│ ┌───────────┐ │  │                            │          │                   │
│ │ tabs      │ │  │        preview             │          │ Transform         │
│ │ grid      │ │  └────────────────────────────┘          │ Timing            │
│ └───────────┘ │ Transport: ⏮ ◀ ▶ ⏸ ▶ ⏭ 00:00:04:12  1x  🔊 │ Audio             │
│ search/filter │ Zoom −────────●────+  Fit  Snap: on        │ Transition        │
├───────────────┴──────────────────────────────────────────┴───────────────────┤
│ Ruler  0:00      0:10        0:20        0:30        0:40        0:50    1:52 │
│ V2  ▢ [ clip ][ clip ]                                                       │
│ V1  ▢ [====== clip ======][==== clip ====][ clip ]                           │
│ A1  ▢ [~~~~~~~~~~~~ BGM ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ]                    │
│ A2  ▢        [ voice ][ voice ]                                              │
│ T1  ▢    [ title ]                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

Regions map to the product's four tour anchors: `library`, `timeline`, `inspector`, `compile`.

- Left rail collapsible (`Cmd/Ctrl+B`), width 280–360 px.
- Inspector 300–360 px; collapses to a floating sheet below 1024 px.
- Timeline height resizable by dragging the splitter; lane height 56 px (video) / 44 px (audio).
- Dark theme by default; all colours from the design-token spec.

### 5.2 Library (media pool)

Tabs: **Takes**, **Clips**, **Images**, **Audio** (BGM + uploads + extracted voices).
Rows/cards show poster, name, duration, resolution, and a badge for generated items.

- Search (debounced 200 ms) + filter by episode and by model.
- Hover preview: muted 3 s loop, generated from `posterUrl`/video on demand.
- Drag source: card → timeline (ghost with poster + duration). Click = open in inspector.
- Upload: `uploadClip` (video/audio, ≤ 200 MB) → optimistic card in `processing` → poll.
- "Refresh URLs": `getFileUrl` batch (§11.4) when a preview 403s (signed URLs expire).

### 5.3 Canvas + transport

- Letterboxed preview at the timeline aspect, `object-fit: contain`, background `#0B0B0F`.
- Safe-area guides toggle (`G`), title-safe 10 % and action-safe 5 %.
- Active clip badge (track + label); timecode; dropped-frame counter in dev mode.
- Transport: jump-to-start, step back, play/pause, step forward, jump-to-end, loop, speed
  menu (0.25/0.5/1/1.5/2), master volume, fullscreen (`F`).
- Clicking the canvas selects the topmost visible clip at the playhead; clicking empty deselects
  (inspector switches to canvas settings).

### 5.4 Inspector

Two modes.

**Canvas mode** (nothing selected): timeline name, resolution, fps, aspect, master gain,
statutory warning config, markers list, episode duration, "Recompute layout".

**Clip mode**: sections

| Section | Fields |
|---|---|
| Identity | label, media name, source badge, model, take index, seed, generated at |
| Timing | start, duration, in, out, speed; `Trim to playhead` buttons |
| Transform (video/overlay/image) | x, y, scale, rotation, opacity, fit (cover/contain) |
| Audio (audio-bearing) | gain dB, fade in/out, mute clip, channel mode |
| Transition | type, duration, audio crossfade |
| Text (text clips) | content, font, size, weight, colour, background, stroke, align, anchor, animation |
| Prompt | prompt textarea, `Rewrite`, `Regenerate`, take strip, `Use this take` |
| Continuity | panel thumb, `Open history`, `Attach reference` |
| Danger | `Delete clip`, `Ripple delete`, `Lock` |

All numeric inputs commit on blur/Enter and support arrow-key nudging (1 frame; Shift = 10
frames).

### 5.5 Compile panel

Right-side sheet opened by **Compile**:

- Preset: `9:16 1080×1920` (default, matches timeline), `16:9 1920×1080`, `1:1 1080×1080`,
  custom.
- fps: timeline fps default; 24/25/30/60.
- Format: MP4 (H.264/AAC), WebM (VP9/Opus), MOV (ProRes optional, `DESIGNED`).
- Quality: slider mapping to CRF 16–28 (default 20), preset select.
- Audio: bitrate 128/192/256, loudness normalisation on by default (-14 LUFS).
- Estimated duration and size, credit cost (compile is free in the replica; show `0 credits`).
- `Compile` → job sheet with progress bar, cancel, and on completion: preview, download,
  "Reveal in Compilations".
- Validation errors are listed before submit (empty timeline, gaps on V1, missing media,
  unsupported source, locked track conflicts).

---

## 6. Interaction specification

### 6.1 Selection

- Single click selects; `Shift+click` range-selects clips on the same track; `Cmd/Ctrl+click`
  toggles. Multi-select supported for delete, move (same track only), and gain changes.
- Selection is stored as `clipIds: string[]` in editor state, never in the document.
- `Esc` clears selection; `Tab` cycles clips in time order on the focused track.
- Inspector shows the *primary* (last-clicked) clip; a multi-select banner shows count.

### 6.2 Drag & drop from library

| Drop target | Result |
|---|---|
| Empty area of a `video` track | insert clip at drop time, snap start to drop position |
| Existing clip body on `video` | insert before/after based on pointer half; ripple optional |
| `audio` track | audio clip; if video media has audio, offer "video only / audio only / both" |
| `overlay`/`text` | overlay clip or new text clip |
| Canvas | append to V1 at playhead |

Rules:

- Drag ghost shows poster + duration + snap indicator line.
- Hovering the timeline edge auto-scrolls at 8 px/frame.
- Dropping media shorter/longer than the target gap: insert at pointer, push subsequent clips
  right (insert mode) unless `Alt` is held (overwrite mode).
- Unsupported media types are rejected with a toast, never silently ignored.

### 6.3 Trim in/out

- Hover the left/right 8 px of a clip → trim cursor.
- Drag adjusts `srcInMs` (left) or `srcOutMs` (right) and `durationMs` together; the neighbouring
  clips do not move (trim is *non-rippling* by default).
- `Alt+drag` = ripple trim (subsequent clips shift by the delta).
- Limits: `srcInMs >= 0`, `srcOutMs <= media.durationMs`, `durationMs >= 1 frame`.
- Trimming past the source end is clamped with a red edge flash; no invalid state is committed.
- Multi-frame precision: pointer delta is converted to ms then frame-quantised.
- `I`/`O` set in/out on the *selected clip* at the playhead (trim to playhead).

### 6.4 Split at playhead

- `S` splits every selected clip that spans the playhead; with no selection, splits the
  topmost clip under the playhead on the focused track.
- Split point is frame-quantised. Both halves keep provenance; the right half gets a new clip id
  and `srcInMs = splitSourceMs`.
- Audio is split identically; fades are re-apportioned (left keeps fade-in, right keeps fade-out).
- One undo entry per split gesture.

### 6.5 Delete and ripple delete

- `Delete` / `Backspace` = **ripple delete**: remove selected clips and shift later clips on the
  same track left by the removed duration. Gaps are preserved when `Shift` is held (lift).
- `Shift+Delete` = lift (leave gap).
- Ripple delete on V1 may optionally ripple *linked* audio tracks (clips sharing a `mediaId`
  within ±1 frame); this is a checkbox in the confirm toast, default on.
- Deleting a clip never deletes the media from the pool.

### 6.6 Reorder

- Drag a clip horizontally to move it in time; `Cmd/Ctrl+drag` constrains to its track; dropping
  on another compatible track moves it there (V→V, A→A only).
- Swap gesture: drop a clip onto an occupied slot with `Shift` → swap the two clips' start times
  if their durations allow, else insert-push.
- Reorder commits a sorted, validated clip array; overlapping (non-transition) clips are rejected.

### 6.7 Snapping

- Snap targets: playhead, timeline start/end, other clip edges on any track, markers, ruler
  second/frame ticks (when zoomed in), safe-area centre lines (canvas drag).
- Default threshold 8 px, converted to ms at current zoom; `N` toggles snapping.
- Visual: vertical 1 px accent line + 4 px magnet glow; label shows the target (`V1 end`,
  `Marker: Act 2`).
- `Alt` temporarily disables snapping during a drag.

### 6.8 Zoom and scroll

- Horizontal zoom range 4–400 px/s, default fit-to-window on load.
- `Cmd/Ctrl+wheel` zooms around the pointer; trackpad pinch maps to the same handler.
- `+` / `-` zoom, `Shift+Z` fit selection, `Z` fit timeline.
- Vertical scroll for lanes; ruler is sticky; playhead is a fixed 1 px line with a draggable head.
- Auto-scroll follows playback; disabled while the user is dragging or has scrolled manually
  (re-enabled when playhead re-enters view).

### 6.9 Frame thumbnails

- Filmstrip: one thumbnail every 0.5 s of clip duration, capped at 12 per clip; regenerate on
  zoom change (debounced 150 ms).
- Generation: hidden `<video preload="auto" muted crossOrigin="anonymous">`, seek to
  `t = in + i*step`, `drawImage` to a 160×90 canvas, `toDataURL("image/jpeg", 0.7)`.
  (This mirrors the observed client helper that seeks a video element and returns a JPEG data
  URL at quality 0.7.)
- Cache: IndexedDB `thumbs` store keyed `mediaId:round(t*10)`; hit < 5 ms. LRU cap 5000 entries.
- Images use their poster at every slot; audio clips render a waveform (peaks computed once,
  200 buckets/s, cached).
- Missing/failed thumbs render a neutral placeholder with the clip label.

### 6.10 Preview player

- Composition: one `<video>` element per visible `video`/`overlay` track (max 4 concurrently),
  CSS-transformed; text rendered as DOM; audio through WebAudio where supported, otherwise
  element volume.
- Preload strategy: current clip + next clip on V1; other tracks preload metadata only.
- On play: seek all active elements to `playhead - clip.start + srcIn`, `play()` in the same task;
  drift correction every 250 ms if `|Δ| > 80 ms`.
- On seek: synchronously set `currentTime`, request one frame (`requestVideoFrameCallback` when
  available).
- Gaps on V1 render black with a "gap" badge in the ruler.
- Playback speed applies `playbackRate` to all active media; audio is pitch-preserved by default.
- If a media 403s, refresh URLs for that media and retry once; second failure shows an inline
  error chip and the timeline stays usable.

### 6.11 Audio mixing

- Per clip: gain, fade in/out (drag handles on the clip), mute.
- Per track: gain, mute, solo (solo isolates; multiple solos allowed).
- Master: gain + limiter indicator.
- Mix law: `out = Σ(clip.gain × track.gain × masterGain)`; solo overrides track mute.
- BGM ducking: optional per audio track (`duckUnder: "A1"`), implemented at export with
  `sidechaincompress` and previewed with a static -8 dB reduction while A1 is active.
- Meters: peak per track at 20 Hz for preview only (not persisted).
- Loudness: export normalises to -14 LUFS; preview is unnormalised.

### 6.12 Transitions

- A transition belongs to the **incoming** clip (`transitionIn`) and overlaps it with the
  previous clip on the same track.
- Adding: drag the clip edge onto its neighbour (overlap gesture) or pick a type + duration in
  the inspector.
- Constraint: `0 < durationMs <= min(prev.durationMs, clip.durationMs, 2000)`; validation
  prevents a third overlapping clip.
- Layout consequence: when a transition of `d` is set, `clip.startMs = prev.endMs - d`.
  Removing it restores butt-joint (`startMs = prev.endMs`) unless the user had moved it manually.
- Audio: `crossfade` uses equal-power crossfade; `cut` keeps a hard audio cut.
- Render: `xfade` (video) + `acrossfade` (audio), see §12.4.

### 6.13 Text overlays

- Create: `T` adds a text clip at the playhead on the focused text track (create `T1` if absent),
  default 3 s, default style from canvas settings.
- Editing: double-click the clip or the canvas overlay → inline editor; Enter commits,
  Shift+Enter newline, Esc cancels.
- Bounds: text box wraps at 80 % width, auto-shrinks font to a 24 px floor, then truncates with
  ellipsis; a warning appears when content exceeds 280 chars.
- Safe area: when `safeArea` is true, the box is clamped inside 10 % insets; the UI shows the
  title-safe rectangle while dragging.
- Rendering in preview: DOM with the same font stack as export; export pre-renders text to a
  transparent PNG server-side (font fidelity + deterministic output) unless the font is on the
  render host and `drawtext` is chosen.
- Animations: `fade` (opacity ramp), `slide-up/down` (24 px translate), durations from
  `fadeInMs`/`fadeOutMs`.

### 6.14 Per-clip prompt, rewrite and regenerate

The clip inspector exposes the generation provenance and four actions:

| Action | Endpoint | Behaviour |
|---|---|---|
| Rewrite prompt | `repromptVideoPrompt` (video) / `repromptImagePrompt` (image) | LLM rewrites the current prompt from an instruction; result replaces the textarea, not saved until the user accepts |
| Generate prompt from shot | `generateVideoPrompt` | Creates a first prompt from the storyboard shot (`videoDesc`, stills, continuity) |
| Save prompt | `updateVideoPrompt` | Persists the prompt on the take/shot; does not regenerate |
| Regenerate | `generateVideo` / `batchGenerateVideo` | New take with the current prompt; credits quoted first; progress via `checkVideoStateList` |

Rules:

- Regenerate never overwrites an existing take; it appends to `videoList` and the new take is
  auto-selected on success (configurable).
- Changing `updateVideoDuration` before regeneration changes the requested clip length
  (4–15 s depending on model); the timeline clip duration is not changed until the user
  replaces the take.
- "Replace clip with this take" keeps the clip's `startMs` and transition, resets `srcInMs` to 0
  and adjusts `durationMs` to the new take (clamped to keep the track valid; overflow pushes
  subsequent clips with a toast).
- Prompt editing is disabled on locked tracks and for viewers.

### 6.15 Continuity panels

Purpose: keep characters, wardrobe and sets consistent across shots and takes.

- A panel is a generated reference image plus prompt and region markers (e.g. "face", "costume").
- Entry points: inspector → Continuity section; storyboard shot menu; the Video step.
- `generateContinuityPanel` returns `{ versionId, version }`; the panel is polled with
  `pollingContinuityPanel(projectId, ids)` until an image URL exists.
- `getContinuityPrompt` seeds the editor with the current continuity prompt.
- `editContinuityPanelWithMarkers` saves marker-guided edits (regions + notes) as a new version.
- History lists versions with thumbnails; `deleteContinuityPanelHistory` removes one.
- Attaching a panel to a clip stores `provenance.continuityVersionId`; regeneration includes the
  panel image as an image reference.
- The editor shows a small continuity chip on clips that have one; clicking previews the panel
  side by side with the current frame.

### 6.16 Statutory-warning overlay

- `detectStatutoryWarning(prompt)` scans a prompt/shot description and returns the categories and
  a suggested banner text. It runs on shot creation and on prompt save; results are advisory.
- A required warning is materialised as **either**
  1. a per-timeline `statutoryWarning` config rendered at export/preview as a canvas overlay, or
  2. a dedicated clip on `O1` (`assetUrl` = pre-rendered PNG) so it can be timed and animated.
  Default: option 1, whole programme, bottom, 34 px at 1080 width, 70 % black plate, 90 % opacity.
- `updateTrackStatutoryWarning` persists a per-track override (position, window, style).
- UI: canvas-mode inspector shows a "Statutory warning" card with detected categories, text
  editor, position/window controls, and a live preview. Toggling off requires a confirmation with
  the detected categories.
- Preview: rendered in the DOM as an absolutely positioned banner inside the safe area.
- Export: burned in for the entire window; the banner must never be clipped by the platform UI
  (bottom safe inset 96 px at 1080×1920).

---

## 7. State machines

### 7.1 Video take generation and polling

```
                quote ok                provider accepted
  idle ──▶ quoting ──▶ held ──▶ queued ──▶ generating ──▶ ready
                    │                 │            │
                    │                 │            └──▶ failed ──▶ (retry) queued
                    │                 └──▶ cancelled
                    └──▶ error (credits released)

  ready ──selectVideo──▶ selected ──assemble──▶ on timeline
```

Polling policy:

1. `generateVideo` / `batchGenerateVideo` returns `{ jobIds, videoIds }` (PARTIAL) — the client
   records the ids and sets each take to `queued`.
2. Poll `checkVideoStateList(projectId, scriptId, videoIds)` every **4 s** while any take is
   `queued|generating`.
3. Backoff: after 2 minutes → 8 s; after 5 minutes → 15 s.
4. Timeout: 20 minutes → mark `failed` locally with `error: "timeout"` and offer `syncVideoStatus`
   (server truth) before retrying.
5. On tab focus / network reconnect: one immediate `syncVideoStatus` call.
6. Stop polling when no take is pending, on route leave, or on `visibilitychange` to hidden
   (resume on visible).
7. Never poll a batch larger than 50 ids; chunk.

`syncVideoStatus(projectId, scriptId)` returns the authoritative list of takes and states; it is
the reconciliation source of truth after any polling gap.

### 7.2 BGM generation

```
idle ──generateBgm──▶ submitting ──▶ polling(jobId) ──▶ ready(mediaId,url) ──▶ attached to A2
                                      └──▶ failed ──▶ retry/cancel
```

- `generateBgm` payload includes prompt, mood, target duration (episode duration), projectId,
  scriptId. Returns `{ jobId }` (PARTIAL).
- `pollBgm(jobId, projectId)` every 3 s, max 5 minutes.
- On ready: create media (`source: "bgm"`), attach as a clip on the first free audio track at 0 ms,
  gain 0.25, 1.5 s fade-in, 3 s fade-out.
- `getBgmList(projectId, scriptId)` lists previous BGM jobs/media for reuse; the list is the
  Audio tab's "BGM" filter.

### 7.3 Image jobs (storyboard, anchor, asset variants)

```
batchGenerateImage(payload) -> { items[], warning? }
  items[i] = { id, state: queued|generating|ready|failed, url? }
pollingImage(ids) -> same items shape, poll 3 s
updateStoryboardUrl/updateAnchorUrl/updateAssetsUrl({ id, url, flowId }) on manual replacement
```

Batch endpoints may return a `warning` string (e.g. partial quota); surface it as a toast and
continue with the returned items.

### 7.4 Continuity panels

```
generateContinuityPanel(payload) -> { versionId, version }
pollingContinuityPanel(projectId, ids, signal) -> versions until imageUrl
editContinuityPanelWithMarkers(payload) -> { versionId, version }
```

Cancellation uses an `AbortController` signal (the client passes `{ signal }`).

### 7.5 Clip / track UI states

```
clip:   empty ──attach media──▶ ready ──regenerate──▶ generating ──▶ ready | failed
track:  empty ──first clip──▶ populated ──lock──▶ locked
```

`empty` clips are placeholders from storyboard assembly; they block export validation until
filled or deleted.

### 7.6 Save machine

```
idle ──edit──▶ dirty ──debounce 600ms──▶ saving ──200──▶ saved
                     ▲                        │
                     └──────── error ◀────────┘ (retry ×3, exp backoff, then banner)
saving ──409 conflict──▶ conflict (dialog: Reload server / Overwrite / Duplicate)
```

### 7.7 Export machine

```
draft ──validate ok──▶ queued ──worker claims──▶ rendering ──▶ finalizing ──▶ ready
   │                        │                        │
   └── validation errors    └── cancelled            └── failed (error, retry)
```

Progress is polled every 2 s (`getCompilation`), with an optional SSE channel (`DESIGNED`).
`rendering.progress` is derived from ffmpeg `out_time_ms / duration_ms`, clamped 0–0.99;
`finalizing` covers faststart/move/poster (0.99–1.0).

---

## 8. Persistence, autosave and undo

### 8.1 Document vs patch

- The editor loads one `Timeline` document (§4.3) and keeps it in memory (Zustand store
  `useTimelineStore`).
- Edits mutate a draft copy. Track-level saves send the **whole clip array** for that track, which
  matches the observed `saveTrackMedias({ projectId, trackId, medias })` contract and keeps the
  server simple.
- Timeline-level settings (fps, statutory, markers, master gain, track order) save via the
  timeline document endpoint (`DESIGNED`) or, if the backend only has the flow blob, through
  `saveFlowData({ projectId, episodesId, data })`.

### 8.2 Autosave

- Debounce **600 ms** after the last mutation; hard flush every **10 s** while dirty.
- Save only dirty tracks (a set of `trackId`s) + the timeline doc if dirty.
- Requests are serialised per track; a newer edit while a save is in flight queues exactly one
  follow-up (coalescing), never a request storm.
- Optimistic UI; the "Saved" pill shows `Saving… → Saved 12:04:31` and `Retry` on error.
- `beforeunload` guard while dirty or saving; `visibilitychange:hidden` flushes with
  `navigator.sendBeacon` fallback.
- Local safety net: the draft is snapshotted to IndexedDB every 20 mutations (max 10 snapshots);
  on load, if the server revision is older than a local snapshot, offer **Restore local draft**.

### 8.3 Conflicts

- `saveTrackMedias` accepts `revision`. Server compares; on mismatch returns `409` with the
  current track.
- Dialog options: **Reload** (discard local track), **Overwrite** (send with `force: true`,
  admin/editor only), **Duplicate** (copy local clips into a new track).
- Never auto-merge overlapping clips.

### 8.4 Undo / redo

- Command stack of inverse patches on the timeline document; cap 200 entries; grouped per gesture
  (a drag = one entry).
- `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z`; history panel (`Cmd/Ctrl+Alt+Z`) with labels
  ("Trim clip", "Split at playhead", "Ripple delete 2 clips", "Add BGM").
- Undo across a save is allowed; it marks the document dirty again.
- Regeneration and uploads are **not** undoable (server-side effects); only their timeline
  placement is.

---

## 9. API contracts

Base: `/api`. Envelope (OBSERVED):

```json
{ "code": 200, "message": "ok", "data": { } }
```

Non-`200` throws client-side with `message` and `data`. Auth: cookies + `x-agency-id`.
All times integer ms; all ids UUID.

### 9.1 Load and context

| # | Op | Method/path | Status | Request | Response |
|---|---|---|---|---|---|
| 1 | Workbench data | `POST /production/workbench/getGenerateData` | OBSERVED | `{ projectId, scriptId }` | `{ storyboardList[], trackList[], anchorList[] }` |
| 2 | Flow blob | `POST /production/getFlowData` | OBSERVED | `{ projectId, episodesId }` | `{ data }` |
| 3 | Save flow blob | `POST /production/saveFlowData` | OBSERVED | `{ projectId, episodesId, data }` | `{ ok }` |
| 4 | Signed URLs | `POST /production/workbench/getFileUrl` | OBSERVED | `{ items: [{ id, sources? }] }` | `{ data: [{ id, sources, url }] }` or `{ "<id>:<sources>": url }` |
| 5 | Storyboard page | `POST /production/storyboard/getStoryboardData` | OBSERVED | `{ projectId, scriptId, page?, limit?, name? }` | `{ data[], total }` |
| 6 | Shots | `POST /production/storyboard/getShots` | OBSERVED¹ | `{ projectId, scriptId }` | `{ data[] }` |
| 7 | Storyboard table | `POST /production/storyboard/getTable` | OBSERVED¹ | `{ projectId, scriptId }` | `{ data[] }` |

¹ listed in the reference inventory; payload inferred.

### 9.2 Timeline document (`DESIGNED`, replica)

| Op | Method/path | Request | Response |
|---|---|---|---|
| Get timeline | `POST /production/timeline/get` | `{ projectId, scriptId, timelineId? }` | `{ timeline: Timeline }` |
| Create/ensure | `POST /production/timeline/ensure` | `{ projectId, scriptId, fps?, aspect? }` | `{ timeline }` |
| Save document | `POST /production/timeline/save` | `{ timelineId, revision, patch: { fps?, width?, height?, aspect?, markers?, statutoryWarning?, masterGain?, trackOrder? } }` | `{ timeline, revision }` |

If the replica keeps the reference's storage shape, `get` is implemented over `getGenerateData`
+ `getFlowData`, and `save` over `saveFlowData`; the client contract stays the same.

### 9.3 Tracks and clips

| # | Op | Method/path | Status | Request | Response |
|---|---|---|---|---|---|
| 8 | Add track | `POST /production/workbench/addTrack` | OBSERVED | `{ projectId, scriptId, duration, kind?, index?, name? }` | `{ track }` |
| 9 | Delete track | `POST /production/workbench/deleteTrack` | OBSERVED | `{ id }` | `{ ok }` |
| 10 | Save track media | `POST /production/workbench/saveTrackMedias` | OBSERVED | `{ projectId, trackId, medias: Clip[], revision? }` | `{ track, revision }` |
| 11 | Track statutory | `POST /production/workbench/updateTrackStatutoryWarning` | PARTIAL | `{ projectId, trackId, statutoryWarning }` | `{ track }` |
| 12 | Reorder tracks | `POST /production/timeline/reorderTracks` | DESIGNED | `{ timelineId, order: string[] }` | `{ timeline }` |

`addTrack` observed signature takes the episode `duration`; the replica adds `kind` and `index`
with defaults (`video`, next free V lane) so the call remains backwards compatible.

`saveTrackMedias` is a **whole-array replace**, validated server-side: non-overlapping clips
(except transition overlaps), positive durations, media ownership, `srcOut > srcIn`, and unique
clip ids. Errors: `400 invalid_timeline`, `409 revision_mismatch`, `403 forbidden`, `404`.

### 9.4 Video takes and prompts

| # | Op | Method/path | Status | Request | Response |
|---|---|---|---|---|---|
| 13 | Generate video | `POST /production/workbench/generateVideo` | PARTIAL | `{ projectId, scriptId, storyboardId, prompt, videoPrompt?, duration, model?, aspect?, referenceAssetIds?, continuityVersionId? }` | `{ jobId, videoId, creditsHeld }` |
| 14 | Batch generate | `POST /production/workbench/batchGenerateVideo` | PARTIAL | `{ projectId, scriptId, items: [{ storyboardId, prompt, duration, model? }] }` | `{ items: [{ jobId, videoId }], creditsHeld, warning? }` |
| 15 | Poll states | `POST /production/workbench/checkVideoStateList` | OBSERVED | `{ projectId, scriptId, videoIds }` | `{ items: Take[] }` |
| 16 | Sync all | `POST /production/workbench/syncVideoStatus` | OBSERVED | `{ projectId, scriptId }` | `{ items: Take[] }` |
| 17 | Select take | `POST /production/workbench/selectVideo` | PARTIAL | `{ projectId, scriptId, storyboardId, videoId }` | `{ ok, storyboard }` |
| 18 | Delete take | `POST /production/workbench/delVideo` | OBSERVED | `{ id }` | `{ ok }` |
| 19 | Generate prompt | `POST /production/workbench/generateVideoPrompt` | PARTIAL | `{ projectId, scriptId, storyboardId, ... }` | `{ prompt }` |
| 20 | Rewrite video prompt | `POST /production/workbench/repromptVideoPrompt` | PARTIAL | `{ projectId, currentPrompt, instruction, ... }` | `{ prompt }` |
| 21 | Rewrite image prompt | `POST /production/workbench/repromptImagePrompt` | OBSERVED | `{ projectId, currentPrompt, instruction }` | `{ prompt }` |
| 22 | Save video prompt | `POST /production/workbench/updateVideoPrompt` | OBSERVED | `{ id, prompt }` | `{ ok }` |
| 23 | Update duration | `POST /production/workbench/updateVideoDuration` | OBSERVED | `{ id, duration }` | `{ ok }` |
| 24 | Audio-bound assets | `POST /production/workbench/getAudioBindAssetsList` | OBSERVED | `{ assetsIds }` | `{ data[] }` |

Example — generate:

```json
// request
{
  "projectId": "0193ef10-1a2b-7c40-8d11-2f3a4b5c6d7e",
  "scriptId": "0193ef22-3b4c-7d51-9e22-3a4b5c6d7e8f",
  "storyboardId": "sb_01",
  "prompt": "Theo weaves glowing Aether-Silk in the cellar, lantern light, 9:16",
  "videoPrompt": "slow push-in, warm lantern key light, shallow depth of field",
  "duration": 5,
  "model": "seedance-2.5",
  "aspect": "9:16",
  "continuityVersionId": "cp_v3"
}
// response
{ "code": 200, "message": "ok", "data": {
  "jobId": "job_8f1", "videoId": "vid_9f2", "creditsHeld": 12 } }
```

Example — poll:

```json
// request
{ "projectId": "…", "scriptId": "…", "videoIds": ["vid_9f2"] }
// response data
{ "items": [
  { "id": "vid_9f2", "storyboardId": "sb_01", "state": "generating",
    "durationMs": 5000, "model": "seedance-2.5",
    "prompt": "Theo weaves glowing Aether-Silk…", "seed": 884213, "src": null }
] }
```

### 9.5 BGM

| # | Op | Method/path | Status | Request | Response |
|---|---|---|---|---|---|
| 25 | Generate BGM | `POST /production/workbench/generateBgm` | PARTIAL | `{ projectId, scriptId, prompt, mood?, duration }` | `{ jobId }` |
| 26 | Poll BGM | `POST /production/workbench/pollBgm` | OBSERVED | `{ jobId, projectId }` | `{ state, mediaId?, url?, durationMs?, error? }` |
| 27 | BGM list | `POST /production/workbench/getBgmList` | OBSERVED | `{ projectId, scriptId }` | `{ data: BgmJob[] }` |

### 9.6 Continuity

| # | Op | Method/path | Status |
|---|---|---|---|
| 28 | Get continuity prompt | `POST /production/workbench/getContinuityPrompt` | OBSERVED (returns `{ prompt }`) |
| 29 | Generate panel | `POST /production/workbench/generateContinuityPanel` | OBSERVED (returns `{ versionId, version }`) |
| 30 | Poll panels | `POST /production/workbench/pollingContinuityPanel` | OBSERVED (`{ projectId, ids }`, accepts `signal`) |
| 31 | History | `POST /production/workbench/getContinuityPanelHistory` | PARTIAL |
| 32 | Edit with markers | `POST /production/workbench/editContinuityPanelWithMarkers` | OBSERVED (returns version) |
| 33 | Delete history | `POST /production/workbench/deleteContinuityPanelHistory` | OBSERVED (`{ id }`) |

### 9.7 Statutory warning

```http
POST /api/production/workbench/detectStatutoryWarning
{ "prompt": "He lights a cigarette in the courtyard while the family argues." }

200 { "code": 200, "data": {
  "required": true,
  "categories": ["tobacco"],
  "suggestedText": "Smoking is injurious to health.",
  "confidence": 0.86
} }
```

`updateTrackStatutoryWarning` body: `{ projectId, trackId, statutoryWarning: StatutoryWarning|null }`.

The detector is advisory: it never blocks save or export, but export shows a warning when a
category was detected and the overlay is disabled.

### 9.8 Storyboard, anchors and assets (consumed by the editor)

| Op | Method/path | Status | Notes |
|---|---|---|---|
| Batch stills | `POST /production/storyboard/batchGenerateImage` | OBSERVED | returns `items[]` or `{ items, warning }` |
| Poll stills | `POST /production/storyboard/pollingImage` | OBSERVED | `{ ids }` |
| Replace still | `POST /production/storyboard/updateStoryboardUrl` | OBSERVED | `{ id, url, flowId }` |
| Edit shot | `POST /production/storyboard/editStoryboardInfo` | OBSERVED | `{ id, prompt, videoDesc }` |
| Preview stills | `POST /production/storyboard/previewImage` | OBSERVED | `{ storyboardIds, projectId }` |
| Download stills | `POST /production/storyboard/downPreviewImage` | OBSERVED (blob) | `{ storyboardIds }` |
| Anchors | `POST /production/anchor/{batchGenerateImage,pollingImage,batchDelete,update,updateAnchorUrl}` | OBSERVED | consistency references |
| Asset page | `POST /production/assets/getAssetsPage` | OBSERVED | `{ page, limit, …filters }` → `{ data, total }` |
| Batch asset images | `POST /production/assets/batchGenerateAssetsImage` | OBSERVED | `items[]` |
| Asset polling | `POST /production/assets/pollingImage` | OBSERVED | `{ ids }` |
| Asset URL | `POST /production/assets/updateAssetsUrl` | OBSERVED | `{ id, url, flowId }` |
| Delete asset image | `POST /production/assets/deleteAssetsDireve` | OBSERVED | `{ id, projectId }` |
| Upload clip | `POST /assets/uploadClip` | OBSERVED | `{ base64Data, projectId, name }` |
| Image flow get/save/update/generate | `POST /production/editImage/{getImageFlow,saveImageFlow,updateImageFlow,generateFlowImage,uploadImage}` | OBSERVED | `getImageFlow {id}`, `updateImageFlow {…patch, flowId}`, `uploadImage {base64Data, projectId, scriptId}` |

### 9.9 Export / compilations (`DESIGNED`)

| Op | Method/path | Request | Response |
|---|---|---|---|
| Compile | `POST /production/compile` | `{ projectId, scriptId, timelineId, settings: ExportSettings }` | `{ compilationId }` |
| Poll compilation | `POST /production/compile/poll` | `{ compilationId }` | `{ compilation: Compilation }` |
| List compilations | `POST /production/compilations` | `{ projectId, scriptId?, page?, limit? }` | `{ data: Compilation[], total }` |
| Delete compilation | `POST /production/compilations/delete` | `{ id }` | `{ ok }` |
| Cancel | `POST /production/compile/cancel` | `{ compilationId }` | `{ ok }` |
| Retry | `POST /production/compile/retry` | `{ compilationId }` | `{ compilationId }` |

Example:

```json
// request
{ "projectId": "…", "scriptId": "…", "timelineId": "…",
  "settings": { "width": 1080, "height": 1920, "fps": 30, "format": "mp4",
                "videoCodec": "h264", "crf": 20, "preset": "veryfast",
                "audioCodec": "aac", "audioBitrateKbps": 192,
                "loudnessTargetLufs": -14 } }
// response
{ "code": 200, "data": { "compilationId": "cmp_01" } }
```

Poll response:

```json
{ "code": 200, "data": { "compilation": {
  "id": "cmp_01", "state": "rendering", "progress": 0.42,
  "settings": { "width": 1080, "height": 1920, "fps": 30, "format": "mp4", "crf": 20 },
  "durationMs": 112000 } } }
```

### 9.10 Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | missing/expired cookies |
| `forbidden` | 403 | role/workspace mismatch |
| `not_found` | 404 | project/script/timeline/clip |
| `invalid_request` | 400 | zod failure |
| `invalid_timeline` | 400 | overlap, bad trim, missing media |
| `revision_mismatch` | 409 | stale track/doc revision |
| `insufficient_credits` | 402 | quote/hold failed |
| `provider_error` | 502 | generation provider failed; credits released |
| `rate_limited` | 429 | polling or generation throttle |

---

## 10. Generation polling matrix

| Job | Start | Poll | Interval | Max | Reconciler |
|---|---|---|---|---|---|
| Video take | `generateVideo` / `batchGenerateVideo` | `checkVideoStateList` | 4 s (→8/15) | 20 min | `syncVideoStatus` |
| Storyboard still | `storyboard/batchGenerateImage` | `storyboard/pollingImage` | 3 s | 8 min | `getStoryboardData` |
| Anchor still | `anchor/batchGenerateImage` | `anchor/pollingImage` | 3 s | 8 min | `anchor/getPlan` |
| Asset variant | `assets/batchGenerateAssetsImage` | `assets/pollingImage` | 3 s | 8 min | `assets/getAssetsPage` |
| BGM | `generateBgm` | `pollBgm` | 3 s | 5 min | `getBgmList` |
| Continuity | `generateContinuityPanel` | `pollingContinuityPanel` | 3 s | 5 min | `getContinuityPanelHistory` |
| Compilation | `compile` | `compile/poll` | 2 s | 60 min | `compilations` list |

Rules: one poll loop per job family (not per item); exponential backoff on 429/5xx; AbortController
on unmount; never poll while `document.hidden`.

---

## 11. Media, URLs and uploads

### 11.1 Signed URLs

- Media `url` values are short-lived signed URLs. The editor treats 403/410 as "expired", calls
  `getFileUrl` with up to 50 `{ id, sources }` items, patches the store, and retries the visual
  once.
- The response may be a list (`{id, sources, url}`) or an object keyed `"<id>:<sources>"`; the
  client normalises both (observed helper does exactly this).

### 11.2 Thumbnails & posters

- Generated client-side for clips; stored server-side only for compilations (`posterUrl`).
- Cache keyed by `mediaId + time`; invalidated when the media URL changes.

### 11.3 Upload rules

- Video: MP4/WebM/MOV, H.264/VP9/HEVC, ≤ 200 MB, ≤ 10 min, ≥ 480 px short side.
- Audio: MP3/WAV/M4A/OGG/AAC, ≤ 50 MB.
- Image: PNG/JPG/WebP, ≤ 20 MB, ≥ 720 px.
- Upload is base64 in the observed contract; the replica may add multipart behind the same
  endpoint and keep base64 for ≤ 5 MB.
- Transcode on ingest to the canonical intermediate (§12.1) so export never sees exotic sources.

### 11.4 Media pool composition

```
Takes      = generated video takes for this episode (state ready)
Clips      = asset clips + uploads + rendered compilations
Images     = storyboard stills, anchors, asset images, continuity panels
Audio      = BGM jobs + uploaded audio + extracted voices
```

Each item resolves to a `Media` row; drag payload is `mediaId` + type + duration.

---

## 12. Export pipeline (ffmpeg)

### 12.1 Canonical intermediate

Every clip that reaches the renderer is normalised once to the timeline canvas:

```bash
ffmpeg -y -i "$SRC" \
  -ss "$IN" -to "$OUT" \
  -vf "fps=$FPS,scale=$W:$H:force_original_aspect_ratio=increase,\
crop=$W:$H,setsar=1,format=yuv420p,setpts=PTS-STARTPTS" \
  -af "atrim=0:$DUR,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo" \
  -c:v libx264 -preset veryfast -crf 18 -g $((FPS*2)) -keyint_min $FPS -sc_threshold 0 \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  "seg_$(printf '%03d' "$I").mp4"
```

- Input `-ss` before `-i` is fast but keyframe-aligned; when the trim must be frame-exact, seek
  after `-i` (slower) or add `trim=start=…:end=…` in the filter graph.
- Variable frame rate sources are normalised by `fps=$FPS` with duplication/drop as needed.
- Clips with no audio get a silent stereo track (`anullsrc`) so concat stays uniform.
- Speed ≠ 1: `setpts=PTS/$SPEED` and `atempo` chained (0.5–2.0 per stage) or `atempo=1/$SPEED`
  for slowdowns.

### 12.2 Track concat

Butt-joint clips on a track, all normalised:

```bash
# list.txt
file 'seg_000.mp4'
file 'seg_001.mp4'
ffmpeg -y -f concat -safe 0 -i list.txt -c copy track_V1.mp4
```

`-c copy` is valid only because §12.1 produced identical codec/params. If any segment differs
(e.g. image clip rendered as a loop), fall back to filter concat:

```bash
ffmpeg -y -i a.mp4 -i b.mp4 -filter_complex \
 "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
 -map "[v]" -map "[a]" -c:v libx264 -crf 18 -c:a aac track_V1.mp4
```

### 12.3 Image and text clips

```bash
# still -> clip of N seconds
ffmpeg -y -loop 1 -i still.png -t "$DUR" -r "$FPS" \
  -vf "scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,setsar=1" \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -shortest -c:v libx264 -crf 18 -c:a aac seg.png.mp4
```

Text clips are pre-rendered to transparent PNGs at 2× and composited with `overlay`, which is
more deterministic than `drawtext` for custom fonts:

```bash
ffmpeg -y -i base.mp4 -i title.png \
  -filter_complex "[0:v][1:v]overlay=x=(W-w)/2:y=H*0.78-h/2:enable='between(t,1.2,4.2)'" \
  -c:a copy out.mp4
```

### 12.4 Transitions

```bash
ffmpeg -y -i A.mp4 -i B.mp4 -filter_complex \
 "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.3[v];\
  [0:a][1:a]acrossfade=d=0.5:c1=tri:c2=tri[a]" \
 -map "[v]" -map "[a]" -c:v libx264 -crf 18 -c:a aac joined.mp4
```

`offset = A.duration - transition.duration` (with the overlap layout of §6.12).
`dip-to-black` = `fade` out then in (two `fade` filters), `whip-pan` = `slideleft`/`slideright`.

### 12.5 Compositing overlay and text tracks

```bash
ffmpeg -y -i V1.mp4 -i O1.mp4 -i title.png -filter_complex \
 "[0:v][1:v]overlay=0:0:enable='between(t,0,112)'[v1];\
  [v1][2:v]overlay=x=(W-w)/2:y=H*0.78-h/2:enable='between(t,1.2,4.2)'[v]" \
 -map "[v]" -map 0:a -c:v libx264 -crf 18 -c:a copy master_video.mp4
```

Overlay clips carry their own alpha (PNG/WebM with alpha or a luma matte).

### 12.6 Audio mix

```bash
ffmpeg -y -i A1_voice.wav -i A2_bgm.wav -filter_complex \
 "[1:a]volume=0.25,aloop=loop=-1:size=2e9,atrim=0:112[bgm];\
  [bgm][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bgmduck];\
  [0:a][bgmduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,\
loudnorm=I=-14:TP=-1.5:LRA=11[a]" \
 -map "[a]" -c:a aac -b:a 192k mix.m4a
```

Order matters: `sidechaincompress` takes the signal to compress first and the key second, so the
BGM is compressed by the voice. Clip fades use `afade=t=in:st=…:d=…` before mixing.

### 12.7 Statutory warning burn-in

Pre-rendered banner (preferred):

```bash
ffmpeg -y -i master_video.mp4 -i warning.png \
  -filter_complex "[0:v][1:v]overlay=x=(W-w)/2:y=H-h-96:enable='between(t,0,112)'" \
  -c:a copy out.mp4
```

`drawtext` fallback:

```bash
-vf "drawtext=fontfile=/fonts/Inter-SemiBold.ttf:textfile=warning.txt:\
fontcolor=white:fontsize=34:x=(w-text_w)/2:y=h-140:\
box=1:boxcolor=black@0.7:boxborderw=18:enable='between(t,0,112)'"
```

Safe area: bottom inset 96 px at 1080×1920, 72 px at 1080×1080/1920×1080.

### 12.8 Final encode

```bash
ffmpeg -y -i master.mov \
  -vf "scale=$W:$H:flags=lanczos,fps=$FPS,format=yuv420p" \
  -c:v libx264 -preset "$PRESET" -crf "$CRF" -profile:v high -level 4.1 \
  -g $((FPS*2)) -keyint_min $FPS -sc_threshold 0 \
  -c:a aac -b:a "${ABITRATE}k" -ar 48000 -ac 2 \
  -movflags +faststart "$OUT.mp4"
```

- WebM: `-c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -c:a libopus -b:a 128k`.
- MOV/ProRes (optional): `-c:v prores_ks -profile:v 3 -c:a pcm_s16le`.
- Poster: `ffmpeg -ss 1 -i out.mp4 -frames:v 1 -vf scale=540:-2 poster.jpg`.
- Progress: `-progress pipe:1 -nostats`; parse `out_time_ms`, `speed`, `frame`.

### 12.9 Render plan JSON (worker input)

```json
{
  "compilationId": "cmp_01",
  "canvas": { "width": 1080, "height": 1920, "fps": 30, "durationMs": 112000 },
  "settings": { "format": "mp4", "videoCodec": "h264", "crf": 20, "preset": "veryfast",
                "audioBitrateKbps": 192, "loudnessTargetLufs": -14 },
  "tracks": [
    { "kind": "video", "index": 1, "clips": [
      { "id": "clp_01", "mediaUrl": "https://…/take1.mp4", "srcInMs": 200,
        "srcOutMs": 5000, "startMs": 0, "durationMs": 4800, "speed": 1,
        "transitionIn": null },
      { "id": "clp_02", "mediaUrl": "https://…/take2.mp4", "srcInMs": 0,
        "srcOutMs": 5200, "startMs": 4800, "durationMs": 5200, "speed": 1,
        "transitionIn": { "type": "crossfade", "durationMs": 500 } }
    ]},
    { "kind": "text", "index": 1, "clips": [
      { "id": "clp_title", "startMs": 1200, "durationMs": 3000,
        "text": { "content": "CELLAR DAWN", "fontSizePx": 64, "color": "#FFFFFF",
                  "align": "center", "anchor": "bottom" } }
    ]},
    { "kind": "audio", "index": 2, "clips": [
      { "id": "clp_bgm", "mediaUrl": "https://…/bgm.mp3", "startMs": 0,
        "durationMs": 112000, "gain": 0.25, "duckUnder": "A1",
        "fadeInMs": 1500, "fadeOutMs": 3000 }
    ]}
  ],
  "statutoryWarning": { "assetUrl": "https://…/warning.png", "startMs": 0, "endMs": null }
}
```

### 12.10 Size and time estimates (1080×1920, 30 fps, CRF 20)

| Duration | Approx. size | `veryfast` CPU (8 vCPU) |
|---|---|---|
| 15 s | 12–20 MB | 8–15 s |
| 60 s | 45–75 MB | 35–60 s |
| 3 min | 140–220 MB | 2–4 min |

Normalisation pass adds roughly 0.3–0.6× realtime per source minute; reuse cached segments by
`(mediaId, srcIn, srcOut, speed, fps, size)` hash to make re-exports cheap.

---

## 13. Performance targets

| Metric | Target | Measurement |
|---|---|---|
| Editor first paint (route) | < 800 ms cached, < 2 s cold | Lighthouse/WebPageTest |
| Timeline interactive with 200 clips | < 1.5 s after data | Performance marks |
| Scroll/zoom frame budget | 60 fps, ≤ 16 ms per frame | DevTools trace |
| Drag commit (drop → store update) | < 50 ms | custom mark |
| Trim/split/delete update | < 30 ms | custom mark |
| Autosave request P95 | < 300 ms | server metric |
| Thumbnail generation | < 120 ms each, < 5 ms cache hit | instrumented |
| Preview seek | < 150 ms local, < 400 ms remote | measure on seek |
| Playback A/V drift | < 80 ms after correction | dev overlay |
| Memory with 10 min timeline | < 400 MB | Chrome task manager |
| Export 60 s 1080×1920 | ≤ 90 s (`veryfast`, 8 vCPU) | worker timing |
| Poll request volume | ≤ 1 rps per engagement window | server logs |

Guidelines: virtualise lanes (render only visible time range ± 1 screen), memoise clip
components, avoid re-rendering the whole timeline on playhead ticks (separate layer/transform),
use `requestAnimationFrame` for drag, and offload waveform/thumbnail work to a Web Worker where
possible.

---

## 14. Keyboard shortcuts

Reference-confirmed: `S` split, `Delete` remove. The rest are `DESIGNED` and must not conflict
with browser defaults.

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `J` / `K` / `L` | Reverse / pause / forward (repeated presses ×2, ×4) |
| `←` / `→` | Step 1 frame |
| `Shift+←/→` | Step 1 s |
| `Home` / `End` | Timeline start / end |
| `I` / `O` | Set clip in / out at playhead |
| `S` | Split at playhead |
| `Delete` / `Backspace` | Ripple delete selection |
| `Shift+Delete` | Lift (leave gap) |
| `Cmd/Ctrl+Z` | Undo |
| `Shift+Cmd/Ctrl+Z` | Redo |
| `Cmd/Ctrl+D` | Duplicate clip after itself |
| `Cmd/Ctrl+A` | Select all clips on focused track |
| `Esc` | Clear selection / close sheet |
| `+` / `-` | Zoom in / out |
| `Z` | Fit timeline |
| `Shift+Z` | Zoom to selection |
| `N` | Toggle snapping |
| `M` | Mute selected clip/track |
| `T` | New text clip at playhead |
| `G` | Toggle safe-area guides |
| `F` | Fullscreen preview |
| `Cmd/Ctrl+B` | Toggle library rail |
| `Cmd/Ctrl+Enter` | Compile |
| `Cmd/Ctrl+S` | Force save |
| `[` / `]` | Previous / next marker |
| `Alt+drag` | Disable snapping / ripple trim (context) |

Shortcuts are disabled while a text field has focus, except `Esc`.

---

## 15. Accessibility and i18n

- Full keyboard operation of the timeline: lane focus via `Tab`, clip navigation with arrows,
  context menu via `Shift+F10`.
- ARIA: tracks are `role="listbox"` with `aria-multiselectable`, clips are `option` with
  `aria-label` including track, label, start and duration; live region announces
  "Trimmed to 4.8 seconds", "Split at 00:00:04:12".
- Contrast ≥ 4.5:1 for text and controls; focus rings from the design tokens; no colour-only
  status (icons + labels).
- Reduced motion: disable magnet glow, slide animations, and auto-scroll smoothing.
- Copy is externalised (`en.json`) with Devanagari-capable font fallbacks; timecode respects
  locale but stays `HH:MM:SS:FF`.

---

## 16. Edge cases

| Case | Behaviour |
|---|---|
| Media URL expires | refresh via `getFileUrl`, retry once, then inline error chip |
| Take finishes while the editor is closed | `syncVideoStatus` on mount reconciles; badge shows "new take" |
| Episode duration changes after script edit | timeline keeps clips; ruler shows the new episode end; compile warns on clips beyond end |
| Track saved by another tab | 409 dialog (§8.3); no silent overwrite |
| Delete a clip used as a transition partner | transition removed from the survivor; notify once |
| Trim to < 1 frame | clamp to 1 frame |
| Split at exact clip boundary | no-op with a toast |
| Empty V1 | compile blocked: "Add at least one picture clip" |
| Placeholder clip remains | compile blocked with a list of missing shots |
| Duplicate media ids in a track | server rejects `invalid_timeline` |
| Upload fails mid-way | card returns to `failed` with retry; no orphan media |
| Poll 429 | backoff, keep local `generating`, banner after 3 failures |
| Compile while dirty | force flush, then compile with the saved revision |
| Viewer opens editor | read-only banner; all mutating controls disabled; download only |
| Font missing at export | fall back to bundled Inter/Noto and warn in the compile summary |

---

## 17. Analytics events (replica, non-PII)

`editor_open`, `timeline_assemble`, `clip_trim`, `clip_split`, `clip_delete`, `clip_reorder`,
`transition_add`, `text_add`, `bgm_generate`, `take_regenerate`, `take_select`,
`statutory_detect`, `compile_start`, `compile_done`, `compile_fail`, `autosave_error`.

Payload: ids hashed or omitted, counts, durations, `trackKind`, `fps`, `format`. No prompts or
media URLs.

---

## 18. Implementation plan

Assumes the replica monorepo from `docs/PLAN.md`: Next.js app (`apps/web`), Express API
(`apps/api`), SQLite, ffmpeg worker.

### Phase 0 — contracts (0.5 day)
- Land this document; create `packages/contracts/timeline.ts` (zod schemas mirroring §4.3) and
  fixture JSON.
- Exit: schemas validate the §4.4 example; shared types consumed by web and api.

### Phase 1 — data + load path (1.5 days)
- `timelines/tracks/clips` tables; `timeline/ensure|get|save`; `saveTrackMedias` with revision
  checks and validation.
- `/editor` route shell with context bar, skeletons, and a seeded timeline fixture.
- Exit: open `/editor?projectId&scriptId`, see tracks and clips from the API.

### Phase 2 — timeline core rendering (2 days)
- Ruler, lanes, clip blocks, labels, waveform placeholders, zoom/scroll, playhead, selection,
  fit-to-window, virtualisation.
- Exit: 200-clip fixture scrolls at 60 fps; selection works by click, shift and cmd.

### Phase 3 — edit operations (2.5 days)
- Trim (non-ripple + alt-ripple), split, ripple delete/lift, reorder, insert/overwrite drops,
  snapping, undo/redo command stack, frame quantisation utilities.
- Exit: keyboard and pointer parity for every operation in §6.3–6.8; unit tests for the
  timeline reducer (property tests for non-overlap and duration invariants).

### Phase 4 — media pool + thumbnails (1.5 days)
- Library tabs, search/filter, drag payloads, upload, `getFileUrl` refresh, thumbnail worker,
  IndexedDB cache, waveform peaks.
- Exit: drag a take onto V1 and an uploaded audio onto A2; filmstrip appears within 1 s.

### Phase 5 — preview and audio (2 days)
- Multi-element compositor, transport, speed, loop, safe areas, seek/scroll sync, per-clip fade
  handles, track gain/mute/solo, meters, BGM duck preview.
- Exit: 60 s timeline plays with ≤ 80 ms drift and audible fades; scrubbing stays < 150 ms.

### Phase 6 — generation integration (2.5 days)
- Take sheet, prompt inspector, rewrite/save/regenerate, polling loops with backoff, select take,
  replace-in-timeline, BGM generate/poll/list, storyboard assembly action.
- Exit: mock provider produces a take in ~10 s; assemble builds V1; BGM lands on A2 at 0.25 gain.

### Phase 7 — text, transitions, statutory, continuity (2 days)
- Text clip editor + DOM overlay + safe area; transition overlap model + inspector; statutory
  detect/save/preview; continuity panel browse/attach/history.
- Exit: a text clip and a crossfade render identically in preview and export fixtures.

### Phase 8 — compile pipeline (2.5 days)
- `compile` job, render plan (§12.9), normalise → concat → composite → mix → burn-in → encode,
  progress parsing, poster, compilations list, cancel/retry, cleanup of temp segments.
- Exit: 60 s 9:16 export completes < 90 s and plays in the browser with loudness ≈ -14 LUFS.

### Phase 9 — autosave, conflicts, polish (1.5 days)
- Debounce/flush, beforeunload, IndexedDB snapshots, 409 dialog, error toasts, empty states,
  read-only mode, a11y pass, reduced motion.
- Exit: killing the tab mid-edit recovers; two tabs produce a conflict dialog, not corruption.

### Phase 10 — E2E and seed (1.5 days)
- Playwright: sign in → open seeded show → assemble → trim/split/reorder → text + BGM →
  compile → download. Screenshots for the walkthrough.
- Exit: green on CI; `pnpm dev` demo path in `docs/PLAN.md` works from a clean database.

Total ≈ 20 engineering days for one full-stack engineer, or ~12 calendar days with the
backend/frontend split used elsewhere in the plan.

### 18.1 Definition of done

- A new user can create a show from a script, reach `/editor`, assemble a storyboard, trim,
  split, reorder, add text, transitions, BGM and a statutory warning, save, reload, and compile
  an MP4 that matches the preview within one frame at cut points.
- All contracts in §9 implemented with zod validation and tests; no endpoint returns an
  unvalidated shape.
- Performance targets in §13 met on the reference laptop with a 3-minute episode.
- Viewer role is read-only end to end; credits are quoted/hold/settled for every generate call.

---

## 19. Open questions

1. **Track persistence shape.** The reference saves a whole media array per track
   (`saveTrackMedias`); we mirror it. Confirm whether large tracks (>200 clips) need granular
   `PATCH clip` endpoints — the replica can add them without changing the client contract.
2. **Timeline-level settings.** `saveFlowData` is a generic blob; the replica should still expose
   a typed `timeline/save` facade so the editor never writes opaque JSON.
3. **Compile contract.** Compile is only described in product copy ("appears under
   Compilations"); §9.9 is our design. Confirm the real product's preset names before matching
   copy.
4. **Transition semantics.** Whether the reference uses overlap or handle-based transitions is
   unknown; we specify overlap because it is deterministic and maps cleanly to `xfade`.
5. **Statutory warning taxonomy.** Categories beyond tobacco/alcohol are placeholders; the final
   list must come from the compliance spec, not from guessing.
6. **Audio-only video tracks.** Decide whether V-track audio is always detached to A lanes at
   assembly (default here: keep embedded audio on the clip and mix it, unless the user detaches).

---

## 20. Appendix

### 20.1 Frame helpers

```ts
const q = (ms: number, fps: number) => Math.round((ms / 1000) * fps) * (1000 / fps);
const frameOf = (ms: number, fps: number) => Math.round((ms / 1000) * fps);
const msOf = (frame: number, fps: number) => (frame * 1000) / fps;
const timecode = (ms: number, fps: number) => {
  const f = frameOf(ms, fps), s = Math.floor(f / fps), ff = f % fps;
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return [hh, mm, ss, ff].map(n => String(n).padStart(2, "0")).join(":");
};
```

### 20.2 Validation rules (server, `saveTrackMedias`)

1. `track.kind` compatible with every `clip.kind`.
2. Clips sorted by `startMs`; for consecutive `a, b`:
   `b.startMs >= a.startMs + a.durationMs - (b.transitionIn?.durationMs ?? 0)`.
3. No clip extends past the next clip's start.
4. `0 < durationMs <= 600000`; `0 <= srcInMs < srcOutMs`.
5. `speed ∈ [0.25, 4]`; `gain ∈ [0, 2]`; fades `<= durationMs`.
6. `text` present iff `kind === "text"`; `mediaId` non-null otherwise and owned by the project.
7. Transition duration `<= min(2000, prev.durationMs, clip.durationMs)`.
8. `revision` equals current, unless `force` and role is `admin`.

### 20.3 Component map (Next.js)

```
app/editor/page.tsx
features/editor/
  EditorShell.tsx            # layout, context bar, keyboard scope
  context/ContextBar.tsx
  library/LibraryPanel.tsx   # tabs, search, drag sources
  timeline/Timeline.tsx      # ruler, lanes, virtualisation
  timeline/TrackLane.tsx
  timeline/ClipBlock.tsx
  timeline/Playhead.tsx
  timeline/useTimelineGestures.ts
  preview/PreviewCanvas.tsx
  preview/Transport.tsx
  inspector/Inspector.tsx
  inspector/PromptPanel.tsx
  inspector/TextPanel.tsx
  inspector/TransitionPanel.tsx
  inspector/ContinuityPanel.tsx
  inspector/StatutoryCard.tsx
  compile/CompileSheet.tsx
  compile/CompilationList.tsx
  state/useTimelineStore.ts   # document, selection, history
  state/useAutosave.ts
  state/usePoller.ts
  lib/timelineOps.ts         # split/trim/ripple/snap, pure + tested
  lib/thumbs.ts              # worker bridge
  lib/ffmpegPlan.ts          # render plan builder (shared with api)
```

### 20.4 Future work

Keyframes/automation, colour grading (LUT), multicam, nested sequences, collaboration presence,
comment pins, voice-over recording, auto-captions, loudness presets per platform (TikTok/Reels/
Shorts), one-click "safe crop" per destination, and a frame-accurate proxy workflow for 4K
sources.

---

*Clean-room note: this specification describes behaviour and contracts only. No proprietary
source, assets, copy or identifiers were reproduced. Where a contract was inferred rather than
observed it is marked `PARTIAL` or `DESIGNED`.*
