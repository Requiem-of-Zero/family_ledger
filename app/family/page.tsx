import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { prisma } from "@/src/server/db/prisma";
import { createAuthRequest } from "@/src/shared/utils/api";
import { formatDate } from "@/src/shared/utils/format";
import FamilyManagementPortal from "./FamilyManagementPortal";

export default async function FamilyPage() {
  // Server-side auth keeps the family portal private and lets the page safely
  // fetch the family management snapshot directly with Prisma.
  const cookieStore = await cookies();
  const req = createAuthRequest(cookieStore.toString());
  const sessionUser = await getCurrentUserFromRequest(req);

  if (!sessionUser) redirect("/login");

  const userId = sessionUser.id;

  const [
    familyMemberships,
    familyJoinRequests,
    familyFriends,
  ] = await Promise.all([
    prisma.familyMember.findMany({
      where: {
        userId,
        isActive: true,
        family: { deletedAt: null },
      },
      include: {
        family: {
          include: {
            members: {
              where: { isActive: true },
              include: {
                user: {
                  select: { id: true, email: true, username: true },
                },
              },
              orderBy: { joinedAt: "asc" },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.familyJoinRequest.findMany({
      where: {
        OR: [
          { addresseeId: userId },
          {
            family: {
              members: {
                some: {
                  userId,
                  isActive: true,
                  memberRole: { in: ["OWNER", "CO_OWNER"] },
                },
              },
            },
          },
        ],
      },
      include: {
        family: { select: { id: true, name: true } },
        requester: { select: { id: true, email: true, username: true } },
        addressee: { select: { id: true, email: true, username: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.familyFriend.findMany({
      where: {
        OR: [
          {
            requesterFamily: {
              members: { some: { userId, isActive: true } },
            },
          },
          {
            addresseeFamily: {
              members: { some: { userId, isActive: true } },
            },
          },
        ],
      },
      include: {
        requesterFamily: { select: { id: true, name: true } },
        addresseeFamily: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const manageableFamilyIds = new Set(
    familyMemberships
      .filter((membership) => ["OWNER", "CO_OWNER"].includes(membership.memberRole))
      .map((membership) => membership.familyId),
  );

  const families = familyMemberships.map((membership) => ({
    id: membership.family.id,
    name: membership.family.name,
    currentUserRole: membership.memberRole,
    joinedAtLabel: formatDate(membership.joinedAt),
    canManage:
      membership.memberRole === "OWNER" || membership.memberRole === "CO_OWNER",
    members: membership.family.members.map((member) => ({
      id: member.id,
      role: member.memberRole,
      relationshipLabel: member.relationshipLabel,
      joinedAtLabel: formatDate(member.joinedAt),
      user: member.user,
    })),
  }));

  const joinRequests = familyJoinRequests.map((request) => ({
    id: request.id,
    familyId: request.familyId,
    familyName: request.family.name,
    status: request.status,
    direction: request.addresseeId === userId ? "RECEIVED" : "SENT",
    canManage: manageableFamilyIds.has(request.familyId),
    requester: request.requester,
    addressee: request.addressee,
    createdAtLabel: formatDate(request.createdAt),
  }));

  const familyFriendRows = familyFriends.map((relationship) => ({
    id: relationship.id,
    requesterFamilyId: relationship.requesterFamilyId,
    addresseeFamilyId: relationship.addresseeFamilyId,
    requesterFamilyName: relationship.requesterFamily.name,
    addresseeFamilyName: relationship.addresseeFamily.name,
    status: relationship.status,
    direction: manageableFamilyIds.has(relationship.addresseeFamilyId)
      ? "RECEIVED"
      : "SENT",
    canManageRequester: manageableFamilyIds.has(relationship.requesterFamilyId),
    canManageAddressee: manageableFamilyIds.has(relationship.addresseeFamilyId),
    createdAtLabel: formatDate(relationship.createdAt),
  }));

  return (
    <FamilyManagementPortal
      families={families}
      familyFriends={familyFriendRows}
      joinRequests={joinRequests}
    />
  );
}
