export class ApiRequestError extends Error {
  status: number;
  code?: string;
  fields?: unknown;

  constructor(message: string, status: number, code?: string, fields?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(j?.error?.message ?? "Request failed", res.status, j?.error?.code, j?.error?.fields);
  }
  return j.data as T;
}
