import { describe, expect, it } from "vitest";
import { BASE_SECURITY_HEADERS, httpSecurityMiddleware, isHttpsAtEdge } from "./httpSecurity";

describe("HTTP security middleware", () => {
  it("recognizes direct and proxy-terminated HTTPS without trusting unrelated values", () => {
    expect(isHttpsAtEdge("https", undefined)).toBe(true);
    expect(isHttpsAtEdge("http", "http, https")).toBe(true);
    expect(isHttpsAtEdge("http", "http")).toBe(false);
  });

  it("sets baseline security headers and HSTS only for HTTPS traffic", () => {
    const headers = new Map<string, string>();
    let nextCalls = 0;
    httpSecurityMiddleware(
      { protocol: "http", headers: { "x-forwarded-proto": "https" } } as any,
      { setHeader: (name: string, value: string) => headers.set(name, value) } as any,
      () => { nextCalls += 1; },
    );
    expect(Object.fromEntries(headers)).toMatchObject(BASE_SECURITY_HEADERS);
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(nextCalls).toBe(1);
  });
});
