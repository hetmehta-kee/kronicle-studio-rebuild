import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(process.env.DATABASE_PATH ?? "./storage/kronicle.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  user_id INTEGER UNIQUE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(agency_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  agency_id TEXT UNIQUE NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  held REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  type TEXT NOT NULL,
  gen_type TEXT,
  status TEXT NOT NULL,
  credits_held REAL NOT NULL DEFAULT 0,
  credits_delta REAL NOT NULL DEFAULT 0,
  reason TEXT,
  actor_user_id INTEGER,
  meta TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'video',
  image_model TEXT,
  video_model TEXT,
  image_quality TEXT,
  video_ratio TEXT,
  art_style TEXT,
  director_manual TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  episode_number INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'ready',
  extract_state INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  script_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  describe TEXT,
  prompt TEXT,
  prompt_state TEXT,
  state TEXT,
  image_path TEXT,
  model TEXT,
  resolution TEXT,
  look_locked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_images (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  path TEXT NOT NULL,
  model TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  script_id TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS storyboards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  script_id TEXT,
  shot_number INTEGER NOT NULL,
  scene TEXT,
  prompt TEXT,
  image_path TEXT,
  video_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  script_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'video',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  storyboard_id TEXT,
  media_path TEXT,
  start_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 2000,
  trim_in_ms INTEGER NOT NULL DEFAULT 0,
  trim_out_ms INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  prompt TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bgm (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  script_id TEXT,
  name TEXT NOT NULL,
  path TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  script_id TEXT,
  clip_id TEXT,
  path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_job_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  plan_id INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  currency TEXT NOT NULL,
  gateway_order_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_id TEXT,
  created_at INTEGER NOT NULL
);
`);

// Lightweight migrations for the dev database.
{
  const cols = db.prepare("PRAGMA table_info(assets)").all() as Array<{ name?: string }>;
  if (!cols.some((c) => c.name === "prompt_state")) {
    db.exec("ALTER TABLE assets ADD COLUMN prompt_state TEXT");
  }
}

export const now = () => Date.now();
export const uuid = () => crypto.randomUUID();

export function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as any[])) as T | undefined;
}
export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as any[])) as T[];
}
export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as any[]));
}

export function getUserByEmail(email: string) {
  return one<{ id: string; email: string; name: string; user_id: number }>(
    "SELECT id, email, name, user_id FROM users WHERE email = ?",
    email.toLowerCase(),
  );
}
export function getUserById(id: string) {
  return one<{ id: string; email: string; name: string; user_id: number }>(
    "SELECT id, email, name, user_id FROM users WHERE id = ?",
    id,
  );
}

export function createUser(email: string, name: string) {
  const id = uuid();
  const userId = Math.floor(400_000_000 + Math.random() * 99_000_000);
  run(
    "INSERT INTO users (id, user_id, email, name, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    userId,
    email.toLowerCase(),
    name,
    now(),
  );
  return { id, email: email.toLowerCase(), name, user_id: userId };
}

export function getAgency(id: string) {
  return one<{ id: string; name: string; type: "individual" | "org"; owner_user_id: string }>(
    "SELECT id, name, type, owner_user_id FROM agencies WHERE id = ?",
    id,
  );
}

export function getMembership(agencyId: string, userId: string) {
  return one<{ role: "admin" | "editor" | "viewer" }>(
    "SELECT role FROM memberships WHERE agency_id = ? AND user_id = ?",
    agencyId,
    userId,
  );
}

export function listAgencies(userId: string) {
  return all<{ id: string; name: string; type: "individual" | "org"; role: string }>(
    `SELECT a.id, a.name, a.type, m.role
       FROM memberships m JOIN agencies a ON a.id = m.agency_id
      WHERE m.user_id = ?
      ORDER BY a.created_at ASC`,
    userId,
  );
}

export function getWallet(agencyId: string) {
  return one<{ id: string; agency_id: string; balance: number; held: number }>(
    "SELECT id, agency_id, balance, held FROM wallets WHERE agency_id = ?",
    agencyId,
  );
}

export function ensureWallet(agencyId: string) {
  let w = getWallet(agencyId);
  if (!w) {
    const id = uuid();
    run("INSERT INTO wallets (id, agency_id, balance, held) VALUES (?, ?, 0, 0)", id, agencyId);
    w = getWallet(agencyId);
  }
  return w!;
}

export function createAgency(userId: string, name: string, type: "individual" | "org") {
  const id = uuid();
  run(
    "INSERT INTO agencies (id, name, type, owner_user_id, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    name,
    type,
    userId,
    now(),
  );
  run(
    "INSERT INTO memberships (id, agency_id, user_id, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
    uuid(),
    id,
    userId,
    now(),
  );
  ensureWallet(id);
  return id;
}

export function ledger(agencyId: string, limit = 50) {
  return all(
    `SELECT id, type, gen_type AS genType, status, credits_held AS creditsHeld,
            credits_delta AS creditsDelta, reason, actor_user_id AS actorUserId, created_at AS createdAt
       FROM ledger WHERE agency_id = ? ORDER BY created_at DESC LIMIT ?`,
    agencyId,
    limit,
  );
}
