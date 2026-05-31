import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { prisma } from "@/src/server/db/prisma";
import { createAuthRequest } from "@/src/shared/utils/api";
import { formatDate } from "@/src/shared/utils/format";
import FriendRequestManager from "@/app/profile/FriendRequestManager";

export default async function FriendsPage() {
  // ---------------------------------------------------------------------------
  // Auth Gate
  // ---------------------------------------------------------------------------
  // The friends dashboard is private because it exposes emails and relationship
  // actions for the signed-in user's social graph.
  const cookieStore = await cookies();
  const req = createAuthRequest(cookieStore.toString());
  const user = await getCurrentUserFromRequest(req);

  if (!user) redirect("/login");

  // ---------------------------------------------------------------------------
  // Friend Relationship Snapshot
  // ---------------------------------------------------------------------------
  // Load raw relationship rows once, then normalize direction so the client
  // manager can render incoming/outgoing/current friend sections cleanly.
  const friendRelationships = await prisma.userFriend.findMany({
    where: {
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
    include: {
      requester: { select: { id: true, email: true, username: true } },
      addressee: { select: { id: true, email: true, username: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const normalizedFriends = friendRelationships.map((relationship) => {
    const direction =
      relationship.requesterId === user.id ? "SENT" : "RECEIVED";
    const friend =
      direction === "SENT" ? relationship.addressee : relationship.requester;

    return {
      id: relationship.id,
      status: relationship.status,
      direction,
      friend,
      createdAt: relationship.createdAt,
      acceptedAt: relationship.acceptedAt,
    };
  });

  const acceptedFriends = normalizedFriends.filter(
    (relationship) => relationship.status === "ACCEPTED",
  );
  const incomingFriendRequests = normalizedFriends.filter(
    (relationship) =>
      relationship.status === "PENDING" &&
      relationship.direction === "RECEIVED",
  );
  const outgoingFriendRequests = normalizedFriends.filter(
    (relationship) =>
      relationship.status === "PENDING" && relationship.direction === "SENT",
  );
  const blockedFriends = normalizedFriends.filter(
    (relationship) => relationship.status === "BLOCKED",
  );

  const friendManagerProps = {
    incomingFriendRequests: incomingFriendRequests.map((relationship) => ({
      id: relationship.id,
      status: relationship.status,
      direction: relationship.direction,
      title: relationship.friend.username,
      subtitle: relationship.friend.email,
      meta: `Requested ${formatDate(relationship.createdAt)}`,
    })),
    outgoingFriendRequests: outgoingFriendRequests.map((relationship) => ({
      id: relationship.id,
      status: relationship.status,
      direction: relationship.direction,
      title: relationship.friend.username,
      subtitle: relationship.friend.email,
      meta: `Sent ${formatDate(relationship.createdAt)}`,
    })),
    acceptedFriends: acceptedFriends.map((relationship) => ({
      id: relationship.id,
      status: relationship.status,
      direction: relationship.direction,
      title: relationship.friend.username,
      subtitle: relationship.friend.email,
      meta: relationship.acceptedAt
        ? `Accepted ${formatDate(relationship.acceptedAt)}`
        : "Accepted",
    })),
    blockedFriends: blockedFriends.map((relationship) => ({
      id: relationship.id,
      status: relationship.status,
      direction: relationship.direction,
      title: relationship.friend.username,
      subtitle: relationship.friend.email,
      meta: "Blocked",
    })),
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Friends</p>
          <h1 className="mt-1 text-3xl font-semibold text-primary-text">
            Management portal
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-text">
            Manage user-level requests, accepted friends, and blocked
            relationships.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-bg px-4 py-3 text-sm text-muted-text">
          {incomingFriendRequests.length} incoming requests
        </div>
      </header>

      <FriendRequestManager {...friendManagerProps} />
    </main>
  );
}
