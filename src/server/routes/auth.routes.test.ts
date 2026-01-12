import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db/prisma";

// Import the Next route handlers we *will* implement next.
// (These imports will fail until the files exist — that’s normal in TDD.)
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as meGET } from "@/app/api/auth/me/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "../auth/constants";
import { generateSessionToken, hashSessionToken } from "../auth/session";

function getSetCookie(res: Response): string {
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("Expected set-cookie header but got none");
  return cookie;
}

function extractCookieValue(setCookie: string, cookieName: string): string {
  const match = setCookie.match(new RegExp(`(?:^|;)\\s*${cookieName}=([^;]+)`));
  if (!match)
    throw new Error(
      `Could not find cookie "${cookieName}" in Set-Cookie: ${setCookie}`,
    );
  return match[1];
}

beforeEach(async () => {
  // Clean DB between tests (order matters because foreign keys)
  await prisma.session.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

describe("auth routes", () => {
  it("POST /api/auth/register returns user and sets session cookie", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      // Test /api/auth/register post request with email, username, and password payloads
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        username: "testuser",
        password: "password123",
      }),
    });

    const res = await registerPOST(req);

    expect(res.status).toBe(201);

    const body = await res.json();

    expect(body.user.email).toBe("test@example.com");
    expect(body.user.username).toBe("testuser");

    const setCookie = getSetCookie(res);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("POST /api/auth/login returns user and sets a new session cookie", async () => {
    const regReq = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        username: "testuser",
        password: "password123",
      }),
    });

    await registerPOST(regReq);

    const req = new Request("http://localhost/api/auth/login", {
      // Test /api/auth/login post request with email and password payloads
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });

    const res = await loginPOST(req);

    expect(res.status).toBe(200);

    const body = await res.json();
    const userId = body.user.id;

    expect(body.user.email).toBe("test@example.com"); // Ensure user email is same as the request body
    expect(body.user.username).toBe("testuser"); // Ensure the username is the same as the request body

    const activeSession = await prisma.session.findFirst({
      // Find the first active session by filtering by revokedAt, expiration date greater than current date, ordering desc on the createdAt values
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    expect(activeSession).not.toBeNull();
    // Lookup session row by hashed token
    const loginCookie = extractCookieValue(
      getSetCookie(res),
      SESSION_COOKIE_NAME,
    );

    const tokenHash = hashSessionToken(loginCookie);

    const session = await prisma.session.findFirst({
      where: { tokenHash, revokedAt: null },
    });

    expect(session?.userId).toBe(body.user.id);
    expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("GET /api/auth/me returns current user when session cookie is present", async () => {
    // Register and capture cookie
    const regReq = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "me@example.com",
        username: "mememe",
        password: "password123",
      }),
    });

    const regRes = await registerPOST(regReq);
    const registerSetCookie = getSetCookie(regRes);
    const sessionToken = extractCookieValue(
      registerSetCookie,
      SESSION_COOKIE_NAME,
    );

    // Call /api/auth/me with the Cookie header and the session token obtained from register response
    const meReq = new Request("http://localhost/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      },
    });

    const meRes = await meGET(meReq);

    expect(meRes.status).toBe(200);

    const body = await meRes.json();

    expect(body.user.email).toBe("me@example.com");
  });

  it("POST /api/auth/logout revokes session and clears cookie", async () => {
    const regRes = await registerPOST(
      new Request("http://test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "logout@example.com",
          username: "logout",
          password: "password123",
        }),
      }),
    );

    const sessionToken = extractCookieValue(
      // Obtain session token from the cookies of the response
      getSetCookie(regRes),
      SESSION_COOKIE_NAME,
    );
    const tokenHash = hashSessionToken(sessionToken); // Obtain the token hash by using the same hashing algorithm for testing

    const before = await prisma.session.findFirst({ where: { tokenHash } }); // Ensure session exists and isn't revoked upon registration
    expect(before).not.toBeNull();
    expect(before!.revokedAt).toBeNull();

    // Logout using the same cookie
    const logoutReq = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      },
    });

    const logoutRes = await logoutPOST(logoutReq);
    expect(logoutRes.status).toBe(200);
    // Assert the cookie was cleared

    const setCookie = getSetCookie(logoutRes).toLowerCase();
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("max-age=0");
    
    // Assert the exact session row is now revoked
    const after = await prisma.session.findFirst({where: {tokenHash}});
    expect(after).not.toBeNull();
    expect(after!.revokedAt).not.toBeNull()
  });
});
