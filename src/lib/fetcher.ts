export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(j?.error?.message ?? "Request failed");
    error.name = "ApiRequestError";
    throw error;
  }
  return j.data as T;
}
