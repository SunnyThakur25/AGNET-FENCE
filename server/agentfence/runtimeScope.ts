export function deriveRuntimeCredentialScope(input: {
  referenceScopes: unknown;
  referenceTtlSeconds: number;
  requestedScopes?: string[];
  requestedTtlSeconds: number;
}) {
  const referenceScopes = Array.isArray(input.referenceScopes) ? input.referenceScopes.filter((scope): scope is string => typeof scope === "string") : [];
  const requestedScopes = input.requestedScopes ?? referenceScopes;
  if (!requestedScopes.length || requestedScopes.some(scope => !referenceScopes.includes(scope))) {
    throw new Error("runtime_scope_exceeds_reference");
  }
  if (input.requestedTtlSeconds > input.referenceTtlSeconds) {
    throw new Error("runtime_ttl_exceeds_reference");
  }
  return { scopes: requestedScopes, ttlSeconds: input.requestedTtlSeconds };
}
