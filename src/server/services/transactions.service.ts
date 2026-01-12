import { prisma } from "@/src/server/db/prisma";
import type {
  CreateTransactionInput,
  ListTransactionQuery,
  TransactionId,
  UpdateTransactionInput,
} from "@/src/shared/validators/transactions";

/*
Creates a transaction for the given user
*/
export async function createTransactionForUser(
  userId: number,
  input: CreateTransactionInput,
) {
  const transaction = await prisma.transaction.create({
    data: {
      createdByUserId: userId,
      familyId: input.familyId ?? null,
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
