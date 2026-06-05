import { prisma } from "@/src/server/db/prisma";
import type {
  CreateTransactionInput,
  ListTransactionQuery,
  TransactionId,
  UpdateTransactionInput,
} from "@/src/shared/validators/transactions";
import { HttpError } from "@/src/server/services/auth.service";
import {
  getDefaultSharingProfileTargetsForUser,
  getSharingProfileTargetsForUser,
  normalizeAndAuthorizeShareTargets,
  type NormalizedShareTarget,
} from "@/src/server/services/sharing-profiles.service";

// -----------------------------------------------------------------------------
// Ownership Guards
// -----------------------------------------------------------------------------
// These helpers keep transaction writes from pointing at a family/group/category
// the current user cannot actually use.
async function ensureUserCanUseFamily(userId: number, familyId: number) {
  const membership = await prisma.familyMember.findFirst({
    where: {
      userId,
      familyId,
      isActive: true,
      family: { deletedAt: null },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new HttpError("Family not found", 404);
  }
}

async function ensureUserCanUseFriendGroup(userId: number, friendGroupId: number) {
  const membership = await prisma.friendGroupMember.findFirst({
    where: {
      userId,
      friendGroupId,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new HttpError("Friend group not found", 404);
  }
}

async function ensureCategoryBelongsToFamily(
  categoryId: number,
  familyId: number | null,
) {
  const category = await prisma.transactionCategory.findUnique({
    where: { id: categoryId },
    select: { familyId: true },
  });

  if (!category || category.familyId !== familyId) {
    throw new HttpError("Category not found for this family", 404);
  }
}

const TransactionSharingDisplayInclude = {
  createdBy: {
    select: {
      id: true,
      username: true,
      email: true,
    },
  },
  family: {
    select: {
      id: true,
      name: true,
    },
  },
  friendGroup: {
    select: {
      id: true,
      name: true,
    },
  },
  shares: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
        },
      },
      family: {
        select: {
          id: true,
          name: true,
        },
      },
      friendGroup: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  sharingProfile: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

function attachTransactionPermissions<T extends { createdByUserId: number }>(
  userId: number,
  transaction: T,
) {
  return {
    ...transaction,
    canModify: transaction.createdByUserId === userId,
  };
}

export async function getDefaultFamilyIdForUser(userId: number) {
  // New users are created as OWNER of their first family. Prefer that family,
  // then fall back to any active family membership if the app grows later.
  const ownedFamily = await prisma.familyMember.findFirst({
    where: {
      userId,
      isActive: true,
      memberRole: "OWNER",
      family: { deletedAt: null },
    },
    orderBy: { joinedAt: "asc" },
    select: { familyId: true },
  });

  if (ownedFamily) return ownedFamily.familyId;

  const activeFamily = await prisma.familyMember.findFirst({
    where: {
      userId,
      isActive: true,
      family: { deletedAt: null },
    },
    orderBy: { joinedAt: "asc" },
    select: { familyId: true },
  });

  return activeFamily?.familyId ?? null;
}

/*
Creates a transaction for the given user
*/
export async function createTransactionForUser(
  userId: number,
  input: CreateTransactionInput,
) {
  // Resolve direct shares, saved sharing profiles, or the user's default preset
  // before creating the transaction and its optional TransactionShare rows.
  const sharing = await resolveTransactionSharing(userId, input, {
    useDefaultProfile: true,
  });
  const { visibility, familyId, friendGroupId, sharingProfileId, targets } =
    sharing;

  if (input.categoryId) {
    await ensureCategoryBelongsToFamily(input.categoryId, familyId);
  }

  const transaction = await prisma.transaction.create({
    data: {
      createdByUserId: userId,
      familyId,
      friendGroupId,
      sharingProfileId,
      visibility,
      categoryId: input.categoryId ?? null,
      amountCents: input.amountCents,
      type: input.type,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      occurredAt: input.occurredAt,
      shares:
        targets.length > 0
          ? {
              createMany: {
                data: targets,
              },
            }
          : undefined,
    },
    include: {
      ...TransactionSharingDisplayInclude,
    },
  });

  return attachTransactionPermissions(userId, transaction);
}

export async function listTransactionsForUser(
  userId: number,
  query: ListTransactionQuery,
) {
  const { from, to, familyId } = query;
  const toExclusive = to ? new Date(to) : undefined;

  // Date filters come from date-only inputs. A raw `to=YYYY-MM-DD` parses to
  // midnight at the start of that day, which hides transactions added later the
  // same day. Query `< next day` so the selected end date is inclusive.
  if (toExclusive) {
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  }

  if (familyId !== undefined) {
    await ensureUserCanUseFamily(userId, familyId);
  }

  const activeFamilyIds =
    familyId !== undefined
      ? [familyId]
      : await prisma.familyMember
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
  const friendGroupIds = await prisma.friendGroupMember
    .findMany({
      where: { userId },
      select: { friendGroupId: true },
    })
    .then((memberships) =>
      memberships.map((membership) => membership.friendGroupId),
    );

  // A user can see their own transactions, older direct family/group shares, and
  // the newer generic TransactionShare rows for users, families, or friend groups.
  const transactions = await prisma.transaction.findMany({
    where: {
      type: query.type,
      deletedAt: null,
      OR: [
        { createdByUserId: userId },
        { visibility: "FAMILY", familyId: { in: activeFamilyIds } },
        { visibility: "FRIEND_GROUP", friendGroupId: { in: friendGroupIds } },
        {
          shares: {
            some: {
              OR: [
                { targetType: "USER", userId },
                { targetType: "FAMILY", familyId: { in: activeFamilyIds } },
                {
                  targetType: "FRIEND_GROUP",
                  friendGroupId: { in: friendGroupIds },
                },
              ],
            },
          },
        },
      ],
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(toExclusive ? { lt: toExclusive } : {}),
            },
          }
        : {}),
    },
    include: {
      ...TransactionSharingDisplayInclude,
      plaidAccount: {
        select: {
          id: true,
          name: true,
          mask: true,
          type: true,
          subtype: true,
          item: {
            select: {
              id: true,
              institutionName: true,
            },
          },
        },
      },
    },
    orderBy: { occurredAt: "desc" },
  });

  return transactions.map((transaction) =>
    attachTransactionPermissions(userId, transaction),
  );
}

export async function getTransactionForUserById(
  userId: number,
  transactionId: TransactionId,
) {
  // Mirror the list visibility rules so direct URL access cannot read private
  // transactions outside the user's ownership or share graph.
  return prisma.transaction.findFirst({
    where: {
      deletedAt: null,
      id: transactionId,
      OR: [
        { createdByUserId: userId },
        {
          visibility: "FAMILY",
          family: {
            members: {
              some: {
                userId,
                isActive: true,
              },
            },
          },
        },
        {
          visibility: "FRIEND_GROUP",
          friendGroup: {
            members: {
              some: { userId },
            },
          },
        },
        {
          shares: {
            some: {
              OR: [
                { targetType: "USER", userId },
                {
                  targetType: "FAMILY",
                  family: {
                    members: {
                      some: { userId, isActive: true },
                    },
                  },
                },
                {
                  targetType: "FRIEND_GROUP",
                  friendGroup: {
                    members: {
                      some: { userId },
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    },
    include: {
      ...TransactionSharingDisplayInclude,
    },
  }).then((transaction) =>
    transaction ? attachTransactionPermissions(userId, transaction) : null,
  );
}

// -----------------------------------------------------------------------------
// Transaction Sharing Resolution
// -----------------------------------------------------------------------------
// This converts all supported inputs into one write shape:
// - sharingProfileId: use a saved preset
// - shareTargets: use explicit mixed targets
// - no sharing input on create: try the user's default transaction profile
// - legacy fields: keep existing family/group/specific-user callers working
// Updates call this with useDefaultProfile=false so editing a normal field does
// not silently re-share a personal transaction through the user's default preset.
async function resolveTransactionSharing(
  userId: number,
  input: CreateTransactionInput | UpdateTransactionInput,
  options: { useDefaultProfile: boolean },
) {
  if (input.sharingProfileId) {
    const { profile, targets } = await getSharingProfileTargetsForUser(
      userId,
      input.sharingProfileId,
    );

    return buildSharingData(targets, profile.id);
  }

  if (input.shareTargets && input.shareTargets.length > 0) {
    const targets = await normalizeAndAuthorizeShareTargets(
      userId,
      input.shareTargets,
    );

    return buildSharingData(targets, null);
  }

  if (
    options.useDefaultProfile &&
    !input.visibility &&
    !input.familyId &&
    !input.friendGroupId &&
    !input.sharedUserIds
  ) {
    const defaultProfile = await getDefaultSharingProfileTargetsForUser(userId);
    if (defaultProfile) {
      return buildSharingData(defaultProfile.targets, defaultProfile.profile.id);
    }
  }

  const visibility =
    input.visibility ?? (input.familyId ? "FAMILY" : "PERSONAL");
  const legacyTargets: NormalizedShareTarget[] = [];

  // Legacy visibility fields support older callers and simple forms that do not
  // yet send generic shareTargets. They are translated into the same target list.
  if (visibility === "FAMILY") {
    const familyId = input.familyId ?? (await getDefaultFamilyIdForUser(userId));
    if (!familyId) {
      throw new HttpError("Family is required for family-shared transactions", 400);
    }
    await ensureUserCanUseFamily(userId, familyId);
    legacyTargets.push({ targetType: "FAMILY", familyId });
  }

  if (visibility === "FRIEND_GROUP") {
    if (!input.friendGroupId) {
      throw new HttpError("Friend group is required for friend group transactions", 400);
    }
    await ensureUserCanUseFriendGroup(userId, input.friendGroupId);
    legacyTargets.push({
      targetType: "FRIEND_GROUP",
      friendGroupId: input.friendGroupId,
    });
  }

  if (visibility === "SPECIFIC_USERS") {
    const targets = (input.sharedUserIds ?? []).map((sharedUserId) => ({
      targetType: "USER" as const,
      userId: sharedUserId,
    }));
    legacyTargets.push(
      ...(await normalizeAndAuthorizeShareTargets(userId, targets)),
    );
  }

  return buildSharingData(legacyTargets, null, visibility);
}

// Convert normalized targets into both summary columns and generic share rows.
// The summary columns preserve simple filtering for one-family/one-group shares,
// while TransactionShare supports bulk and mixed sharing targets.
function buildSharingData(
  targets: NormalizedShareTarget[],
  sharingProfileId: number | null,
  requestedVisibility?: CreateTransactionInput["visibility"],
) {
  const familyTargets = targets.filter((target) => target.targetType === "FAMILY");
  const groupTargets = targets.filter(
    (target) => target.targetType === "FRIEND_GROUP",
  );
  const userTargets = targets.filter((target) => target.targetType === "USER");
  const targetCount = targets.length;

  // Pick the most specific visibility label possible. Mixed targets become
  // CUSTOM, but the actual access still comes from the TransactionShare rows.
  const visibility =
    requestedVisibility ??
    (targetCount === 0
      ? "PERSONAL"
      : targetCount === 1 && familyTargets.length === 1
        ? "FAMILY"
        : targetCount === 1 && groupTargets.length === 1
          ? "FRIEND_GROUP"
          : userTargets.length === targetCount
            ? "SPECIFIC_USERS"
            : "CUSTOM");

  return {
    visibility,
    sharingProfileId,
    familyId: familyTargets.length === 1 ? familyTargets[0].familyId! : null,
    friendGroupId:
      groupTargets.length === 1 ? groupTargets[0].friendGroupId! : null,
    targets: targets.map((target) => ({
      targetType: target.targetType,
      familyId: target.familyId ?? null,
      friendGroupId: target.friendGroupId ?? null,
      userId: target.userId ?? null,
    })),
  };
}

export async function updateTransactionForUserById(
  userId: number,
  transactionId: TransactionId,
  data: UpdateTransactionInput,
) {
  const transactionData = { ...data };
  delete transactionData.shareTargets;
  delete transactionData.sharedUserIds;

  // Only rebuild share rows when the request includes a sharing field. This
  // prevents a normal edit from wiping or changing existing share settings.
  const hasSharingUpdate =
    "visibility" in data ||
    "sharingProfileId" in data ||
    "familyId" in data ||
    "friendGroupId" in data ||
    "shareTargets" in data ||
    "sharedUserIds" in data;

  const existing = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      createdByUserId: userId,
    },
    select: { id: true, familyId: true },
  });

  if (!existing) return null;

  const sharing = hasSharingUpdate
    ? await resolveTransactionSharing(userId, data, {
        useDefaultProfile: false,
      })
    : null;
  const nextFamilyId = sharing ? sharing.familyId : existing.familyId;

  if (data.categoryId) {
    await ensureCategoryBelongsToFamily(data.categoryId, nextFamilyId);
  }

  return prisma.$transaction(async (tx) => {
    if (sharing) {
      // Sharing updates replace the target set as a whole, matching how the
      // profile/modal UI submits the desired final state.
      await tx.transactionShare.deleteMany({
        where: { transactionId },
      });
    }

    return tx.transaction.update({
      where: { id: transactionId },
      data: {
        ...transactionData,
        ...(sharing
          ? {
              visibility: sharing.visibility,
              familyId: sharing.familyId,
              friendGroupId: sharing.friendGroupId,
              sharingProfileId: sharing.sharingProfileId,
              shares:
                sharing.targets.length > 0
                  ? { createMany: { data: sharing.targets } }
                  : undefined,
            }
          : {}),
      },
      include: {
        ...TransactionSharingDisplayInclude,
      },
    }).then((transaction) => attachTransactionPermissions(userId, transaction));
  });
}

export async function softDeleteTransactionForUserById(
  userId: number,
  transactionId: TransactionId,
) {
  const existing = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      createdByUserId: userId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!existing) return null;

  return prisma.transaction.update({
    where: { id: transactionId },
    data: { deletedAt: new Date() },
  });
}
