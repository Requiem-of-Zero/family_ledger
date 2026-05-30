import { prisma } from "@/src/server/db/prisma";
import { HttpError } from "@/src/server/services/auth.service";

export type ShareTargetInput = {
  targetType: "FAMILY" | "FRIEND_GROUP" | "USER";
  familyId?: number | null;
  friendGroupId?: number | null;
  userId?: number | null;
};

export type SharingResourceTypeInput = "TRANSACTION" | "RECIPE" | "ALL";

export type NormalizedShareTarget = {
  targetType: "FAMILY" | "FRIEND_GROUP" | "USER";
  familyId?: number;
  friendGroupId?: number;
  userId?: number;
};

// -----------------------------------------------------------------------------
// Target Normalization And Access Checks
// -----------------------------------------------------------------------------
// Every sharing path runs through this function before data is written. It turns
// mixed target shapes into one clean format, removes duplicates, and verifies the
// current user is allowed to share with each selected family/group/user.
export async function normalizeAndAuthorizeShareTargets(
  actorUserId: number,
  targets: ShareTargetInput[],
) {
  const normalized = dedupeShareTargets(targets.map(normalizeShareTarget));

  const familyIds = normalized
    .filter((target) => target.targetType === "FAMILY")
    .map((target) => target.familyId!);
  const friendGroupIds = normalized
    .filter((target) => target.targetType === "FRIEND_GROUP")
    .map((target) => target.friendGroupId!);
  const userIds = normalized
    .filter((target) => target.targetType === "USER")
    .map((target) => target.userId!);

  if (familyIds.length > 0) {
    const count = await prisma.familyMember.count({
      where: {
        userId: actorUserId,
        isActive: true,
        familyId: { in: familyIds },
        family: { deletedAt: null },
      },
    });

    if (count !== familyIds.length) {
      throw new HttpError("One or more families are not available", 403);
    }
  }

  if (friendGroupIds.length > 0) {
    const count = await prisma.friendGroup.count({
      where: {
        id: { in: friendGroupIds },
        OR: [
          { ownerId: actorUserId },
          { members: { some: { userId: actorUserId } } },
        ],
      },
    });

    if (count !== friendGroupIds.length) {
      throw new HttpError("One or more friend groups are not available", 403);
    }
  }

  if (userIds.length > 0) {
    const acceptedFriendCount = await prisma.userFriend.count({
      where: {
        status: "ACCEPTED",
        OR: userIds.flatMap((userId) => [
          { requesterId: actorUserId, addresseeId: userId },
          { requesterId: userId, addresseeId: actorUserId },
        ]),
      },
    });

    if (acceptedFriendCount !== userIds.length) {
      throw new HttpError("One or more users are not accepted friends", 403);
    }
  }

  return normalized;
}

// -----------------------------------------------------------------------------
// Profile Lookup For Transaction Sharing
// -----------------------------------------------------------------------------
// Transactions can use TRANSACTION profiles directly, or ALL profiles that should
// apply to multiple future resource types like recipes.
export async function getSharingProfileTargetsForUser(
  actorUserId: number,
  sharingProfileId: number,
) {
  const profile = await prisma.sharingProfile.findFirst({
    where: {
      id: sharingProfileId,
      userId: actorUserId,
      resourceType: { in: ["TRANSACTION", "ALL"] },
    },
    include: { targets: true },
  });

  if (!profile) {
    throw new HttpError("Sharing profile not found", 404);
  }

  return {
    profile,
    targets: await normalizeAndAuthorizeShareTargets(
      actorUserId,
      profile.targets,
    ),
  };
}

// Default profiles are resolved at transaction creation time so membership and
// friendship changes are always rechecked before a new share is created.
export async function getDefaultSharingProfileTargetsForUser(
  actorUserId: number,
) {
  const profile = await prisma.sharingProfile.findFirst({
    where: {
      userId: actorUserId,
      isDefault: true,
      resourceType: { in: ["TRANSACTION", "ALL"] },
    },
    include: { targets: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!profile) return null;

  return {
    profile,
    targets: await normalizeAndAuthorizeShareTargets(
      actorUserId,
      profile.targets,
    ),
  };
}

// -----------------------------------------------------------------------------
// Sharing Profile CRUD
// -----------------------------------------------------------------------------
// Profiles are saved bundles of share targets. Marking one as default means new
// transactions can automatically inherit these targets without resending them.
export async function listSharingProfilesForUser(actorUserId: number) {
  return prisma.sharingProfile.findMany({
    where: { userId: actorUserId },
    include: { targets: true },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createSharingProfileForUser(
  actorUserId: number,
  input: {
    name: string;
    resourceType: SharingResourceTypeInput;
    isDefault: boolean;
    targets: ShareTargetInput[];
  },
) {
  const targets = await normalizeAndAuthorizeShareTargets(
    actorUserId,
    input.targets,
  );

  return prisma.$transaction(async (tx) => {
    // Keep one default per resource type so "new transaction" has one clear preset.
    if (input.isDefault) {
      await tx.sharingProfile.updateMany({
        where: {
          userId: actorUserId,
          resourceType: input.resourceType,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return tx.sharingProfile.create({
      data: {
        userId: actorUserId,
        name: input.name,
        resourceType: input.resourceType,
        isDefault: input.isDefault,
        targets: { createMany: { data: targets } },
      },
      include: { targets: true },
    });
  });
}

export async function updateSharingProfileForUser(
  actorUserId: number,
  sharingProfileId: number,
  input: {
    name?: string;
    resourceType?: SharingResourceTypeInput;
    isDefault?: boolean;
    targets?: ShareTargetInput[];
  },
) {
  const existing = await prisma.sharingProfile.findFirst({
    where: { id: sharingProfileId, userId: actorUserId },
  });

  if (!existing) {
    throw new HttpError("Sharing profile not found", 404);
  }

  const resourceType = input.resourceType ?? existing.resourceType;
  const targets =
    input.targets === undefined
      ? undefined
      : await normalizeAndAuthorizeShareTargets(actorUserId, input.targets);

  return prisma.$transaction(async (tx) => {
    // If this profile becomes default, demote sibling defaults for that resource.
    if (input.isDefault) {
      await tx.sharingProfile.updateMany({
        where: {
          userId: actorUserId,
          resourceType,
          isDefault: true,
          NOT: { id: existing.id },
        },
        data: { isDefault: false },
      });
    }

    // Target replacement is intentional: the UI sends the desired full target set.
    if (targets) {
      await tx.sharingProfileTarget.deleteMany({
        where: { sharingProfileId: existing.id },
      });
    }

    return tx.sharingProfile.update({
      where: { id: existing.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.resourceType ? { resourceType: input.resourceType } : {}),
        ...(input.isDefault !== undefined
          ? { isDefault: input.isDefault }
          : {}),
        ...(targets ? { targets: { createMany: { data: targets } } } : {}),
      },
      include: { targets: true },
    });
  });
}

export async function deleteSharingProfileForUser(
  actorUserId: number,
  sharingProfileId: number,
) {
  const profile = await prisma.sharingProfile.findFirst({
    where: { id: sharingProfileId, userId: actorUserId },
    select: { id: true },
  });

  if (!profile) {
    throw new HttpError("Sharing profile not found", 404);
  }

  await prisma.sharingProfile.delete({ where: { id: profile.id } });

  return { deletedSharingProfileId: profile.id };
}

// -----------------------------------------------------------------------------
// Target Shape Helpers
// -----------------------------------------------------------------------------
// These helpers keep the public service functions focused on business rules.
function normalizeShareTarget(target: ShareTargetInput): NormalizedShareTarget {
  if (target.targetType === "FAMILY" && target.familyId) {
    return { targetType: "FAMILY", familyId: target.familyId };
  }

  if (target.targetType === "FRIEND_GROUP" && target.friendGroupId) {
    return {
      targetType: "FRIEND_GROUP",
      friendGroupId: target.friendGroupId,
    };
  }

  if (target.targetType === "USER" && target.userId) {
    return { targetType: "USER", userId: target.userId };
  }

  throw new HttpError("Invalid share target", 400);
}

function dedupeShareTargets(targets: NormalizedShareTarget[]) {
  const seen = new Set<string>();

  return targets.filter((target) => {
    const key =
      target.targetType === "FAMILY"
        ? `FAMILY:${target.familyId}`
        : target.targetType === "FRIEND_GROUP"
          ? `FRIEND_GROUP:${target.friendGroupId}`
          : `USER:${target.userId}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
