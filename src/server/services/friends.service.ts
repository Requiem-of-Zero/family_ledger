import { prisma } from "@/src/server/db/prisma";
import { HttpError } from "@/src/server/services/auth.service";

// Keep friend-facing user payloads intentionally small. These objects are safe
// to return from API routes and avoid leaking password/session internals.
const FriendUserSelect = {
  id: true,
  email: true,
  username: true,
} as const;

// Creates a one-way pending friend request. The relationship is still modeled as
// one row, so we also check the reverse direction to prevent duplicate pairs.
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

  // A pair can only have one relationship row regardless of who initiated it.
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

// Lists every relationship involving the user and normalizes each row with a
// `friend` field so callers do not have to infer the "other user" themselves.
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
  // Only the addressee can accept a pending request. The requester cannot accept
  // their own outgoing request on behalf of someone else.
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

export async function rejectFriendRequest(
  userId: number,
  friendRequestId: number,
) {
  // Rejection removes the pending row entirely. If we later want an audit trail,
  // this can become a status transition instead of a delete.
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
    throw new HttpError("Only the recipient can reject this request", 403);
  }

  if (friendRequest.status !== "PENDING") {
    throw new HttpError("Friend request is not pending", 409);
  }

  await prisma.userFriend.delete({
    where: { id: friendRequest.id },
  });

  return { rejectedFriendRequestId: friendRequest.id };
}

export async function cancelFriendRequest(
  userId: number,
  friendRequestId: number,
) {
  // Cancel is the sender-side equivalent of reject: only the original requester
  // can remove their still-pending outbound request.
  const friendRequest = await prisma.userFriend.findUnique({
    where: { id: friendRequestId },
    select: {
      id: true,
      requesterId: true,
      status: true,
    },
  });

  if (!friendRequest) {
    throw new HttpError("Friend request not found", 404);
  }

  if (friendRequest.requesterId !== userId) {
    throw new HttpError("Only the sender can cancel this request", 403);
  }

  if (friendRequest.status !== "PENDING") {
    throw new HttpError("Only pending friend requests can be canceled", 409);
  }

  await prisma.userFriend.delete({
    where: { id: friendRequest.id },
  });

  return { canceledFriendRequestId: friendRequest.id };
}

export async function blockFriendRelationship(
  userId: number,
  friendRequestId: number,
) {
  // Blocking preserves a relationship row with BLOCKED status. That record is
  // what prevents the same pair from immediately creating another request.
  const relationship = await prisma.userFriend.findUnique({
    where: { id: friendRequestId },
    select: {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
    },
  });

  if (!relationship) {
    throw new HttpError("Friend relationship not found", 404);
  }

  if (relationship.requesterId !== userId && relationship.addresseeId !== userId) {
    throw new HttpError("You are not part of this friend relationship", 403);
  }

  if (relationship.status === "BLOCKED") {
    throw new HttpError("Friend relationship is already blocked", 409);
  }

  return prisma.userFriend.update({
    where: { id: relationship.id },
    data: {
      status: "BLOCKED",
      acceptedAt: null,
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

export async function removeFriendRelationship(
  userId: number,
  friendRequestId: number,
) {
  // Accepted and blocked relationships can be removed by either participant.
  // Pending requests should normally flow through reject/cancel for clearer UX.
  const relationship = await prisma.userFriend.findUnique({
    where: { id: friendRequestId },
    select: {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
    },
  });

  if (!relationship) {
    throw new HttpError("Friend relationship not found", 404);
  }

  if (relationship.requesterId !== userId && relationship.addresseeId !== userId) {
    throw new HttpError("You are not part of this friend relationship", 403);
  }

  await prisma.userFriend.delete({
    where: { id: relationship.id },
  });

  return { removedFriendRelationshipId: relationship.id };
}
