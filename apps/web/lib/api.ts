export type ApiError = { message: string; status: number };

export function activeAgency(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("agencyId") ?? "";
}

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const agency = activeAgency();
  if (agency) headers["x-agency-id"] = agency;
  const res = await fetch(path, {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text }; }
  if (!res.ok) {
    const err: ApiError = { message: json?.message ?? `Request failed (${res.status})`, status: res.status };
    throw err;
  }
  return json as T;
}

export const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(n);

export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);

export const timeAgo = (ms: number) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
