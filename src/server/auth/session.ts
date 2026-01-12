import crypto from "crypto";

export const SESSION_TIL_DAYS = 30; // How long a session is valid (ex: 30 days)

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex"); // 32 bytes -> 64 hex characters
}

export function hashSessionToken(token: string): string {
  // Hash the token before storing in DB
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getSessionExpiryDate(now: Date = new Date()): Date {
  const expires = new Date(now);
  expires.setDate(expires.getDate() + SESSION_TIL_DAYS);
  return expires;
}
