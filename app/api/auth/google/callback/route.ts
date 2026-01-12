import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { SESSION_COOKIE_NAME } from "@/src/server/auth/constants";
import {
  generateSessionToken,
  hashSessionToken,
  getSessionExpiryDate,
} from "@/src/server/auth/session";

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
};

type GoogleUserInfo = {
  sub: string; // providerAccountId (stable)
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // Validate CSRF state
  const cookieState = (req.headers.get("cookie") ?? "").match(
    /oauth_state=([^;]+)/,
  )?.[1];
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  // Exchange authorization code for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.json(
      { error: "Token exchange failed", detail: text },
      { status: 400 },
    );
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse;

  // Get user identity from OIDC UserInfo endpoint
  const userInfoRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    },
  );

  if (!userInfoRes.ok) {
    const text = await userInfoRes.text();
    return NextResponse.json(
      { error: "Failed to fetch userinfo", detail: text },
      { status: 400 },
    );
  }

  const info = (await userInfoRes.json()) as GoogleUserInfo;

  if (!info.sub) {
    return NextResponse.json(
      { error: "Google userinfo missing sub" },
      { status: 400 },
    );
  }
  if (!info.email) {
    return NextResponse.json(
      { error: "Google account has no email" },
      { status: 400 },
    );
  }
  const providerAccountId = info.sub;
  const email = info.email;
  const displayName = info.name ?? email.split("@")[0];

  // Create/link user + OAuthAccount, then issue your session
  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = getSessionExpiryDate();

  const user = await prisma.$transaction(async (tx) => {
    // 1) If OAuthAccount exists, use its user
    const existingOAuth = await tx.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "GOOGLE",
          providerAccountId: info.sub,
        },
      },
      include: { user: true },
    });

    if (existingOAuth?.user) {
      // Create app session for existing user
      await tx.session.create({
        data: { userId: existingOAuth.user.id, tokenHash, expiresAt },
      });
      return existingOAuth.user;
    }

    // 2) Otherwise, try to find user by email
    let dbUser = await tx.user.findUnique({ where: { email: info.email } });

    // 3) If user doesn't exist, create one (username can be derived)
    if (!dbUser) {
      dbUser = await tx.user.create({
        data: {
          email,
          username: info.name ?? displayName,
          passwordHash: "OAUTH", // placeholder since you're not using password for this user
          // role defaults to USER in your schema
        },
      });

      // Optional: create family+membership here like your register() does,
      // or keep it separate and create family on first app use.
      const family = await tx.family.create({
        data: { name: `${dbUser.username}'s Family`, createdBy: dbUser.id },
      });

      await tx.familyMember.create({
        data: { userId: dbUser.id, familyId: family.id, memberRole: "OWNER" },
      });
    }

    // 4) Create OAuthAccount link
    await tx.oAuthAccount.create({
      data: {
        userId: dbUser.id,
        provider: "GOOGLE",
        providerAccountId: info.sub,
        email,
      },
    });

    // 5) Create your session
    await tx.session.create({
      data: { userId: dbUser.id, tokenHash, expiresAt },
    });

    return dbUser;
  });

  // Redirect to app and set your normal session cookie
  const res = NextResponse.redirect(new URL("/", process.env.APP_URL!));

  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });

  // Clear oauth_state
  res.cookies.set({
    name: "oauth_state",
    value: "",
    path: "/",
    maxAge: 0,
  });

  return res;
}
