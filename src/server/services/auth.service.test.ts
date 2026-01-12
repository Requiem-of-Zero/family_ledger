import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db/prisma";
import { register, login, HttpError } from "./auth.service";
import { hashSessionToken } from "../auth/session";

beforeEach(async () => {
  // Clean up the DB between tests
  await prisma.session.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

describe("auth.service", () => {
  it("register creates user + family + familyMember + session", async () => {
    const result = await register({
      email: "sam@example.com",
      username: "sungjinwong",
      password: "password123",
      familyName: "Wong House",
    });

    expect(result.user.email).toBe("sam@example.com");
    expect(result.sessionToken.length).toBeGreaterThan(10);

    const users = await prisma.user.findMany();
    const families = await prisma.family.findMany();
    const members = await prisma.familyMember.findMany();
    const sessions = await prisma.session.findMany();

    expect(users).toHaveLength(1);
    expect(families).toHaveLength(1);
    expect(members).toHaveLength(1);
    expect(sessions).toHaveLength(1);

    expect(members[0].memberRole).toBe("OWNER");
  });

  it("register rejects duplicate email", async () => {
    await register({
      email: "sam@example.com",
      username: "sungjinwong",
      password: "password123",
    });

    await expect(
      register({
        email: "sam@example.com",
        username: "sungjinwong2",
        password: "password123",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("login rejects unknown email", async () => {
    await expect(
      login({
        email: "sam@unknown.com",
        password: "whatever",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("login works with correct password and creates a session", async () => {
    await register({
      email: "sam@example.com",
      username: "sungjinwong",
      password: "password123",
    });

    const loginRes = await login({
      email: "sam@example.com",
      password: "password123",
    });

    expect(loginRes.user.email).toBe("sam@example.com");
    expect(loginRes.sessionToken).toBeTypeOf("string");
    expect(loginRes.sessionToken.length).toBeGreaterThan(10);

    const tokenHash = hashSessionToken(loginRes.sessionToken);
    const sessionRow = await prisma.session.findFirst({
      where: { tokenHash, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    expect(sessionRow).not.toBeNull();
    expect(sessionRow?.revokedAt).toBeNull;
  });
});
