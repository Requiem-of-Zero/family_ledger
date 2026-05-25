import { prisma } from "@/src/server/db/prisma";

export async function listPlaidAccountsForUser(userId: number) {
  return prisma.plaidAccount.findMany({
    where: {
      item: { userId },
    },
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
    orderBy: [{ item: { institutionName: "asc" } }, { name: "asc" }],
  });
}
