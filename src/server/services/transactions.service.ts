import { prisma } from "@/src/server/db/prisma";
import type {
  CreateTransactionInput,
  ListTransactionQuery,
  TransactionId,
  UpdateTransactionInput,
} from "@/src/shared/validators/transactions";

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
  const familyId = input.familyId ?? (await getDefaultFamilyIdForUser(userId));

  const transaction = await prisma.transaction.create({
    data: {
      createdByUserId: userId,
      familyId,
      categoryId: input.categoryId ?? null,
      amountCents: input.amountCents,
      type: input.type,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      occurredAt: input.occurredAt,
    },
  });
  return transaction;
}

export async function listTransactionsForUser(
  userId: number,
  query: ListTransactionQuery,
) {
  const { from, to, familyId } = query;

  return prisma.transaction.findMany({
    where: {
      type: query.type,
      deletedAt: null,
      createdByUserId: userId,
      ...(familyId !== undefined ? { familyId } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
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
}

export async function getTransactionForUserById(
  userId: number,
  transactionId: TransactionId,
) {
  return prisma.transaction.findFirst({
    where: {
      deletedAt: null,
      createdByUserId: userId,
      id: transactionId,
    },
  });
}

export async function updateTransactionForUserById(
  userId: number,
  transactionId: TransactionId,
  data: UpdateTransactionInput,
) {
  const existing = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      createdByUserId: userId,
    },
    select: { id: true },
  });

  if (!existing) return null;

  return prisma.transaction.update({
    where: { id: transactionId },
    data,
  });
}

export async function softDeleteTransactionForUserById(
  userId: number,
  transactionId: TransactionId,
) {
  const existing = prisma.transaction.findFirst({
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
