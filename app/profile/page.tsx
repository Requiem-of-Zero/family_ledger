import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/src/server/auth/currentUser";
import { prisma } from "@/src/server/db/prisma";
import { createAuthRequest } from "@/src/shared/utils/api";
import { formatDate } from "@/src/shared/utils/format";
import ConnectedBankList from "./ConnectedBankList";
import ProfileBankConnect from "./ProfileBankConnect";

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
      email: true,
      username: true,
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

  // A derived count keeps the JSX below focused on rendering instead of math.
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Page heading */}
      <section className="mb-8">
        <p className="text-sm font-semibold text-primary">Profile</p>
        <h1 className="mt-2 text-3xl font-semibold text-primary-text">
          {user.username}
        </h1>
        <p className="mt-2 text-sm text-muted-text">
          Manage account details, family membership, and connected banks.
        </p>
      </section>

      {/* Quick stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Families" value={user.familyMembers.length} />
        <SummaryTile label="Banks" value={user.plaidItems.length} />
        <SummaryTile label="Accounts" value={accountCount} />
      </section>

      {/* Main profile details */}
      <section className="mt-8 grid gap-6">
        {/* Account metadata */}
        <div className="rounded-xl border border-border bg-surface-bg p-5">
          <h2 className="text-lg font-semibold text-primary-text">
            Account information
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <InfoItem label="Email" value={user.email} />
            <InfoItem label="Username" value={user.username} />
            <InfoItem label="Role" value={user.role} />
            <InfoItem label="Status" value={user.isActive ? "Active" : "Inactive"} />
            <InfoItem
              label="Created"
              value={formatDate(user.createdAt)}
            />
            <InfoItem
              label="Last login"
              value={user.lastLogin ? formatDate(user.lastLogin) : "Not recorded"}
            />
          </dl>
        </div>

        {/* Family memberships */}
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

        {/* Plaid institutions and their accounts */}
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

// Small display component for the three top summary numbers.
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

// Reusable definition-list row for profile fields.
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-text">{label}</dt>
      <dd className="mt-1 font-medium text-primary-text">{value}</dd>
    </div>
  );
}

// Plaid sends account type/subtype as API-safe strings. This turns them into
// friendlier labels without changing the stored data.
function formatAccountType(type: string | null, subtype: string | null) {
  return [type, subtype]
    .filter(Boolean)
    .map((part) => part!.replaceAll("_", " "))
    .join(" / ");
}
