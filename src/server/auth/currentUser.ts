import { prisma } from "../db/prisma";
import { hashSessionToken } from "./session";
import { SESSION_COOKIE_NAME } from "./constants";

// Returns user if session is valid, otherwise returns null
export async function getCurrentUserFromRequest(req: Request) {
  const rawSessionToken = getRawSessionTokenFromRequest(req);

  if (!rawSessionToken) return null;

  const tokenHash = hashSessionToken(rawSessionToken);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if(!session) return null;
  if(session.revokedAt) return null;
  if(session.expiresAt <= new Date()) return null;

  return session.user
}

// Used by logout to identify which exact session to revoke
export function getRawSessionTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}
