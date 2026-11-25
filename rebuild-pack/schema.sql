-- Kronicle replica schema (SQLite, node:sqlite)
-- Extracted from apps/api/src/db.ts

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

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at INTEGER NOT NULL,
  locked_at INTEGER,
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs(status, run_at);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_project ON agent_messages(project_id, created_at);
