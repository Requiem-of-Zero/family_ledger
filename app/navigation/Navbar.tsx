"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, type ReactNode } from "react";
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
  name?: string;
};

type FamilyFriendNotification = {
  status: string;
  addresseeFamilyId: number;
};

type SharingProfileSummary = {
  id: number;
  name: string;
  isDefault: boolean;
  targets: Array<{
    targetType: "FAMILY" | "FRIEND_GROUP" | "USER";
    familyId?: number | null;
    friendGroupId?: number | null;
    userId?: number | null;
  }>;
};

type FriendRelationshipSummary = {
  status: string;
  friend: {
    id: number;
    email: string;
    username: string;
  };
};

type FriendGroupSummary = {
  id: number;
  name: string;
  members: Array<{
    user: {
      id: number;
      username: string;
    };
  }>;
};

type ShareTargetDraft = {
  targetType: "FAMILY" | "FRIEND_GROUP" | "USER";
  familyId?: number;
  friendGroupId?: number;
  userId?: number;
};

export default function NavBar() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  // Current user state
  const [me, setMe] = useState<MeUser | null>(null);
  const [isLoadingMe, setIsLoadingMe] = useState(true);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
      setIsNotificationMenuOpen(false);
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

  useEffect(() => {
    if (!isNotificationMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(event.target as Node)
      ) {
        setIsNotificationMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isNotificationMenuOpen]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-bg/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link
          href={brandHref}
          aria-label="Family Ledger home"
          className="flex items-center"
        >
          <Image
            src={
              theme === "light"
                ? "/brand/family-ledger-horizontal-dark-transparent.png"
                : "/brand/family-ledger-horizontal-transparent.png"
            }
            alt="Family Ledger home"
            width={240}
            height={61}
            className="hidden h-9 w-auto object-contain md:block"
            priority
          />
          <span
            aria-hidden="true"
            className="block h-10 w-10 shrink-0 rounded-lg bg-contain bg-center bg-no-repeat md:hidden"
            style={{
              backgroundImage: `url(${
                theme === "light"
                  ? "/brand/family-ledger-app-icon-light.png"
                  : "/brand/family-ledger-app-icon-dark.png"
              })`,
            }}
          />
        </Link>

        {/* Links */}
        <nav className="hidden items-center gap-2 md:flex">
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

          {!isLoadingMe && me && <SharingProfilesMenu />}

          {/* User Display - Show username or email when logged in */}
          {!isLoadingMe && me && (
            <div ref={notificationMenuRef} className="group relative">
              <button
                type="button"
                aria-label={`${notificationTotal} notifications`}
                aria-expanded={isNotificationMenuOpen}
                title="Notifications"
                onClick={() =>
                  setIsNotificationMenuOpen((isOpen) => !isOpen)
                }
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
              </button>
              <div
                className={[
                  "absolute right-0 top-full z-50 w-56 pt-2",
                  isNotificationMenuOpen
                    ? "block"
                    : "hidden group-hover:block group-focus-within:block",
                ].join(" ")}
              >
                <div className="rounded-xl border border-border bg-surface-bg p-3 text-sm shadow-lg">
                  <div className="font-semibold text-primary-text">
                    Notifications
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-text">
                    <div>{notificationCounts.friends} friend requests</div>
                    <div>{notificationCounts.families} family requests</div>
                  </div>
                  {notificationCounts.friends > 0 && (
                    <Link
                      href="/friends#requests"
                      onClick={() => setIsNotificationMenuOpen(false)}
                      className="mt-3 block rounded-lg border border-border bg-raised-bg px-3 py-2 text-xs font-semibold text-primary-text hover:border-border-hover"
                    >
                      Open friend requests
                    </Link>
                  )}
                  {notificationCounts.families > 0 && (
                    <Link
                      href="/family"
                      onClick={() => setIsNotificationMenuOpen(false)}
                      className="mt-2 block rounded-lg border border-border bg-raised-bg px-3 py-2 text-xs font-semibold text-primary-text hover:border-border-hover"
                    >
                      Open family requests
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isLoadingMe && me && <ProfileBubble user={me} />}

        </nav>

        <div ref={mobileMenuRef} className="relative md:hidden">
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-raised-bg text-primary-text hover:border-border-hover"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            >
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </button>

          {isMobileMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-surface-bg p-3 text-sm shadow-lg">
              <div className="grid gap-2">
                {navItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "rounded-xl px-3 py-2 font-semibold transition",
                        active
                          ? "bg-raised-bg text-primary-text"
                          : "text-muted-text hover:bg-raised-bg hover:text-primary-text",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                })}

                {!isLoadingMe && me && (
                  <>
                    <Link
                      href="/friends#requests"
                      className="rounded-xl border border-border bg-raised-bg px-3 py-2 font-semibold text-primary-text"
                    >
                      Notifications ({notificationTotal})
                    </Link>
                    <SharingProfilesMenu compact />
                    <Link
                      href="/profile"
                      className="rounded-xl border border-border bg-raised-bg px-3 py-2 font-semibold text-primary-text"
                    >
                      Profile
                    </Link>
                    <Link
                      href="/friends"
                      className="rounded-xl border border-border bg-raised-bg px-3 py-2 font-semibold text-primary-text"
                    >
                      Friends
                    </Link>
                    <Link
                      href="/family"
                      className="rounded-xl border border-border bg-raised-bg px-3 py-2 font-semibold text-primary-text"
                    >
                      Family
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
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
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href="/friends"
              className="rounded-lg border border-border bg-raised-bg px-3 py-2 text-center text-xs font-semibold text-primary-text hover:border-border-hover"
            >
              Friends
            </Link>
            <Link
              href="/family"
              className="rounded-lg border border-border bg-raised-bg px-3 py-2 text-center text-xs font-semibold text-primary-text hover:border-border-hover"
            >
              Family
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SharingProfilesMenu({ compact = false }: { compact?: boolean }) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Profile builder state lives in the navbar for now so users can create quick
  // transaction presets without leaving the current ledger page.
  const [isOpen, setIsOpen] = useState(false);
  const [profiles, setProfiles] = useState<SharingProfileSummary[]>([]);
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [friends, setFriends] = useState<FriendRelationshipSummary[]>([]);
  const [friendGroups, setFriendGroups] = useState<FriendGroupSummary[]>([]);
  const [profileName, setProfileName] = useState("");
  const [isDefaultProfile, setIsDefaultProfile] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<ShareTargetDraft[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Load every target type the user is allowed to share with. The backend still
  // re-authorizes these ids on save; this just builds the checkbox list.
  async function loadProfiles() {
    const [profilesRes, familiesRes, friendsRes, friendGroupsRes] =
      await Promise.all([
      fetch("/api/sharing-profiles", { credentials: "include" }),
      fetch("/api/families", { credentials: "include" }),
      fetch("/api/friends", { credentials: "include" }),
      fetch("/api/friend-groups", { credentials: "include" }),
    ]);
    const profilesBody = await profilesRes.json().catch(() => ({}));
    const familiesBody = await familiesRes.json().catch(() => ({}));
    const friendsBody = await friendsRes.json().catch(() => ({}));
    const friendGroupsBody = await friendGroupsRes.json().catch(() => ({}));

    if (profilesRes.ok && Array.isArray(profilesBody.sharingProfiles)) {
      setProfiles(profilesBody.sharingProfiles);
    }

    if (familiesRes.ok && Array.isArray(familiesBody.families)) {
      setFamilies(familiesBody.families);
    }

    if (friendsRes.ok && Array.isArray(friendsBody.friends)) {
      setFriends(
        friendsBody.friends.filter(
          (friend: FriendRelationshipSummary) => friend.status === "ACCEPTED",
        ),
      );
    }

    if (
      friendGroupsRes.ok &&
      Array.isArray(friendGroupsBody.friendGroups)
    ) {
      setFriendGroups(friendGroupsBody.friendGroups);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    loadProfiles().catch((error) => {
      if (!cancelled) console.error("Failed to load sharing profiles:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  // A target key lets the picker dedupe mixed target types without comparing
  // object references from React state.
  function shareTargetKey(target: ShareTargetDraft) {
    if (target.targetType === "FAMILY") return `FAMILY:${target.familyId}`;
    if (target.targetType === "FRIEND_GROUP") {
      return `FRIEND_GROUP:${target.friendGroupId}`;
    }
    return `USER:${target.userId}`;
  }

  function toggleShareTarget(target: ShareTargetDraft) {
    const key = shareTargetKey(target);

    setSelectedTargets((currentTargets) =>
      currentTargets.some((currentTarget) => shareTargetKey(currentTarget) === key)
        ? currentTargets.filter(
            (currentTarget) => shareTargetKey(currentTarget) !== key,
          )
        : [...currentTargets, target],
    );
  }

  function isShareTargetSelected(target: ShareTargetDraft) {
    const key = shareTargetKey(target);
    return selectedTargets.some(
      (currentTarget) => shareTargetKey(currentTarget) === key,
    );
  }

  async function createSharingProfile() {
    const name = profileName.trim();
    if (!name || selectedTargets.length === 0) return;

    setIsCreating(true);

    try {
      // The selected targets are stored as a reusable SharingProfileTarget set.
      // Transactions can later reference this profile by id from the modal.
      const res = await fetch("/api/sharing-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          resourceType: "TRANSACTION",
          isDefault: isDefaultProfile,
          targets: selectedTargets,
        }),
      });

      if (res.ok) {
        setProfileName("");
        setIsDefaultProfile(false);
        setSelectedTargets([]);
        await loadProfiles();
      }
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div ref={menuRef} className={compact ? "relative" : "relative"}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={[
          "rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm font-semibold text-primary-text hover:border-border-hover",
          compact ? "w-full text-left" : "",
        ].join(" ")}
      >
        Sharing
      </button>

      {isOpen && (
        <div
          className={[
            "z-50 mt-2 w-72 rounded-xl border border-border bg-surface-bg p-3 text-sm shadow-lg",
            compact ? "relative" : "absolute right-0 top-full",
          ].join(" ")}
        >
          <div className="font-semibold text-primary-text">
            Sharing profiles
          </div>
          <p className="mt-1 text-xs text-muted-text">
            Build presets from families, friend groups, and specific friends.
          </p>
          <div className="mt-2 grid gap-2">
            {profiles.length === 0 ? (
              <div className="rounded-lg border border-border bg-raised-bg px-3 py-2 text-muted-text">
                No profiles yet.
              </div>
            ) : (
              profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-lg border border-border bg-raised-bg px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary-text">
                      {profile.name}
                    </span>
                    {profile.isDefault && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-fg">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-text">
                    {profile.targets.length} target
                    {profile.targets.length === 1 ? "" : "s"}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="font-semibold text-primary-text">
              New profile
            </div>
            <input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Profile name"
              className="mt-2 w-full rounded-lg border border-border bg-raised-bg px-3 py-2 text-sm outline-none focus:border-border-hover"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-text">
              <input
                type="checkbox"
                checked={isDefaultProfile}
                onChange={(event) => setIsDefaultProfile(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Use as default for new transactions
            </label>

            <ShareTargetSection title="Families">
              {families.map((family) => (
                <ShareTargetCheckbox
                  key={family.id}
                  label={family.name ?? `Family ${family.id}`}
                  checked={isShareTargetSelected({
                    targetType: "FAMILY",
                    familyId: family.id,
                  })}
                  onChange={() =>
                    toggleShareTarget({
                      targetType: "FAMILY",
                      familyId: family.id,
                    })
                  }
                />
              ))}
            </ShareTargetSection>

            <ShareTargetSection title="Friend groups">
              {friendGroups.map((group) => (
                <ShareTargetCheckbox
                  key={group.id}
                  label={`${group.name} (${group.members.length})`}
                  checked={isShareTargetSelected({
                    targetType: "FRIEND_GROUP",
                    friendGroupId: group.id,
                  })}
                  onChange={() =>
                    toggleShareTarget({
                      targetType: "FRIEND_GROUP",
                      friendGroupId: group.id,
                    })
                  }
                />
              ))}
            </ShareTargetSection>

            <ShareTargetSection title="Friends">
              {friends.map((friend) => (
                <ShareTargetCheckbox
                  key={friend.friend.id}
                  label={friend.friend.username || friend.friend.email}
                  checked={isShareTargetSelected({
                    targetType: "USER",
                    userId: friend.friend.id,
                  })}
                  onChange={() =>
                    toggleShareTarget({
                      targetType: "USER",
                      userId: friend.friend.id,
                    })
                  }
                />
              ))}
            </ShareTargetSection>
          </div>

          <button
            type="button"
            disabled={
              !profileName.trim() ||
              selectedTargets.length === 0 ||
              isCreating
            }
            onClick={createSharingProfile}
            className="mt-3 w-full rounded-lg border border-border bg-raised-bg px-3 py-2 text-xs font-semibold text-primary-text hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? "Creating..." : "Create sharing profile"}
          </button>
        </div>
      )}
    </div>
  );
}

function ShareTargetSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-semibold text-muted-text">{title}</div>
      <div className="grid max-h-28 gap-1 overflow-y-auto pr-1">
        {children || (
          <div className="rounded-lg border border-border bg-raised-bg px-3 py-2 text-xs text-muted-text">
            None available
          </div>
        )}
      </div>
    </div>
  );
}

function ShareTargetCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-raised-bg px-3 py-2 text-xs text-primary-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-primary"
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
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
