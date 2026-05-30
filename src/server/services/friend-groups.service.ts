import { prisma } from "@/src/server/db/prisma";

// Public shape for the sharing-profile picker. A group can appear because the
// user owns it or because they are a member of it.
export async function listFriendGroupsForUser(userId: number) {
  const groups = await prisma.friendGroup.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    ownerId: group.ownerId,
    members: group.members.map((member) => ({
      id: member.id,
      addedAt: member.addedAt,
      user: member.user,
    })),
  }));
}
