import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../db/prisma";
import { register, login } from "./auth.service";
import { hashSessionToken } from "../auth/session";

function expectRecord<T>(record: T | null, message: string): T {
  expect(record, message).not.toBeNull();
  if (!record) throw new Error(message);
  return record;
}

beforeEach(async () => {
  // Clean up the DB between tests
  await prisma.session.deleteMany();
  await prisma.friendGroupMember.deleteMany();
  await prisma.friendGroup.deleteMany();
  await prisma.userFriend.deleteMany();
  await prisma.familyFriend.deleteMany();
  await prisma.familyJoinRequest.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.transactionCategory.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
});

describe("auth.service", () => {
  it("register creates user + family + familyMember + session", async () => {
    const beforeRegister = new Date();

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
    expect(users[0].lastLogin).toBeInstanceOf(Date);
    expect(users[0].lastLogin!.getTime()).toBeGreaterThanOrEqual(
      beforeRegister.getTime(),
    );
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
    const session = expectRecord(
      sessionRow,
      "Expected login to create an active session",
    );

    expect(session.revokedAt).toBeNull();
  });

  it("login updates lastLogin after registration", async () => {
    await register({
      email: "sam@example.com",
      username: "sungjinwong",
      password: "password123",
    });

    const beforeLogin = expectRecord(
      await prisma.user.findUnique({
        where: { email: "sam@example.com" },
      }),
      "Expected registered user before login",
    );

    expect(beforeLogin.lastLogin).toBeInstanceOf(Date);

    await login({
      email: "sam@example.com",
      password: "password123",
    });

    const afterLogin = expectRecord(
      await prisma.user.findUnique({
        where: { email: "sam@example.com" },
      }),
      "Expected registered user after login",
    );

    expect(afterLogin.lastLogin).toBeInstanceOf(Date);
    expect(afterLogin.lastLogin!.getTime()).toBeGreaterThanOrEqual(
      beforeLogin.lastLogin!.getTime(),
    );
  });

  it("login rejects inactive users", async () => {
    await register({
      email: "sam@example.com",
      username: "sungjinwong",
      password: "password123",
    });

    await prisma.user.update({
      where: { email: "sam@example.com" },
      data: { isActive: false },
    });

    await expect(
      login({
        email: "sam@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("login rejects soft-deleted users", async () => {
    await register({
      email: "sam@example.com",
      username: "sungjinwong",
      password: "password123",
    });

    await prisma.user.update({
      where: { email: "sam@example.com" },
      data: { deletedAt: new Date() },
    });

    await expect(
      login({
        email: "sam@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
