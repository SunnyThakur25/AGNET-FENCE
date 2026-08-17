import type { RequestHandler } from "express";

export const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
} as const;

export function isHttpsAtEdge(protocol: string, forwardedProto: string | string[] | undefined) {
  if (protocol === "https") return true;
  const values = Array.isArray(forwardedProto) ? forwardedProto : typeof forwardedProto === "string" ? forwardedProto.split(",") : [];
  return values.some(value => value.trim().toLowerCase() === "https");
}

export const httpSecurityMiddleware: RequestHandler = (req, res, next) => {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) res.setHeader(name, value);
  if (isHttpsAtEdge(req.protocol, req.headers["x-forwarded-proto"])) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
};
