import { isRuntimeCredentialUsable, isRuntimeNonceSafe, type RuntimeClaims, type RuntimeCredentialRecord } from "./runtimeAuth";

export type RuntimeNonceReservation = (runtimeCredentialId: number, nonce: string, expiresAt: Date) => Promise<boolean>;

export async function authorizeRuntimeGatewayRequest(input: {
  runtimeCredentialId: number;
  credential: RuntimeCredentialRecord;
  claims: RuntimeClaims;
  nonce: string;
  reserveNonce: RuntimeNonceReservation;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  if (!isRuntimeCredentialUsable(input.credential, input.claims, now)) throw new Error("runtime_credential_inactive");
  if (!isRuntimeNonceSafe(input.nonce)) throw new Error("runtime_nonce_invalid");
  const reserved = await input.reserveNonce(input.runtimeCredentialId, input.nonce, new Date(now + 5 * 60 * 1000));
  if (!reserved) throw new Error("runtime_request_replay");
  return true;
}
