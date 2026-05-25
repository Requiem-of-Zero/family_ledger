"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "../theme/ThemeProvider";

type NavItem = {
  href: string;
  label: string;
};

const AUTH_NAV: NavItem[] = [
  { href: "/transactions", label: "Transactions" },
  /*
   * Add later:
   * {href: "/categories", label: "categories"}
   * {href: "/settings", label: "settings"}
   */
];

const PUBLIC_NAV: NavItem[] = [{ href: "/about", label: "About" }];

// Minimal “me” shape for the navbar UI
type MeUser = {
  id: number;
  email: string;
  username: string;
  profileImageUrl: string | null;
};

type FriendNotification = {
  status: string;
  direction: string;
};

type FamilySummary = {
  id: number;
};

type FamilyFriendNotification = {
  status: string;
  addresseeFamilyId: number;
};

export default function NavBar() {
  const pathname = usePathname();
  const { theme } = useTheme();

  // Current user state
  const [me, setMe] = useState<MeUser | null>(null);
  const [isLoadingMe, setIsLoadingMe] = useState(true);
  const [notificationCounts, setNotificationCounts] = useState({
    friends: 0,
    families: 0,
  });
  const navItems = !isLoadingMe && me ? AUTH_NAV : PUBLIC_NAV;
  const brandHref = !isLoadingMe && me ? "/transactions" : "/about";
  const notificationTotal =
    notificationCounts.friends + notificationCounts.families;

  // Fetch current user on mount and after route changes
  useEffect(() => {
    let isCurrent = true;

    async function fetchMe() {
      setIsLoadingMe(true);

      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (!isCurrent) return;

        if (res.ok) {
          const body = await res.json();
          setMe(body.user);
        } else {
          setMe(null);
        }
      } catch (error) {
        if (!isCurrent) return;

        console.error("Failed to fetch user:", error);
        setMe(null);
      } finally {
        if (isCurrent) setIsLoadingMe(false);
      }
    }

    fetchMe();

    return () => {
      isCurrent = false;
    };
  }, [pathname]);

  // The bell is intentionally read-only for now. It aggregates request counts
  // from the existing friend/family APIs and links users to the profile section
  // where those requests are displayed.
  useEffect(() => {
    if (!me) {
      setNotificationCounts({ friends: 0, families: 0 });
      return;
    }

    let isCurrent = true;

    async function fetchNotificationCounts() {
      try {
        const [friendsRes, familiesRes, familyFriendsRes] = await Promise.all([
          fetch("/api/friends", { credentials: "include" }),
          fetch("/api/families", { credentials: "include" }),
          fetch("/api/family-friends", { credentials: "include" }),
        ]);

        if (!isCurrent) return;

        const friendsBody = friendsRes.ok
          ? await friendsRes.json().catch(() => ({}))
          : {};
        const familiesBody = familiesRes.ok
          ? await familiesRes.json().catch(() => ({}))
          : {};
        const familyFriendsBody = familyFriendsRes.ok
          ? await familyFriendsRes.json().catch(() => ({}))
          : {};

        const friends = Array.isArray(friendsBody.friends)
          ? (friendsBody.friends as FriendNotification[])
          : [];
        const families = Array.isArray(familiesBody.families)
          ? (familiesBody.families as FamilySummary[])
          : [];
        const familyFriends = Array.isArray(familyFriendsBody.familyFriends)
          ? (familyFriendsBody.familyFriends as FamilyFriendNotification[])
          : [];
        const familyIds = new Set(families.map((family) => family.id));

        setNotificationCounts({
          friends: friends.filter(
            (friend) =>
              friend.status === "PENDING" && friend.direction === "RECEIVED",
          ).length,
          families: familyFriends.filter(
            (relationship) =>
              relationship.status === "PENDING" &&
              familyIds.has(relationship.addresseeFamilyId),
          ).length,
        });
      } catch (error) {
        if (!isCurrent) return;

        console.error("Failed to fetch notifications:", error);
        setNotificationCounts({ friends: 0, families: 0 });
      }
    }

    fetchNotificationCounts();

    return () => {
      isCurrent = false;
    };
  }, [me, pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-bg/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href={brandHref} className="flex items-center">
          <Image
            src={
              theme === "light"
                ? "/brand/family-ledger-horizontal-dark-transparent.png"
                : "/brand/family-ledger-horizontal-transparent.png"
            }
            alt="Family Ledger home"
            width={240}
            height={61}
            className="hidden h-9 w-auto object-contain sm:block"
            priority
          />
          <Image
            src="/brand/family-ledger-app-icon.png"
            alt="Family Ledger home"
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl border border-border object-cover sm:hidden"
            priority
          />
        </Link>

        {/* Links */}
        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-raised-bg text-primary-text"
                    : "text-muted-text hover:text-primary-text hover:bg-raised-bg",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}

          {/* User Display - Show username or email when logged in */}
          {!isLoadingMe && me && (
            <div className="group relative">
              <Link
                href="/profile#requests"
                aria-label={`${notificationTotal} notifications`}
                title="Notifications"
                className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-raised-bg text-primary-text hover:border-border-hover"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {notificationTotal > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-fg">
                    {notificationTotal}
                  </span>
                )}
              </Link>
              <div className="absolute right-0 top-full z-50 hidden w-56 pt-2 group-hover:block group-focus-within:block">
                <div className="rounded-xl border border-border bg-surface-bg p-3 text-sm shadow-lg">
                  <div className="font-semibold text-primary-text">
                    Notifications
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-text">
                    <div>{notificationCounts.friends} friend requests</div>
                    <div>{notificationCounts.families} family requests</div>
                  </div>
                  <Link
                    href="/profile#requests"
                    className="mt-3 block rounded-lg border border-border bg-raised-bg px-3 py-2 text-xs font-semibold text-primary-text hover:border-border-hover"
                  >
                    Open profile requests
                  </Link>
                </div>
              </div>
            </div>
          )}

          {!isLoadingMe && me && <ProfileBubble user={me} />}

        </nav>
      </div>
    </header>
  );
}

function ProfileBubble({ user }: { user: MeUser }) {
  const displayName = user.username || user.email.split("@")[0];

  return (
    <div className="group relative">
      <Link
        href="/profile"
        aria-label="Open profile"
        title={displayName}
        className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-border bg-raised-bg text-sm font-semibold text-primary-text transition hover:border-border-hover"
      >
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          getInitials(displayName)
        )}
      </Link>

      <div className="absolute right-0 top-full z-50 hidden w-64 pt-2 group-hover:block group-focus-within:block">
        <div className="rounded-xl border border-border bg-surface-bg p-3 text-sm shadow-lg">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-raised-bg text-sm font-semibold text-primary-text">
              {user.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                getInitials(displayName)
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-primary-text">
                {displayName}
              </div>
              <div className="truncate text-xs text-muted-text">
                {user.email}
              </div>
            </div>
          </div>
          <Link
            href="/profile"
            className="mt-3 block rounded-lg border border-border bg-raised-bg px-3 py-2 text-xs font-semibold text-primary-text hover:border-border-hover"
          >
            View profile
          </Link>
        </div>
      </div>
    </div>
  );
}

function getInitials(value: string) {
  const parts = value
    .replaceAll("@", " ")
    .split(/\s+/)
    .filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
