"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";

type VisibleFriend = {
  id: number;
  username: string;
  email: string;
};

type VisibleFriendGroup = {
  id: number;
  name: string;
  memberCount: number;
  members: string[];
};

type SocialVisibilityPanelProps = {
  friends: VisibleFriend[];
  friendGroups: VisibleFriendGroup[];
  initialShowFriends: boolean;
  initialShowFriendGroups: boolean;
};

export default function SocialVisibilityPanel({
  friends,
  friendGroups,
  initialShowFriends,
  initialShowFriendGroups,
}: SocialVisibilityPanelProps) {
  const [showFriends, setShowFriends] = useState(initialShowFriends);
  const [showFriendGroups, setShowFriendGroups] = useState(
    initialShowFriendGroups,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateVisibility(setting: "friends" | "friendGroups", value: boolean) {
    // Optimistically reflect the user's choice, then persist the matching DB
    // field. If the request fails, roll back the specific switch.
    const body =
      setting === "friends"
        ? { showFriendsOnProfile: value }
        : { showFriendGroupsOnProfile: value };
    const rollback =
      setting === "friends"
        ? () => setShowFriends(!value)
        : () => setShowFriendGroups(!value);

    if (setting === "friends") {
      setShowFriends(value);
    } else {
      setShowFriendGroups(value);
    }

    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/profile/social-visibility", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        rollback();
        const error = await res.json().catch(() => null);
        setMessage(error?.error ?? "Could not save visibility setting.");
        return;
      }

      setMessage("Visibility saved.");
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface-bg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary-text">
            Social visibility
          </h2>
          <p className="mt-1 text-sm text-muted-text">
            Choose which personal social lists are visible on your profile.
          </p>
        </div>
        <span className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-muted-text">
          Saved setting
        </span>
      </div>

      {/* Visibility is persisted per user so the profile can consistently render
          only the social lists the user wants exposed. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <VisibilityToggle
          disabled={isPending}
          enabled={showFriends}
          label="Friends"
          onClick={() => updateVisibility("friends", !showFriends)}
        />
        <VisibilityToggle
          disabled={isPending}
          enabled={showFriendGroups}
          label="Friend groups"
          onClick={() => updateVisibility("friendGroups", !showFriendGroups)}
        />
      </div>

      {message && <p className="mt-3 text-xs text-muted-text">{message}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {showFriends && (
          <SocialList title="Friends" emptyMessage="No accepted friends yet.">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="rounded-xl border border-border bg-raised-bg px-3 py-3"
              >
                <div className="font-semibold text-primary-text">
                  {friend.username}
                </div>
                <div className="mt-1 text-xs text-muted-text">
                  {friend.email}
                </div>
              </div>
            ))}
          </SocialList>
        )}

        {showFriendGroups && (
          <SocialList
            title="Friend groups"
            emptyMessage="No friend groups yet."
          >
            {friendGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-border bg-raised-bg px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-primary-text">
                    {group.name}
                  </div>
                  <span className="text-xs text-muted-text">
                    {group.memberCount} members
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-text">
                  {group.members.join(", ") || "No members"}
                </div>
              </div>
            ))}
          </SocialList>
        )}
      </div>
    </section>
  );
}

function VisibilityToggle({
  disabled,
  enabled,
  label,
  onClick,
}: {
  disabled: boolean;
  enabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60",
        enabled
          ? "border-primary bg-raised-bg text-primary-text"
          : "border-border bg-surface-bg text-muted-text hover:text-primary-text",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SocialList({
  children,
  emptyMessage,
  title,
}: {
  children: ReactNode;
  emptyMessage: string;
  title: string;
}) {
  const items = Array.isArray(children) ? children : [children];

  return (
    <div>
      <h3 className="text-sm font-semibold text-primary-text">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.length > 0 ? (
          children
        ) : (
          <div className="rounded-xl border border-border bg-raised-bg px-3 py-3 text-sm text-muted-text">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
