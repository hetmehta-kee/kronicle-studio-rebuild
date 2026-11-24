import {
  all, createAgency, createUser, getAgency, getMembership, getUserByEmail,
  getWallet, listAgencies, now, one, run, uuid,
} from "./db.js";
import { creditWallet, walletDetail } from "./wallet.js";
import { renderClipVideo, svgImage } from "./media.js";

export const DEMO_EMAIL = "demo@kronicle.studio";
export const DEMO_AGENCY = "Kronicle Studio";
export const DEMO_CREDITS = 10_000;

export async function ensureDemo() {
  let user = getUserByEmail(DEMO_EMAIL);
  if (!user) user = createUser(DEMO_EMAIL, "Kronicle Studio");

  let agencies = listAgencies(user.id);
  let agency = agencies.find((a) => a.name === DEMO_AGENCY);
  if (!agency) {
    const id = createAgency(user.id, DEMO_AGENCY, "org");
    creditWallet(id, DEMO_CREDITS, { reason: "demo_seed", actorUserId: user.user_id });
    agency = listAgencies(user.id).find((a) => a.id === id)!;
  } else {
    const w = getWallet(agency.id)!;
    if (w.balance < DEMO_CREDITS) {
      creditWallet(agency.id, DEMO_CREDITS - w.balance, { reason: "demo_seed", actorUserId: user.user_id });
    }
  }

  const existing = one<{ id: string }>(
    "SELECT id FROM projects WHERE agency_id = ? AND name = 'The Lighthouse Keeper' AND status != 'deleted'",
    agency.id,
  );
  if (!existing) await seedProject(agency.id, user.id);
  return { user, agencyId: agency.id };
}

async function seedProject(agencyId: string, userId: string) {
  const projectId = uuid();
  run(
    `INSERT INTO projects (id, agency_id, user_id, name, project_type, image_model, video_model, image_quality, video_ratio, art_style, director_manual, created_at)
     VALUES (?, ?, ?, 'The Lighthouse Keeper', 'video', 'openai:google/gemini-3.1-flash-image', 'volcengine:ep-20260727140143-rwmnp', '1K', '9:16', 'Indian_Fantasy_Microdrama', 'Indian_Fantasy_Microdrama', ?)`,
    projectId, agencyId, userId, now(),
  );

  const scriptId = uuid();
  run(
    `INSERT INTO scripts (id, project_id, name, content, episode_number, version, type, status, extract_state, created_at)
     VALUES (?, ?, 'Episode 1: Message in a Bottle', ?, 1, 1, 'v1', 'ready', 1, ?)`,
    scriptId, projectId,
    "A lighthouse keeper finds a message in a bottle that predicts tomorrow's storm. The keeper rows into the storm to find the sender, and discovers the message was written by the lighthouse itself.",
    now(),
  );

  const assets = [
    { name: "Lighthouse Keeper", type: "role", describe: "A solitary, weathered keeper in oilskins." },
    { name: "The Lighthouse", type: "scene", describe: "A stone tower on black cliffs under a storm." },
    { name: "Message in a Bottle", type: "tool", describe: "A corked green bottle with a salt-stained note." },
  ];
  for (const a of assets) {
    const id = uuid();
    const img = svgImage(a.name, a.describe, "LOOK");
    run(
      `INSERT INTO assets (id, project_id, script_id, name, type, describe, prompt, prompt_state, state, image_path, model, resolution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'completed', ?, 'openai:google/gemini-3.1-flash-image', '1K', ?)`,
      id, projectId, scriptId, a.name, a.type, a.describe,
      `Cinematic ${a.type} portrait of ${a.name}: ${a.describe} Photorealistic, dramatic key light, 85mm.`,
      img, now(),
    );
    run("INSERT INTO asset_images (id, asset_id, path, model, created_at) VALUES (?, ?, ?, 'mock', ?)", uuid(), id, img, now());
  }

  const plan = {
    lens: "24mm wide, 50mm push-in, 85mm close-ups",
    pacing: "fast-cut microdrama",
    scenes: Array.from({ length: 3 }, (_, i) => ({
      id: `1-${i + 1}`,
      heading: `SCENE ${i + 1} — The Lighthouse Keeper`,
      shots: Array.from({ length: 6 }, (_, j) => ({
        shot: j + 1,
        framing: j % 3 === 0 ? "wide" : j % 3 === 1 ? "medium" : "close",
        move: j % 2 ? "handheld push-in" : "static",
      })),
    })),
  };
  run("INSERT INTO plans (id, project_id, script_id, content, status, created_at) VALUES (?, ?, ?, ?, 'ready', ?)", uuid(), projectId, scriptId, JSON.stringify(plan), now());

  for (let i = 1; i <= 6; i++) {
    run(
      `INSERT INTO storyboards (id, project_id, script_id, shot_number, scene, prompt, image_path, video_prompt, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'image_ready', ?)`,
      uuid(), projectId, scriptId, i, `Scene 1-${Math.floor((i - 1) / 3) + 1}`,
      `Cinematic frame ${i}: the keeper and the lighthouse in the storm.`,
      svgImage(`Shot ${i}`, "storyboard frame", "STORYBOARD"),
      `Camera pushes in on shot ${i}`, now(),
    );
  }

  const videoUrl = await renderClipVideo("The Lighthouse Keeper", 2);
  const trackId = uuid();
  run("INSERT INTO tracks (id, project_id, script_id, name, kind, position, created_at) VALUES (?, ?, ?, 'Video', 'video', 0, ?)", trackId, projectId, scriptId, now());
  const clipId = uuid();
  run(
    "INSERT INTO clips (id, track_id, storyboard_id, media_path, start_ms, duration_ms, trim_in_ms, trim_out_ms, position, status, prompt, created_at) VALUES (?, ?, NULL, ?, 0, 2000, 0, NULL, 0, 'ready', 'The Lighthouse Keeper', ?)",
    clipId, trackId, videoUrl, now(),
  );
  run("INSERT INTO videos (id, project_id, script_id, clip_id, path, status, created_at) VALUES (?, ?, ?, ?, ?, 'ready', ?)", uuid(), projectId, scriptId, clipId, videoUrl, now());
}

export function ensureLabAccount() {
  const email = "researcher@kronicle.local";
  let user = getUserByEmail(email);
  if (!user) user = createUser(email, "Researcher");
  let agency = listAgencies(user.id).find((a) => a.name === "Research Lab");
  let agencyId = agency?.id;
  if (!agencyId) {
    agencyId = createAgency(user.id, "Research Lab", "org");
    creditWallet(agencyId, 3000, { reason: "lab_seed", actorUserId: user.user_id });
  } else {
    const w = getWallet(agencyId)!;
    if (w.balance < 3000) creditWallet(agencyId, 3000 - w.balance, { reason: "lab_seed", actorUserId: user.user_id });
  }
  return { user, agencyId };
}

export function attachDemoAgency(userId: string) {
  const a = listAgencies(userId).find((x) => x.name === DEMO_AGENCY);
  return a?.id;
}
