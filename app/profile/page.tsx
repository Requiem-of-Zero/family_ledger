import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { prisma } from "@/src/server/db/prisma";
import { createAuthRequest } from "@/src/shared/utils/api";
import { formatDate } from "@/src/shared/utils/format";
import ConnectedBankList from "./ConnectedBankList";
import FriendRequestManager from "./FriendRequestManager";
import ProfileBankConnect from "./ProfileBankConnect";
import ProfileLogoutButton from "./ProfileLogoutButton";
import ProfilePhotoUploader from "./ProfilePhotoUploader";

export default async function ProfilePage() {
  // Server pages do not receive the browser Request object directly, so we
  // rebuild a small auth request from the incoming cookies.
  const cookieStore = await cookies();
  const req = createAuthRequest(cookieStore.toString());
  const sessionUser = await getCurrentUserFromRequest(req);

  // This page should only show private account and bank data to logged-in users.
  if (!sessionUser) redirect("/login");

  // Fetch only the fields needed by the profile UI. Sensitive Plaid values,
  // especially access tokens, are intentionally left out of this select.
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      username: true,
      profileImageUrl: true,
      role: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
      familyMembers: {
        where: { isActive: true, family: { deletedAt: null } },
        select: {
          memberRole: true,
          joinedAt: true,
          family: {
            select: {
              id: true,
              name: true,
              createdAt: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
      plaidItems: {
        select: {
          id: true,
          institutionId: true,
          institutionName: true,
          createdAt: true,
          updatedAt: true,
          accounts: {
            select: {
              id: true,
              name: true,
              officialName: true,
              mask: true,
              type: true,
              subtype: true,
            },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) redirect("/login");

  // Social data is fetched separately from the account query so the profile page
  // can keep account/banking fields narrow while still showing relationship data.
  const [friendRelationships, familyFriendRelationships] = await Promise.all([
    prisma.userFriend.findMany({
      where: {
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
      include: {
        requester: {
          select: { id: true, email: true, username: true },
        },
        addressee: {
          select: { id: true, email: true, username: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.familyFriend.findMany({
      where: {
        OR: [
          {
            requesterFamily: {
              members: { some: { userId: user.id, isActive: true } },
            },
          },
          {
            addresseeFamily: {
              members: { some: { userId: user.id, isActive: true } },
            },
          },
        ],
      },
      include: {
        requesterFamily: {
          select: { id: true, name: true },
        },
        addresseeFamily: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const accountCount = user.plaidItems.reduce(
    (count, item) => count + item.accounts.length,
    0,
  );
  const connectedBanks = user.plaidItems.map((item) => ({
    id: item.id,
    institutionName: item.institutionName ?? "Connected institution",
    connectedAtLabel: formatDate(item.createdAt),
    accounts: item.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      officialName: account.officialName,
      mask: account.mask,
      typeLabel: formatAccountType(account.type, account.subtype),
    })),
  }));

  // Normalize user-friend rows into the current user's perspective. This lets
  // the UI say "incoming", "outgoing", and "friend" without repeating relation
  // direction checks throughout the JSX.
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
  // Keep client props small and already formatted. The interactive manager only
  // needs ids, display text, and action eligibility from the server snapshot.
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

  // Family-friend rows are visible through all families the user belongs to.
  // This set lets us determine which pending requests are incoming to the user.
  const familyIds = new Set(
    user.familyMembers.map((membership) => membership.family.id),
  );
  const incomingFamilyFriendRequests = familyFriendRelationships.filter(
    (relationship) =>
      relationship.status === "PENDING" &&
      familyIds.has(relationship.addresseeFamilyId),
  );
  const notificationCount =
    incomingFriendRequests.length + incomingFamilyFriendRequests.length;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-4">
            <ProfilePhotoUploader
              imageUrl={user.profileImageUrl}
              username={user.username}
              email={user.email}
            />
            <div>
              <p className="text-sm font-semibold text-primary">Profile</p>
              <h1 className="mt-2 text-3xl font-semibold text-primary-text">
                {user.username}
              </h1>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-text">
            Manage account details, family membership, friends, and connected
            banks.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-bg px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-primary-text">
              Notifications
            </span>
            <span className="grid h-7 min-w-7 place-items-center rounded-full bg-primary px-2 text-sm font-semibold text-primary-fg">
              {notificationCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-text">
            Incoming friend and family requests
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <SummaryTile label="Families" value={user.familyMembers.length} />
        <SummaryTile label="Friends" value={acceptedFriends.length} />
        <SummaryTile label="Requests" value={notificationCount} />
        <SummaryTile label="Banks" value={user.plaidItems.length} />
      </section>

      <section className="mt-8 grid gap-6">
        <div className="rounded-xl border border-border bg-surface-bg p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-primary-text">
              Account information
            </h2>
            <ProfileLogoutButton />
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <InfoItem label="Email" value={user.email} />
            <InfoItem label="Username" value={user.username} />
            <InfoItem label="Role" value={user.role} />
            <InfoItem
              label="Status"
              value={user.isActive ? "Active" : "Inactive"}
            />
            <InfoItem label="Created" value={formatDate(user.createdAt)} />
            <InfoItem
              label="Last login"
              value={user.lastLogin ? formatDate(user.lastLogin) : "Not recorded"}
            />
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-surface-bg p-5">
          <h2 className="text-lg font-semibold text-primary-text">Families</h2>
          <div className="mt-4 divide-y divide-border">
            {user.familyMembers.map((membership) => (
              <div
                key={membership.family.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="font-semibold text-primary-text">
                    {membership.family.name}
                  </div>
                  <div className="mt-1 text-sm text-muted-text">
                    Joined {formatDate(membership.joinedAt)}
                  </div>
                </div>
                <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
                  {membership.memberRole}
                </span>
              </div>
            ))}
          </div>
        </div>

        <FriendRequestManager {...friendManagerProps} />

        <div className="rounded-xl border border-border bg-surface-bg p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary-text">
                Family friends
              </h2>
              <p className="mt-1 text-sm text-muted-text">
                Family-to-family relationships for shared household workflows.
              </p>
            </div>
            <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
              {familyFriendRelationships.length} total
            </span>
          </div>

          <div className="mt-4 divide-y divide-border">
            {familyFriendRelationships.length === 0 ? (
              <div className="rounded-xl border border-border bg-raised-bg px-4 py-3 text-sm text-muted-text">
                No family friend relationships yet.
              </div>
            ) : (
              familyFriendRelationships.map((relationship) => {
                const currentFamilyIsRequester = familyIds.has(
                  relationship.requesterFamilyId,
                );
                const currentFamily = currentFamilyIsRequester
                  ? relationship.requesterFamily
                  : relationship.addresseeFamily;
                const otherFamily = currentFamilyIsRequester
                  ? relationship.addresseeFamily
                  : relationship.requesterFamily;
                const direction = currentFamilyIsRequester ? "Sent" : "Received";

                return (
                  <div
                    key={relationship.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <div className="font-semibold text-primary-text">
                        {currentFamily.name} - {otherFamily.name}
                      </div>
                      <div className="mt-1 text-sm text-muted-text">
                        {direction} {formatDate(relationship.createdAt)}
                      </div>
                    </div>
                    <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
                      {relationship.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-bg p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary-text">
                Connected banks
              </h2>
              <p className="mt-1 text-sm text-muted-text">
                Add accounts here, then review synced transactions on the
                transactions page.
              </p>
            </div>
            <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
              {accountCount} accounts
            </span>
          </div>

          {user.plaidItems.length === 0 ? (
            <ProfileBankConnect hasConnections={false} />
          ) : (
            <>
              <ProfileBankConnect hasConnections />
              <ConnectedBankList banks={connectedBanks} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-bg p-4">
      <div className="text-sm text-muted-text">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-primary-text">
        {value}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-text">{label}</dt>
      <dd className="mt-1 font-medium text-primary-text">{value}</dd>
    </div>
  );
}

function formatAccountType(type: string | null, subtype: string | null) {
  return [type, subtype]
    .filter(Boolean)
    .map((part) => part!.replaceAll("_", " "))
    .join(" / ");
}
