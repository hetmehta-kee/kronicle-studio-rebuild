import { all, now, one, run, uuid } from "./db.js";

type Handler = (payload: any) => Promise<void> | void;
const handlers = new Map<string, Handler>();

export function registerJob(kind: string, handler: Handler) {
  handlers.set(kind, handler);
}

export function enqueueJob(kind: string, payload: unknown, delayMs = 0) {
  const id = uuid();
  run(
    "INSERT INTO jobs (id, kind, payload, status, run_at, attempts, created_at) VALUES (?, ?, ?, 'queued', ?, 0, ?)",
    id, kind, JSON.stringify(payload), now() + Math.max(0, delayMs), now(),
  );
  return id;
}

export function startJobWorker() {
  setInterval(async () => {
    const job = one<any>(
      "SELECT * FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY run_at ASC LIMIT 1",
      now(),
    );
    if (!job) return;
    const claimed = run(
      "UPDATE jobs SET status = 'running', locked_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'",
      now(), job.id,
    );
    if (!claimed.changes) return;
    try {
      const handler = handlers.get(job.kind);
      if (!handler) throw new Error(`no handler for ${job.kind}`);
      await handler(JSON.parse(job.payload));
      run("UPDATE jobs SET status = 'done', result = 'ok' WHERE id = ?", job.id);
    } catch (err: any) {
      const attempts = Number(job.attempts ?? 0) + 1;
      const retry = attempts < 3;
      run(
        "UPDATE jobs SET status = ?, error = ?, run_at = ? WHERE id = ?",
        retry ? "queued" : "error",
        String(err?.message ?? err).slice(0, 500),
        now() + Math.min(30_000, 2 ** attempts * 1000),
        job.id,
      );
    }
  }, 1000).unref?.();
}

export function recentJobs(limit = 20) {
  return all("SELECT id, kind, status, attempts, error, created_at AS createdAt FROM jobs ORDER BY created_at DESC LIMIT ?", limit);
}
