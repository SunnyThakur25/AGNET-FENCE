import { createHash } from "crypto";
import { jwtVerify, SignJWT } from "jose";

export type RuntimeClaims = {
  tokenId: string;
  organizationId: number;
  agentId: number;
  vaultCredentialId: number;
  allowedScopes: string[];
};

export type RuntimeCredentialRecord = {
  tokenId: string;
  organizationId: number;
  agentId: number;
  vaultCredentialId: number | null;
  allowedScopes: unknown;
  status: "active" | "revoked" | "expired";
  expiresAt: Date;
};

export function isRuntimeCredentialUsable(credential: RuntimeCredentialRecord, claims: RuntimeClaims, now = Date.now()) {
  const storedScopes = Array.isArray(credential.allowedScopes) && credential.allowedScopes.every(scope => typeof scope === "string") ? credential.allowedScopes : [];
  return credential.status === "active"
    && credential.expiresAt.getTime() >= now
    && credential.tokenId === claims.tokenId
    && credential.organizationId === claims.organizationId
    && credential.agentId === claims.agentId
    && credential.vaultCredentialId === claims.vaultCredentialId
    && storedScopes.length === claims.allowedScopes.length
    && storedScopes.every(scope => claims.allowedScopes.includes(scope));
}

export function isRuntimeNonceSafe(nonce: string) {
  return /^[a-zA-Z0-9._-]{16,96}$/.test(nonce);
}

export function scopeAllows(scopes: string[], toolName: string, action: string) {
  return scopes.includes("*") || scopes.includes(`${toolName}.*`) || scopes.includes(`${toolName}.${action}`);
}

function signingKey() {
  const root = process.env.JWT_SECRET;
  if (!root || root.length < 32) throw new Error("Runtime gateway signing is unavailable until the server JWT secret is configured.");
  return new TextEncoder().encode(createHash("sha256").update(`${root}:agentfence-runtime-gateway:v1`).digest("hex"));
}

export async function issueRuntimeToken(claims: RuntimeClaims, ttlSeconds: number) {
  return new SignJWT({ org: claims.organizationId, agent: claims.agentId, vaultCredentialId: claims.vaultCredentialId, scopes: claims.allowedScopes, runtime: "agentfence" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(claims.agentId))
    .setJti(claims.tokenId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(signingKey());
}

export async function verifyRuntimeToken(token: string): Promise<RuntimeClaims> {
  const verified = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
  const tokenId = verified.payload.jti;
  const organizationId = Number(verified.payload.org);
  const agentId = Number(verified.payload.agent);
  const vaultCredentialId = Number(verified.payload.vaultCredentialId);
  const allowedScopes = Array.isArray(verified.payload.scopes) && verified.payload.scopes.every(scope => typeof scope === "string") ? verified.payload.scopes as string[] : [];
  if (!tokenId || !Number.isInteger(organizationId) || !Number.isInteger(agentId) || !Number.isInteger(vaultCredentialId) || !allowedScopes.length || verified.payload.runtime !== "agentfence") {
    throw new Error("Invalid runtime gateway token claims.");
  }
  return { tokenId, organizationId, agentId, vaultCredentialId, allowedScopes };
}
