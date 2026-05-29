import { prisma } from "@/src/server/db/prisma";
import { HttpError } from "@/src/server/services/auth.service";

// Public user shape for family/member responses. Keeping this centralized makes
// it harder to accidentally include auth-sensitive fields in nested payloads.
const FamilyUserSelect = {
  id: true,
  email: true,
  username: true,
} as const;

// Baseline authorization helper for family-scoped actions. A missing membership
// is reported as 404 so callers cannot probe arbitrary family ids.
async function requireActiveFamilyMembership(userId: number, familyId: number) {
  const membership = await prisma.familyMember.findFirst({
    where: {
      userId,
      familyId,
      isActive: true,
      family: { deletedAt: null },
    },
  });

  if (!membership) {
    throw new HttpError("Family not found", 404);
  }

  return membership;
}

// Owner-only guard for operations that mutate family membership or family-level
// relationships. Multiple owner roles can be supported later by this same check.
async function requireFamilyOwner(userId: number, familyId: number) {
  const membership = await requireActiveFamilyMembership(userId, familyId);

  if (membership.memberRole !== "OWNER") {
    throw new HttpError("Only a family owner can perform this action", 403);
  }

  return membership;
}

// Family managers can act on family-to-family social requests without being the
// primary owner. Family deletion and ownership changes still use OWNER only.
async function requireFamilyManager(userId: number, familyId: number) {
  const membership = await requireActiveFamilyMembership(userId, familyId);

  if (!["OWNER", "CO_OWNER"].includes(membership.memberRole)) {
    throw new HttpError(
      "Only a family owner or co-owner can perform this action",
      403,
    );
  }

  return membership;
}

// Returns all active families for a user with enough nested data to build a
// family switcher, member list, or permissions-aware UI.
export async function listFamiliesForUser(userId: number) {
  const memberships = await prisma.familyMember.findMany({
    where: {
      userId,
      isActive: true,
      family: { deletedAt: null },
    },
    include: {
      family: {
        include: {
          creator: {
            select: FamilyUserSelect,
          },
          members: {
            where: { isActive: true },
            include: {
              user: {
                select: FamilyUserSelect,
              },
            },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return memberships.map((membership) => ({
    id: membership.family.id,
    name: membership.family.name,
    currentUserRole: membership.memberRole,
    createdAt: membership.family.createdAt,
    creator: membership.family.creator,
    members: membership.family.members.map((member) => ({
      id: member.id,
      role: member.memberRole,
      relationshipLabel: member.relationshipLabel,
      joinedAt: member.joinedAt,
      user: member.user,
    })),
  }));
}

// Creates a family and immediately makes the creator its first OWNER member.
export async function createFamilyForUser(userId: number, name: string) {
  const existingOwnedFamily = await prisma.familyMember.findFirst({
    where: {
      userId,
      memberRole: "OWNER",
      isActive: true,
      family: { deletedAt: null },
    },
    select: { familyId: true },
  });

  if (existingOwnedFamily) {
    throw new HttpError("You already own an active family", 409);
  }

  return prisma.family.create({
    data: {
      name,
      createdBy: userId,
      members: {
        create: {
          userId,
          memberRole: "OWNER",
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: FamilyUserSelect,
          },
        },
      },
    },
  });
}

export async function updateFamilyName(
  actorUserId: number,
  familyId: number,
  name: string,
) {
  // Family profile edits are owner-only. The owner guard also rejects
  // soft-deleted families because it requires an active membership.
  await requireFamilyOwner(actorUserId, familyId);

  return prisma.family.update({
    where: { id: familyId },
    data: { name },
  });
}

export async function deleteFamilyForOwner(
  actorUserId: number,
  familyId: number,
) {
  // Family deletion is intentionally soft. Ledger history can keep pointing at
  // the family row, while active memberships stop granting access immediately.
  await requireFamilyOwner(actorUserId, familyId);

  return prisma.$transaction(async (tx) => {
    const family = await tx.family.update({
      where: { id: familyId },
      data: { deletedAt: new Date() },
    });

    await tx.familyMember.updateMany({
      where: {
        familyId,
        isActive: true,
      },
      data: {
        isActive: false,
        leftAt: new Date(),
      },
    });

    return family;
  });
}

export async function addFamilyMemberByEmail(
  actorUserId: number,
  familyId: number,
  memberEmail: string,
) {
  // For now, invitations are direct adds by email. When invite links are added,
  // this should become a pending invitation flow instead of immediate membership.
  await requireFamilyOwner(actorUserId, familyId);

  const user = await prisma.user.findUnique({
    where: { email: memberEmail },
    select: FamilyUserSelect,
  });

  if (!user) {
    throw new HttpError("User not found", 404);
  }

  return prisma.familyMember.upsert({
    where: {
      familyId_userId: {
        familyId,
        userId: user.id,
      },
    },
    update: {
      isActive: true,
      leftAt: null,
    },
    create: {
      familyId,
      userId: user.id,
      memberRole: "MEMBER",
    },
    include: {
      user: {
        select: FamilyUserSelect,
      },
    },
  });
}

export async function sendFamilyJoinRequest(
  actorUserId: number,
  familyId: number,
  addresseeEmail: string,
) {
  // Owners invite users into a family. The invited user is not a member until
  // they accept, which prevents silent membership changes from another account.
  await requireFamilyOwner(actorUserId, familyId);

  const addressee = await prisma.user.findUnique({
    where: { email: addresseeEmail },
    select: FamilyUserSelect,
  });

  if (!addressee) {
    throw new HttpError("User not found", 404);
  }

  const existingMembership = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: {
        familyId,
        userId: addressee.id,
      },
    },
    select: { isActive: true },
  });

  if (existingMembership?.isActive) {
    throw new HttpError("User is already an active family member", 409);
  }

  const existingRequest = await prisma.familyJoinRequest.findUnique({
    where: {
      familyId_addresseeId: {
        familyId,
        addresseeId: addressee.id,
      },
    },
  });

  if (existingRequest?.status === "PENDING") {
    throw new HttpError("Family join request already exists", 409);
  }

  return prisma.familyJoinRequest.upsert({
    where: {
      familyId_addresseeId: {
        familyId,
        addresseeId: addressee.id,
      },
    },
    update: {
      requesterId: actorUserId,
      status: "PENDING",
      acceptedAt: null,
    },
    create: {
      familyId,
      requesterId: actorUserId,
      addresseeId: addressee.id,
    },
    include: {
      family: true,
      requester: { select: FamilyUserSelect },
      addressee: { select: FamilyUserSelect },
    },
  });
}

export async function listFamilyJoinRequestsForUser(userId: number) {
  // A user can see requests sent to them, plus requests for families they own.
  // That gives owners an outgoing invitation list without exposing other
  // families' invite activity.
  const ownedFamilyIds = await prisma.familyMember
    .findMany({
      where: {
        userId,
        isActive: true,
        memberRole: "OWNER",
        family: { deletedAt: null },
      },
      select: { familyId: true },
    })
    .then((memberships) =>
      memberships.map((membership) => membership.familyId),
    );

  const requests = await prisma.familyJoinRequest.findMany({
    where: {
      OR: [{ addresseeId: userId }, { familyId: { in: ownedFamilyIds } }],
    },
    include: {
      family: true,
      requester: { select: FamilyUserSelect },
      addressee: { select: FamilyUserSelect },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return requests.map((request) => ({
    ...request,
    direction: request.addresseeId === userId ? "RECEIVED" : "SENT",
  }));
}

export async function acceptFamilyJoinRequest(
  actorUserId: number,
  familyJoinRequestId: number,
) {
  // Only the invited user can accept. Accepting creates/reactivates the
  // FamilyMember row inside the same transaction as the request update.
  const request = await prisma.familyJoinRequest.findUnique({
    where: { id: familyJoinRequestId },
    select: {
      id: true,
      familyId: true,
      addresseeId: true,
      status: true,
    },
  });

  if (!request) {
    throw new HttpError("Family join request not found", 404);
  }

  if (request.addresseeId !== actorUserId) {
    throw new HttpError("Only the invited user can accept this request", 403);
  }

  if (request.status !== "PENDING") {
    throw new HttpError("Family join request is not pending", 409);
  }

  return prisma.$transaction(async (tx) => {
    await tx.familyMember.upsert({
      where: {
        familyId_userId: {
          familyId: request.familyId,
          userId: actorUserId,
        },
      },
      update: {
        isActive: true,
        leftAt: null,
        memberRole: "MEMBER",
      },
      create: {
        familyId: request.familyId,
        userId: actorUserId,
        memberRole: "MEMBER",
      },
    });

    return tx.familyJoinRequest.update({
      where: { id: request.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
      include: {
        family: true,
        requester: { select: FamilyUserSelect },
        addressee: { select: FamilyUserSelect },
      },
    });
  });
}

export async function rejectFamilyJoinRequest(
  actorUserId: number,
  familyJoinRequestId: number,
) {
  // Rejection is recipient-only and keeps the row as REJECTED, so owners can
  // understand why an invitation disappeared from the pending list.
  const request = await prisma.familyJoinRequest.findUnique({
    where: { id: familyJoinRequestId },
    select: {
      id: true,
      addresseeId: true,
      status: true,
    },
  });

  if (!request) {
    throw new HttpError("Family join request not found", 404);
  }

  if (request.addresseeId !== actorUserId) {
    throw new HttpError("Only the invited user can reject this request", 403);
  }

  if (request.status !== "PENDING") {
    throw new HttpError("Family join request is not pending", 409);
  }

  return prisma.familyJoinRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED" },
  });
}

export async function cancelFamilyJoinRequest(
  actorUserId: number,
  familyJoinRequestId: number,
) {
  // The original requester or any current owner of that family can cancel a
  // pending invite. This covers "undo my invite" and owner cleanup workflows.
  const request = await prisma.familyJoinRequest.findUnique({
    where: { id: familyJoinRequestId },
    select: {
      id: true,
      familyId: true,
      requesterId: true,
      status: true,
    },
  });

  if (!request) {
    throw new HttpError("Family join request not found", 404);
  }

  if (request.requesterId !== actorUserId) {
    await requireFamilyOwner(actorUserId, request.familyId);
  }

  if (request.status !== "PENDING") {
    throw new HttpError("Family join request is not pending", 409);
  }

  return prisma.familyJoinRequest.update({
    where: { id: request.id },
    data: { status: "CANCELED" },
  });
}

export async function removeFamilyMember(
  actorUserId: number,
  familyId: number,
  familyMemberId: number,
) {
  // Removing a member is a soft remove. The historical FamilyMember row remains
  // available for audit/history, but it no longer grants family access.
  await requireFamilyOwner(actorUserId, familyId);

  const member = await prisma.familyMember.findFirst({
    where: {
      id: familyMemberId,
      familyId,
      isActive: true,
    },
    select: {
      id: true,
      userId: true,
      memberRole: true,
    },
  });

  if (!member) {
    throw new HttpError("Family member not found", 404);
  }

  if (member.memberRole === "OWNER") {
    throw new HttpError("Owner removal is not supported yet", 409);
  }

  return prisma.familyMember.update({
    where: { id: member.id },
    data: {
      isActive: false,
      leftAt: new Date(),
    },
    include: {
      user: { select: FamilyUserSelect },
    },
  });
}

export async function updateFamilyMemberSettings(
  actorUserId: number,
  familyId: number,
  familyMemberId: number,
  data: {
    memberRole?: "CO_OWNER" | "MEMBER";
    relationshipLabel?: string | null;
  },
) {
  // Owners manage member labels and promote/demote non-owner members. OWNER
  // transfer stays out of this narrow route until we build a safer flow.
  await requireFamilyOwner(actorUserId, familyId);

  const member = await prisma.familyMember.findFirst({
    where: {
      id: familyMemberId,
      familyId,
      isActive: true,
    },
    select: {
      id: true,
      memberRole: true,
    },
  });

  if (!member) {
    throw new HttpError("Family member not found", 404);
  }

  if (member.memberRole === "OWNER" && data.memberRole) {
    throw new HttpError("Owner role changes are not supported yet", 409);
  }

  return prisma.familyMember.update({
    where: { id: member.id },
    data: {
      ...(data.memberRole ? { memberRole: data.memberRole } : {}),
      ...(data.relationshipLabel !== undefined
        ? { relationshipLabel: data.relationshipLabel }
        : {}),
    },
    include: {
      user: { select: FamilyUserSelect },
    },
  });
}

export async function sendFamilyFriendRequest(
  actorUserId: number,
  requesterFamilyId: number,
  addresseeFamilyId: number,
) {
  // Family friendships are family-level relationships, so owners and co-owners
  // of the requesting family can initiate them.
  await requireFamilyManager(actorUserId, requesterFamilyId);

  if (requesterFamilyId === addresseeFamilyId) {
    throw new HttpError("A family cannot friend itself", 400);
  }

  const addresseeFamily = await prisma.family.findFirst({
    where: { id: addresseeFamilyId, deletedAt: null },
    select: { id: true },
  });

  if (!addresseeFamily) {
    throw new HttpError("Family not found", 404);
  }

  const existing = await prisma.familyFriend.findFirst({
    where: {
      OR: [
        { requesterFamilyId, addresseeFamilyId },
        {
          requesterFamilyId: addresseeFamilyId,
          addresseeFamilyId: requesterFamilyId,
        },
      ],
    },
  });

  if (existing) {
    throw new HttpError("Family friend request already exists", 409);
  }

  return prisma.familyFriend.create({
    data: {
      requesterFamilyId,
      addresseeFamilyId,
      status: "PENDING",
    },
    include: {
      requesterFamily: true,
      addresseeFamily: true,
    },
  });
}

export async function listFamilyFriendRelationshipsForUser(userId: number) {
  // A user sees family-friend rows for every active family they belong to. The
  // UI can later filter this by one selected family if needed.
  const familyIds = await prisma.familyMember
    .findMany({
      where: {
        userId,
        isActive: true,
        family: { deletedAt: null },
      },
      select: { familyId: true },
    })
    .then((memberships) =>
      memberships.map((membership) => membership.familyId),
    );

  return prisma.familyFriend.findMany({
    where: {
      OR: [
        { requesterFamilyId: { in: familyIds } },
        { addresseeFamilyId: { in: familyIds } },
      ],
    },
    include: {
      requesterFamily: true,
      addresseeFamily: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function acceptFamilyFriendRequest(
  actorUserId: number,
  familyFriendId: number,
) {
  // Accepting is manager-only on the receiving family, mirroring user friend
  // requests where only the addressee side can accept.
  const familyFriend = await prisma.familyFriend.findUnique({
    where: { id: familyFriendId },
    select: {
      id: true,
      addresseeFamilyId: true,
      status: true,
    },
  });

  if (!familyFriend) {
    throw new HttpError("Family friend request not found", 404);
  }

  await requireFamilyManager(actorUserId, familyFriend.addresseeFamilyId);

  if (familyFriend.status !== "PENDING") {
    throw new HttpError("Family friend request is not pending", 409);
  }

  return prisma.familyFriend.update({
    where: { id: familyFriend.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    },
    include: {
      requesterFamily: true,
      addresseeFamily: true,
    },
  });
}

export async function rejectFamilyFriendRequest(
  actorUserId: number,
  familyFriendId: number,
) {
  // Rejection deletes the pending family-friend row. As with user friends, this
  // can become a retained status later if product needs an audit trail.
  const familyFriend = await prisma.familyFriend.findUnique({
    where: { id: familyFriendId },
    select: {
      id: true,
      addresseeFamilyId: true,
      status: true,
    },
  });

  if (!familyFriend) {
    throw new HttpError("Family friend request not found", 404);
  }

  await requireFamilyManager(actorUserId, familyFriend.addresseeFamilyId);

  if (familyFriend.status !== "PENDING") {
    throw new HttpError("Family friend request is not pending", 409);
  }

  await prisma.familyFriend.delete({
    where: { id: familyFriend.id },
  });

  return { rejectedFamilyFriendRequestId: familyFriend.id };
}

export async function cancelFamilyFriendRequest(
  actorUserId: number,
  familyFriendId: number,
) {
  // Cancel is requester-side cleanup for pending family-friend requests.
  const familyFriend = await prisma.familyFriend.findUnique({
    where: { id: familyFriendId },
    select: {
      id: true,
      requesterFamilyId: true,
      status: true,
    },
  });

  if (!familyFriend) {
    throw new HttpError("Family friend request not found", 404);
  }

  await requireFamilyManager(actorUserId, familyFriend.requesterFamilyId);

  if (familyFriend.status !== "PENDING") {
    throw new HttpError("Family friend request is not pending", 409);
  }

  await prisma.familyFriend.delete({
    where: { id: familyFriend.id },
  });

  return { canceledFamilyFriendRequestId: familyFriend.id };
}

export async function blockFamilyFriendRelationship(
  actorUserId: number,
  familyFriendId: number,
) {
  // Blocking can be done by an owner on either side of the relationship.
  const familyFriend = await requireOwnedFamilyFriend(
    actorUserId,
    familyFriendId,
  );

  return prisma.familyFriend.update({
    where: { id: familyFriend.id },
    data: {
      status: "BLOCKED",
      acceptedAt: null,
    },
    include: {
      requesterFamily: true,
      addresseeFamily: true,
    },
  });
}

export async function removeFamilyFriendRelationship(
  actorUserId: number,
  familyFriendId: number,
) {
  // Remove deletes the family-friend row when either side no longer wants the
  // relationship visible. Pending rows should use reject/cancel instead.
  const familyFriend = await requireOwnedFamilyFriend(
    actorUserId,
    familyFriendId,
  );

  if (familyFriend.status === "PENDING") {
    throw new HttpError(
      "Pending family friend requests must be canceled or rejected",
      409,
    );
  }

  await prisma.familyFriend.delete({
    where: { id: familyFriend.id },
  });

  return { removedFamilyFriendId: familyFriend.id };
}

async function requireOwnedFamilyFriend(
  actorUserId: number,
  familyFriendId: number,
) {
  const familyFriend = await prisma.familyFriend.findUnique({
    where: { id: familyFriendId },
    select: {
      id: true,
      requesterFamilyId: true,
      addresseeFamilyId: true,
      status: true,
    },
  });

  if (!familyFriend) {
    throw new HttpError("Family friend relationship not found", 404);
  }

  const managerMembership = await prisma.familyMember.findFirst({
    where: {
      userId: actorUserId,
      memberRole: { in: ["OWNER", "CO_OWNER"] },
      isActive: true,
      familyId: {
        in: [familyFriend.requesterFamilyId, familyFriend.addresseeFamilyId],
      },
      family: { deletedAt: null },
    },
  });

  if (!managerMembership) {
    throw new HttpError(
      "Only a family owner or co-owner can perform this action",
      403,
    );
  }

  return familyFriend;
}
