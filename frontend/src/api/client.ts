import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API_BASE = `${BASE}/api`;
const TOKEN_KEY = "trace_session_token";

export async function getToken(): Promise<string | null> {
  const v = await storage.secureGet<string>(TOKEN_KEY, "");
  return v && typeof v === "string" && v.length > 0 ? v : null;
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Opts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: any;
  auth?: boolean;
};

async function authHeaders(auth: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (auth) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  return headers;
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new ApiError(res.status, text || res.statusText);
}

export async function apiFetch<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers = await authHeaders(opts.auth !== false);
  headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  await throwIfNotOk(res);
  if (res.status === 204) return undefined as any;
  return (await res.json()) as T;
}

// Multipart upload — used for the debug-photo endpoint. Content-Type is left
// unset so fetch sets the multipart boundary itself.
export async function apiFetchForm<T = any>(path: string, form: FormData): Promise<T> {
  const headers = await authHeaders(true);
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: form as any });
  await throwIfNotOk(res);
  return (await res.json()) as T;
}
