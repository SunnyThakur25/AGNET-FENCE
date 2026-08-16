export function isApprovalExpired(expiresAt: Date, now = Date.now()) {
  return expiresAt.getTime() < now;
}
