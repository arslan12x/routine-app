export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error?.message ?? "Request failed");
  return j.data as T;
}
