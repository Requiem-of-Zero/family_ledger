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
import {
  DELETE as familyDELETE,
  PATCH as familyPATCH,
} from "@/app/api/families/[id]/route";
import { POST as familyMembersPOST } from "@/app/api/families/[id]/members/route";
import {
  DELETE as familyMemberDELETE,
  PATCH as familyMemberPATCH,
} from "@/app/api/families/[id]/members/[memberId]/route";
import {
  GET as familyJoinRequestsGET,
  POST as familyJoinRequestsPOST,
} from "@/app/api/family-join-requests/route";
import { POST as acceptFamilyJoinRequestPOST } from "@/app/api/family-join-requests/[id]/accept/route";
import { POST as rejectFamilyJoinRequestPOST } from "@/app/api/family-join-requests/[id]/reject/route";
import { POST as cancelFamilyJoinRequestPOST } from "@/app/api/family-join-requests/[id]/cancel/route";
import {
  GET as familyFriendsGET,
  POST as familyFriendsPOST,
} from "@/app/api/family-friends/route";
import { DELETE as deleteFamilyFriendDELETE } from "@/app/api/family-friends/[id]/route";
import { POST as acceptFamilyFriendPOST } from "@/app/api/family-friends/[id]/accept/route";
import { POST as blockFamilyFriendPOST } from "@/app/api/family-friends/[id]/block/route";
import { POST as cancelFamilyFriendPOST } from "@/app/api/family-friends/[id]/cancel/route";
import { POST as rejectFamilyFriendPOST } from "@/app/api/family-friends/[id]/reject/route";
import { GET as transactionsGET, POST as transactionsPOST } from "@/app/api/transactions/route";
import {
  GET as sharingProfilesGET,
  POST as sharingProfilesPOST,
} from "@/app/api/sharing-profiles/route";
import {
  DELETE as sharingProfileDELETE,
  PATCH as sharingProfilePATCH,
} from "@/app/api/sharing-profiles/[id]/route";
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

function expectRecord<T>(record: T | null, message: string): T {
  expect(record, message).not.toBeNull();
  if (!record) throw new Error(message);
  return record;
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

// Test setup: start each route test from an empty social/family graph.
beforeEach(async () => {
  // Clear newest relationship tables first, then parents. This keeps foreign
  // keys happy as new family/friend models are added.
  await prisma.session.deleteMany();
  await prisma.friendGroupMember.deleteMany();
  await prisma.friendGroup.deleteMany();
  await prisma.userFriend.deleteMany();
  await prisma.familyFriend.deleteMany();
  await prisma.familyJoinRequest.deleteMany();
  await prisma.transactionShare.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.sharingProfileTarget.deleteMany();
  await prisma.sharingProfile.deleteMany();
  await prisma.transactionCategory.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.oAuthAccount.deleteMany();
  await prisma.user.deleteMany();
});

// User-friend API coverage: direct relationships between individual users.
describe("friends routes", () => {
  // Verifies the full happy path from request creation through accepted removal.
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
    const removedFriend = await prisma.userFriend.findUnique({
      where: { id: created.friendRequest.id },
    });
    expect(removedFriend).toBeNull();
  });

  // Verifies pending-request state transitions for both recipient and sender.
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

// Family API coverage: memberships, shared ledger access, family invites, and
// family-to-family social relationships.
describe("families and shared ledger routes", () => {
  // Verifies default registration families can share transactions with members.
  it("uses default families, adds members, and shows shared family transactions", async () => {
    // This protects the shared ledger behavior: a family transaction created by
    // one member should be visible to another active member of that family.
    const owner = await registerUser("owner@example.com", "owner");
    const member = await registerUser("member@example.com", "member");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );
    const familyId = family.id;

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

  // Verifies the single-active-owned-family rule and recreation after deletion.
  it("prevents multiple active owned families", async () => {
    // Registration creates the first owned family. A user can create another
    // only after their current owned family is soft-deleted.
    const owner = await registerUser("owner@example.com", "owner");

    const duplicateRes = await familiesPOST(
      new Request("http://localhost/api/families", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ name: "Second Household" }),
      }),
    );

    expect(duplicateRes.status).toBe(409);

    const existingFamily = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    const deleteRes = await familyDELETE(
      new Request(`http://localhost/api/families/${existingFamily.id}`, {
        method: "DELETE",
        headers: authedHeaders(owner.sessionToken),
      }),
      { params: Promise.resolve({ id: String(existingFamily.id) }) },
    );

    expect(deleteRes.status).toBe(200);

    const createRes = await familiesPOST(
      new Request("http://localhost/api/families", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ name: "New Household" }),
      }),
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.family.name).toBe("New Household");
  });

  // Verifies only family owners can change shared family profile settings.
  it("renames families for owners and rejects non-owner updates", async () => {
    // Family profile updates are intentionally owner-only because names are
    // shared across every member's profile and ledger views.
    const owner = await registerUser("owner@example.com", "owner");
    const member = await registerUser("member@example.com", "member");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: member.user.id,
        memberRole: "MEMBER",
      },
    });

    const forbiddenRes = await familyPATCH(
      new Request(`http://localhost/api/families/${family.id}`, {
        method: "PATCH",
        headers: authedHeaders(member.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ name: "Member Rename" }),
      }),
      { params: Promise.resolve({ id: String(family.id) }) },
    );

    expect(forbiddenRes.status).toBe(403);

    const renameRes = await familyPATCH(
      new Request(`http://localhost/api/families/${family.id}`, {
        method: "PATCH",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ name: "Renamed Household" }),
      }),
      { params: Promise.resolve({ id: String(family.id) }) },
    );

    expect(renameRes.status).toBe(200);
    const renameBody = await renameRes.json();
    expect(renameBody.family.name).toBe("Renamed Household");
  });

  // Verifies family deletion is soft and removes access from active lists.
  it("soft-deletes owned families and removes them from active lists", async () => {
    // Deleting a family keeps history rows intact, but deactivates memberships
    // so the family no longer appears in normal user-facing queries.
    const owner = await registerUser("owner@example.com", "owner");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    const deleteRes = await familyDELETE(
      new Request(`http://localhost/api/families/${family.id}`, {
        method: "DELETE",
        headers: authedHeaders(owner.sessionToken),
      }),
      { params: Promise.resolve({ id: String(family.id) }) },
    );

    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.family.deletedAt).toBeTruthy();

    const deletedFamily = expectRecord(
      await prisma.family.findUnique({ where: { id: family.id } }),
      "Expected soft-deleted family row to remain",
    );
    expect(deletedFamily.deletedAt).toBeTruthy();

    const activeMembershipCount = await prisma.familyMember.count({
      where: {
        familyId: family.id,
        isActive: true,
      },
    });
    expect(activeMembershipCount).toBe(0);

    const familiesRes = await familiesGET(
      new Request("http://localhost/api/families", {
        method: "GET",
        headers: authedHeaders(owner.sessionToken),
      }),
    );
    const familiesBody = await familiesRes.json();
    expect(familiesBody.families).toHaveLength(0);
  });

  // Verifies owner-mediated family-friend request creation, acceptance, and rejection.
  it("creates, lists, accepts, and rejects family friend requests", async () => {
    // Family-friend requests are owner-mediated on both sides. This test covers
    // request creation by one owner and accept/reject by receiving owners.
    const owner = await registerUser("owner@example.com", "owner");
    const otherOwner = await registerUser("other@example.com", "other");
    const thirdOwner = await registerUser("third@example.com", "third");

    const ownerFamily = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );
    const otherFamily = expectRecord(
      await prisma.family.findFirst({
        where: { createdBy: otherOwner.user.id },
      }),
      "Expected other owner registration to create a family",
    );
    const thirdFamily = expectRecord(
      await prisma.family.findFirst({
        where: { createdBy: thirdOwner.user.id },
      }),
      "Expected third owner registration to create a family",
    );

    const createRes = await familyFriendsPOST(
      new Request("http://localhost/api/family-friends", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          requesterFamilyId: ownerFamily.id,
          addresseeIdentifier: otherOwner.user.email,
        }),
      }),
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.familyFriend.addresseeFamilyId).toBe(otherFamily.id);

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

  // Verifies co-owners can manage family-friend requests without full ownership.
  it("allows co-owners to send, accept, and reject family friend requests", async () => {
    // Co-owners are allowed to manage family-to-family social requests without
    // granting them destructive owner-only powers like deleting the family.
    const owner = await registerUser("owner@example.com", "owner");
    const coOwner = await registerUser("coowner@example.com", "coowner");
    const otherOwner = await registerUser("other@example.com", "other");
    const otherCoOwner = await registerUser("otherco@example.com", "otherco");
    const thirdOwner = await registerUser("third@example.com", "third");

    const ownerFamily = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );
    const otherFamily = expectRecord(
      await prisma.family.findFirst({
        where: { createdBy: otherOwner.user.id },
      }),
      "Expected other owner registration to create a family",
    );
    const thirdFamily = expectRecord(
      await prisma.family.findFirst({
        where: { createdBy: thirdOwner.user.id },
      }),
      "Expected third owner registration to create a family",
    );

    await prisma.familyMember.create({
      data: {
        familyId: ownerFamily.id,
        userId: coOwner.user.id,
        memberRole: "CO_OWNER",
      },
    });
    await prisma.familyMember.create({
      data: {
        familyId: otherFamily.id,
        userId: otherCoOwner.user.id,
        memberRole: "CO_OWNER",
      },
    });

    const createRes = await familyFriendsPOST(
      new Request("http://localhost/api/family-friends", {
        method: "POST",
        headers: authedHeaders(coOwner.sessionToken, {
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
          headers: authedHeaders(otherCoOwner.sessionToken),
        },
      ),
      { params: Promise.resolve({ id: String(createBody.familyFriend.id) }) },
    );

    expect(acceptRes.status).toBe(200);

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
        headers: authedHeaders(coOwner.sessionToken),
      }),
      { params: Promise.resolve({ id: String(pending.id) }) },
    );

    expect(rejectRes.status).toBe(200);
  });

  // Verifies family-friend cleanup actions after pending or active relationships.
  it("cancels, blocks, and removes family friend relationships", async () => {
    // These actions round out family-friend management for the later family
    // detail page: cancel outgoing, block active, and remove blocked/accepted.
    const owner = await registerUser("owner@example.com", "owner");
    const otherOwner = await registerUser("other@example.com", "other");
    const thirdOwner = await registerUser("third@example.com", "third");

    const ownerFamily = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );
    const otherFamily = expectRecord(
      await prisma.family.findFirst({
        where: { createdBy: otherOwner.user.id },
      }),
      "Expected other owner registration to create a family",
    );
    const thirdFamily = expectRecord(
      await prisma.family.findFirst({
        where: { createdBy: thirdOwner.user.id },
      }),
      "Expected third owner registration to create a family",
    );

    const pending = await prisma.familyFriend.create({
      data: {
        requesterFamilyId: ownerFamily.id,
        addresseeFamilyId: otherFamily.id,
        status: "PENDING",
      },
    });

    const cancelRes = await cancelFamilyFriendPOST(
      new Request(`http://localhost/api/family-friends/${pending.id}/cancel`, {
        method: "POST",
        headers: authedHeaders(owner.sessionToken),
      }),
      { params: Promise.resolve({ id: String(pending.id) }) },
    );

    expect(cancelRes.status).toBe(200);
    expect(
      await prisma.familyFriend.findUnique({ where: { id: pending.id } }),
    ).toBeNull();

    const accepted = await prisma.familyFriend.create({
      data: {
        requesterFamilyId: ownerFamily.id,
        addresseeFamilyId: thirdFamily.id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    const blockRes = await blockFamilyFriendPOST(
      new Request(`http://localhost/api/family-friends/${accepted.id}/block`, {
        method: "POST",
        headers: authedHeaders(thirdOwner.sessionToken),
      }),
      { params: Promise.resolve({ id: String(accepted.id) }) },
    );

    expect(blockRes.status).toBe(200);
    const blocked = await blockRes.json();
    expect(blocked.familyFriend.status).toBe("BLOCKED");

    const removeRes = await deleteFamilyFriendDELETE(
      new Request(`http://localhost/api/family-friends/${accepted.id}`, {
        method: "DELETE",
        headers: authedHeaders(owner.sessionToken),
      }),
      { params: Promise.resolve({ id: String(accepted.id) }) },
    );

    expect(removeRes.status).toBe(200);
    expect(
      await prisma.familyFriend.findUnique({ where: { id: accepted.id } }),
    ).toBeNull();
  });

  // Verifies user invitations into a family create membership only after accept.
  it("sends, lists, and accepts family join requests", async () => {
    // Invite flow mirrors a real product flow:
    // owner invites by email -> invited user sees request -> accepting creates
    // active FamilyMember access.
    const owner = await registerUser("owner@example.com", "owner");
    const invited = await registerUser("invited@example.com", "invited");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    const inviteRes = await familyJoinRequestsPOST(
      new Request("http://localhost/api/family-join-requests", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          familyId: family.id,
          addresseeEmail: invited.user.email,
        }),
      }),
    );

    expect(inviteRes.status).toBe(201);
    const inviteBody = await inviteRes.json();
    expect(inviteBody.familyJoinRequest.status).toBe("PENDING");

    const listRes = await familyJoinRequestsGET(
      new Request("http://localhost/api/family-join-requests", {
        method: "GET",
        headers: authedHeaders(invited.sessionToken),
      }),
    );

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.familyJoinRequests).toHaveLength(1);
    expect(listBody.familyJoinRequests[0].direction).toBe("RECEIVED");

    const acceptRes = await acceptFamilyJoinRequestPOST(
      new Request(
        `http://localhost/api/family-join-requests/${inviteBody.familyJoinRequest.id}/accept`,
        {
          method: "POST",
          headers: authedHeaders(invited.sessionToken),
        },
      ),
      {
        params: Promise.resolve({
          id: String(inviteBody.familyJoinRequest.id),
        }),
      },
    );

    expect(acceptRes.status).toBe(200);
    const acceptedBody = await acceptRes.json();
    expect(acceptedBody.familyJoinRequest.status).toBe("ACCEPTED");

    const membership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: family.id,
          userId: invited.user.id,
        },
      },
    });
    if (!membership) throw new Error("Expected accepted invite to create membership");
    expect(membership.isActive).toBe(true);
    expect(membership.memberRole).toBe("MEMBER");
  });

  // Verifies family join requests support both recipient rejection and owner cancel.
  it("rejects and cancels family join requests", async () => {
    // Reject is recipient-side; cancel is owner/requester-side. Keeping both
    // routes tested protects the separate authorization rules.
    const owner = await registerUser("owner@example.com", "owner");
    const rejectTarget = await registerUser("reject@example.com", "reject");
    const cancelTarget = await registerUser("cancel@example.com", "cancel");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    const requestToReject = await prisma.familyJoinRequest.create({
      data: {
        familyId: family.id,
        requesterId: owner.user.id,
        addresseeId: rejectTarget.user.id,
      },
    });

    const rejectRes = await rejectFamilyJoinRequestPOST(
      new Request(
        `http://localhost/api/family-join-requests/${requestToReject.id}/reject`,
        {
          method: "POST",
          headers: authedHeaders(rejectTarget.sessionToken),
        },
      ),
      { params: Promise.resolve({ id: String(requestToReject.id) }) },
    );

    expect(rejectRes.status).toBe(200);
    const rejected = await rejectRes.json();
    expect(rejected.familyJoinRequest.status).toBe("REJECTED");

    const requestToCancel = await prisma.familyJoinRequest.create({
      data: {
        familyId: family.id,
        requesterId: owner.user.id,
        addresseeId: cancelTarget.user.id,
      },
    });

    const cancelRes = await cancelFamilyJoinRequestPOST(
      new Request(
        `http://localhost/api/family-join-requests/${requestToCancel.id}/cancel`,
        {
          method: "POST",
          headers: authedHeaders(owner.sessionToken),
        },
      ),
      { params: Promise.resolve({ id: String(requestToCancel.id) }) },
    );

    expect(cancelRes.status).toBe(200);
    const canceled = await cancelRes.json();
    expect(canceled.familyJoinRequest.status).toBe("CANCELED");
  });

  // Verifies removing a member preserves history while revoking active access.
  it("removes non-owner family members", async () => {
    // Member removal is a soft delete: the row remains, but isActive=false
    // means later family-scoped guards will deny access for that user.
    const owner = await registerUser("owner@example.com", "owner");
    const member = await registerUser("member@example.com", "member");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    const familyMember = await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: member.user.id,
        memberRole: "MEMBER",
      },
    });

    const removeRes = await familyMemberDELETE(
      new Request(
        `http://localhost/api/families/${family.id}/members/${familyMember.id}`,
        {
          method: "DELETE",
          headers: authedHeaders(owner.sessionToken),
        },
      ),
      {
        params: Promise.resolve({
          id: String(family.id),
          memberId: String(familyMember.id),
        }),
      },
    );

    expect(removeRes.status).toBe(200);
    const removeBody = await removeRes.json();
    expect(removeBody.member.id).toBe(familyMember.id);
    expect(removeBody.member.isActive).toBe(false);

    const removed = expectRecord(
      await prisma.familyMember.findUnique({
        where: { id: familyMember.id },
      }),
      "Expected soft-removed member row to remain",
    );
    expect(removed.isActive).toBe(false);
    expect(removed.leftAt).toBeTruthy();
  });

  // Verifies owners can promote/demote members and label family relationships.
  it("updates member roles and relationship labels", async () => {
    const owner = await registerUser("owner@example.com", "owner");
    const member = await registerUser("member@example.com", "member");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    const familyMember = await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: member.user.id,
        memberRole: "MEMBER",
      },
    });

    const updateRes = await familyMemberPATCH(
      new Request(
        `http://localhost/api/families/${family.id}/members/${familyMember.id}`,
        {
          method: "PATCH",
          headers: authedHeaders(owner.sessionToken, {
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            memberRole: "CO_OWNER",
            relationshipLabel: "Father",
          }),
        },
      ),
      {
        params: Promise.resolve({
          id: String(family.id),
          memberId: String(familyMember.id),
        }),
      },
    );

    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.member.memberRole).toBe("CO_OWNER");
    expect(updateBody.member.relationshipLabel).toBe("Father");
  });

  // Verifies explicit transaction visibility scopes protect shared ledger data.
  it("lists personal, family, friend group, and specific-user shared transactions", async () => {
    const owner = await registerUser("owner@example.com", "owner");
    const familyMember = await registerUser("family@example.com", "family");
    const friend = await registerUser("friend@example.com", "friend");
    const stranger = await registerUser("stranger@example.com", "stranger");

    const family = expectRecord(
      await prisma.family.findFirst({ where: { createdBy: owner.user.id } }),
      "Expected owner registration to create a family",
    );

    await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: familyMember.user.id,
        memberRole: "MEMBER",
      },
    });
    await prisma.userFriend.create({
      data: {
        requesterId: owner.user.id,
        addresseeId: friend.user.id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    const friendGroup = await prisma.friendGroup.create({
      data: {
        ownerId: owner.user.id,
        name: "Trip group",
        members: {
          create: [
            { userId: owner.user.id },
            { userId: friend.user.id },
          ],
        },
      },
    });

    const basePayload = {
      type: "EXPENSE",
      amountCents: 1000,
      occurredAt: "2026-02-01T12:00:00.000Z",
    };

    const personalRes = await transactionsPOST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          ...basePayload,
          visibility: "PERSONAL",
          merchant: "Personal",
        }),
      }),
    );
    const familyRes = await transactionsPOST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          ...basePayload,
          familyId: family.id,
          visibility: "FAMILY",
          merchant: "Family",
        }),
      }),
    );
    const groupRes = await transactionsPOST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          ...basePayload,
          friendGroupId: friendGroup.id,
          visibility: "FRIEND_GROUP",
          merchant: "Group",
        }),
      }),
    );
    const specificRes = await transactionsPOST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          ...basePayload,
          visibility: "SPECIFIC_USERS",
          sharedUserIds: [friend.user.id],
          merchant: "Specific",
        }),
      }),
    );

    expect(personalRes.status).toBe(201);
    expect(familyRes.status).toBe(201);
    expect(groupRes.status).toBe(201);
    expect(specificRes.status).toBe(201);

    const familyMemberList = await transactionsGET(
      new Request("http://localhost/api/transactions", {
        method: "GET",
        headers: authedHeaders(familyMember.sessionToken),
      }),
    );
    const friendList = await transactionsGET(
      new Request("http://localhost/api/transactions", {
        method: "GET",
        headers: authedHeaders(friend.sessionToken),
      }),
    );
    const strangerList = await transactionsGET(
      new Request("http://localhost/api/transactions", {
        method: "GET",
        headers: authedHeaders(stranger.sessionToken),
      }),
    );

    const familyMerchants = (await familyMemberList.json()).transactions.map(
      (transaction: { merchant: string | null }) => transaction.merchant,
    );
    const friendMerchants = (await friendList.json()).transactions.map(
      (transaction: { merchant: string | null }) => transaction.merchant,
    );
    const strangerMerchants = (await strangerList.json()).transactions.map(
      (transaction: { merchant: string | null }) => transaction.merchant,
    );

    expect(familyMerchants).toContain("Family");
    expect(familyMerchants).not.toContain("Personal");
    expect(friendMerchants).toEqual(expect.arrayContaining(["Group", "Specific"]));
    expect(strangerMerchants).toHaveLength(0);
  });

  // Verifies saved default sharing profiles apply automatically to new rows.
  it("uses a default sharing profile when creating transactions", async () => {
    const owner = await registerUser("owner@example.com", "owner");
    const friend = await registerUser("friend@example.com", "friend");

    await prisma.userFriend.create({
      data: {
        requesterId: owner.user.id,
        addresseeId: friend.user.id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    const profileRes = await sharingProfilesPOST(
      new Request("http://localhost/api/sharing-profiles", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          name: "Default friend share",
          resourceType: "TRANSACTION",
          isDefault: true,
          targets: [{ targetType: "USER", userId: friend.user.id }],
        }),
      }),
    );

    expect(profileRes.status).toBe(201);

    const transactionRes = await transactionsPOST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          type: "EXPENSE",
          amountCents: 1200,
          occurredAt: "2026-02-01T12:00:00.000Z",
          merchant: "Default Shared",
        }),
      }),
    );

    expect(transactionRes.status).toBe(201);
    const transactionBody = await transactionRes.json();
    expect(transactionBody.transaction.visibility).toBe("SPECIFIC_USERS");

    const friendList = await transactionsGET(
      new Request("http://localhost/api/transactions", {
        method: "GET",
        headers: authedHeaders(friend.sessionToken),
      }),
    );

    const friendMerchants = (await friendList.json()).transactions.map(
      (transaction: { merchant: string | null }) => transaction.merchant,
    );
    expect(friendMerchants).toContain("Default Shared");
  });

  // Verifies saved profile CRUD supports the full target picker:
  // family membership, owned friend groups, and accepted individual friends.
  it("creates, lists, updates, and deletes mixed-target sharing profiles", async () => {
    const owner = await registerUser("owner@example.com", "owner");
    const friend = await registerUser("friend@example.com", "friend");

    await prisma.userFriend.create({
      data: {
        requesterId: owner.user.id,
        addresseeId: friend.user.id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    const family = await prisma.family.create({
      data: {
        name: "Owner Household",
        createdBy: owner.user.id,
        members: {
          create: { userId: owner.user.id, memberRole: "OWNER" },
        },
      },
    });

    const friendGroup = await prisma.friendGroup.create({
      data: {
        ownerId: owner.user.id,
        name: "Owner Group",
        members: {
          create: { userId: friend.user.id },
        },
      },
    });

    const createRes = await sharingProfilesPOST(
      new Request("http://localhost/api/sharing-profiles", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          name: "Mixed share",
          resourceType: "TRANSACTION",
          isDefault: false,
          targets: [
            { targetType: "FAMILY", familyId: family.id },
            { targetType: "FRIEND_GROUP", friendGroupId: friendGroup.id },
            { targetType: "USER", userId: friend.user.id },
          ],
        }),
      }),
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.sharingProfile.targets).toHaveLength(3);

    const listRes = await sharingProfilesGET(
      new Request("http://localhost/api/sharing-profiles", {
        method: "GET",
        headers: authedHeaders(owner.sessionToken),
      }),
    );

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(
      listBody.sharingProfiles.map(
        (profile: { name: string }) => profile.name,
      ),
    ).toContain("Mixed share");

    const patchRes = await sharingProfilePATCH(
      new Request(
        `http://localhost/api/sharing-profiles/${createBody.sharingProfile.id}`,
        {
          method: "PATCH",
          headers: authedHeaders(owner.sessionToken, {
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            name: "Friends only",
            isDefault: true,
            targets: [{ targetType: "USER", userId: friend.user.id }],
          }),
        },
      ),
      {
        params: Promise.resolve({
          id: String(createBody.sharingProfile.id),
        }),
      },
    );

    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.sharingProfile.name).toBe("Friends only");
    expect(patchBody.sharingProfile.isDefault).toBe(true);
    expect(patchBody.sharingProfile.targets).toHaveLength(1);
    expect(patchBody.sharingProfile.targets[0].targetType).toBe("USER");

    const deleteRes = await sharingProfileDELETE(
      new Request(
        `http://localhost/api/sharing-profiles/${createBody.sharingProfile.id}`,
        {
          method: "DELETE",
          headers: authedHeaders(owner.sessionToken),
        },
      ),
      {
        params: Promise.resolve({
          id: String(createBody.sharingProfile.id),
        }),
      },
    );

    expect(deleteRes.status).toBe(200);
    const deletedProfile = await prisma.sharingProfile.findUnique({
      where: { id: createBody.sharingProfile.id },
    });
    expect(deletedProfile).toBeNull();
  });

  // Verifies default selection is exclusive per resource type.
  it("keeps only one default sharing profile per resource type", async () => {
    const owner = await registerUser("owner@example.com", "owner");
    const friend = await registerUser("friend@example.com", "friend");

    await prisma.userFriend.create({
      data: {
        requesterId: owner.user.id,
        addresseeId: friend.user.id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    const firstProfile = await prisma.sharingProfile.create({
      data: {
        userId: owner.user.id,
        name: "First default",
        resourceType: "TRANSACTION",
        isDefault: true,
        targets: {
          create: { targetType: "USER", userId: friend.user.id },
        },
      },
    });

    const createSecondDefaultRes = await sharingProfilesPOST(
      new Request("http://localhost/api/sharing-profiles", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          name: "Second default",
          resourceType: "TRANSACTION",
          isDefault: true,
          targets: [{ targetType: "USER", userId: friend.user.id }],
        }),
      }),
    );

    expect(createSecondDefaultRes.status).toBe(201);
    const firstAfterCreate = await prisma.sharingProfile.findUnique({
      where: { id: firstProfile.id },
    });
    expect(firstAfterCreate?.isDefault).toBe(false);

    const firstPatchRes = await sharingProfilePATCH(
      new Request(
        `http://localhost/api/sharing-profiles/${firstProfile.id}`,
        {
          method: "PATCH",
          headers: authedHeaders(owner.sessionToken, {
            "content-type": "application/json",
          }),
          body: JSON.stringify({ isDefault: true }),
        },
      ),
      { params: Promise.resolve({ id: String(firstProfile.id) }) },
    );

    expect(firstPatchRes.status).toBe(200);
    const defaults = await prisma.sharingProfile.findMany({
      where: {
        userId: owner.user.id,
        resourceType: "TRANSACTION",
        isDefault: true,
      },
    });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(firstProfile.id);
  });

  // Verifies profile targets cannot point at users/families/groups outside the
  // actor's accepted social graph and active memberships.
  it("rejects unavailable sharing profile targets", async () => {
    const owner = await registerUser("owner@example.com", "owner");
    const stranger = await registerUser("stranger@example.com", "stranger");

    const inaccessibleFamily = await prisma.family.create({
      data: {
        name: "Stranger Household",
        createdBy: stranger.user.id,
        members: {
          create: { userId: stranger.user.id, memberRole: "OWNER" },
        },
      },
    });

    const inaccessibleGroup = await prisma.friendGroup.create({
      data: {
        ownerId: stranger.user.id,
        name: "Stranger Group",
      },
    });

    const inaccessibleUserRes = await sharingProfilesPOST(
      new Request("http://localhost/api/sharing-profiles", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          name: "Bad user",
          targets: [{ targetType: "USER", userId: stranger.user.id }],
        }),
      }),
    );
    expect(inaccessibleUserRes.status).toBe(403);

    const inaccessibleFamilyRes = await sharingProfilesPOST(
      new Request("http://localhost/api/sharing-profiles", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          name: "Bad family",
          targets: [
            { targetType: "FAMILY", familyId: inaccessibleFamily.id },
          ],
        }),
      }),
    );
    expect(inaccessibleFamilyRes.status).toBe(403);

    const inaccessibleGroupRes = await sharingProfilesPOST(
      new Request("http://localhost/api/sharing-profiles", {
        method: "POST",
        headers: authedHeaders(owner.sessionToken, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          name: "Bad group",
          targets: [
            {
              targetType: "FRIEND_GROUP",
              friendGroupId: inaccessibleGroup.id,
            },
          ],
        }),
      }),
    );
    expect(inaccessibleGroupRes.status).toBe(403);
  });
});
