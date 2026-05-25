import { beforeEach, describe, expect, it } from "vitest";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { GET as friendsGET, POST as friendsPOST } from "@/app/api/friends/route";
import { POST as acceptFriendPOST } from "@/app/api/friends/[id]/accept/route";
import { POST as rejectFriendPOST } from "@/app/api/friends/[id]/reject/route";
import { POST as cancelFriendPOST } from "@/app/api/friends/[id]/cancel/route";
import { DELETE as deleteFriendDELETE } from "@/app/api/friends/[id]/route";
import {
  GET as familiesGET,
  POST as familiesPOST,
} from "@/app/api/families/route";
import { POST as familyMembersPOST } from "@/app/api/families/[id]/members/route";
import {
  GET as familyFriendsGET,
  POST as familyFriendsPOST,
} from "@/app/api/family-friends/route";
import { POST as acceptFamilyFriendPOST } from "@/app/api/family-friends/[id]/accept/route";
import { POST as rejectFamilyFriendPOST } from "@/app/api/family-friends/[id]/reject/route";
import { GET as transactionsGET, POST as transactionsPOST } from "@/app/api/transactions/route";
import { SESSION_COOKIE_NAME } from "../auth/constants";
import { prisma } from "../db/prisma";

function getSetCookie(res: Response): string {
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("Expected set-cookie header but got none");
  return cookie;
}

function extractCookieValue(setCookie: string, cookieName: string): string {
  const match = setCookie.match(new RegExp(`(?:^|;)\\s*${cookieName}=([^;]+)`));
  if (!match) throw new Error(`Could not find cookie "${cookieName}"`);
  return match[1];
}

function authedHeaders(sessionToken: string, extra?: HeadersInit) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
    ...(extra ?? {}),
  };
}

// Registers through the real auth route so these tests exercise session cookies
// the same way browser requests do.
async function registerUser(email: string, username: string) {
  const res = await registerPOST(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        username,
        password: "password123",
      }),
    }),
  );

  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `Register failed with status ${res.status}: ${JSON.stringify(body)}`,
    );
  }

  const sessionToken = extractCookieValue(
    getSetCookie(res),
    SESSION_COOKIE_NAME,
  );

  return { user: body.user, sessionToken };
}

beforeEach(async () => {
  // Clear newest relationship tables first, then parents. This keeps foreign
  // keys happy as new family/friend models are added.
  await prisma.session.deleteMany();
  await prisma.friendGroupMember.deleteMany();
  await prisma.friendGroup.deleteMany();
  await prisma.userFriend.deleteMany();
  await prisma.familyFriend.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.transactionCategory.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.oAuthAccount.deleteMany();
  await prisma.user.deleteMany();
});

describe("friends routes", () => {
  it("creates, lists, accepts, and removes friend relationships", async () => {
    // Happy path for the user-friend lifecycle:
    // sender creates -> recipient lists -> recipient accepts -> either side removes.
    const sam = await registerUser("sam@example.com", "sammy");
    const alex = await registerUser("alex@example.com", "alexx");

    const createRes = await friendsPOST(
      new Request("http://localhost/api/friends", {
        method: "POST",
        headers: authedHeaders(sam.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ addresseeEmail: alex.user.email }),
      }),
    );

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.friendRequest.status).toBe("PENDING");

    const listRes = await friendsGET(
      new Request("http://localhost/api/friends", {
        method: "GET",
        headers: authedHeaders(alex.sessionToken),
      }),
    );

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.friends[0].direction).toBe("RECEIVED");

    const acceptRes = await acceptFriendPOST(
      new Request(
        `http://localhost/api/friends/${created.friendRequest.id}/accept`,
        {
          method: "POST",
          headers: authedHeaders(alex.sessionToken),
        },
      ),
      { params: Promise.resolve({ id: String(created.friendRequest.id) }) },
    );

    expect(acceptRes.status).toBe(200);
    const accepted = await acceptRes.json();
    expect(accepted.friendRequest.status).toBe("ACCEPTED");
    expect(accepted.friendRequest.acceptedAt).toBeTruthy();

    const deleteRes = await deleteFriendDELETE(
      new Request(`http://localhost/api/friends/${created.friendRequest.id}`, {
        method: "DELETE",
        headers: authedHeaders(sam.sessionToken),
      }),
      { params: Promise.resolve({ id: String(created.friendRequest.id) }) },
    );

    expect(deleteRes.status).toBe(200);
    await expect(
      prisma.userFriend.findUniqueOrThrow({
        where: { id: created.friendRequest.id },
      }),
    ).rejects.toThrow();
  });

  it("rejects received requests and cancels sent requests", async () => {
    // Reject and cancel are intentionally separate operations because the
    // authorization rule depends on whether the user received or sent the row.
    const sam = await registerUser("sam@example.com", "sammy");
    const alex = await registerUser("alex@example.com", "alexx");
    const morgan = await registerUser("morgan@example.com", "morgan");

    const rejectTarget = await prisma.userFriend.create({
      data: {
        requesterId: alex.user.id,
        addresseeId: sam.user.id,
        status: "PENDING",
      },
    });

    const rejectRes = await rejectFriendPOST(
      new Request(`http://localhost/api/friends/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: authedHeaders(sam.sessionToken),
      }),
      { params: Promise.resolve({ id: String(rejectTarget.id) }) },
    );

    expect(rejectRes.status).toBe(200);

    const cancelTarget = await prisma.userFriend.create({
      data: {
        requesterId: sam.user.id,
        addresseeId: morgan.user.id,
        status: "PENDING",
      },
    });

    const cancelRes = await cancelFriendPOST(
      new Request(`http://localhost/api/friends/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: authedHeaders(sam.sessionToken),
      }),
      { params: Promise.resolve({ id: String(cancelTarget.id) }) },
    );

    expect(cancelRes.status).toBe(200);
    expect(await prisma.userFriend.count()).toBe(0);
  });
});

describe("families and shared ledger routes", () => {
  it("creates families, adds members, and shows shared family transactions", async () => {
    // This protects the shared ledger behavior: a family transaction created by
    // one member should be visible to another active member of that family.
    const owner = await registerUser("owner@example.com", "owner");
    const member = await registerUser("member@example.com", "member");

    const createFamilyRes = await familiesPOST(
      new Request("http://localhost/api/families", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ name: "Shared House" }),
      }),
    );

    expect(createFamilyRes.status).toBe(201);
    const createFamilyBody = await createFamilyRes.json();
    const familyId = createFamilyBody.family.id;

    const addMemberRes = await familyMembersPOST(
      new Request(`http://localhost/api/families/${familyId}/members`, {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ email: member.user.email }),
      }),
      { params: Promise.resolve({ id: String(familyId) }) },
    );

    expect(addMemberRes.status).toBe(201);

    const createTransactionRes = await transactionsPOST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          familyId,
          type: "EXPENSE",
          amountCents: 1234,
          occurredAt: "2026-02-01T12:00:00.000Z",
          merchant: "Shared Market",
        }),
      }),
    );

    expect(createTransactionRes.status).toBe(201);

    const listForMemberRes = await transactionsGET(
      new Request(`http://localhost/api/transactions?familyId=${familyId}`, {
        method: "GET",
        headers: authedHeaders(member.sessionToken),
      }),
    );

    expect(listForMemberRes.status).toBe(200);
    const listForMemberBody = await listForMemberRes.json();
    expect(listForMemberBody.transactions).toHaveLength(1);
    expect(listForMemberBody.transactions[0].merchant).toBe("Shared Market");

    const familiesRes = await familiesGET(
      new Request("http://localhost/api/families", {
        method: "GET",
        headers: authedHeaders(member.sessionToken),
      }),
    );

    const familiesBody = await familiesRes.json();
    expect(familiesBody.families.some((family: { id: number }) => family.id === familyId)).toBe(true);
  });

  it("creates, lists, accepts, and rejects family friend requests", async () => {
    // Family-friend requests are owner-mediated on both sides. This test covers
    // request creation by one owner and accept/reject by receiving owners.
    const owner = await registerUser("owner@example.com", "owner");
    const otherOwner = await registerUser("other@example.com", "other");
    const thirdOwner = await registerUser("third@example.com", "third");

    const ownerFamily = await prisma.family.findFirstOrThrow({
      where: { createdBy: owner.user.id },
    });
    const otherFamily = await prisma.family.findFirstOrThrow({
      where: { createdBy: otherOwner.user.id },
    });
    const thirdFamily = await prisma.family.findFirstOrThrow({
      where: { createdBy: thirdOwner.user.id },
    });

    const createRes = await familyFriendsPOST(
      new Request("http://localhost/api/family-friends", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          requesterFamilyId: ownerFamily.id,
          addresseeFamilyId: otherFamily.id,
        }),
      }),
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();

    const acceptRes = await acceptFamilyFriendPOST(
      new Request(
        `http://localhost/api/family-friends/${createBody.familyFriend.id}/accept`,
        {
          method: "POST",
          headers: authedHeaders(otherOwner.sessionToken),
        },
      ),
      { params: Promise.resolve({ id: String(createBody.familyFriend.id) }) },
    );

    expect(acceptRes.status).toBe(200);

    const listRes = await familyFriendsGET(
      new Request("http://localhost/api/family-friends", {
        method: "GET",
        headers: authedHeaders(owner.sessionToken),
      }),
    );
    const listBody = await listRes.json();
    expect(listBody.familyFriends).toHaveLength(1);
    expect(listBody.familyFriends[0].status).toBe("ACCEPTED");

    const pending = await prisma.familyFriend.create({
      data: {
        requesterFamilyId: thirdFamily.id,
        addresseeFamilyId: ownerFamily.id,
        status: "PENDING",
      },
    });

    const rejectRes = await rejectFamilyFriendPOST(
      new Request(`http://localhost/api/family-friends/${pending.id}/reject`, {
        method: "POST",
        headers: authedHeaders(owner.sessionToken),
      }),
      { params: Promise.resolve({ id: String(pending.id) }) },
    );

    expect(rejectRes.status).toBe(200);
  });
});
