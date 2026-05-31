import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { prisma } from "@/src/server/db/prisma";
import { createAuthRequest } from "@/src/shared/utils/api";
import { formatDate } from "@/src/shared/utils/format";
import ConnectedBankList from "./ConnectedBankList";
import ProfileBankConnect from "./ProfileBankConnect";
import ProfileLogoutButton from "./ProfileLogoutButton";
import ProfilePhotoUploader from "./ProfilePhotoUploader";
import SocialVisibilityPanel from "./SocialVisibilityPanel";

export default async function ProfilePage() {
  // ---------------------------------------------------------------------------
  // Auth Gate
  // ---------------------------------------------------------------------------
  // Server pages do not receive the browser Request object directly, so we
  // rebuild a small auth request from the incoming cookies.
  const cookieStore = await cookies();
  const req = createAuthRequest(cookieStore.toString());
  const sessionUser = await getCurrentUserFromRequest(req);

  // This page should only show private account and bank data to logged-in users.
  if (!sessionUser) redirect("/login");

  // ---------------------------------------------------------------------------
  // Account Snapshot
  // ---------------------------------------------------------------------------
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
      showFriendsOnProfile: true,
      showFriendGroupsOnProfile: true,
      lastLogin: true,
      createdAt: true,
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
      oauthAccounts: {
        select: { provider: true },
      },
    },
  });

  if (!user) redirect("/login");

  // ---------------------------------------------------------------------------
  // Social Data
  // ---------------------------------------------------------------------------
  // Social data is fetched separately from the account query so the profile page
  // can keep account/banking fields narrow while still showing relationship data.
  const [friendRelationships, friendGroups] = await Promise.all([
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
    prisma.friendGroup.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true } },
          },
          orderBy: { addedAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // ---------------------------------------------------------------------------
  // Banking Display Data
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Friend Request Display Data
  // ---------------------------------------------------------------------------
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
  const socialVisibilityProps = {
    initialShowFriends: user.showFriendsOnProfile,
    initialShowFriendGroups: user.showFriendGroupsOnProfile,
    friendCount: acceptedFriends.length,
    friendGroupCount: friendGroups.length,
  };
  const notificationCount = incomingFriendRequests.length;
  const canUploadProfilePhoto = !user.oauthAccounts.some(
    (account) => account.provider === "GOOGLE",
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Profile header and notification summary. */}
      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-4">
            <ProfilePhotoUploader
              imageUrl={user.profileImageUrl}
              username={user.username}
              email={user.email}
              canUpload={canUploadProfilePhoto}
            />
            <div>
              <p className="text-sm font-semibold text-primary">Profile</p>
              <h1 className="mt-2 text-3xl font-semibold text-primary-text">
                {user.username}
              </h1>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-text">
            Manage account details, social visibility, and connected banks.
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
            Incoming friend requests
          </p>
        </div>
      </section>

      {/* Quick stats for the main profile areas. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Friends" value={acceptedFriends.length} />
        <SummaryTile label="Requests" value={notificationCount} />
        <SummaryTile label="Banks" value={user.plaidItems.length} />
      </section>

      <section className="mt-8 grid gap-6">
        {/* Account basics and sign out action. */}
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

        {/* Personal visibility settings stay on profile; relationship details live on dashboards. */}
        <SocialVisibilityPanel {...socialVisibilityProps} />

        {/* Bank connection status and connected Plaid accounts. */}
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
