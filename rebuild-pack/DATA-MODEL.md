# Data model

SQLite schema, table by table. Runnable DDL is in `schema.sql`. The replica
does not declare most foreign keys; scoping is enforced in queries. A rebuild
should keep the same logical relationships and may add real FKs plus the
`ON DELETE` rules noted here.

---

## 1. Relationship map

```
users 1──n memberships n──1 agencies 1──1 wallets
  │                          │             └──1──n ledger
  │                          ├──n invites
  │                          └──n projects 1──n scripts
  │                                          ├──n assets 1──n asset_images
  │                                          ├──n plans
  │                                          ├──n storyboards
  │                                          └──n tracks 1──n clips
  │                                                       └──n videos
  └──n orders

jobs             (queue, no FKs)
agent_messages   (agency + project scoped)
```

---

## 2. Identity

### users

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| user_id | INTEGER UNIQUE | public numeric id (used in member APIs) |
| email | TEXT UNIQUE | lower-cased |
| name | TEXT | display name |
| created_at | INTEGER | epoch ms |

### otps

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | returned as `verification_id` |
| email | TEXT | lower-cased, must match on verify |
| code | TEXT | 4 digits |
| expires_at | INTEGER | now + 5 min |
| consumed | INTEGER | 0/1, set on successful verify |

Invariant: a code is usable once, for that email + verification id, before
expiry.

---

## 3. Tenancy

### agencies

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | workspace id |
| name | TEXT | |
| type | TEXT | `individual` or `org` |
| owner_user_id | TEXT | users.id |
| created_at | INTEGER | |

### memberships

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| agency_id | TEXT | agencies.id |
| user_id | TEXT | users.id |
| role | TEXT | `admin`/`editor`/`viewer` |
| created_at | INTEGER | |
| UNIQUE | (agency_id, user_id) | one role per pair |

### invites

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| agency_id | TEXT | |
| email | TEXT | invite is bound to this address |
| role | TEXT | role on accept |
| token | TEXT UNIQUE | 32 random bytes, base64url |
| expires_at | INTEGER | 7 days |
| accepted_at | INTEGER | nullable |

### wallets

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| agency_id | TEXT UNIQUE | one wallet per agency |
| balance | REAL | spendable credits, 6 dp |
| held | REAL | sum of pending holds |

Invariant: `balance` should be ≥ 0 in a fixed build; the live product can go
negative (OBS-002).

### ledger

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| agency_id | TEXT | |
| type | TEXT | `topup`/`generation`/`adjustment` |
| gen_type | TEXT | `asset_prompt`, `storyboard_image`, `workbench_video_generation`, `universal_text`, `asset-extraction`, `script_analysis`, … |
| status | TEXT | `pending`/`completed`/`failed` |
| credits_held | REAL | reserved at hold time |
| credits_delta | REAL | signed amount applied at settle/top-up |
| reason | TEXT | |
| actor_user_id | INTEGER | users.user_id |
| meta | TEXT | JSON (`items`, `unit`) |
| created_at | INTEGER | |

Invariants: append-only; a `pending` row settles once; `sum(pending.credits_held)
= wallets.held`; `credits_delta` records the actual charge (negative for
generation).

---

## 4. Projects and scripts

### projects

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| agency_id | TEXT | scoping root |
| user_id | TEXT | creator |
| name | TEXT | |
| project_type | TEXT | `video` |
| image_model | TEXT | registry value |
| video_model | TEXT | registry value |
| image_quality | TEXT | `1K`/`2K`/`4K` |
| video_ratio | TEXT | `9:16`/`16:9`/`1:1` |
| art_style | TEXT | style id |
| director_manual | TEXT | style id |
| status | TEXT | `active`/`deleted` (soft delete sets `deletedAt` on the live API) |
| created_at | INTEGER | |

### scripts

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| name | TEXT | episode title |
| content | TEXT | script text |
| episode_number | INTEGER | 1-based |
| version | INTEGER | |
| type | TEXT | `v1` |
| status | TEXT | `ready` |
| extract_state | INTEGER | 0 not extracted, 1 extracted, -1 cancelled |
| created_at | INTEGER | |

---

## 5. Assets and images

### assets

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| script_id | TEXT | nullable |
| name | TEXT | |
| type | TEXT | `role`/`scene`/`tool`/`storyboard` |
| describe | TEXT | |
| prompt | TEXT | generated prompt |
| prompt_state | TEXT | `completed`/null |
| state | TEXT | `ready`/`completed` |
| image_path | TEXT | public URL (CDN or `/media`) |
| model | TEXT | model value |
| resolution | TEXT | `1K`/`2K`/`4K` |
| look_locked | INTEGER | |
| created_at | INTEGER | |

### asset_images

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| asset_id | TEXT | |
| path | TEXT | public URL |
| model | TEXT | |
| created_at | INTEGER | |

History is newest-first; the primary look is `assets.image_path`.

---

## 6. Directing

### plans

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| script_id | TEXT | |
| content | TEXT | JSON: `{ lens, pacing, scenes:[{id,heading,shots:[{shot,framing,move}]}] }` |
| status | TEXT | `ready` |
| created_at | INTEGER | |

### storyboards

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| script_id | TEXT | |
| shot_number | INTEGER | |
| scene | TEXT | |
| prompt | TEXT | image prompt |
| image_path | TEXT | public URL |
| video_prompt | TEXT | camera/motion prompt |
| status | TEXT | `image_ready` |
| created_at | INTEGER | |

---

## 7. Timeline

### tracks

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| script_id | TEXT | nullable |
| name | TEXT | |
| kind | TEXT | `video`/`audio`/`text`/`overlay` |
| position | INTEGER | order |
| created_at | INTEGER | |

### clips

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| track_id | TEXT | |
| storyboard_id | TEXT | nullable |
| media_path | TEXT | public URL |
| start_ms | INTEGER | timeline start |
| duration_ms | INTEGER | |
| trim_in_ms | INTEGER | |
| trim_out_ms | INTEGER | nullable |
| position | INTEGER | |
| status | TEXT | `ready` |
| prompt | TEXT | |
| created_at | INTEGER | |

### bgm

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| script_id | TEXT | |
| name | TEXT | |
| path | TEXT | |
| created_at | INTEGER | |

### videos

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT | |
| script_id | TEXT | |
| clip_id | TEXT | nullable |
| path | TEXT | public URL |
| status | TEXT | `ready` |
| provider_job_id | TEXT | nullable |
| created_at | INTEGER | |

---

## 8. Billing

### orders

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | internal order id |
| agency_id | TEXT | |
| user_id | TEXT | |
| plan_id | INTEGER | 1/2/3 |
| amount_paise | INTEGER | server-side |
| credits | INTEGER | server-side |
| currency | TEXT | `INR` |
| gateway_order_id | TEXT UNIQUE | Razorpay order id |
| status | TEXT | `pending`/`paid`/`failed` |
| payment_id | TEXT | nullable |
| created_at | INTEGER | |

Invariants: amount/credits come from the plan, never the client; verify is
owner-scoped; the webhook is HMAC-checked and idempotent.

---

## 9. Async and chat

### jobs

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| kind | TEXT | `settle` |
| payload | TEXT | JSON |
| status | TEXT | `queued`/`running`/`done`/`error` |
| attempts | INTEGER | |
| run_at | INTEGER | due time |
| locked_at | INTEGER | nullable |
| result | TEXT | |
| error | TEXT | |
| created_at | INTEGER | |

### agent_messages

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| agency_id | TEXT | |
| project_id | TEXT | |
| user_id | TEXT | nullable for assistant |
| role | TEXT | `user`/`assistant` |
| content | TEXT | |
| created_at | INTEGER | |

---

## 10. Scoping rules

- Every project query: `projects.id = ? AND projects.agency_id = ?`.
- Every child query: join through `projects` and filter `agency_id`.
- Orders and ledger: filter by `agency_id` and (for orders) the owner user.
- `x-agency-id` is resolved against `memberships` before any query.
- A missing row and a foreign row both return 404.

## 11. Deletion

- Projects: soft delete (`status='deleted'`, live `deletedAt`); child rows stay
  for audit.
- Members: remove the membership; their personal wallet is untouched.
- Invites: revoke sets/removes the token; accepted invites stay for audit.
- Test orgs: deleting the agency should remove memberships, invites, projects,
  ledger and wallet in one transaction.

## 12. Indexes to add in a rebuild

```sql
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_projects_agency ON projects(agency_id, created_at);
CREATE INDEX idx_scripts_project ON scripts(project_id, episode_number);
CREATE INDEX idx_assets_project ON assets(project_id);
CREATE INDEX idx_storyboards_project ON storyboards(project_id, shot_number);
CREATE INDEX idx_tracks_project ON tracks(project_id);
CREATE INDEX idx_clips_track ON clips(track_id, position);
CREATE INDEX idx_ledger_agency ON ledger(agency_id, created_at);
CREATE INDEX idx_orders_agency ON orders(agency_id, created_at);
CREATE INDEX idx_agent_messages_project ON agent_messages(project_id, created_at);
```
