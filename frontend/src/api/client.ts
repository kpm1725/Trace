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

type Opts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  auth?: boolean;
};

/**
 * A non-2xx response from the API.
 *
 * Keeps the status and the parsed body rather than baking them into a message
 * string, so `err.status === 402` is the check a paywall makes and `err.detail`
 * carries the credit numbers it renders.
 */
export class ApiError extends Error {
  status: number;
  detail: any;

  constructor(status: number, detail: any, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  /** True when the call was rejected for want of credits, not for any other reason. */
  get isPaywall(): boolean {
    return this.status === 402;
  }
}

export async function apiFetch<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail: any = null;
    try {
      detail = text ? JSON.parse(text).detail ?? JSON.parse(text) : null;
    } catch {
      // Not JSON — a proxy error page or an empty body. `detail` stays null and
      // the message below falls back to the status.
    }
    const message =
      typeof detail === "string" ? detail
      : detail?.message ? detail.message
      : `API ${res.status}: ${res.statusText}`;
    throw new ApiError(res.status, detail, message);
  }

  if (res.status === 204) return undefined as any;
  return (await res.json()) as T;
}
