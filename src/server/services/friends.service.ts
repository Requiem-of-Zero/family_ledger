import { prisma } from "@/src/server/db/prisma";
import { HttpError } from "@/src/server/services/auth.service";

const FriendUserSelect = {
  id: true,
  email: true,
  username: true,
} as const;

export async function sendFriendRequest(
  requesterId: number,
  addresseeEmail: string,
) {
  const addressee = await prisma.user.findUnique({
    where: { email: addresseeEmail },
    select: FriendUserSelect,
  });

  if (!addressee) {
    throw new HttpError("User not found", 404);
  }

  if (addressee.id === requesterId) {
    throw new HttpError("You cannot send a friend request to yourself", 400);
  }

  const existing = await prisma.userFriend.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId: addressee.id },
        { requesterId: addressee.id, addresseeId: requesterId },
      ],
    },
  });

  if (existing) {
    throw new HttpError("Friend request already exists", 409);
  }

  return prisma.userFriend.create({
    data: {
      requesterId,
      addresseeId: addressee.id,
      status: "PENDING",
    },
    include: {
      requester: {
        select: FriendUserSelect,
      },
      addressee: {
        select: FriendUserSelect,
      },
    },
  });
}

export async function listFriendRelationshipsForUser(userId: number) {
  const relationships = await prisma.userFriend.findMany({
    where: {
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: {
        select: FriendUserSelect,
      },
      addressee: {
        select: FriendUserSelect,
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return relationships.map((relationship) => {
    const direction =
      relationship.requesterId === userId ? "SENT" : "RECEIVED";
    const friend =
      relationship.requesterId === userId
        ? relationship.addressee
        : relationship.requester;

    return {
      id: relationship.id,
      status: relationship.status,
      direction,
      friend,
      requester: relationship.requester,
      addressee: relationship.addressee,
      createdAt: relationship.createdAt,
      acceptedAt: relationship.acceptedAt,
    };
  });
}

export async function acceptFriendRequest(
  userId: number,
  friendRequestId: number,
) {
  const friendRequest = await prisma.userFriend.findUnique({
    where: { id: friendRequestId },
    select: {
      id: true,
      addresseeId: true,
      status: true,
    },
  });

  if (!friendRequest) {
    throw new HttpError("Friend request not found", 404);
  }

  if (friendRequest.addresseeId !== userId) {
    throw new HttpError("Only the recipient can accept this request", 403);
  }

  if (friendRequest.status !== "PENDING") {
    throw new HttpError("Friend request is not pending", 409);
  }

  return prisma.userFriend.update({
    where: { id: friendRequest.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
    },
    include: {
      requester: {
        select: FriendUserSelect,
      },
      addressee: {
        select: FriendUserSelect,
      },
    },
  });
}
