/**
 * `apiFetch` error shaping.
 *
 * The paywall branches on `err.status === 402` and renders `err.detail`, so a
 * regression that flattens the error into a message string breaks the purchase
 * prompt without breaking the typecheck.
 */
import { ApiError, apiFetch } from "@/src/api/client";

jest.mock("@/src/utils/storage", () => ({
  storage: {
    secureGet: jest.fn(async () => "trace_test_token"),
    secureSet: jest.fn(async () => true),
    secureRemove: jest.fn(async () => true),
  },
}));

function mockResponse(status: number, body: string) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => body,
    json: async () => JSON.parse(body),
  })) as unknown as typeof fetch;
}

afterEach(() => jest.restoreAllMocks());

it("returns the parsed body on success", async () => {
  mockResponse(200, JSON.stringify({ total_available: 5 }));
  await expect(apiFetch("/billing/entitlements")).resolves.toEqual({ total_available: 5 });
});

it("keeps the 402 detail intact so the paywall can read it", async () => {
  mockResponse(402, JSON.stringify({
    detail: { code: "insufficient_credits", message: "Not enough credits.", available: 1, needed: 2 },
  }));

  const err: ApiError = await apiFetch("/generate", { method: "POST" }).catch((e) => e);

  expect(err).toBeInstanceOf(ApiError);
  expect(err.isPaywall).toBe(true);
  expect(err.detail.available).toBe(1);
  expect(err.detail.needed).toBe(2);
  expect(err.message).toBe("Not enough credits.");
});

it("does not mistake other failures for a paywall", async () => {
  mockResponse(502, JSON.stringify({ detail: "LLM error: upstream timeout" }));
  const err: ApiError = await apiFetch("/debug", { method: "POST" }).catch((e) => e);
  expect(err.isPaywall).toBe(false);
  expect(err.status).toBe(502);
  expect(err.message).toBe("LLM error: upstream timeout");
});

it("survives a non-JSON error body", async () => {
  // A proxy error page, which is what a Railway cold start can return.
  mockResponse(503, "<html>Service Unavailable</html>");
  const err: ApiError = await apiFetch("/sessions").catch((e) => e);
  expect(err.status).toBe(503);
  expect(err.detail).toBeNull();
  expect(err.message).toContain("503");
});

it("sends the bearer token when authenticated", async () => {
  mockResponse(200, "{}");
  await apiFetch("/auth/me");
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(init.headers.Authorization).toBe("Bearer trace_test_token");
});

it("omits the token when auth is explicitly off", async () => {
  mockResponse(200, "{}");
  await apiFetch("/auth/google", { method: "POST", body: { id_token: "x" }, auth: false });
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(init.headers.Authorization).toBeUndefined();
});
