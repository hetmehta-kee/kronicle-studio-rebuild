import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { uuid } from "./db.js";

const exec = promisify(execFile);
export const STORAGE = resolve(process.env.STORAGE_DIR ?? "./storage");
export const IMAGES = join(STORAGE, "images");
export const VIDEOS = join(STORAGE, "videos");
export const EXPORTS = join(STORAGE, "exports");
for (const d of [IMAGES, VIDEOS, EXPORTS]) mkdirSync(d, { recursive: true });

const PALETTES = [
  ["#1b1035", "#7c5cff", "#ff7ab8"],
  ["#071a1f", "#0ea5a5", "#f4d35e"],
  ["#1f0b12", "#e0457b", "#ffb86b"],
  ["#0b1220", "#3b82f6", "#a78bfa"],
  ["#1a1206", "#f59e0b", "#ef4444"],
];

function esc(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

export function svgImage(title: string, subtitle = "", tag = "KRONICLE") {
  const [a, b, c] = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const id = uuid();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
    </linearGradient>
    <radialGradient id="v" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.20"/><stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </radialGradient>
  </defs>
  <rect width="720" height="1280" fill="url(#g)"/>
  <rect width="720" height="1280" fill="url(#v)"/>
  <text x="48" y="86" fill="#ffffff" fill-opacity="0.65" font-family="Helvetica,Arial,sans-serif" font-size="20" letter-spacing="6">${esc(tag)}</text>
  <text x="48" y="980" fill="#ffffff" font-family="Helvetica,Arial,sans-serif" font-size="56" font-weight="700">${esc(title.slice(0, 22))}</text>
  <text x="48" y="1040" fill="#ffffff" fill-opacity="0.75" font-family="Helvetica,Arial,sans-serif" font-size="24">${esc(subtitle.slice(0, 42))}</text>
  <rect x="48" y="1100" width="120" height="6" rx="3" fill="#ffffff" fill-opacity="0.8"/>
</svg>`;
  const file = join(IMAGES, `${id}.svg`);
  writeFileSync(file, svg);
  return `/media/images/${id}.svg`;
}

const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";

export async function renderClipVideo(label: string, seconds = 2) {
  const id = uuid();
  const out = join(VIDEOS, `${id}.mp4`);
  const safe = label.replace(/[^a-zA-Z0-9 ,._-]/g, " ").slice(0, 48);
  const draw =
    `drawtext=text='${safe.replace(/'/g, "")}':fontcolor=white:fontsize=44:` +
    `x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.25:boxborderw=24`;
  try {
    await exec("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=0x121216:s=720x1280:d=${seconds},format=yuv420p`,
      "-vf", draw,
      "-r", "30",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      out,
    ]);
  } catch {
    await exec("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `testsrc2=s=720x1280:d=${seconds}`,
      "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", out,
    ]);
  }
  return `/media/videos/${id}.mp4`;
}

function localPath(url: string) {
  if (url.startsWith("/media/")) return join(STORAGE, url.replace("/media/", ""));
  return url;
}

export async function exportTimeline(clips: Array<{ path: string; trimInMs?: number; trimOutMs?: number; label?: string }>) {
  const id = uuid();
  const out = join(EXPORTS, `${id}.mp4`);
  if (!clips.length) return renderClipVideo("Kronicle export", 2);

  const parts: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const src = localPath(c.path);
    const part = join(EXPORTS, `${id}-${i}.mp4`);
    const trimIn = Math.max(0, (c.trimInMs ?? 0) / 1000);
    const trimOut = c.trimOutMs ? Math.max(trimIn + 0.2, c.trimOutMs / 1000) : undefined;
    const dur = trimOut ? trimOut - trimIn : 2;
    try {
      if (src.endsWith(".mp4")) {
        const args = ["-y", "-ss", String(trimIn), "-i", src, "-t", String(dur >= 0.2 ? dur : 2)];
        args.push("-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=30");
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", part);
        await exec("ffmpeg", args);
      } else {
        await exec("ffmpeg", [
          "-y", "-f", "lavfi", "-i", `color=c=0x121216:s=720x1280:d=${Math.max(1, dur)},format=yuv420p`,
          "-vf", `drawtext=text='${(c.label ?? "Kronicle").replace(/'/g, "").slice(0, 40)}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2`,
          "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", part,
        ]);
      }
      parts.push(part);
    } catch {
      /* skip a broken clip */
    }
  }
  if (!parts.length) return renderClipVideo("Kronicle export", 2);
  const list = join(EXPORTS, `${id}.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  await exec("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  return `/media/exports/${id}.mp4`;
}
