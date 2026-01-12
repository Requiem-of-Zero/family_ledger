import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { hashSessionToken } from "@/src/server/auth/session";
import { SESSION_COOKIE_NAME } from "@/src/server/auth/constants";
import { getRawSessionTokenFromRequest } from "@/src/server/auth/currentUser";

export async function POST(req: Request) {
  const rawSessionToken = getRawSessionTokenFromRequest(req);

  if (rawSessionToken) {
    const tokenHash = hashSessionToken(rawSessionToken);

    // Revoke the session if it exists and not already revoked
    await prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const res = NextResponse.json({ok: true}, {status: 200});
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0
  })

  return res
}
